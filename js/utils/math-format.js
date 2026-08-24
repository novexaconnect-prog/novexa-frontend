(() => {
  'use strict';

  const COMMANDS = [
    'dfrac','tfrac','frac','sqrt','binom','sum','prod','int','cdot','times','pm',
    'leq','geq','neq','ne','approx','equiv','infty','alpha','beta','gamma','delta',
    'theta','pi','lambda','mu','sigma','omega','partial','nabla','quad','qquad',
    'big','Big','bigg','Bigg','bigl','bigr','Bigl','Bigr','left','right','text',
    'mathrm','mathbf','mathit','mathbb','overline','underline','boxed','vec','hat',
    'bar','Rightarrow','Longrightarrow','Leftarrow','Longleftarrow','rightarrow',
    'leftarrow','to','dots','ldots','cdots','lim','log','ln','sin','cos','tan',
    'sec','csc','cot','exp'
  ];
  const COMMAND_RE = new RegExp('\\\\(?:' + COMMANDS.join('|') + ')\\b');

  // Conservative bare-word repair: common English words such as `sum`, `text`,
  // `int`, `prod`, `lim`, `bar`, and `hat` must not be mistaken for TeX.
  const SAFE_BARE_COMMANDS = [
    'dfrac','tfrac','frac','sqrt','binom','cdot','times','pm','leq','geq','neq','ne',
    'approx','equiv','infty','alpha','beta','gamma','delta','theta','pi','lambda','mu',
    'sigma','omega','partial','nabla','quad','qquad','Big','Bigg','big','bigg','bigl','bigr',
    'Bigl','Bigr','overline','underline','boxed','vec','Rightarrow','Longrightarrow',
    'Leftarrow','Longleftarrow','rightarrow','leftarrow','dots','ldots','cdots'
  ];
  const SAFE_BARE_COMMAND_RE = new RegExp('\\b(?:' + SAFE_BARE_COMMANDS.join('|') + ')\\b','i');

  function repairBareTextMathCommands(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');

    // Normalize transport corruption where JSON/string escaping removed a TeX slash.
    source = source
      .replace(/\\\\(?=(?:begin|end|frac|dfrac|tfrac|sqrt|binom|sum|prod|int|cdot|times|pm|leq|geq|neq|approx|equiv|in|notin|infty|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega|partial|nabla|quad|qquad|left|right|text|mathrm|mathbf|mathbb|overline|underline|boxed|vec|hat|bar|Rightarrow|Longrightarrow)\b)/g, '\\')
      .replace(/\\\\dfrac/g, '\\frac')
      .replace(/\\\\tfrac/g, '\\frac')
      .replace(/\\\\f(?=(?:rac|loor|orall|ont)\b)/g, '\\')
      .replace(/\\\\t(?=(?:imes|ext|heta|an|au|itle|riangle)\b)/g, '\\')
      .replace(/\\\\r(?=(?:ight|m|eal)\b)/g, '\\')
      .replace(/\\\\n(?=(?:abla|neq|notin|ge|le|times|theta|text|to)\b)/g, '\\');

    // Restore missing slashes for known TeX commands only when the line is
    // equation-like or already contains an obvious math command.
    source = source.split('\n').map(line => {
      const trimmed = line.trim();
      const equationLike = /[=<>^_]/.test(trimmed) || /\b(?:Formula|Working|Solution|Answer|Final answer|LHS|RHS|Error)\s*:/i.test(trimmed);
      const hasKnownBare = SAFE_BARE_COMMAND_RE.test(trimmed);
      if (!equationLike && !hasKnownBare) return line;
      let out = line;
      // Restore only unambiguous TeX-like bare commands. Common English words
      // such as `sum`, `int`, `text`, `prod`, `lim`, `bar`, and `hat` are
      // intentionally excluded so prose cannot be swallowed by MathJax.
      const safePattern = SAFE_BARE_COMMANDS.map(command => command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const rx = new RegExp('(^|[^A-Za-z_\\\\])(' + safePattern + ')(?=\\s|[_^{\\[\\](){}]|$)', 'g');
      out = out.replace(rx, '$1\\$2');
      return out;
    }).join('\n');

    // Common malformed command/grouping variants.
    source = source
      .replace(/\\binom\s*\{?([A-Za-z0-9])\}?\s*\{?([A-Za-z0-9])\}?/g, '\\binom{$1}{$2}')
      .replace(/\\binom\s*([A-Za-z0-9])\s*([A-Za-z0-9])/g, '\\binom{$1}{$2}')
      .replace(/\\sqrt\s*\(([^()\n]+)\)/g, '\\sqrt{$1}')
      .replace(/\\frac\s*\(\s*([^()\n]+?)\s*\)\s*\/\s*\(\s*([^()\n]+?)\s*\)/g, '\\frac{$1}{$2}')
      .replace(/\\frac\s*\(\s*([^()\n]+?)\s*\)\s*\/\s*([A-Za-z0-9.]+)/g, '\\frac{$1}{$2}')
      .replace(/\\frac\s*\(\s*\(([^()]+)\)\s*\/\s*([^)]+)\)\s*\^\s*\{?(\d+)\}?\s*\\?(\d+)\b/g, '\\frac{($1/$2)^$3}{$4}')
      .replace(/\\frac\s*\(\s*([^()]+)\s*\/\s*([^()]+)\s*\)\s*\^\s*\{?(\d+)\}?/g, '\\left(\\frac{$1}{$2}\\right)^$3')
      .replace(/\\frac\s*\(\s*([^()]+)\s*\)\s*\\?(\d+)\b/g, '\\frac{$1}{$2}')
      .replace(/\\sum[_\s]*([A-Za-z])\s*=\s*([0-9]+)\s*\^\s*([A-Za-z0-9]+(?:-[0-9]+)?)/g, '\\sum_{$1=$2}^{$3}')
      .replace(/\\sum[_\s]*\{?([A-Za-z])\}?\s*=\s*([0-9]+)\s*\^\s*([A-Za-z0-9]+(?:-[0-9]+)?)/g, '\\sum_{$1=$2}^{$3}')
      .replace(/(?<!\\)&\s*=/g, '=')
      .replace(/\\begin\{(aligned|alignedat|gathered|gather|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array|equation|equation\*)\}/g, (_, env) => `\\begin{${env}}`)
      .replace(/\\left\s*([([{|])/g, '\\left$1')
      .replace(/\\right\s*([)\]}|])/g, '\\right$1');

    return source;
  }

  function normalizeEnvironmentBlocks(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');
    const env = '(aligned|alignedat|gathered|gather|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array|equation|equation\\*)';
    return source.replace(new RegExp('(^|\\n)([ \\t]*)\\\\begin\\{' + env + '\\}([\\s\\S]*?)\\\\end\\{\\3\\}(?=\\n|$)', 'g'),
      (_, prefix, indent, name, body) => `${prefix}${indent}\\[\n${body.trim()}\n${indent}\\]`);
  }

  function balanceDelimiters(value) {
    let source = String(value ?? '');
    const balance = (open, close) => {
      let out = '';
      let pos = 0;
      while (pos < source.length) {
        const start = source.indexOf(open, pos);
        if (start < 0) { out += source.slice(pos); break; }
        const end = source.indexOf(close, start + open.length);
        if (end < 0) { out += source.slice(pos, start) + source.slice(start + open.length); break; }
        out += source.slice(pos, end + close.length);
        pos = end + close.length;
      }
      source = out;
    };
    balance('\\[', '\\]');
    balance('\\(', '\\)');
    const dollars = (source.match(/\$\$/g) || []).length;
    if (dollars % 2) source = source.replace(/\$\$/g, '');
    return source;
  }

  function looksLikeMathLine(line) {
    const text = String(line || '').trim();
    if (!text) return false;
    if (/^#{1,6}\s+/.test(text)) return false;
    // Do not turn normal prose into an equation merely because a word happens
    // to resemble a TeX command. There must be a real math signal first.
    const explicitMathSignal = /\\(?:[A-Za-z]+)\\b/.test(text)
      || SAFE_BARE_COMMAND_RE.test(text)
      || /[=<>^_{}]|[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]/.test(text);
    if (!explicitMathSignal) return false;
    if (/^[-*+]\s+/.test(text) || /^\d+[.)]\s+/.test(text)) {
      const body = text.replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, '').trim();
      return looksLikeMathLine(body);
    }
    if (/\b(?:the|this|that|because|therefore|using|given|where|when|find|calculate|solve|question|statement|claim|for|every|integer)\b/i.test(text)
      && !/^(?:Formula|Working|Solution|Answer|Final answer)\s*:/i.test(text)) {
      return /\\(?:[A-Za-z]+)\\b/.test(text) || SAFE_BARE_COMMAND_RE.test(text) || /[:=<>^_]\s*[-+]?\s*[A-Za-z0-9(\[\{]/.test(text) || /[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]/.test(text);
    }
    return /\\(?:[A-Za-z]+)\\b/.test(text) || SAFE_BARE_COMMAND_RE.test(text) || /[=<>]/.test(text) || /[A-Za-z]\w*[_^][A-Za-z0-9{]/.test(text) || /[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]/.test(text);
  }

  function wrapBareMathLines(value) {
    let inside = false;
    return String(value ?? '').split('\n').map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('\\[') || trimmed.startsWith('$$')) {
        inside = !(trimmed.includes('\\]') || trimmed.endsWith('$$'));
        return line;
      }
      if (inside) {
        if (trimmed.includes('\\]') || trimmed.endsWith('$$')) inside = false;
        return line;
      }
      if (!trimmed || /^```/.test(trimmed) || /^\|.*\|$/.test(trimmed)) return line;
      if (/^#{1,6}\s+/.test(trimmed) || /^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed) || /^\*\*✦\s+/.test(trimmed) || /^✦\s+/.test(trimmed)) return line;
      // A line containing any explicit math already has the correct mixed
      // prose/math structure; never wrap the entire sentence.
      if (/\\\(|\\\]|\\\[|\\\)|\$\$|(?<!\$)\$[^$\n]+\$(?!\$)/.test(trimmed)) return line;
      const proseLead = /^(?:the|this|that|these|those|a|an|each|for|when|where|because|since)\b/i.test(trimmed);
      const proseWordCount = (trimmed.match(/[A-Za-z]+/g) || []).length;
      const hasRealTeX = /\\(?:frac|dfrac|tfrac|sqrt|binom|cdot|times|pm|leq|geq|neq|approx|alpha|beta|gamma|theta|pi|lambda|mu|sigma|omega|partial|nabla)\b/.test(trimmed);
      if (proseLead && proseWordCount > 3 && !hasRealTeX) return line;
      // Common worked-solution lead-ins should remain prose. Only the
      // mathematical tail is sent to MathJax.
      const leadMath = trimmed.match(/^(Substitute|Substitution|Let|Given|Therefore|Hence|Thus|So|Calculate|Compute|Evaluate)\s+(.+)$/i);
      if (leadMath) {
        const tail = leadMath[2].trim();
        const tailWords = (tail.match(/[A-Za-z]+/g) || []).length;
        const tailProse = /\b(?:the|this|that|these|those|with|from|into|for|when|where|using|given|rule|strips|approximate|integral|value|curve|line|because|therefore|and|or|then)\b/i.test(tail);
        if (!tailProse && tailWords <= 8 && /[=<>^_{}]|[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]|\\(?:frac|dfrac|tfrac|sqrt|sum|int|prod|cdot|times|pm|leq|geq|neq|approx|infty|alpha|beta|gamma|theta|pi|lambda|mu|sigma|partial|nabla)\b/.test(tail)) {
          const indent = line.slice(0, line.indexOf(trimmed));
          return `${indent}${leadMath[1]} \\(${tail}\\)`;
        }
      }
      const proseWords = (trimmed.match(/\b(?:method|taking|both|sides|substitute|substitution|apply|quotient|law|recap|self|check|quick|question|hint|write|answer|explain|using|given|therefore|because|then|and|or|the|this|that|with|from|into|for|when|where|first|middle|last|category|role|index|item|meaning|value|column|row|area|curve|line|problem)\b/gi) || []).length;
      const alphaWords = (trimmed.match(/[A-Za-z]+/g) || []).length;
      // A line that OPENS with a TeX operator/command and contains no English
      // sentence words is a bare equation the provider forgot to delimit
      // (e.g. flashcard backs such as `\int_a^b f(x)\,dx \approx ...`). Length
      // alone must never disqualify it: without this branch the long-equation
      // prose guard below left raw `\int ...` visible to the student.
      if (/^\\(?:int|sum|prod|lim|frac|dfrac|tfrac|sqrt|log|ln|sin|cos|tan|sec|csc|cot|exp|binom|vec|hat|bar|overline)(?![A-Za-z])/.test(trimmed) && proseWords === 0) {
        const indent = line.slice(0, line.indexOf(trimmed));
        return `${indent}\\(${trimmed}\\)`;
      }
      // A few normal words plus a subscripted symbol are still prose, e.g.
      // `First ((y_0))` or `Middle (y_1)`. Never wrap the entire line as math.
      if (alphaWords >= 2 && /\s/.test(trimmed) && proseWords >= 1 && !/^(?:Formula|Working|Solution|Answer|Final answer)\s*:/i.test(trimmed)) return line;
      if ((proseWords >= 2 || alphaWords >= 8 || /\*\*/.test(trimmed)) && !/^(?:Formula|Working|Solution|Answer|Final answer)\s*:/i.test(trimmed)) return line;
      if (!looksLikeMathLine(trimmed)) return line;
      const labelled = /^(\s*(?:(?:Front|Back|Answer|Final answer|Solution|Formula|Working|Error)\s*[:\-]\s*))/i.exec(line);
      if (labelled) {
        const body = line.slice(labelled[1].length).trim();
        if (looksLikeMathLine(body)) return `${labelled[1]}\\(${body}\\)`;
      }

      // Also catch natural-language labels such as:
      // "Area of sector: Area = (1/2) r² θ". The label stays text while only
      // the mathematical tail is sent to MathJax. This is intentionally narrow
      // so ordinary prose with a colon is never swallowed.
      const colonMath = line.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)([^:]{2,100}:\s*)(.+)$/);
      if (colonMath) {
        const tail = colonMath[3].trim();
        const hasMathSignal = /[=<>^_]|[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]|\\(?:frac|sqrt|int|sum|times|cdot|pm|leq|geq|approx|infty)\b/.test(tail);
        if (hasMathSignal && looksLikeMathLine(tail)) {
          return `${colonMath[1]}${colonMath[2]}\\(${tail}\\)`;
        }
      }
      const wordCount = (trimmed.match(/[A-Za-z]+/g) || []).length;
      if (wordCount <= 8 && (SAFE_BARE_COMMAND_RE.test(trimmed) || /[=<>^_{}²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]/.test(trimmed))) return `\\(${trimmed}\\)`;
      return line;
    }).join('\n');
  }

  // Strip layout/HTML fragments accidentally emitted by AI providers.
  // These are implementation artifacts, not student-facing content. Keep
  // legitimate text inside the tags and convert <br> to real line breaks.
  function stripLeakedLayoutMarkup(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');
    source = source
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/?\s*(?:div|table|thead|tbody|tfoot|tr|th|td|section|article)(?:\s[^>]*)?>/gi, '')
      // Common truncated wrapper leaks seen in streamed answers.
      .replace(/(^|\n)\s*<\s*\/?\s*div\s*class\s*=\s*[^\n>]*>?\s*(?=\n|$)/gi, '$1')
      .replace(/(^|\n)\s*["']>\s*(?=\n|$)/g, '$1')
      .replace(/(^|\n)\s*[<>]\s*\/??\s*div\s*class\s*=\s*[^\n]*?(?=\n|$)/gi, '$1');
    return source;
  }

  function normalizeMarkdownTables(value) {
    const rawLines = stripLeakedLayoutMarkup(value).split('\n');

    const unwrapRow = value => String(value ?? '').trim()
      .replace(/^\\(?:\(|\[)\s*/, '')
      .replace(/\s*\\(?:\)|\])$/, '')
      .replace(/^(?:\(|\[)\s*/, '')
      .replace(/\s*(?:\)|\])$/, '')
      .trim();

    const splitCells = value => {
      let row = unwrapRow(value);
      if (row.startsWith('|')) row = row.slice(1);
      if (row.endsWith('|')) row = row.slice(0, -1);

      const cells = [];
      let current = '';
      let slashRun = 0;
      for (const ch of row) {
        // Only an unescaped pipe is a column separator. This prevents content
        // such as `value \\| inside cell` from creating phantom columns.
        if (ch === '|' && slashRun % 2 === 0) {
          cells.push(current.trim());
          current = '';
          slashRun = 0;
          continue;
        }
        current += ch;
        if (ch === '\\') slashRun += 1;
        else slashRun = 0;
      }
      cells.push(current.trim());

      while (cells.length && !cells[0]) cells.shift();
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      return cells.map(cell => cell.replace(/\\\|/g, '|').trim());
    };

    const isRow = line => {
      const text = String(line ?? '').trim();
      if (!text || /^```/.test(text)) return false;
      return (text.match(/\|/g) || []).length >= 2;
    };
    const isSeparator = line => {
      if (!isRow(line)) return false;
      const cells = splitCells(line);
      return cells.length >= 2 && cells.every(c => /^:?-{3,}:?$/.test(c));
    };

    const out = [];
    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      if (!isRow(line)) {
        // Remove delimiter-only rows/wrappers that can otherwise leak as red
        // brackets in MathJax after a broken table block.
        if (/^\s*(?:\\(?:\(|\)|\[|\])|[\[\]])\s*$/.test(line)) continue;
        out.push(line);
        continue;
      }

      const next = rawLines[i + 1] || '';
      if (!isSeparator(next)) {
        // Be conservative: an isolated pair of pipe lines is not enough to
        // invent a table. A real table needs either a separator or 3+ rows.
        const rowCountAhead = rawLines.slice(i, i + 6).filter(isRow).length;
        if (rowCountAhead < 3) {
          out.push(stripLeakedLayoutMarkup(line));
          continue;
        }
      }

      const header = splitCells(line);
      if (header.length < 2) {
        out.push(line);
        continue;
      }

      let dataStart = i + 1;
      if (isSeparator(rawLines[dataStart])) dataStart += 1;

      const rows = [];
      let j = dataStart;
      while (j < rawLines.length && isRow(rawLines[j]) && !isSeparator(rawLines[j])) {
        rows.push(splitCells(rawLines[j]));
        j += 1;
      }

      if (!rows.length) {
        out.push(line);
        continue;
      }

      // Header width is authoritative. Extra cells from malformed provider
      // output are discarded rather than creating phantom columns.
      const width = header.length;
      const normalizedHeader = header.slice(0, width);
      const normalizedRows = rows.map(row => Array.from({ length: width }, (_, k) => row[k] ?? ''));

      out.push(`| ${normalizedHeader.join(' | ')} |`);
      out.push(`| ${Array.from({ length: width }, () => '---').join(' | ')} |`);
      normalizedRows.forEach(row => out.push(`| ${row.join(' | ')} |`));
      i = j - 1;
    }
    return out.join('\n');
  }

  function normalizePlainMathNotation(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');

    // AI providers often return mathematically correct-looking plain text
    // instead of TeX, e.g. `(13√(6))/(2)` or `(5√(6))/(2)`. MathJax cannot
    // guess that a slash is a fraction unless we turn it into real TeX.
    // Repair only fraction-shaped expressions; ordinary prose slashes such as
    // `km/h` and `and/or` are left alone.
    for (let pass = 0; pass < 4; pass += 1) {
      const before = source;
      source = source
        .replace(/\(([^()\n]{1,140})\)\s*\/\s*\(([^()\n]{1,80})\)/g, '\\frac{$1}{$2}')
        .replace(/\(([^()\n]{1,140})\)\s*\/\s*([A-Za-z0-9][A-Za-z0-9.,^{}]*)/g, '\\frac{$1}{$2}')
        .replace(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)(?=\s*(?:cm|mm|m|km|s|min|h|kg|g|N|J|W|Pa|%|$|[),.;:]))/g, '\\frac{$1}{$2}');
      if (source === before) break;
    }

    // Once the provider has used Unicode √, make it a TeX radical so the
    // radical and any surrounding fraction share MathJax's visual baseline.
    source = source.replace(/√\s*\(([^()\n]+)\)/g, '\\sqrt{$1}');
    source = source.replace(/√\s*([A-Za-z0-9][A-Za-z0-9.]*)/g, '\\sqrt{$1}');

    return source;
  }

  function normalizeCommonLatexSyntax(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');
    // Common provider variants that are visually close to TeX but invalid for MathJax.
    source = source
      .replace(/\\dfrac/g, '\\frac')
      .replace(/\\tfrac/g, '\\frac')
      .replace(/\\sqrt\s*\(\s*([^()\n]+?)\s*\)/g, '\\sqrt{$1}')
      .replace(/\\frac\s*\(\s*([^()\n]+?)\s*\)\s*\/\s*\(\s*([^()\n]+?)\s*\)/g, '\\frac{$1}{$2}')
      .replace(/\\frac\s*\(\s*([^()\n]+?)\s*\)\s*\/\s*([A-Za-z0-9.]+)/g, '\\frac{$1}{$2}')
      .replace(/\^\s*\{([^{}]+)\}/g, '^{$1}')
      .replace(/_\s*\{([^{}]+)\}/g, '_{$1}')
      .replace(/\\left\s*([([{|])/g, '\\left$1')
      .replace(/\\right\s*([)\]}|])/g, '\\right$1');
    return source;
  }

  function hasBalancedLatex(value) {
    const source = String(value ?? '');
    let braces = 0;
    let brackets = 0;
    let parens = 0;
    for (const ch of source) {
      if (ch === '{') braces += 1;
      else if (ch === '}') { braces -= 1; if (braces < 0) return false; }
      else if (ch === '[') brackets += 1;
      else if (ch === ']') { brackets -= 1; if (brackets < 0) return false; }
      else if (ch === '(') parens += 1;
      else if (ch === ')') { parens -= 1; if (parens < 0) return false; }
    }
    return braces === 0 && brackets === 0 && parens === 0;
  }

  function normalizeDollarMath(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');
    // Protect existing TeX delimiters while canonicalizing single-dollar math.
    // This prevents inputs such as `\\(x$^2$\\)` from becoming nested math.
    const protectedMath = [];
    const protect = (kind, latex) => {
      const token = `@@NOVEXA_DOLLAR_PROTECT_${protectedMath.length}@@`;
      protectedMath.push({ token, kind, latex });
      return token;
    };
    source = source
      .replace(/\\[\[]([\s\S]*?)\\[\]]/g, (_, latex) => protect('display', latex))
      .replace(/\\[\(]([\s\S]*?)\\[\)]/g, (_, latex) => protect('inline', latex))
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => protect('display', latex));
    source = source.replace(/(^|[^$])\$([^$\n]+?)\$(?!\$)/g, (_, before, latex) => `${before}\\(${latex}\\)`);
    for (const item of protectedMath) {
      const restored = item.kind === 'display' ? `\\[${item.latex}\\]` : `\\(${item.latex}\\)`;
      source = source.split(item.token).join(restored);
    }
    return source;
  }

  function normalizeSectionHeadings(value) {
    return String(value ?? '').replace(/^(\s*)#{1,6}\s+(.+)$/gm, (_, indent, title) => {
      const clean = String(title).trim().replace(/^#+\s+/, '');
      return `${indent}**✦ ${clean}**`;
    });
  }

  function normalizeInlineHeadingMarkers(value) {
    return String(value ?? '').replace(/(^|\n)\s*#{1,6}\s+(.+)/g, (_, prefix, title) => `${prefix}✦ ${String(title).trim()}`);
  }

  function normalizeUnicodeMath(value) {
    let source = String(value ?? '');
    const supers = {'⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁺':'+','⁻':'-','⁼':'=','⁽':'(','⁾':')'};
    const subs = {'₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','₊':'+','₋':'-','₌':'=','₍':'(','₎':')'};
    // The glyph class MUST be built from the CURRENT map. Sharing one class
    // between both passes made the superscript pass consume subscript glyphs,
    // look them up as undefined, and emit empty math islands such as `y^{}` —
    // the malformed fragment behind the student-visible red brackets when the
    // AI writes ordinary Unicode like `First (y0-subscript)`.
    const convertRuns = (input, map, marker) => {
      const use = map === supers ? supers : subs;
      const glyphs = Object.keys(use)
        .map(ch => ch.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'))
        .join('');
      const rx = new RegExp(`([A-Za-z0-9)\\]}])([${glyphs}]+)`, 'gu');
      return String(input).replace(rx, (_, base, run) => {
        const chars = [...run];
        const converted = chars.map(ch => use[ch]).join('');
        return `${base}${marker}{${converted}}`;
      });
    };
    // Convert superscripts/subscripts only where they are attached to a token;
    // ordinary Unicode prose stays untouched.
    source = convertRuns(source, supers, '^');
    source = convertRuns(source, subs, '_');
    source = source.replace(/√\s*\(?\s*([A-Za-z0-9][A-Za-z0-9._^{}]*?)\s*\)?(?=\s|$|[),.;!?])/g, '\\sqrt{$1}');
    source = source.replace(/×/g, '\\times ' ).replace(/·/g, '\\cdot ' );
    source = source.replace(/±/g, '\\pm ' ).replace(/≤/g, '\\leq ' ).replace(/≥/g, '\\geq ' ).replace(/≠/g, '\\neq ' ).replace(/≈/g, '\\approx ' );
    source = source.replace(/\(([-+]?\d+(?:\.\d+)?)\s*\/\s*([-+]?\d+(?:\.\d+)?)\)/g, '\\frac{$1}{$2}');

    // Repair the plain-text fraction/radical shape commonly produced by AI
    // after a failed Markdown/LaTeX transport, e.g. `(13√(6))/(2)` or
    // `(5√(6))/2`. Turn these back into real TeX before Markdown sees them.
    for (let pass = 0; pass < 4; pass += 1) {
      const before = source;
      source = source
        .replace(/\\sqrt\s*\(\s*([^()]+?)\s*\)/g, '\\sqrt{$1}')
        .replace(/\(([-+]?[^()\n]+)\)\s*\/\s*\(([^()\n]+)\)/g, '\\frac{$1}{$2}')
        .replace(/\(([-+]?[^()\n]+)\)\s*\/\s*([A-Za-z0-9.]+)/g, '\\frac{$1}{$2}')
        .replace(/\(([-+]?[^()\n]*√\s*\([^()]+\)[^()\n]*)\)\s*\/\s*\(([^()\n]+)\)/g, (_, num, den) => `\\frac{${num}}{${den}}`)
        .replace(/([A-Za-z0-9]+)√\s*\(([^()]+)\)\s*\/\s*([A-Za-z0-9.]+)/g, (_, a, b, c) => `\\frac{${a}\\sqrt{${b}}}{${c}}`);
      if (source === before) break;
    }
    return source;
  }

  function wrapEquationLikeText(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');
    const hasExplicitMath = text => /\\\(|\\\[|\$\$|(?<!\$)\$[^$\n]+\$(?!\$)/.test(text);
    const mathSignals = /[=<>^_]|[{}]|\\(?:frac|sqrt|sum|int|times|cdot|pm|leq|geq|neq|approx|alpha|beta|gamma|theta|pi|Delta)\b/;
    const proseWordsRe = /\b(?:the|this|that|these|those|a|an|each|for|when|where|because|since|therefore|using|given|find|calculate|solve|question|answer|formula|explain|method|taking|both|sides|substitute|apply|quotient|law|recap|self|check|quick|hint|write|as|and|or|with|from|into|then|is|are|was|were|of|to)\b/gi;
    const isProseHeavy = text => {
      const t = String(text || '').trim();
      const words = (t.match(/[A-Za-z]+/g) || []).length;
      const proseWords = (t.match(proseWordsRe) || []).length;
      const hasMarkdown = /(?:\*\*|(^|\s)[*_])/.test(t);
      return words >= 3 || proseWords >= 1 || hasMarkdown;
    };
    const promoteInlineMathIslands = line => {
      let out = String(line || '');
      const protectedIslands = [];
      out = out.replace(/\\\(([^\n]*?)\\\)/g, (_, body) => {
        protectedIslands.push(`\\(${body}\\)`);
        return `@@NOVEXA_MIXED_MATH_${protectedIslands.length - 1}@@`;
      });

      // Find balanced parenthesis pairs, then choose non-overlapping math islands.
      // Prefer the outer pair when it is a real equation (`=`); otherwise keep
      // the inner math pair so prose such as `Taking (log_7) of Both Sides` stays prose.
      const pairs = [];
      const stack = [];
      for (let i = 0; i < out.length; i += 1) {
        if (out[i] === '(') stack.push(i);
        else if (out[i] === ')' && stack.length) {
          const startIdx = stack.pop();
          const body = out.slice(startIdx + 1, i);
          if (mathSignals.test(body)) pairs.push({ start: startIdx, end: i, body, hasEquals: /[=<>]/.test(body) });
        }
      }
      const selected = pairs.filter(candidate => {
        const containsChild = pairs.some(child => child !== candidate && child.start > candidate.start && child.end < candidate.end);
        if (!containsChild) return true;
        return candidate.hasEquals;
      }).sort((a, b) => b.start - a.start);
      for (const pair of selected) {
        // Skip a pair already covered by a selected outer pair.
        if (selected.some(outer => outer !== pair && outer.start < pair.start && outer.end > pair.end)) continue;
        if (isProseHeavy(pair.body) && !pair.hasEquals) continue;
        const replacement = `\\(${pair.body.trim()}\\)`;
        out = out.slice(0, pair.start) + replacement + out.slice(pair.end + 1);
      }
      out = out.replace(/@@NOVEXA_MIXED_MATH_(\d+)@@/g, (_, i) => protectedIslands[Number(i)] || '');
      return out;
    };
    const looksEquation = line => {
      const t = String(line || '').trim();
      if (!t || hasExplicitMath(t) || /^#{1,6}\s+/.test(t) || /^```/.test(t) || /^\|.*\|$/.test(t) || /^\*\*✦\s+/.test(t) || /^✦\s+/.test(t)) return false;
      // Never wrap bullets/numbered explanations as one giant equation. Mixed
      // math inside these lines is handled by promoteInlineMathIslands().
      if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(t)) return false;
      const stripped = t.replace(/^[^:]{2,100}:\s*/, '');
      if (!mathSignals.test(stripped)) return false;
      if (isProseHeavy(stripped) && !/^(?:Formula|Working|Solution|Answer|Final answer|LHS|RHS)\s*:/i.test(t)) return false;
      return stripped.length <= 260;
    };
    source = source.split('\n').map(line => {
      const mixed = promoteInlineMathIslands(line);
      if (mixed !== line) line = mixed;
      if (!looksEquation(line)) {
        const match = line.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)((?:[^:]{2,100}):\s+)(.+)$/);
        if (match && !hasExplicitMath(line)) {
          const tail = match[3];
          if (mathSignals.test(tail) && !isProseHeavy(tail)) return `${match[1]}${match[2]}\\(${tail.trim()}\\)`;
        }
        return line;
      }
      const trimmed = line.trim();
      const lead = trimmed.match(/^(Substitute|Substitution|Let|Given|Therefore|Hence|Thus|So|Calculate|Compute|Evaluate|Working|Use)\s+(.+)$/i);
      if (lead && !isProseHeavy(trimmed) && mathSignals.test(lead[2])) {
        const indent = line.slice(0, line.indexOf(trimmed));
        return `${indent}${lead[1]} \\(${lead[2].trim()}\\)`;
      }
      const labelled = /^(\s*(?:(?:Front|Back|Answer|Final answer|Solution|Formula|Working|Error)\s*[:\-]\s*))/i.exec(line);
      if (labelled) {
        const body = line.slice(labelled[1].length).trim();
        if (looksEquation(body)) return `${labelled[1]}\\(${body}\\)`;
      }
      const colonMath = line.match(/^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)([^:]{2,100}:\s+)(.+)$/);
      if (colonMath && mathSignals.test(colonMath[3]) && !isProseHeavy(colonMath[3])) {
        return `${colonMath[1]}${colonMath[2]}\\(${colonMath[3].trim()}\\)`;
      }
      return line;
    }).join('\n');
    return source;
  }

  // Providers occasionally wrap an entire natural-language sentence in a
  // math delimiter. Keep prose outside MathJax and preserve only genuine math islands.
  function normalizeProseWrappedMath(value) {
    let source = String(value ?? '');
    const proseRe = /\b(?:substitute|substitution|apply|quotient|law|method|taking|both|sides|recap|self|check|quick|question|hint|write|answer|explain|using|given|then|and|or|the|this|that|with|from|into|for|when|where|set|add|list|evaluate|each|step|construct|group|multiply|determine|overestimate|underestimate|curve|straight|line|chord|above|below|value|first|middle|last|category|index|column|row|formula|principle|concept)\b/gi;
    const mathCommand = /\\(?:frac|dfrac|tfrac|sqrt|log|ln|sin|cos|tan|sum|int|prod|times|cdot|pm|leq|geq|neq|approx|infty|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega|partial|nabla)(?![A-Za-z])/;
    const unwrapText = text => String(text || '').replace(/\\text\{([^{}]*)\}/g, '$1');

    const demoteBlock = (body) => {
      const text = String(body || '').trim();
      const proseCount = (text.match(proseRe) || []).length;
      const words = (text.match(/[A-Za-z]{2,}/g) || []).length;
      const hasMath = mathCommand.test(text) || /[=<>^_{}²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]/.test(text);
      if (!hasMath && (proseCount >= 2 || words >= 6)) return unwrapText(text);
      if (proseCount < 2 && words < 6) return null;

      // Common provider defect: the whole sentence is wrapped in math and the
      // prose lead is emitted as `\text{...} equation`. Split the prose lead
      // back out so normal word spacing is preserved and only the equation is
      // sent to MathJax.
      const textTail = text.match(/^\\text\{([^{}]*)\}\s+(.+)$/s);
      if (textTail) {
        const tail = textTail[2].trim();
        const tailLooksMath = /[=<>^_]|[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]|\\(?:frac|dfrac|tfrac|sqrt|sum|int|prod|times|cdot|pm|leq|geq|neq|approx|infty|alpha|beta|gamma|theta|pi|lambda|mu|sigma|partial|nabla)\b/.test(tail);
        if (tailLooksMath) return `${textTail[1].trim()} \\(${tail}\\)`;
      }

      const cmdMatch = text.match(/\\(?:log|ln|frac|dfrac|tfrac|sqrt|sum|int|prod|sin|cos|tan)(?![A-Za-z])/i);
      if (cmdMatch && cmdMatch.index != null) {
        const parenStart = text.lastIndexOf('(', cmdMatch.index);
        const lastParen = text.lastIndexOf(')');
        if (parenStart >= 0 && lastParen > parenStart) {
          const before = unwrapText(text.slice(0, parenStart).trim());
          const math = text.slice(parenStart + 1, lastParen).trim();
          const after = unwrapText(text.slice(lastParen + 1).trim());
          return [before, `\\(${math}\\)`, after].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        }
      }

      // Remove prose-oriented TeX wrappers, then re-wrap compact equations.
      let plain = unwrapText(text);
      plain = plain.replace(/(^|\s)([A-Za-z]\s*=\s*\\[A-Za-z]+(?:_[A-Za-z0-9]+)?(?:\s*[A-Za-z0-9.+\-*/()=^{}]*)?)(?=\s|$)/g,
        (_, lead, expr) => `${lead}\\(${expr.trim()}\\)`);
      return plain;
    };

    source = source.replace(/\\\(([^\n]*?)\\\)/g, (full, body) => {
      const result = demoteBlock(body);
      return result == null ? full : result;
    });
    source = source.replace(/\\\[([\s\S]*?)\\\]/g, (full, body) => {
      const result = demoteBlock(body);
      return result == null ? full : result;
    });
    return source;
  }

  function prepareMarkdown(value) {
    let source = String(value ?? '').split('\\(').join('\\(').split('\\)').join('\\)').split('\\[').join('\\[').split('\\]').join('\\]');
    source = normalizeSectionHeadings(normalizeCommonLatexSyntax(normalizePlainMathNotation(repairBareTextMathCommands(normalizeUnicodeMath(source)))));
    source = normalizeProseWrappedMath(source);
    source = source.replace(/(:\s*)(\\(?:int|sum|prod|frac|dfrac|tfrac|sqrt|lim)\S[^\n.;!?]{1,220})/g, (_, prefix, expr) => `${prefix}\\(${expr.trim()}\\)`);
    source = normalizeDollarMath(source);
    source = normalizeEnvironmentBlocks(source);
    source = normalizeMarkdownTables(source);
    source = wrapBareMathLines(source);
    source = wrapEquationLikeText(source);
    // Never pass delimiter artefacts into Markdown. A line containing only
    // `[` or `]` is almost always a broken TeX display closer from an AI
    // provider and otherwise renders as the ugly raw bracket seen by students.
    // Collapse duplicated TeX delimiters created by double-escaped provider output.
    source = source
      .replace(/\\\(\s*\\\(/g, '\\(').replace(/\\\)\s*\\\)/g, '\\)')
      .replace(/\\\[\s*\\\[/g, '\\[').replace(/\\\]\s*\\\]/g, '\\]')
      .replace(/(^|\n)\s*(?:\\\]|\\\[|[\[\]])\s*(?=\n|$)/g, '$1');
    source = balanceDelimiters(source);
    return source;
  }

  function prepareInline(value) {
    let source = String(value ?? '').split('\\(').join('\\(').split('\\)').join('\\)').split('\\[').join('\\[').split('\\]').join('\\]');
    source = normalizeInlineHeadingMarkers(normalizeCommonLatexSyntax(normalizePlainMathNotation(repairBareTextMathCommands(normalizeUnicodeMath(source)))));
    source = normalizeProseWrappedMath(source);
    source = normalizeDollarMath(source);
    source = normalizeEnvironmentBlocks(source);
    source = wrapBareMathLines(source);
    source = wrapEquationLikeText(source);
    source = source
      .replace(/\\\(\s*\\\(/g, '\\(').replace(/\\\)\s*\\\)/g, '\\)')
      .replace(/\\\(\s*\(([^()\n]+)\)\s*\\\)/g, '\\($1\\)')
      .replace(/\\\[\s*\\\[/g, '\\[').replace(/\\\]\s*\\\]/g, '\\]')
      .replace(/(^|\n)\s*(?:\\\]|\\\[|[\[\]])\s*(?=\n|$)/g, '$1');
    return balanceDelimiters(source);
  }


  function cleanMathArtifacts(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');
    // Providers sometimes leak escaped Markdown headings such as \### or \##
    // into the final response. A heading marker is never valid math.
    source = source.replace(/(^|\n)[ \t]*\\?(?=\#{1,6}\s)/g, '$1');
    // Remove standalone TeX delimiters/brackets that escaped the parser.
    source = source.replace(/(^|\n)[ \t]*(?:\\\(|\\\)|\\\[|\\\]|\[\]])[ \t]*(?=\n|$)/g, '$1');
    source = source.replace(/(^|\n)[ \t]*[\[\]][ \t]*(?=\n|$)/g, '$1');
    source = source.replace(/\\(?=#)/g, '');
    return source.replace(/\n{3,}/g, '\n\n');
  }

  function cleanRenderedMathArtifacts(root) {
    if (!root) return;
    const scope = root.matches?.('.markdown-body, .novexa-math-target, .paper-ai-markdown')
      ? root : root.querySelector?.('.markdown-body, .novexa-math-target, .paper-ai-markdown, .flashcard-math-slot') || root;

    // Last-resort safety net for MathJax errors. A failed TeX fragment can leave
    // a red `mjx-merror` node behind even after the caller restored its snapshot.
    // Replace the error node with a readable plain-text version so students never
    // see MathJax's red error brackets/boxes in Novexa AI, Paper AI, or Flashcards.
    const errorNodes = scope.querySelectorAll?.('.mjx-merror, .MathJax_Error, [data-mjx-error]') || [];
    errorNodes.forEach(errorNode => {
      try {
        const raw = String(errorNode.textContent || '').trim();
        const readable = readableLatex(raw)
          .replace(/\\(?:\\(|\\)|\\[|\\])/g, '')
          .replace(/(^|\\n)[ \\t]*[\\[\\]]+[ \\t]*(?=\\n|$)/g, '$1')
          .trim();
        errorNode.replaceWith(document.createTextNode(readable));
      } catch (_) {
        try { errorNode.remove(); } catch (_) {}
      }
    });

    const textNodes = [];
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);
    const rawDelimiter = /\\(?:\(|\)|\[|\])/g;
    const bareHeading = /(^|\n)\s*\\?#{1,6}\s+/g;
    const rawMathCommand = /(?:\\(?:frac|dfrac|tfrac|sqrt|binom|sum|prod|int|text|mathrm|mathbf|mathbb|mathit|overline|underline|boxed|vec|hat|bar|times|cdot|pm|leq|geq|neq|approx|infty|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega|partial|nabla|left|right)\b|\b(?:frac|dfrac|tfrac|sqrt)\s*[({])/i;
    for (const textNode of textNodes) {
      const parent = textNode.parentElement;
      if (!parent || parent.closest('script,style,pre,code,.MathJax,.mjx-container,.katex,.novexa-math-slot,.paper-math-slot,.flashcard-math-slot,[data-latex]')) continue;
      const original = String(textNode.nodeValue || '');
      if (!original) continue;
      let next = original.replace(bareHeading, '$1').replace(rawDelimiter, '');
      if (rawMathCommand.test(next)) {
        try { next = readableLatex(next); } catch (_) {}
      }
      // Remove only delimiter/error artefacts that occupy a line on their own.
      // Do NOT strip ordinary square brackets used by student-facing prose.
      next = next
        .replace(/\n[ \t]*[\[\]]+[ \t]*(?=\n|$)/g, '')
        .replace(/^[ \t]*[\[\]]+[ \t]*$/gm, '')
        .replace(/^[ \t]*(?:\\\]|\\\[)[ \t]*$/gm, '');
      if (next !== original) textNode.nodeValue = next;
    }
  }

  function sanitizeStudentFacingMath(value) {
    let source = String(value ?? '').replace(/\r\n?/g, '\n');
    source = source
      .replace(/(^|\n)[ \t]*(?:\\\(|\\\)|\\\[|\\\]|[\[\]])[ \t]*(?=\n|$)/g, '$1')
      .replace(/\\(?:\(|\)|\[|\])/g, '')
      .replace(/^[ \t]*[\[\]]+[ \t]*$/gm, '');
    // Delimiter stripping alone leaves the TeX BODY visible (e.g. `\frac{1}{2}`),
    // which violates the no-raw-LaTeX rule. Convert each surviving math command
    // (with up to one nesting level of arguments) into its readable Unicode form.
    // Ordinary escaped characters such as `\#` never match and stay untouched.
    const MATH_COMMAND_RE = /^\\(?:frac|dfrac|tfrac|sqrt|binom|sum|prod|int|cdot|times|pm|mp|leq|geq|neq|approx|equiv|infty|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega|partial|nabla|text|mathrm|mathbf|mathbb|mathit|overline|underline|boxed|vec|hat|bar|left|right|bigl|bigr|Bigl|Bigr|big|Big|Bigg|quad|qquad|dots|ldots|cdots|Rightarrow|Longrightarrow|Leftarrow|Longleftarrow|rightarrow|leftarrow|begin|end)\b/;
    source = source.replace(/\\[A-Za-z]+(?:\[[^\]\n]*\]|\{[^{}\n]*(?:\{[^{}\n]*\}[^{}\n]*)*\})*/g, fragment =>
      MATH_COMMAND_RE.test(fragment) ? (() => { try { return readableLatex(fragment); } catch (_) { return fragment; } })() : fragment);
    return source.replace(/\n{3,}/g, '\n\n');
  }

  function readableLatex(value) {
    // Fallback must also repair providers that dropped the TeX backslash.
    // This is what prevents visible strings such as `frac{...}{...}` when
    // MathJax rejects one malformed fragment and the readable fallback runs.
    let out = repairBareTextMathCommands(String(value ?? ''));
    if (/^\s*[\[\]](?:\s*[\[\]])?\s*$/.test(out)) return '';

    // Resolve brace-based commands from the inside out. A single pass cannot
    // handle a nested command such as \frac{5\sqrt{6}}{2}, because the outer
    // \frac argument then contains a nested brace pair and the shallow
    // \{[^{}]*\} matcher intentionally refuses to match across it, leaving
    // \frac untouched and producing garbage like "frac5√(6)2" once the loose
    // backslash/brace cleanup below runs. Looping the same substitutions
    // resolves the innermost command first (\sqrt{6} -> √(6)), so the next
    // pass sees a brace-free \frac argument and converts correctly.
    for (let pass = 0; pass < 6; pass += 1) {
      const before = out;
      out = out
        .replace(/\\begin\{(?:aligned|alignedat|gathered|gather|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array|equation|equation\*)\}/g,'')
        .replace(/\\end\{(?:aligned|alignedat|gathered|gather|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array|equation|equation\*)\}/g,'')
        .replace(/\\sqrt\s*\{([^{}]*)\}/g,'√($1)')
        .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,'($1)/($2)')
        .replace(/\\binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,'C($1,$2)')
        .replace(/\\(?:text|textbf|textit|textrm|mathrm|mathbf|mathit|mathbb)\s*\{([^{}]*)\}/g,'$1')
        .replace(/\\(?:overline|underline|boxed|vec|hat|bar|bigl|bigr|Bigl|Bigr)\s*\{?([^{}]*)\}?/g,'$1');
      if (out === before) break;
    }

    // \left / \right are pure sizing hints with no symbol of their own.
    // Strip them BEFORE the short two-letter commands below: an unbounded
    // `\le` replacement matches the first three characters of `\left`
    // (backslash + l + e), leaving the literal text "ft" behind and
    // producing the "≤ ft[" corruption seen in production.
    out = out.replace(/\\(?:left|right)\b\s*/g,'');

    // Short commands use `(?![A-Za-z])`, NOT `\b`: underscore is a word
    // character, so `\int_1^3` has NO word boundary after `t`. With `\b`,
    // `\int`/`\sum`/`\prod` followed by a subscript never converted, and the
    // loose backslash strip below then leaked raw text such as "int_1^3".
    // The lookahead still blocks prefix collisions (`\in` in `\infty`,
    // `\to` in `\theta`) because those continuations are letters.
    out = out
      .replace(/\\times/g,' × ').replace(/\\cdot/g,' · ').replace(/\\pm/g,' ± ')
      .replace(/\\leq(?![A-Za-z])/g,' ≤ ').replace(/\\geq(?![A-Za-z])/g,' ≥ ').replace(/\\neq(?![A-Za-z])/g,' ≠ ')
      .replace(/\\le(?![A-Za-z])/g,' ≤ ').replace(/\\ge(?![A-Za-z])/g,' ≥ ').replace(/\\ne(?![A-Za-z])/g,' ≠ ')
      .replace(/\\approx/g,' ≈ ').replace(/\\equiv(?![A-Za-z])/g,' ≡ ')
      .replace(/\\notin(?![A-Za-z])/g,' ∉ ').replace(/\\in(?![A-Za-z])/g,' ∈ ')
      .replace(/\\infty/g,'∞')
      .replace(/\\(?:Rightarrow|Longrightarrow)/g,' → ').replace(/\\(?:Leftarrow|Longleftarrow)/g,' ← ')
      .replace(/\\to(?![A-Za-z])|\\rightarrow/g,' → ').replace(/\\leftarrow/g,' ← ')
      .replace(/\\dots|\\ldots|\\cdots/g,' … ')
      .replace(/\\sum(?![A-Za-z])/g,'Σ').replace(/\\prod(?![A-Za-z])/g,'Π').replace(/\\int(?![A-Za-z])/g,'∫')
      .replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ')
      .replace(/\\delta/g,'δ').replace(/\\theta/g,'θ').replace(/\\pi(?![A-Za-z])/g,'π').replace(/\\lambda/g,'λ')
      .replace(/\\mu/g,'μ').replace(/\\sigma/g,'σ').replace(/\\omega/g,'ω').replace(/\\partial/g,'∂').replace(/\\nabla/g,'∇')
      .replace(/\\(?:quad|qquad|;|,)/g,' ')
      .replace(/\\\\/g,' ; ').replace(/&/g,'')
      .replace(/\^\{([^{}]+)\}/g,'^$1').replace(/_\{([^{}]+)\}/g,'_$1')
      .replace(/[{}]/g,'').replace(/\\#/g,'#').replace(/\\[A-Za-z]+/g,m=>m.slice(1))
      .replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g,'')
      // A failed/partial delimiter can leave a lone square bracket on its own
      // line. It is a TeX delimiter artefact, not student-facing content.
      .replace(/(^|\n)\s*[\[\]]\s*(?=\n|$)/g, '$1')
      .replace(/\s{2,}/g,' ').trim();

    // Strip a dangling trailing `]` ONLY when it has no matching opener.
    // `\left[ x \right]` legitimately degrades to "[ x ]"; the old
    // unconditional trim corrupted that balanced pair into "[ x".
    if (/\s+\]\s*$/.test(out) && !out.includes('[')) {
      out = out.replace(/\s+\]\s*$/, '');
    }
    return out;
  }

  window.NovexaMath = Object.freeze({
    commands: COMMANDS.slice(),
    repairBareTextMathCommands,
    normalizeEnvironmentBlocks,
    normalizeMarkdownTables,
    prepareMarkdown,
    prepareInline,
    readableLatex,
    balanceDelimiters,
    normalizeCommonLatexSyntax,
    normalizePlainMathNotation,
    normalizeSectionHeadings,
    normalizeInlineHeadingMarkers,
    normalizeUnicodeMath,
    wrapEquationLikeText,
    cleanMathArtifacts,
    cleanRenderedMathArtifacts,
    sanitizeStudentFacingMath,
    stripLeakedLayoutMarkup,
    hasBalancedLatex
  });
})();
