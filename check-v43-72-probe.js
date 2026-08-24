// Probe: dump actual output of NovexaMath on every acceptance-criteria example.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = __dirname;

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/utils/math-format.js'), 'utf8'), ctx);
const math = ctx.window.NovexaMath;

const show = (label, fn) => {
  try {
    const out = fn();
    console.log(`\n=== ${label} ===`);
    console.log(JSON.stringify(out));
  } catch (e) {
    console.log(`\n=== ${label} === ERROR: ${e.message}`);
  }
};

// C1 English
show('C1 English prepareMarkdown', () => math.prepareMarkdown('The curve is convex and bends upward.'));
show('C1 English prepareInline', () => math.prepareInline('The curve is convex and bends upward.'));

// C2 Math
show('C2 Math y=x^2 prepareMarkdown', () => math.prepareMarkdown('y=x^2'));
show('C2 Math y=x^2 prepareInline', () => math.prepareInline('y=x^2'));

// C3 Mixed
show('C3 Mixed prepareMarkdown', () => math.prepareMarkdown('When x = 2, the value of y is 4.'));
show('C3 Mixed prepareInline', () => math.prepareInline('When x = 2, the value of y is 4.'));

// C4 Parentheses
show('C4 Parentheses prepareMarkdown', () => math.prepareMarkdown('First (y₀), Middle (y₁), Last (y₄)'));
show('C4 Parentheses prepareInline', () => math.prepareInline('First (y₀), Middle (y₁), Last (y₄)'));

// C5 Table - 4 columns, no phantom
const table = '| i | x_i | y_i | Role in formula |\n|---|---|---|---|\n| 0 | 1.0 | 1.0000 | First (y_0) |\n| 1 | 1.5 | 0.6667 | Middle (y_1) |\n| 2 | 2.0 | 0.5000 | Middle (y_2) |\n| 3 | 2.5 | 0.4000 | Middle (y_3) |\n| 4 | 3.0 | 0.3333 | Last (y_4) |';
show('C5 Table normalizeMarkdownTables', () => math.normalizeMarkdownTables(table));

// C6 HTML leak
show('C6 HTML stripLeakedLayoutMarkup', () => math.stripLeakedLayoutMarkup('<divclass = "table-wrap">\n| A | B |\n|---|---|\n| 1 | 2 |\n</div>\n">'));

// C7 Delimiters via readableLatex (fallback should not show delimiters)
show('C7 readableLatex frac', () => math.readableLatex('\\frac{1}{2}'));
show('C7 readableLatex int', () => math.readableLatex('\\int_1^3 \\frac{1}{x}\\,dx'));
show('C7 readableLatex text', () => math.readableLatex('\\text{Area} \\approx \\frac{h}{2}'));

// C8 Markdown headings
show('C8 normalizeSectionHeadings', () => math.normalizeSectionHeadings('## Step 1: Find the strip width'));

// C9 Spacing
show('C9 Spacing prepareMarkdown', () => math.prepareMarkdown('Use the trapezium rule with 4 strips (n = 4) to approximate the integral.'));

// C10 sanitize / clean
show('C10 sanitizeStudentFacingMath', () => math.sanitizeStudentFacingMath('\\[ \\frac{1}{2} \\]\n\\(x=2\\)\nraw'));
show('C10 cleanMathArtifacts', () => math.cleanMathArtifacts('\\[ \\frac{1}{2} \\]\n\\### Heading\n\t\t'));
