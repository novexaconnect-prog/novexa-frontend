const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = __dirname;
for (const f of ['js/utils/math-format.js', 'js/novexa-ai.js']) {
  new vm.Script(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/utils/math-format.js'), 'utf8'), ctx);
const math = ctx.window.NovexaMath;

const prose = math.prepareInline('Use the trapezium rule with 4 strips ((n = 4)) to approximate the integral.');
if (/\\\(Use\s+the\s+trapezium/.test(prose) || /Usethetrapezium/.test(prose)) throw new Error('plain prose swallowed by MathJax');
if (!prose.includes('Use the trapezium rule with 4 strips \\(n = 4\\) to approximate')) throw new Error('inline math island missing');

const label = math.prepareInline('First ((y_0))');
if (/\\\(First/.test(label)) throw new Error('table label promoted to math');
if (!label.includes('First (\\(y_0\\))')) throw new Error('table label math island missing');

const tableInput = '| i | x_i | y_i | Role in formula |\n|---|---|---|---|\n| 0 | 1.0 | 1.0000 | First ((y_0)) |\n| 1 | 1.5 | 0.6667 | Middle ((y_1)) |';
const table = math.normalizeMarkdownTables(tableInput);
const tableRows = table.split('\\n');
if (tableRows.some(line => line.includes('\\\\(') || line.includes('\\\\)'))) throw new Error('row TeX wrapper leaked');
if (!table.includes('| i | x_i | y_i | Role in formula |')) throw new Error('table header lost');
if (!table.includes('| 1 | 1.5 | 0.6667 | Middle ((y_1)) |')) throw new Error('table body lost');

const leak = math.stripLeakedLayoutMarkup('<divclass = "table-wrap">\n| A | B |\n|---|---|\n| 1 | 2 |\n</div>\n">');
if (/<\s*div|class\s*=|^\s*">\s*$/m.test(leak)) throw new Error('layout fragment leaked');

const source = fs.readFileSync(path.join(root, 'js', 'novexa-ai.js'), 'utf8');
if (!source.includes('const standaloneMath')) throw new Error('strict table-cell math guard missing');
if (!source.includes('stripLeakedLayoutMarkup(normalizeRawLatexBlocks(text))')) throw new Error('Novexa input leak sanitizer missing');

for (const page of ['paper.html', 'flashcards.html']) {
  const text = fs.readFileSync(path.join(root, 'pages', page), 'utf8');
  if (!text.includes('novexa-v43-71-math-error-guard')) throw new Error(`${page} red-error guard not bumped`);
  if (!text.includes('utils/math-format.js?v=43.71')) throw new Error(`${page} shared formatter cache not bumped`);
}
console.log('PASS V43.71 spacing + table + layout + no-red-bracket checks');
