// V43.72 acceptance-criteria regression test.
// Every assertion maps directly to a visual rule the student must experience:
//   - normal English spacing is never destroyed by the math formatter
//   - mixed prose/math keeps prose outside MathJax
//   - parentheses around symbols never become red/malformed math
//   - tables keep exactly their intended column count (no phantom columns)
//   - HTML/parser artifacts (<div, class=, ">) never reach the student
//   - the readable fallback never shows raw \frac/\int/\text or delimiters
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

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 1. English prose must survive with intact spacing, unwrapped by math.
check('English prose keeps spacing', () => {
  const md = math.prepareMarkdown('The curve is convex and bends upward.');
  assert(md === 'The curve is convex and bends upward.', `unexpected: ${md}`);
});

// 2. Bare equations become inline math islands.
check('Equation wrapped as math island', () => {
  const md = math.prepareMarkdown('y=x^2');
  assert(/\\\(\s*y\s*=\s*x\s*\^\s*\{?2\}?\s*\\\)/.test(md), `unexpected: ${md}`);
});

// 3. Mixed English + math: prose stays prose, spacing untouched.
check('Mixed sentence keeps prose structure', () => {
  const md = math.prepareInline('Use the trapezium rule with 4 strips ((n = 4)) to approximate the integral.');
  assert(!/Usethetrapezium/.test(md.replace(/\\/g, '')), 'spaces collapsed');
  assert(!/\\\(\s*Use\s+the\s+trapezium/.test(md), 'prose lead swallowed into math');
  assert(md.includes('Use the trapezium rule with 4 strips \\(n = 4\\) to approximate'), `unexpected: ${md}`);
});
check('Mixed value sentence stays readable prose', () => {
  const md = math.prepareMarkdown('When x = 2, the value of y is 4.');
  assert(md === 'When x = 2, the value of y is 4.', `unexpected: ${md}`);
});

// 4. Parentheses around subscripted symbols: ordinary parens, real subscripts,
//    NEVER an empty ^{} / _{} fragment (the red-bracket generator).
check('Parenthesised subscripts stay well-formed', () => {
  const input = 'First (y₀), Middle (y₁), Last (y₄)';
  const md = math.prepareMarkdown(input);
  assert(!/\^\{\}/.test(md), `empty superscript island leaked: ${md}`);
  assert(!/_\{\}/.test(md), `empty subscript island leaked: ${md}`);
  assert(md.includes('\\(y_{0}\\)'), `subscript missing: ${md}`);
  assert(md.includes('\\(y_{4}\\)'), `last subscript missing: ${md}`);
  assert((md.match(/First/) || []).length === 1, 'prose label damaged');
});
check('ASCII subscript parentheses stay prose-safe', () => {
  const md = math.prepareInline('First ((y_0))');
  assert(md.includes('First (\\(y_0\\))') && !/\^\{\}/.test(md), `unexpected: ${md}`);
});
check('Superscript unicode converts correctly', () => {
  const md = math.prepareMarkdown('Area = πr² where r = 3.');
  assert(!/\^\{\}/.test(md), `empty superscript island leaked: ${md}`);
  assert(md.includes('r^{2}') || md.includes('r²'), `superscript lost: ${md}`);
});

// 5. Tables: header width authoritative, exactly N columns, rows padded,
//    no row-level TeX wrapper leaking into cells.
check('Table keeps exact column count', () => {
  const input = '| i | x_i | y_i | Role in formula |\n|---|---|---|---|\n| 0 | 1.0 | 1.0000 | First (y_0) |\n| 1 | 1.5 | 0.6667 | Middle (y_1) |\n| 2 | 2.0 | 0.5000 | Middle (y_2) |\n| 3 | 2.5 | 0.4000 | Middle (y_3) |\n| 4 | 3.0 | 0.3333 | Last (y_4) |';
  const table = math.normalizeMarkdownTables(input);
  const lines = table.split('\n');
  const widths = lines.map(line => line.split('|').length - 2);
  assert(widths.every(w => w === 4), `phantom column detected: ${JSON.stringify(widths)}`);
  assert(table.includes('| i | x_i | y_i | Role in formula |'), 'header lost');
  assert(table.includes('| 0 | 1.0 | 1.0000 | First (y_0) |'), 'body lost');
  assert(!lines.some(line => line.includes('\\(') || line.includes('\\[')), 'row TeX wrapper leaked');
});
check('Ragged table rows padded, never phantom', () => {
  const input = '| A | B |\n|---|---|\n| 1 |\n| 2 | 3 | extra |';
  const table = math.normalizeMarkdownTables(input);
  const lines = table.split('\n');
  assert(lines.every(l => l.split('|').length - 2 === 2), `column drift: ${table}`);
});

// 6. Leaked layout markup must be invisible.
check('Layout/HTML fragments stripped', () => {
  const leak = math.stripLeakedLayoutMarkup('<divclass = "table-wrap">\n| A | B |\n|---|---|\n| 1 | 2 |\n</div>\n">');
  assert(!/<\s*div/i.test(leak), 'div tag leaked');
  assert(!/class\s*=/.test(leak), 'class attribute leaked');
  assert(!/^["']>\s*$/m.test(leak), 'stray quote-close leaked');
  assert(!/<\/?\s*(?:table|tr|td)\b/i.test(leak), 'table tag leaked');
});

// 7. Readable fallback: no raw TeX commands or delimiters survive.
check('Fallback converts frac/text/int', () => {
  assert(math.readableLatex('\\frac{h}{2}') === '(h)/(2)', `frac: ${math.readableLatex('\\frac{h}{2}')}`);
  assert(math.readableLatex('\\text{Area} \\approx \\frac{h}{2}') === 'Area ≈ (h)/(2)', 'text/approx failed');
  assert(math.readableLatex('\\int_1^3 \\frac{1}{x}\\,dx') === '∫_1^3 (1)/(x) dx',
    `int with bounds: ${math.readableLatex('\\int_1^3 \\frac{1}{x}\\,dx')}`);
  assert(math.readableLatex('\\sum_{i=1}^{n} x_i') .includes('Σ'), 'sum failed');
});
check('Fallback prefix-collision guards intact', () => {
  // \in inside \infty, \le inside \left, \to inside \theta must not corrupt.
  assert(math.readableLatex('\\infty') === '∞', 'infty corrupted');
  assert(math.readableLatex('\\left[ x \\right]') === '[ x ]', `left/right corrupted: ${math.readableLatex('\\left[ x \\right]')}`);
  assert(math.readableLatex('\\theta') === 'θ', 'theta corrupted');
  assert(!/ft\b/.test(math.readableLatex('\\left( x \\right)')), 'left corruption returned');
});

// 8. Headings become Novexa section cards, never raw hashes.
check('Markdown headings normalized', () => {
  assert(math.normalizeSectionHeadings('## Step 1: Find the strip width') === '**✦ Step 1: Find the strip width**', 'heading not converted');
});

// 9. Bold/italic markers survive for the Markdown renderer (spaces intact).
check('Emphasis survives with spacing', () => {
  const md = math.prepareMarkdown('*The curve is convex.*');
  assert(md === '*The curve is convex.*', `unexpected: ${md}`);
});

// 10. Student-facing sanitizer leaves no raw TeX body behind.
check('Sanitizer converts surviving TeX bodies', () => {
  const cleaned = math.sanitizeStudentFacingMath('\\[ \\frac{1}{2} \\]\n\\(x=2\\)');
  assert(!/\\(?:frac|sqrt|int|text|mathrm)/.test(cleaned), `raw TeX survived: ${cleaned}`);
  assert(cleaned.includes('(1)/(2)'), `readable conversion missing: ${cleaned}`);
});

// 11. Flashcard/Paper inline pipeline end-to-end shape.
check('Flashcard front/back inline prep', () => {
  const front = math.prepareInline('What is the trapezium rule?');
  assert(front === 'What is the trapezium rule?', `front damaged: ${front}`);
  const back = math.prepareInline('\\int_a^b f(x)\\,dx \\approx \\frac{h}{2}[y_0+y_n]');
  assert(back.startsWith('\\(') && back.endsWith('\\)'), `back not math-wrapped: ${back}`);
});

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nPASS V43.72 acceptance criteria (spacing, mixed math, parentheses, tables, HTML leaks, fallback readability, headings, emphasis, sanitizer)');
