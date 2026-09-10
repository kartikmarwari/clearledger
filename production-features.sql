-- Idempotent production feature migration for ClearLedger.
begin;

alter table public.invoices add column if not exists owner_email text not null default '';
alter table public.invoices add column if not exists next_follow_up_at timestamptz;
alter table public.invoices add column if not exists reminder_enabled boolean not null default false;
alter table public.invoices add column if not exists reminder_status text not null default 'idle';
alter table public.invoices add column if not exists last_reminder_at timestamptz;
alter table public.invoices drop constraint if exists invoices_owner_email_check;
alter table public.invoices add constraint invoices_owner_email_check check(length(owner_email)<=200);
alter table public.invoices drop constraint if exists invoices_reminder_status_check;
alter table public.invoices add constraint invoices_reminder_status_check check(reminder_status in ('idle','sending','sent','failed'));
create index if not exists invoice_due_reminders on public.invoices(next_follow_up_at) where reminder_enabled=true;

create table if not exists public.email_deliveries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 invoice_id uuid not null references public.invoices(id) on delete cascade, sender_id uuid not null references auth.users(id),
 recipient text not null check(length(recipient)<=200), subject text not null check(length(subject)<=240),
 status text not null check(status in ('sending','sent','failed')), provider_id text not null default '',
 error_message text not null default '', idempotency_key uuid not null unique, created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists email_delivery_invoice on public.email_deliveries(invoice_id,created_at desc);
alter table public.email_deliveries enable row level security;
drop policy if exists email_delivery_member on public.email_deliveries;
create policy email_delivery_member on public.email_deliveries for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=email_deliveries.organization_id and m.user_id=(select auth.uid())));
revoke all on public.email_deliveries from anon,authenticated;
grant select on public.email_deliveries to authenticated;

create table if not exists public.workspace_invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
 email text not null check(length(email)<=200), invited_by uuid not null references auth.users(id), token text not null unique,
 status text not null default 'pending' check(status in ('pending','accepted','expired','cancelled')),
 expires_at timestamptz not null, accepted_at timestamptz, created_at timestamptz not null default now(),
 unique(organization_id,email)
);
alter table public.workspace_invitations enable row level security;
drop policy if exists invitation_owner on public.workspace_invitations;
create policy invitation_owner on public.workspace_invitations for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=workspace_invitations.organization_id and m.user_id=(select auth.uid()) and m.role='owner'));
revoke all on public.workspace_invitations from anon,authenticated;
grant select on public.workspace_invitations to authenticated;

create or replace function public.save_invoices(workspace_id uuid,items jsonb) returns setof public.invoices language plpgsql security definer set search_path='' as $$
declare item jsonb; previous public.invoices; saved public.invoices; item_id uuid; history jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.memberships where organization_id=workspace_id and user_id=auth.uid()) then raise exception 'Workspace access denied'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>1000 then raise exception 'Invalid batch'; end if;
 for item in select value from jsonb_array_elements(items) loop
  item_id:=(item->>'id')::uuid; select * into previous from public.invoices where id=item_id for update;
  if found then
   if previous.organization_id<>workspace_id then raise exception 'Invoice access denied'; end if;
   if previous.version<>coalesce((item->>'version')::integer,0) then raise exception 'Invoice changed by another session. Refresh before saving.'; end if; history:=previous.events;
  else
   if coalesce((item->>'version')::integer,0)<>0 then raise exception 'Invoice no longer exists'; end if; history:='[]'::jsonb;
  end if;
  history:=history||jsonb_build_array(jsonb_build_object('at',now(),'actor',auth.uid(),'text',left(coalesce(item->>'event','Invoice updated'),2500)));
  insert into public.invoices(id,organization_id,client,number,amount,paid,currency,due,email,owner,blocker,promise,draft,events,version,owner_email,next_follow_up_at,reminder_enabled,reminder_status)
  values(item_id,workspace_id,trim(item->>'client'),trim(item->>'number'),(item->>'amount')::numeric,coalesce((item->>'paid')::numeric,0),item->>'currency',(item->>'due')::date,coalesce(item->>'email',''),coalesce(item->>'owner',''),coalesce(item->>'blocker','Unknown'),nullif(item->>'promise','')::date,coalesce(item->>'draft',''),history,coalesce(previous.version,0)+1,coalesce(item->>'owner_email',''),nullif(item->>'next_follow_up_at','')::timestamptz,coalesce((item->>'reminder_enabled')::boolean,false),coalesce(item->>'reminder_status','idle'))
  on conflict(id) do update set client=excluded.client,number=excluded.number,amount=excluded.amount,paid=excluded.paid,currency=excluded.currency,due=excluded.due,email=excluded.email,owner=excluded.owner,blocker=excluded.blocker,promise=excluded.promise,draft=excluded.draft,events=excluded.events,version=excluded.version,owner_email=excluded.owner_email,next_follow_up_at=excluded.next_follow_up_at,reminder_enabled=excluded.reminder_enabled,reminder_status=excluded.reminder_status,updated_at=now()
  where invoices.organization_id=workspace_id and invoices.version=coalesce(previous.version,0) returning * into saved;
  if not found then raise exception 'Concurrent invoice change. Refresh and retry.'; end if; return next saved;
 end loop;
end $$;

create or replace function public.log_invoice_event(workspace_id uuid,invoice_id uuid,event_text text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.memberships where organization_id=workspace_id and user_id=auth.uid()) then raise exception 'Workspace access denied'; end if;
 update public.invoices set events=events||jsonb_build_array(jsonb_build_object('at',now(),'actor',auth.uid(),'text',left(event_text,2500))),updated_at=now(),version=version+1 where id=invoice_id and organization_id=workspace_id;
 if not found then raise exception 'Invoice not found'; end if;
end $$;

create or replace function public.accept_workspace_invitation(invitation_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare invite public.workspace_invitations; account_email text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select email into account_email from auth.users where id=auth.uid();
 select * into invite from public.workspace_invitations where token=invitation_token and status='pending' and expires_at>now() for update;
 if not found then raise exception 'Invitation is invalid or expired'; end if;
 if lower(invite.email)<>lower(account_email) then raise exception 'Sign in with the invited email address'; end if;
 if exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception 'This account already belongs to a workspace'; end if;
 insert into public.memberships(organization_id,user_id,role) values(invite.organization_id,auth.uid(),'member');
 update public.workspace_invitations set status='accepted',accepted_at=now() where id=invite.id;
 return invite.organization_id;
end $$;

revoke all on function public.save_invoices(uuid,jsonb),public.log_invoice_event(uuid,uuid,text),public.accept_workspace_invitation(text) from public,anon;
grant execute on function public.save_invoices(uuid,jsonb),public.log_invoice_event(uuid,uuid,text),public.accept_workspace_invitation(text) to authenticated;
commit;
