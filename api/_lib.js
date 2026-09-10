'use strict';
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const PUBLIC_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const SECRET_KEY=process.env.SUPABASE_SECRET_KEY||'';

function json(res,status,data){res.status(status).setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
function bearer(req){const value=req.headers.authorization||'';return value.startsWith('Bearer ')?value.slice(7):'';}
async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let text='';for await(const chunk of req){text+=chunk;if(text.length>30000)throw Error('Request is too large.');}return text?JSON.parse(text):{};}
async function sb(path,{method='GET',body,token,secret=false,headers={}}={}){
 const key=secret?SECRET_KEY:PUBLIC_KEY;if(!SUPABASE_URL||!key)throw Error('Server configuration is incomplete.');
 const response=await fetch(SUPABASE_URL+path,{method,headers:{apikey:key,Authorization:'Bearer '+(token||key),'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data=null;try{data=text?JSON.parse(text):null;}catch{data=text;}
 if(!response.ok){const error=new Error(data?.message||data?.error_description||data?.hint||'Database request failed.');error.status=response.status;throw error;}return data;
}
async function userFrom(req){const token=bearer(req);if(!token){const e=new Error('Sign in required.');e.status=401;throw e;}const user=await sb('/auth/v1/user',{token});return{token,user};}
async function requireMembership(token,organizationId,ownerOnly=false){const rows=await sb('/rest/v1/memberships?organization_id=eq.'+encodeURIComponent(organizationId)+'&select=role',{token});if(!rows.length||(ownerOnly&&rows[0].role!=='owner')){const e=new Error(ownerOnly?'Workspace owner access required.':'Workspace access denied.');e.status=403;throw e;}return rows[0];}
async function sendEmail({to,subject,html,text}){if(!process.env.RESEND_API_KEY)throw Error('Email delivery is not configured.');const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL||'ClearLedger <onboarding@resend.dev>',reply_to:process.env.RESEND_REPLY_TO||undefined,to:[to],subject,html,text})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.message||'Email provider rejected the message.');return data;}
function cleanEmail(value){const email=String(value||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200)throw Error('Enter a valid email address.');return email;}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function handler(fn){return async(req,res)=>{try{if(req.method==='OPTIONS'){res.status(204).end();return;}await fn(req,res);}catch(error){json(res,error.status||400,{error:error.message||'Request failed.'});}};}
module.exports={json,readBody,sb,userFrom,requireMembership,sendEmail,cleanEmail,escapeHtml,handler};
