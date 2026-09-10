'use strict';
const {json,readBody,sb,userFrom,requireMembership,sendEmail,cleanEmail,escapeHtml,handler}=require('./_lib');
module.exports=handler(async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 const {token,user}=await userFrom(req),body=await readBody(req);const invoiceId=String(body.invoiceId||''),key=String(body.idempotencyKey||'');
 if(!/^[0-9a-f-]{36}$/i.test(invoiceId)||!/^[0-9a-f-]{36}$/i.test(key))throw Error('Invalid message request.');
 const rows=await sb('/rest/v1/invoices?id=eq.'+invoiceId+'&select=id,organization_id,client,number,email',{token});if(!rows.length)throw Error('Invoice not found.');const invoice=rows[0];await requireMembership(token,invoice.organization_id);
 const to=cleanEmail(body.to||invoice.email),subject=String(body.subject||'').trim(),message=String(body.message||'').trim();if(!subject||subject.length>240)throw Error('Subject is required and must be under 240 characters.');if(!message||message.length>10000)throw Error('Message is required and must be under 10,000 characters.');
 const created=await sb('/rest/v1/email_deliveries',{method:'POST',secret:true,headers:{Prefer:'return=representation'},body:{organization_id:invoice.organization_id,invoice_id:invoice.id,sender_id:user.id,recipient:to,subject,status:'sending',idempotency_key:key}}).catch(e=>{if(e.status===409){e.message='This message was already submitted.';}throw e;});
 try{const sent=await sendEmail({to,subject,text:message,html:'<div style="font:16px/1.6 Arial,sans-serif;white-space:pre-wrap">'+escapeHtml(message)+'</div>'});await sb('/rest/v1/email_deliveries?id=eq.'+created[0].id,{method:'PATCH',secret:true,headers:{Prefer:'return=minimal'},body:{status:'sent',provider_id:sent.id||'',sent_at:new Date().toISOString()}});await sb('/rest/v1/rpc/log_invoice_event',{method:'POST',token,body:{workspace_id:invoice.organization_id,invoice_id:invoice.id,event_text:'Follow-up emailed to '+to}});return json(res,200,{ok:true,id:sent.id});}
 catch(error){await sb('/rest/v1/email_deliveries?id=eq.'+created[0].id,{method:'PATCH',secret:true,headers:{Prefer:'return=minimal'},body:{status:'failed',error_message:String(error.message).slice(0,500)}}).catch(()=>{});throw error;}
});
