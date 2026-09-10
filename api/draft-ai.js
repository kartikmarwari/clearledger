'use strict';
const {json,readBody,sb,userFrom,requireMembership,handler}=require('./_lib');
module.exports=handler(async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 if(!process.env.OPENAI_API_KEY)throw Error('AI is not configured yet.');
 const {token}=await userFrom(req),body=await readBody(req),id=String(body.invoiceId||'');
 const rows=await sb('/rest/v1/invoices?id=eq.'+id+'&select=id,organization_id,client,number,amount,paid,currency,due,blocker,promise,owner',{token});
 if(!rows.length)throw Error('Invoice not found.');await requireMembership(token,rows[0].organization_id);const i=rows[0];
 const input='Write a concise '+(body.tone==='Firm'?'firm but professional':'friendly and professional')+' payment follow-up email body. Do not invent facts, fees, threats, or payment promises. Ask for a clear status and next step. Invoice data: '+JSON.stringify({client:i.client,invoice:i.number,outstanding:Number(i.amount)-Number(i.paid),currency:i.currency,due:i.due,blocker:i.blocker,promise:i.promise,owner:i.owner});
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5-mini',store:false,input,max_output_tokens:350})});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error?.message||'AI provider rejected the request.');
 const draft=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n').trim();if(!draft)throw Error('AI returned an empty draft.');
 json(res,200,{draft:draft.slice(0,10000)});
});
