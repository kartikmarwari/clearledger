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
