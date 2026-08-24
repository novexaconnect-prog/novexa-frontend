// Bisect: why does readableLatex fail on \int?
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'js/utils/math-format.js'), 'utf8'), ctx);
const math = ctx.window.NovexaMath;

const p = (label, v) => console.log(label, '=>', JSON.stringify(v));
p('repairBare("\\int_1^3")', math.repairBareTextMathCommands('\\int_1^3'));
p('repairBare("\\int_1^3 \\frac{1}{x}\\,dx")', math.repairBareTextMathCommands('\\int_1^3 \\frac{1}{x}\\,dx'));
p('readable("\\int")', math.readableLatex('\\int'));
p('readable("\\int_1^3")', math.readableLatex('\\int_1^3'));
p('readable("x \\int y")', math.readableLatex('x \\int y'));
p('readable("\\sum_1^3")', math.readableLatex('\\sum_1^3'));
p('readable("\\int_a^b f(x)dx")', math.readableLatex('\\int_a^b f(x)dx'));
