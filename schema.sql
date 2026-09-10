-- Run once in a new Supabase project's SQL editor. Secrets are never needed in the browser.
begin;
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 owner_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.memberships (
 organization_id uuid references public.organizations(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','member')), primary key(organization_id,user_id)
);
create table public.invoices (
 id uuid primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
 client text not null check(length(trim(client)) between 1 and 200), number text not null check(length(trim(number)) between 1 and 200),
 amount numeric(16,2) not null check(amount>0 and amount<=10000000000), paid numeric(16,2) not null default 0 check(paid>=0 and paid<=amount),
 currency text not null check(currency in ('USD','GBP','EUR','INR','AUD','CAD')), due date not null,
 email text not null default '' check(length(email)<=200), owner text not null default '' check(length(owner)<=200),
 blocker text not null default 'Unknown' check(blocker in ('Unknown','PO missing','Approval pending','Dispute','Incorrect invoice','Tax document','Wrong contact','Payment scheduled','Cash-flow issue','No response','Resolved')),
 promise date, draft text not null default '' check(length(draft)<=10000),
 events jsonb not null default '[]', version integer not null default 1, updated_at timestamptz not null default now()
);
create unique index invoice_identity on public.invoices(organization_id,lower(trim(client)),lower(trim(number)));
create index invoice_workspace_due on public.invoices(organization_id,due);
create index membership_user on public.memberships(user_id);
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invoices enable row level security;
create policy membership_self on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy organization_member on public.organizations for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=id and m.user_id=(select auth.uid())));
create policy invoice_member on public.invoices for select to authenticated using(exists(select 1 from public.memberships m where m.organization_id=invoices.organization_id and m.user_id=(select auth.uid())));
revoke all on public.organizations,public.memberships,public.invoices from anon,authenticated;
grant select on public.organizations,public.memberships,public.invoices to authenticated;

create function public.create_workspace(workspace_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if exists(select 1 from public.memberships where user_id=auth.uid()) then raise exception 'You already belong to a workspace'; end if;
 insert into public.organizations(name,owner_id) values(trim(workspace_name),auth.uid()) returning id into result;
 insert into public.memberships values(result,auth.uid(),'owner');
 return result;
end $$;

create function public.save_invoices(workspace_id uuid,items jsonb) returns setof public.invoices language plpgsql security definer set search_path='' as $$
declare item jsonb; previous public.invoices; saved public.invoices; item_id uuid; history jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.memberships where organization_id=workspace_id and user_id=auth.uid()) then raise exception 'Workspace access denied'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>1000 then raise exception 'Invalid batch'; end if;
 for item in select value from jsonb_array_elements(items) loop
  item_id := (item->>'id')::uuid;
  select * into previous from public.invoices where id=item_id for update;
  if found then
   if previous.organization_id<>workspace_id then raise exception 'Invoice access denied'; end if;
   if previous.version<>coalesce((item->>'version')::integer,0) then raise exception 'Invoice changed by another session. Refresh before saving.'; end if;
   if previous.paid>0 and previous.currency<>item->>'currency' then raise exception 'Cannot change currency after payment'; end if;
   if (item->>'paid')::numeric<previous.paid then raise exception 'Payment reversal requires a reviewed correction'; end if;
   history := previous.events;
  else
   if coalesce((item->>'version')::integer,0)<>0 then raise exception 'Invoice no longer exists'; end if;
   history := '[]'::jsonb;
  end if;
  history := history || jsonb_build_array(jsonb_build_object('at',now(),'actor',auth.uid(),'text',left(coalesce(item->>'event','Invoice updated'),2500)));
  insert into public.invoices(id,organization_id,client,number,amount,paid,currency,due,email,owner,blocker,promise,draft,events,version)
  values(item_id,workspace_id,trim(item->>'client'),trim(item->>'number'),(item->>'amount')::numeric,coalesce((item->>'paid')::numeric,0),item->>'currency',(item->>'due')::date,coalesce(item->>'email',''),coalesce(item->>'owner',''),coalesce(item->>'blocker','Unknown'),nullif(item->>'promise','')::date,coalesce(item->>'draft',''),history,coalesce(previous.version,0)+1)
  on conflict(id) do update set client=excluded.client,number=excluded.number,amount=excluded.amount,paid=excluded.paid,currency=excluded.currency,due=excluded.due,email=excluded.email,owner=excluded.owner,blocker=excluded.blocker,promise=excluded.promise,draft=excluded.draft,events=excluded.events,version=excluded.version,updated_at=now()
  where invoices.organization_id=workspace_id and invoices.version=coalesce(previous.version,0)
  returning * into saved;
  if not found then raise exception 'Concurrent invoice change. Refresh and retry.'; end if;
  return next saved;
 end loop;
end $$;

-- The owner may add an already-registered teammate. No email is sent by this function.
create function public.add_member(workspace_id uuid,member_email text) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not exists(select 1 from public.organizations where id=workspace_id and owner_id=auth.uid()) then raise exception 'Only the workspace owner can add members'; end if;
 select id into target from auth.users where lower(email)=lower(trim(member_email));
 if target is null then raise exception 'Ask the teammate to register and confirm their email first'; end if;
 if exists(select 1 from public.memberships where user_id=target) then raise exception 'This user already belongs to a workspace'; end if;
 insert into public.memberships values(workspace_id,target,'member');
end $$;
revoke all on function public.create_workspace(text),public.save_invoices(uuid,jsonb),public.add_member(uuid,text) from public,anon;
grant execute on function public.create_workspace(text),public.save_invoices(uuid,jsonb),public.add_member(uuid,text) to authenticated;
commit;
