'use strict';
// Keep sessions in this tab only; never persist secrets in exported records.
const sessionKey='clearledger-session';
function rememberSession(){if(session)sessionStorage.setItem(sessionKey,JSON.stringify(session));else sessionStorage.removeItem(sessionKey);}
const originalApi=api;
api=async function(...args){try{return await originalApi(...args);}finally{rememberSession();}};
const originalLoad=loadCloud;
loadCloud=async function(){
 rememberSession();
 const invite=new URLSearchParams(location.search).get('invite')||sessionStorage.getItem('clearledger-invite');
 if(invite&&session){await serverApi('/api/accept-invite',{token:invite});sessionStorage.removeItem('clearledger-invite');history.replaceState({},'',location.pathname);toast('Invitation accepted.');}
 await originalLoad();
};
const priorBind=bind;
bind=function(){
 rememberSession();
 priorBind();
 if(view==='settings'&&cloud&&session){
  const panels=[...document.querySelectorAll('.panel')];
  const readiness=panels.find(p=>p.querySelector('h2')?.textContent==='Service readiness');
  if(readiness){readiness.innerHTML='<h2>Connected services</h2><p>Checking services…</p>';fetch('/api/readiness',{headers:{Authorization:'Bearer '+session.access_token}}).then(async r=>{if(!r.ok)throw Error('Service check unavailable.');return r.json();}).then(s=>{readiness.innerHTML='<h2>Connected services</h2><p>Email: '+(s.email==='configured'?(s.emailTestOnly?'test sender only — verify your sending domain before emailing customers':'configured; send a test to confirm delivery'):'not configured')+'</p><p>Owner reminders: '+(s.reminders?'configured':'not configured')+'</p><p>AI: '+(s.ai==='configured'?'configured':'not configured; editable templates are available')+'</p>';}).catch(()=>{readiness.innerHTML='<h2>Connected services</h2><p>Could not verify services. Check the active deployment before sending.</p>';});}
 }
};
const inviteParam=new URLSearchParams(location.search).get('invite');
if(inviteParam&&!location.hash.includes('access_token'))sessionStorage.setItem('clearledger-invite',inviteParam);
if(cloud&&!location.hash.includes('access_token')){
 try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{sessionStorage.removeItem(sessionKey);}
 if(session)loadCloud().catch(e=>{session=null;rememberSession();view='settings';render();toast(e.message);});
}

const originalMessage=message;
message=function(i){
 originalMessage(i);const send=$('#send-email'),ai=document.createElement('button');ai.type='button';ai.textContent='Improve with AI';send.parentNode.insertBefore(ai,send);
 ai.onclick=()=>action(async()=>{ai.disabled=true;try{const result=await serverApi('/api/draft-ai',{invoiceId:i.id,tone:$('#tone').value});$('#draft').value=result.draft;toast('AI draft ready. Review it before sending.');}finally{ai.disabled=false;}});
};

const originalDetail=detail;
detail=function(id){
 originalDetail(id);const invoice=invoices.find(x=>x.id===id),editButton=$('#edit');if(!invoice||!editButton)return;const remove=document.createElement('button');remove.type='button';remove.textContent='Delete invoice';remove.className='danger-button';editButton.parentNode.appendChild(remove);
 remove.onclick=()=>{if(!confirm('Permanently delete '+invoice.client+' / '+invoice.number+' and its email history?'))return;action(async()=>{if(cloud)await serverApi('/api/delete-invoice',{invoiceId:id});else localStorage.setItem('clearledger-demo-v1',JSON.stringify(invoices.filter(x=>x.id!==id)));invoices=invoices.filter(x=>x.id!==id);$('#modal').close();render();toast('Invoice deleted.');});};
};

const accountBind=bind;
bind=function(){
 accountBind();if(view!=='settings'||!cloud||!session||!org)return;const panel=document.createElement('section');panel.className='panel';panel.innerHTML='<h2>Team access</h2><div id="team-list"><p>Checking access…</p></div>';$('#page').appendChild(panel);
 serverApi('/api/team',{action:'list',organizationId:org}).then(data=>{const members=data.members.map(m=>'<div class="row"><div><strong>'+esc(m.email)+'</strong><small>'+esc(m.role)+'</small></div>'+(m.role==='member'?'<button data-remove-member="'+m.userId+'">Remove</button>':'')+'</div>').join(''),invites=data.invitations.map(x=>'<div class="row"><div><strong>'+esc(x.email)+'</strong><small>Invitation expires '+new Date(x.expires_at).toLocaleDateString()+'</small></div><button data-cancel-invite="'+x.id+'">Cancel</button></div>').join('');$('#team-list').innerHTML=members+(invites?'<h3>Pending invitations</h3>'+invites:'');document.querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=()=>{if(confirm('Remove this teammate from the workspace?'))action(async()=>{await serverApi('/api/team',{action:'remove',organizationId:org,userId:b.dataset.removeMember});render();toast('Teammate removed.');});});document.querySelectorAll('[data-cancel-invite]').forEach(b=>b.onclick=()=>action(async()=>{await serverApi('/api/team',{action:'cancel',organizationId:org,invitationId:b.dataset.cancelInvite});render();toast('Invitation cancelled.');}));}).catch(()=>panel.remove());
};
