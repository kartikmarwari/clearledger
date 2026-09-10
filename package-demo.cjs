const fs=require('node:fs'),path=require('node:path');
const dist=path.join(__dirname,'dist');
let html=fs.readFileSync(path.join(dist,'app.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="app.css">',()=>'<style>'+fs.readFileSync(path.join(dist,'app.css'),'utf8')+'</style>');
for(const file of ['config.js','core.js','app.js'])html=html.replace('<script src="'+file+'"></script>',()=>'<script>'+fs.readFileSync(path.join(dist,file),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
html=html.replace('href="index.html"','href="#"');
const target=path.resolve(__dirname,'../..','outputs','clearledger-mvp.html');
fs.writeFileSync(target,html);console.log('Standalone demo generated: '+target);
