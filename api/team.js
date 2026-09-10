'use strict';
const {json,readBody,sb,userFrom,requireMembership,handler}=require('./_lib');
module.exports=handler(async(req,res)=>{
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 const {token,user}=await userFrom(req),body=await readBody(req),organizationId=String(body.organizationId||'');
 await requireMembership(token,organizationId,true);
 if(body.action==='list'){
  const membershipRows=await sb('/rest/v1/memberships?organization_id=eq.'+organizationId+'&select=user_id,role',{secret:true});
  const members=await Promise.all(membershipRows.map(async m=>{const account=await sb('/auth/v1/admin/users/'+m.user_id,{secret:true});return{userId:m.user_id,role:m.role,email:account.email||'Unknown account'};}));
  const invitations=await sb('/rest/v1/workspace_invitations?organization_id=eq.'+organizationId+'&status=eq.pending&select=id,email,expires_at,created_at&order=created_at.desc',{secret:true});
  return json(res,200,{members,invitations,currentUserId:user.id});
 }
 if(body.action==='remove'){
  const target=String(body.userId||'');if(target===user.id)throw Error('The workspace owner cannot remove their own account.');
  await sb('/rest/v1/memberships?organization_id=eq.'+organizationId+'&user_id=eq.'+encodeURIComponent(target)+'&role=eq.member',{method:'DELETE',secret:true});
  return json(res,200,{ok:true});
 }
 if(body.action==='cancel'){
  await sb('/rest/v1/workspace_invitations?id=eq.'+encodeURIComponent(String(body.invitationId||''))+'&organization_id=eq.'+organizationId,{method:'PATCH',secret:true,body:{status:'cancelled'}});
  return json(res,200,{ok:true});
 }
 throw Error('Unknown team action.');
});
