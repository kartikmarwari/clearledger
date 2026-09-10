'use strict';
const {json,readBody,sb,userFrom,handler}=require('./_lib');
module.exports=handler(async(req,res)=>{if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});const {token}=await userFrom(req),body=await readBody(req);const invitationToken=String(body.token||'');if(invitationToken.length<60)throw Error('Invalid invitation.');await sb('/rest/v1/rpc/accept_workspace_invitation',{method:'POST',token,body:{invitation_token:invitationToken}});return json(res,200,{ok:true});});
