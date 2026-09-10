(function(root){
'use strict';
const currencies=['USD','GBP','EUR','INR','AUD','CAD'];
const blockers=['Unknown','PO missing','Approval pending','Dispute','Incorrect invoice','Tax document','Wrong contact','Payment scheduled','Cash-flow issue','No response','Resolved'];
const today=()=>new Date().toLocaleDateString('en-CA');
const dateOK=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const days=(a,b=today())=>Math.floor((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
const balance=i=>Math.max(0,Math.round((Number(i.amount)-Number(i.paid||0))*100)/100);
const money=(n,c)=>new Intl.NumberFormat('en',{style:'currency',currency:c,maximumFractionDigits:2}).format(n);
const status=i=>balance(i)===0?'Paid':days(i.due)>0?'Overdue':'Open';
const score=i=>balance(i)===0?0:Math.max(0,days(i.due))*2+(i.promise&&days(i.promise)>0?100:0)+(i.blocker==='Dispute'?30:0)+(!i.owner?15:0);
const next=i=>({ 'PO missing':'Ask the account lead who can supply the purchase order.', 'Approval pending':'Ask the client contact to confirm the approver and approval date.', 'Dispute':'Clarify the disputed item and agree a resolution before chasing payment.', 'Incorrect invoice':'Confirm the correction required and reissue the invoice.', 'Tax document':'Confirm the exact document required and its secure delivery route.', 'Wrong contact':'Ask your account lead for the correct accounts-payable contact.', 'Payment scheduled':i.promise&&days(i.promise)>0?'The promised date has passed. Request an updated payment date.':'Confirm the scheduled date and check again when it is due.', 'Cash-flow issue':'Discuss an achievable payment schedule with the client.', 'No response':'Verify delivery and the billing contact before escalating.', 'Resolved':'Confirm receipt and close the invoice.' }[i.blocker]||'Confirm receipt and ask what is preventing payment.');
function validate(i){
 if(!String(i.client||'').trim()||!String(i.number||'').trim())throw Error('Client and invoice number are required.');
 if(!currencies.includes(i.currency))throw Error('Choose a supported currency.');
 if(!Number.isFinite(Number(i.amount))||Number(i.amount)<=0||Number(i.amount)>1e10)throw Error('Amount must be positive and below 10 billion.');
 if(!Number.isFinite(Number(i.paid||0))||Number(i.paid||0)<0||Number(i.paid||0)>Number(i.amount))throw Error('Payment must be between zero and the invoice amount.');
 if(!dateOK(i.due))throw Error('Due date must be a real date in YYYY-MM-DD format.');
 if(i.promise&&!dateOK(i.promise))throw Error('Payment promise must be a real date.');
 if(i.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email))throw Error('Enter a valid client email.');
 if(i.blocker&&!blockers.includes(i.blocker))throw Error('Unknown blocker.');
 for(const k of ['client','number','owner','email'])if(String(i[k]||'').length>200)throw Error(k+' is too long.');
 return i;
}
function parseCSV(text){
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false;
 for(let n=0;n<text.length;n++){const c=text[n];if(c==='"'){if(quoted&&text[n+1]==='"'){value+='"';n++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[n+1]==='\n')n++;row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';}else value+=c;}
 if(quoted)throw Error('CSV has an unclosed quote.');row.push(value);if(row.some(v=>v.trim()))rows.push(row);if(rows.length<2)throw Error('CSV needs a header and at least one invoice.');return rows;
}
const aliases={client:['client','customer','customer name','client name'],number:['number','invoice','invoice number','invoice no','invoice #'],amount:['amount','total','invoice amount'],currency:['currency','currency code'],due:['due','due date'],email:['email','client email'],owner:['owner','assigned to'],paid:['paid','amount paid'],blocker:['blocker'],promise:['promise','promised date']};
function importRows(rows,map,existing){
 const seen=new Set(existing.map(i=>i.client.toLowerCase().trim()+'|'+i.number.toLowerCase().trim()));const valid=[],errors=[];
 rows.slice(1).forEach((r,n)=>{try{const x={};for(const [k,col]of Object.entries(map))x[k]=col===''?'':String(r[Number(col)]||'').trim();x.currency=(x.currency||'USD').toUpperCase();x.amount=Number(x.amount.replace(/,/g,''));x.paid=Number((x.paid||'0').replace(/,/g,''));x.blocker=x.blocker||'Unknown';validate(x);const key=x.client.toLowerCase()+'|'+x.number.toLowerCase();if(seen.has(key))throw Error('Duplicate invoice for this client.');seen.add(key);valid.push(x);}catch(e){errors.push('Row '+(n+2)+': '+e.message);}});return{valid,errors};
}
function draft(i,tone='Friendly'){const opener=tone==='Firm'?'Please provide an update on':'Just following up on';const request={ 'PO missing':'Could you share the purchase order or connect us with the person who can provide it?', 'Approval pending':'Could you confirm who is approving this invoice and the expected approval date?', 'Dispute':'Could you confirm the disputed line item so we can agree the next step?', 'Tax document':'Please let us know which tax document you need and where we should securely send it.', 'Wrong contact':'Could you direct us to the right accounts-payable contact?' }[i.blocker]||'Could you confirm the expected payment date and anything needed from us?';return 'Hi '+i.client+' team,\n\n'+opener+' invoice '+i.number+', due '+i.due+', with '+money(balance(i),i.currency)+' outstanding.\n\n'+request+(i.promise?'\n\nWe have '+i.promise+' recorded as the promised payment date. Please let us know if this has changed.':'')+'\n\nThank you,\n'+(i.owner||'Accounts team');}
const api={currencies,blockers,today,dateOK,days,balance,money,status,score,next,validate,parseCSV,aliases,importRows,draft};root.CL=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
