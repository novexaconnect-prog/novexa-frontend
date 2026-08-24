'use strict';
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync(require('path').join(__dirname, 'js/utils/math-format.js'), 'utf8');
const context = { window: {}, console };
vm.createContext(context);
vm.runInContext(source, context, { filename: 'math-format.js' });
const math = context.window.NovexaMath;

const cases = [
  {
    name: 'nested fraction + radical',
    input: String.raw`Final answer: \frac{13\sqrt{6}}{2} cm`,
    preparedMustContain: String.raw`\frac{13\sqrt{6}}{2}`,
    fallbackMustNotContain: ['frac', 'sqrt']
  },
  {
    name: 'bare LaTeX command repair',
    input: 'Final answer: frac{13sqrt{6}}{2} cm',
    preparedMustContain: String.raw`\frac{13\sqrt{6}}{2}`,
    fallbackMustNotContain: ['frac', 'sqrt']
  },
  {
    name: 'plain-text fraction + Unicode radical repair',
    input: 'Final answer: Perimeter = (13√(6))/(2) cm',
    preparedMustContain: String.raw`\frac{13\sqrt{6}}{2}`,
    fallbackMustNotContain: ['frac', 'sqrt']
  },
  {
    name: 'worked-solution lead-in stays prose',
    input: String.raw`Substitute r = 2\sqrt{6} and s = \frac{5\sqrt{6}}{2}`,
    preparedMustContain: String.raw`Substitute \(r = 2\sqrt{6} and s = \frac{5\sqrt{6}}{2}\)`,
    fallbackMustNotContain: ['frac', 'sqrt']
  },
  {
    name: 'orphan TeX closer removed',
    input: String.raw`\]`,
    preparedMustContain: '',
    fallbackMustNotContain: []
  }
];

for (const test of cases) {
  const prepared = math.prepareMarkdown(test.input);
  const fallback = math.readableLatex(test.input);
  if (test.preparedMustContain && !prepared.includes(test.preparedMustContain)) {
    throw new Error(`${test.name}: prepared output did not contain expected math wrapper`);
  }
  if (test.preparedMustContain === '' && prepared.trim() !== '') {
    throw new Error(`${test.name}: prepared output was not cleaned`);
  }
  for (const token of test.fallbackMustNotContain) {
    if (new RegExp(`\\b${token}\\b`, 'i').test(fallback)) {
      throw new Error(`${test.name}: fallback exposed raw ${token}`);
    }
  }
  if (/[\r\n][ \t]*[\[\]][ \t]*(?=\r?\n|$)/.test(fallback)) {
    throw new Error(`${test.name}: fallback exposed an orphan bracket line`);
  }
}

console.log(`Math rendering smoke test passed (${cases.length} cases).`);
