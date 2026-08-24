const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = __dirname;
for (const f of ['js/utils/math-format.js','js/novexa-ai.js']) {
  new vm.Script(fs.readFileSync(path.join(root,f),'utf8'), { filename:f });
  console.log('PASS syntax', f);
}
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/utils/math-format.js'),'utf8'), ctx, { filename:'math-format.js' });
const math = ctx.window.NovexaMath;
const mixed = math.prepareMarkdown('\\(5. Substitute and apply the Quotient Law (\\log_7 A - \\log_7 B = \\log_7(A/B)) :\\)');
if (!mixed.startsWith('5. Substitute and apply the Quotient Law')) throw new Error('prose/math split failed');
if (!mixed.includes('\\(\\log_7 A - \\log_7 B = \\log_7(A/B)\\)')) throw new Error('math island was not preserved');
const nov = fs.readFileSync(path.join(root,'js/novexa-ai.js'),'utf8');
if (!nov.includes('phantom first/last columns')) throw new Error('table edge cleanup missing');
if (!nov.includes("replace(/^\\\\(?:\\(|\\[)\\s*/, '')")) throw new Error('table delimiter cleanup missing');
console.log('PASS V43.68 table/text regression checks');
