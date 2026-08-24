const fs=require('fs'),path=require('path'),vm=require('vm');
const files=['js/novexa-ai.js','js/pages/dashboard.js','pages/paper.html'];
for(const f of files){const s=fs.readFileSync(path.join(__dirname,f),'utf8'); if(f.endsWith('.js')) new vm.Script(s,{filename:f}); console.log('PASS',f)}
const nov=fs.readFileSync(path.join(__dirname,'js/novexa-ai.js'),'utf8');
if(nov.includes('looseTableHtml')) throw new Error('looseTableHtml reference remains');
if(!nov.includes('recent-chat-delete')) throw new Error('delete chat UI missing');
const flash=fs.readFileSync(path.join(__dirname,'pages/flashcards.html'),'utf8'); if(!flash.includes('cleanRenderedMathArtifacts')) throw new Error('flashcard math cleanup missing');
const paper=fs.readFileSync(path.join(__dirname,'pages/paper.html'),'utf8'); if(!paper.includes('paper-math-slot')) throw new Error('paper math slots missing');
console.log('PASS targeted V43.64 checks');
