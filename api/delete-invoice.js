'use strict';
const {json,readBody,sb,userFrom,requireMembership,handler}=require('./_lib');
module.exports=handler(async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 const {token}=await userFrom(req),body=await readBody(req),id=String(body.invoiceId||'');
 if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid invoice.');
 const rows=await sb('/rest/v1/invoices?id=eq.'+id+'&select=id,organization_id',{token});
 if(!rows.length)throw Error('Invoice not found.');
 await requireMembership(token,rows[0].organization_id);
 await sb('/rest/v1/invoices?id=eq.'+id,{method:'DELETE',secret:true,headers:{Prefer:'return=minimal'}});
 json(res,200,{ok:true});
});
