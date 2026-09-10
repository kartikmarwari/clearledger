'use strict';
const {json,userFrom,handler}=require('./_lib');
module.exports=handler(async(req,res)=>{
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed.'});
 await userFrom(req);
 const email=!!(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL);
 json(res,200,{email:email?'configured':'missing',emailTestOnly:email&&process.env.RESEND_FROM_EMAIL.includes('resend.dev'),ai:process.env.OPENAI_API_KEY?'configured':'missing',reminders:!!process.env.CRON_SECRET});
});
