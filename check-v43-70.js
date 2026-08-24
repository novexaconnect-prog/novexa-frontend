const fs=require('fs'),path=require('path'),vm=require('vm');
const root=__dirname;
for(const f of ['js/utils/math-format.js','js/novexa-ai.js']) {
  new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});
  console.log('PASS syntax',f);
}
const ctx={window:{},console};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/utils/math-format.js'),'utf8'),ctx);
const math=ctx.window.NovexaMath;
const prose=math.prepareMarkdown(String.raw`\(\text{Step 2: Substitute the values into the formula: } 15=\frac12 r^2\times1.25\)`);
if(!/Step 2: Substitute the values into the formula:/.test(prose) || !/\\\(15=\\frac12 r\^2/.test(prose)) throw new Error('prose/math split regression');
const table=math.normalizeMarkdownTables(String.raw`\(| Item | Meaning |
|---|---|
| A | value \| inside cell |
\)`);
if(!table.includes('value | inside cell')) throw new Error('escaped-pipe table content lost');
if(/^\\\(/m.test(table) || /\\\)$/m.test(table)) throw new Error('table row delimiter wrapper leaked');
const mf=fs.readFileSync(path.join(root,'js/utils/math-format.js'),'utf8');
if(!mf.includes('mjx-merror')) throw new Error('MathJax error scrub missing');
const paper=fs.readFileSync(path.join(root,'pages/paper.html'),'utf8');
const flash=fs.readFileSync(path.join(root,'pages/flashcards.html'),'utf8');
if(!paper.includes('.mjx-merror')||!flash.includes('.mjx-merror')) throw new Error('paper/flashcard red-error guard missing');
console.log('PASS V43.70 no-red-bracket + table regression checks');

const proseCheck = math.prepareInline('Use the trapezium rule with 4 strips ((n = 4)) to approximate the integral.');
if (/\\\(Use\s+the\s+trapezium/.test(proseCheck) || /Usethetrapezium/.test(proseCheck)) throw new Error('plain prose swallowed by MathJax');
const label = math.prepareInline('First ((y_0))');
if (/\\\(First/.test(label)) throw new Error('table label promoted to math');
const cleanedLeak = math.stripLeakedLayoutMarkup('<div class="x">\n| A | B |\n|---|---|\n| 1 | 2 |\n</div>');
if (cleanedLeak.includes('<div') || cleanedLeak.includes('class=')) throw new Error('layout HTML leaked');
console.log('PASS V43.71 prose/table/layout regression checks');
