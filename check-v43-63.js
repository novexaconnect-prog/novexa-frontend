const fs=require('fs'),path=require('path'),vm=require('vm');
const root=__dirname;
const files=['js/utils/math-format.js','js/novexa-ai.js','js/pages/dashboard.js'];
for(const f of files){const s=fs.readFileSync(path.join(root,f),'utf8'); new vm.Script(s,{filename:f}); console.log('PASS syntax',f)}
const src=fs.readFileSync(path.join(root,'js/novexa-ai.js'),'utf8');
if(!src.includes('NOVEXA_TABLE_')) throw new Error('Expected table token support missing');
const paper=fs.readFileSync(path.join(root,'pages/paper.html'),'utf8');
if(!paper.includes('paper-math-slot')) throw new Error('Paper math slot support missing');
const dash=fs.readFileSync(path.join(root,'pages/dashboard.html'),'utf8');
for(const id of ['focusProgressBar','focusStopButton','focusOpenButton']) if(!dash.includes(id)) throw new Error('Missing dashboard focus control '+id);
console.log('PASS V43.63 targeted checks');
