const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('./core.js');
const invoice={client:'Studio',number:'INV-1',amount:100,paid:25,currency:'USD',due:'2026-01-01',blocker:'Unknown'};
test('partial payments reduce outstanding balance',()=>{assert.equal(C.balance(invoice),75);assert.equal(C.balance({...invoice,paid:100}),0);assert.equal(C.status({...invoice,paid:100}),'Paid');});
test('invalid financial data is rejected',()=>{for(const change of [{paid:-1},{paid:101},{amount:NaN},{amount:0},{due:'2026-02-30'},{currency:'XYZ'},{promise:'tomorrow'}])assert.throws(()=>C.validate({...invoice,...change}));});
test('CSV supports quoted commas, newlines and escaped quotes',()=>{assert.deepEqual(C.parseCSV('\uFEFFclient,number\r\n"A, B","INV""1"\r\n"line\nname",2'),[['client','number'],['A, B','INV"1'],['line\nname','2']]);assert.throws(()=>C.parseCSV('a,b\n"broken,2'));});
test('CSV detects duplicates within batch and workspace',()=>{const rows=[['client','number','amount','due'],['Studio','INV-1','100','2026-01-01'],['New','2','200','2026-02-01'],['new','2','200','2026-02-01']];const r=C.importRows(rows,{client:'0',number:'1',amount:'2',due:'3',currency:'',paid:''},[invoice]);assert.equal(r.valid.length,1);assert.equal(r.errors.length,2);});
test('broken promises increase priority',()=>{assert.ok(C.score({...invoice,promise:'2025-01-01'})>C.score(invoice));});
test('draft addresses blocker and remaining amount',()=>{const text=C.draft({...invoice,blocker:'PO missing'});assert.match(text,/purchase order/);assert.match(text,/75.00/);});
test('currency does not change nominal balance',()=>{assert.match(C.money(100,'INR'),/100/);assert.equal(C.balance({...invoice,currency:'INR'}),75);});
