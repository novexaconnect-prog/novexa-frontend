(() => {
  window.NOVEXA_FRONTEND_BUILD = '2026-08-24-v43.71-readable-tables-no-red-brackets';
  const $ = (id) => document.getElementById(id);
  const chatThread = $('chatThread');
  const chatInput = $('chatInput');
  const chatSubmit = $('chatSubmit');
  const chatStop = $('chatStop');
  const aiStatus = $('aiStatus');
  const aiLoginBtn = $('aiLoginBtn');
  const aiUpgradeBtn = $('aiUpgradeBtn');
  const aiUserName = $('aiUserName');
  const aiUserEmail = $('aiUserEmail');
  const aiAvatar = $('aiAvatar');
  const aiPetTopAvatar = $('aiPetTopAvatar');
  const aiPetTopName = $('aiPetTopName');
  const subjectSelect = $('subjectSelect');
  const composerMode = $('composerMode');
  const recentChats = $('recentChats');
  const recentChatsSearch = $('recentChatsSearch');
  const recentChatsPlan = $('recentChatsPlan');
  const newChat = $('newChat');
  const newChatSidebar = $('newChatSidebar');
  const sidebarCollapse = $('sidebarCollapse');
  const sidebarToggle = $('sidebarToggle');
  const sidebarBackdrop = $('aiSidebarBackdrop');
  const aiWorkspace = document.querySelector('.ai-workspace');
  const deleteChat = $('deleteChat');
  const exportChat = $('exportChat');
  const creditBadge = $('aiCredits');
  const chatCreditBadge = $('aiChatCredits');
  const aiPlanBadge = $('aiPlanBadge');
  const toolGrid = $('aiToolGrid');
  const attachButton = $('attachButton');
  const fileInput = $('fileInput');
  const attachmentPreview = $('attachmentPreview');
  const composerWrap = document.querySelector('.composer-wrap');
  const aiReminder = document.getElementById('aiReminder');
  const aiCreditExhausted = $('aiCreditExhausted');
  const aiZeroCreditUpgrade = $('aiZeroCreditUpgrade');
  const aiZeroCreditLater = $('aiZeroCreditLater');
  if (window.pdfjsLib?.GlobalWorkerOptions) window.pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';

  const state = {
    user: null,
    history: [],
    mode: 'study',
    action: 'study',
    subject: new URLSearchParams(location.search).get('subject') || 'General',
    busy: false,
    plan: 'basic',
    creditExhausted: false,
    abortController: null,
    stopRequested: false,
    attachments: [],
    deckTarget: new URLSearchParams(location.search).get('deck') || '',
    flashcardSource: { type: 'ai', reference: '' },
    pet: { name: 'Nova', emoji: '🦊' },
    chatId: null,
    chatTitle: '',
    chatList: [],
    sidebarCollapsed: false,
    serverHistoryAvailable: true,
    chatArchived: false,
  };

  // The app normally runs from the Node backend. If you use VS Code Live Server on :5500,
  // send AI requests to the backend on :3000 instead of trying to call /api on the static server.
  const apiBase = ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && location.port !== '3000') ? 'http://localhost:3000' : '';
  const backendUrl = `${apiBase}/api`;
  let sendRequestLock = false;
  let refreshAuthInFlight = null;
  let lastLoadedUserId = '';
  let lastRecoveredJobId = '';

  const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function normalizeMathSource(input) {
    let source = String(input ?? '').replace(/\r\n?/g, '\n');
    // Some providers escape Markdown headings as `\###`; restore the heading marker before math detection.
    source = source.replace(/(^|\n)\\(?=#{1,6}\s)/g, '$1');

    // Providers occasionally return escaped newlines/tabs as literal text.
    // Convert those transport escapes before Markdown sees the response.
    // JSON transport already decodes escaped newlines/tabs. Do not rewrite single-backslash
    // sequences here because LaTeX commands such as \\nabla, \\neq, \\text and \\times use them.

    // Normalize common escaped TeX delimiters and commands.
    source = source
      .replace(/\\\\(?=(?:[A-Za-z]+|[()[\]{}|]))/g, '\\')
      .replace(/\\n(?=\\[A-Za-z])/g, '')
      .replace(/\\t(?=\\[A-Za-z])/g, '')
      .replace(/\\\[/g, '\\[').replace(/\\\]/g, '\\]')
      .replace(/\\\(/g, '\\(').replace(/\\\)/g, '\\)')
      .replace(/\\dfrac/g, '\\frac')
      .replace(/\\tfrac/g, '\\frac')
      .replace(/\\displaystyle\s*/g, '')
      .replace(/\\left\s*([([{|])/g, '\\left$1')
      .replace(/\\right\s*([)\]}|])/g, '\\right$1')
      .replace(/(^|\n)\s*\\(?=#{1,6}(?:\s|$))/g, '$1');

    // Repair common provider omissions where TeX command backslashes are lost
    // even more aggressively for common bare commands such as `frac`, `sum`,
    // `big`, `quad`, etc. Some providers return valid-looking mathematics with
    // the leading backslashes stripped. Restore those commands before Markdown
    // or MathJax sees the answer.
    const bareMathCommands = [
      'frac','dfrac','tfrac','sqrt','sum','prod','int','cdot','times','quad','qquad',
      'big','Big','Bigg','bigl','bigr','Bigl','Bigr','left','right','overline','underline',
      'boxed','vec','hat','bar','text','mathrm','mathbf','mathbb','mathit','leq','geq','neq',
      'ne','le','ge','approx','equiv','pm','infty','alpha','beta','gamma','delta','theta','pi',
      'sigma','lambda','mu','omega','partial','nabla','Rightarrow','Longrightarrow','Leftarrow',
      'Longleftarrow','rightarrow','leftarrow','dots','ldots','cdots','quad','qquad'
    ];
    const bareCommandSource = bareMathCommands.join('|');
    const repairBareMathCommands = (line) => {
      const trimmed = String(line || '').trim();
      const equationLike = /[=<>^_]|\b(?:Formula|LHS|RHS|Working|Solution|Answer|Final answer|Error)\s*:/i.test(trimmed);
      const hasMathWords = new RegExp('\\b(?:' + bareCommandSource + ')\\b', 'i').test(trimmed);
      if (!equationLike && !hasMathWords) return line;
      let out = String(line || '');
      for (const cmd of bareMathCommands) {
        const re = new RegExp('(?<!\\\\)\\b' + cmd.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&') + '\\b', 'g');
        out = out.replace(re, '\\' + cmd);
      }
      // Common transport form: `big[(...)]` -> `\\bigl[...\\bigr]`.
      out = out.replace(/\\big\s*\(/g, String.raw`\bigl(`).replace(/\\big\s*\[/g, String.raw`\bigl[`).replace(/\\big\s*\{/g, String.raw`\bigl{`);
      out = out.replace(/\\big\s*\)/g, String.raw`\bigr)`).replace(/\\big\s*\]/g, String.raw`\bigr]`).replace(/\\big\s*\}/g, String.raw`\bigr}`);
      out = out.replace(/\\sum_([A-Za-z])\s*=\s*([0-9]+)\s*\^\s*([A-Za-z0-9]+(?:-[0-9]+)?)/g, String.raw`\sum_{$1=$2}^{$3}`);
      out = out.replace(/\\frac\s*\(\s*([^()]+)\s*\)\s*\/\s*\(([^()]+)\)/g, String.raw`\frac{$1}{$2}`);
      out = out.replace(/\\frac\s*\(\s*([^()]+)\s*\)\s*\/\s*([A-Za-z0-9.]+)/g, String.raw`\frac{$1}{$2}`);
      out = out.replace(/\\frac\s*\(\s*\(([^()]+)\)\s*\/\s*([^()]+)\s*\)(\s*\^\s*[{]?[A-Za-z0-9]+[}]?)?/g, String.raw`\frac{$1}{$2}$3`);
      out = out.replace(/\\frac\s*\^\s*([0-9]+)/g, '$1');
      out = out.replace(/\\\\(?=\\\\)/g, '\\\\');
      return out;
    };
    source = source.split('\n').map(repairBareMathCommands).join('\n');

    // during transport. Only apply these repairs on equation-like lines so normal
    // prose such as the word "sum" is never modified.
    const repairLooseMath = (line) => {
      const raw = String(line);
      const trimmed = raw.trim();
      const hasMathSignal = /(?:[=^_]\s*|\\[A-Za-z]+|\b(?:frac|dfrac|tfrac|sqrt|sum|int|prod|cdot|times|quad|big|Big|left|right|overline|boxed|leq|geq|neq|pm|infty|alpha|beta|gamma|theta|pi|sigma|lambda|mu|partial)\b)/.test(trimmed);
      const looksEquation = /[=<>]/.test(trimmed) || /\b(?:Formula|Working|Solution|Answer|Final answer|LHS|RHS)\s*:/i.test(trimmed);
      if (!hasMathSignal && !looksEquation) return raw;
      let repaired = raw;
      const commands = ['frac','dfrac','tfrac','sqrt','sum','int','prod','cdot','times','quad','qquad','big','Big','Bigg','left','right','overline','underline','boxed','vec','hat','text','mathrm','mathbf','mathbb','leq','geq','neq','approx','equiv','pm','infty','alpha','beta','gamma','theta','pi','sigma','lambda','mu','partial','nabla','Rightarrow','Longrightarrow','dots','ldots','cdots','quad'];
      for (const cmd of commands) {
        const escaped = cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(?<![A-Za-z_])' + escaped + '(?=\\s|[_^{(\\[\\]})]|$)', 'g');
        repaired = repaired.replace(re, (match, offset, whole) => {
          return Number(offset) > 0 && whole[String(offset) - 1] === '\\' ? match : '\\' + match;
        });
      }
      // Common transport corruption such as literal \n\ge / \nabla.
      repaired = repaired.replace(/\\n(?=(?:ge|le|neq|eq|in|notin|abla|abla|times|theta|text|tri|to)\b)/g, '');
      // Convert simple a/b fractions that lost their TeX \frac command.
      repaired = repaired.replace(/\(([^()\n]+)\)\s*\/\s*\(([^()\n]+)\)/g, '\\frac{$1}{$2}');
      repaired = repaired.replace(/(?<![A-Za-z])([A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+)(?=[,.;)]|$)/g, '\\frac{$1}{$2}');
      return repaired;
    };
    source = source.split('\n').map(repairLooseMath).join('\n');

    // Convert raw LaTeX environments to display math before Markdown.
    source = source.replace(/\\begin\{(aligned|gathered|cases|matrix|pmatrix|bmatrix|array|equation|align\*?)\}([\s\S]*?)\\end\{\1\}/g, '\\[$&\\]');

    // Empty math is never useful and is a common source of NaN SVG errors.
    source = source
      .replace(/\\\[\s*\\\]/g, '')
      .replace(/\\\(\s*\\\)/g, '')
      .replace(/\$\$\s*\$\$/g, '')
      .replace(/(^|\n)\s*\\\[\s*\n/g, '$1')
      .replace(/\n\s*\\\]\s*(?=\n|$)/g, '\n');

    // Balance explicit TeX delimiters. If a provider emits an unmatched
    // opener/closer, strip the delimiter instead of allowing MathJax to treat
    // the rest of the entire answer as one giant equation.
    const balancePair = (text, open, close) => {
      let result = '';
      let pos = 0;
      while (pos < text.length) {
        const a = text.indexOf(open, pos);
        if (a < 0) { result += text.slice(pos); break; }
        const b = text.indexOf(close, a + open.length);
        if (b < 0) {
          result += text.slice(pos, a) + text.slice(a + open.length);
          break;
        }
        result += text.slice(pos, b + close.length);
        pos = b + close.length;
      }
      return result;
    };
    source = balancePair(source, '\\[', '\\]');
    source = balancePair(source, '\\(', '\\)');
    source = balancePair(source, '$$', '$$');

    // Remove unmatched/stray dollars rather than letting Markdown/MathJax
    // consume large chunks of prose. Paired math is protected by renderMarkdown.
    source = source.split('\n').map(line => {
      const count = (line.match(/\$/g) || []).length;
      if (count % 2 === 1) return line.replace(/\$/g, '');
      return line;
    }).join('\n');

    // Strip layout commands that are safe to remove in normal student answers.
    source = source.replace(/\\(?:left|right|Bigl|Bigr)\b/g, '');

    // Models sometimes return a perfectly valid equation but omit the TeX
    // delimiters, e.g. `Z = \frac{X-\mu}{\sigma}` or `v^2 = u^2 + 2as`.
    // MathJax will display those as literal text unless we repair the
    // delimiters. Only wrap equation-looking lines (or labelled formula
    // lines), so ordinary prose is never swallowed into a math expression.
    let insideDisplayMath = false;
    source = source.split('\n').map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('\\[') || trimmed.startsWith('$$')) {
        insideDisplayMath = true;
        const hasClose = trimmed.includes('\\]') || (trimmed.length > 2 && trimmed.endsWith('$$'));
        if (hasClose) insideDisplayMath = false;
        return line;
      }
      if (insideDisplayMath) {
        if (trimmed.includes('\\]') || trimmed.endsWith('$$')) insideDisplayMath = false;
        return line;
      }
      if (!trimmed || /^(?:```|[#>*-]\s*```)/.test(trimmed)) return line;
      // Markdown headings and list markers are never math, even when they
      // contain an equality such as `n=1`.
      if (/^#{1,6}\s+/.test(trimmed) || /^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) return line;
      if (/^\s*(?:\\\(|\\\[|\$\$|\$)/.test(trimmed)) return line;
      // Never swallow a natural-language instruction into one MathJax block.
      // This prevents lines such as `5. Substitute and apply the Quotient Law (...)`
      // from becoming italic MathJax text with spaces visually collapsed.
      const proseWords = (trimmed.match(/\b(?:method|taking|both|sides|substitute|substitution|apply|quotient|law|recap|self|check|quick|question|hint|write|answer|explain|using|given|therefore|because|then|and|or|the|this|that|with|from|into|for|when|where)\b/gi) || []).length;
      const alphaWords = (trimmed.match(/[A-Za-z]+/g) || []).length;
      if (/\*\*/.test(trimmed) || proseWords >= 2 || alphaWords >= 8) return line;
      const label = /^(\s*(?:(?:[-*+]\s+|\d+[.)]\s+)?(?:Front|Back|Answer|Final answer|Solution|Formula|Working|where))\s*[:\-]\s*)/i.exec(line);
      const body = label ? line.slice(label[1].length).trim() : trimmed;
      const mathCommand = /\\(?:frac|dfrac|tfrac|sqrt|text|mathrm|mathbf|mathit|mathbb|overline|underline|boxed|vec|hat|times|cdot|pm|leq|geq|neq|approx|equiv|in|notin|int|sum|prod|infty|alpha|beta|gamma|theta|pi|lambda|mu|sigma|omega|partial|nabla|quad|Rightarrow|Longrightarrow|begin|end)\b/i.test(body);
      const equationShape = /[=<>]/.test(body) && /[A-Za-z0-9]/.test(body);
      const wordCount = (body.match(/[A-Za-z]+/g) || []).length;
      const proseMarker = /\b(?:the|is|are|was|were|answer|because|where|when|this|that|there|therefore|find|calculate|solve|using|given|text|question|factorise|factorize|claim|for|every|integer|method|taking|both|sides|substitute|substitution|apply|quotient|law|recap|self|check|quick|hint|write|explain|and|or|with|from|into|then)\b/i.test(body);
      const simpleEquation = equationShape && wordCount <= 4 && !proseMarker;
      const proseWordCount = (body.match(/[A-Za-z]+/g) || []).length;
      const emphaticProse = /\*\*/.test(body) && proseWordCount >= 3;
      const mathish = !emphaticProse && !(/(?:method|taking|both|sides|substitute|apply|quotient|law|recap|self|check|quick|question|hint|write|explain)\b/i.test(body) && proseWordCount >= 5)
        && ((mathCommand && (!proseMarker || Boolean(label))) || /[A-Za-z0-9)\]}]\s*\^\s*[{A-Za-z0-9(]/.test(body) || /[A-Za-z0-9)\]}]\s*_\s*[{A-Za-z0-9(]/.test(body) || simpleEquation || /\b(?:sin|cos|tan|log|ln|exp)\s*\(/i.test(body));
      if (!mathish) return line;
      const prefix = label ? label[1] : '';
      if (label || (mathCommand && !proseMarker) || simpleEquation || /^(?:[A-Za-z]\s*\([^)]*\)|[A-Za-z]\s*[=<>])/.test(body)) return `${prefix}\\(${body}\\)`;
      return line.replace(/\\(?:frac|dfrac|tfrac|sqrt|mathrm|mathbf)\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}(?:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})?/g, match => `\\(${match}\\)`);
    }).join('\n');
    // Final deterministic math repair after all line-level transforms. This catches
    // provider-corrupted forms that survive the earlier passes.
    source = source
      .replace(/\\sum_([A-Za-z])\s*=\s*([0-9]+)\s*\^\s*([A-Za-z0-9]+(?:-[0-9]+)?)/g, String.raw`\sum_{$1=$2}^{$3}`)
      .replace(/(?:\\)?big\s*\]/g, String.raw`\bigr]`)
      .replace(/(?:\\)?big\s*\)/g, String.raw`\bigr)`)
      .replace(/(?:\\)?big\s*\}/g, String.raw`\bigr}`)
      .replace(/\\frac\s*\(\s*\(([^()]+)\)\s*\/\s*([^()]+)\s*\)(\s*\^\s*[{]?[A-Za-z0-9]+[}]?)?/g, String.raw`\frac{$1}{$2}$3`)
      .replace(/\\frac\s*\^\s*([0-9]+)/g, '$1');
    return source;
  }

  function normalizeRawLatexBlocks(text) {
    let source = String(text ?? '').replace(/\r\n?/g, '\n');
    // Repair common provider escaping before we look for environments.
    source = source
      .replace(/\\\\(?=(?:begin|end|frac|dfrac|tfrac|sqrt|text|mathrm|mathbf|mathbb|overline|underline|boxed|vec|hat|times|cdot|pm|leq|geq|neq|approx|equiv|in|notin|int|sum|prod|infty|alpha|beta|gamma|theta|pi|lambda|mu|sigma|omega|partial|nabla|quad|Rightarrow|Longrightarrow)\b)/g, '\\');
    // Entire multiline TeX environments must be one display equation.
    // Wrapping only the `\begin{aligned}` line leaves the following `&=`
    // lines as raw TeX, which was the exact formatting failure visible in
    // the user's screenshots.
    source = source.replace(/(^|\n)([ \t]*)\\begin\{(aligned|alignedat|gathered|gather|cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array|equation|equation\*)\}([\s\S]*?)\\end\{\3\}(?=\n|$)/g,
      (_, prefix, indent, env, body) => `${prefix}${indent}\\[\n${body.trim()}\n${indent}\\]`);
    // Convert standalone equation-like LaTeX lines that models emitted
    // without delimiters. This intentionally excludes prose.
    let insideDisplay = false;
    source = source.split('\n').map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('\\[')) { insideDisplay = !trimmed.includes('\\]'); return line; }
      if (insideDisplay) { if (trimmed.includes('\\]')) insideDisplay = false; return line; }
      if (!trimmed || /^\\begin\{|^\\end\{/.test(trimmed)) return line;
      // Keep genuine Markdown structure intact, but allow a bullet/numbered
      // item to contain a labelled equation such as "Area: A = ...".
      if (/^#{1,6}\s+/.test(trimmed)) return line;
      if (/^\s*(?:\\\(|\\\[|\$\$|\$)/.test(trimmed) && !trimmed.includes('\\begin')) return line;
      const bulletMatch = trimmed.match(/^([-*+]\s+|\d+[.)]\s+)(.*)$/);
      const lineBody = bulletMatch ? bulletMatch[2].trim() : trimmed;
      const mathCommand = /\\(?:frac|dfrac|tfrac|sqrt|text|mathrm|mathbf|mathbb|overline|underline|boxed|vec|hat|times|cdot|pm|leq|geq|neq|approx|equiv|in|notin|int|sum|prod|infty|alpha|beta|gamma|theta|pi|lambda|mu|sigma|omega|partial|nabla|quad|Rightarrow|Longrightarrow)\b/.test(lineBody);
      const equationShape = /[=<>]/.test(lineBody) && /[A-Za-z0-9]/.test(lineBody);
      const prose = /\b(?:the|this|that|because|therefore|using|given|where|when|find|calculate|solve|question|answer|formula|statement|claim|for|every|integer)\b/i.test(lineBody);
      const labelledMath = /^(?:[-*+]\s+|\d+[.)]\s+)?(?:Formula|Working|Solution|Answer|Final answer)\s*[:\-]/i.test(trimmed);
      if (mathCommand && (!prose || labelledMath)) return `${bulletMatch ? bulletMatch[1] : ''}\\(${lineBody}\\)`;
      if (equationShape && !prose && (lineBody.length < 180 || /^[A-Za-z0-9_\\^{}()\[\]\s.\-+*/=<>]+$/.test(lineBody))) return `${bulletMatch ? bulletMatch[1] : ''}\\(${lineBody}\\)`;

      // Natural-language label + equation: keep the label outside math.
      const colonMath = lineBody.match(/^([^:]{2,100}:\s*)(.+)$/);
      if (colonMath) {
        const tail = colonMath[2].trim();
        const hasMathSignal = /[=<>^_]|[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]|\\(?:frac|sqrt|int|sum|times|cdot|pm|leq|geq|approx|infty)\b/.test(tail);
        if (hasMathSignal && (tail.length < 220 || mathCommand)) return `${bulletMatch ? bulletMatch[1] : ''}${colonMath[1]}\\(${tail}\\)`;
      }
      return line;
    }).join('\n');
    return source;
  }

  function renderMarkdown(text) {
    let normalized = window.NovexaMath.stripLeakedLayoutMarkup(normalizeRawLatexBlocks(text));
    normalized = String(normalized).split('\\(').join('\(').split('\\)').join('\)').split('\\[').join('\[').split('\\]').join('\]');
    let source = window.NovexaMath.cleanMathArtifacts(window.NovexaMath.prepareMarkdown(normalized));

    // Models sometimes emit Markdown bullet markers without the required
    // space (`*An item`). Treat line-leading single stars as bullets while
    // leaving normal inline emphasis untouched.
    source = source.replace(/^(\s*)\*(?!\*|\s)([^\n]+)$/gm, '$1- $2');

    // Some providers return section labels like ***Reasoning*** inline.
    // Promote heading-like labels to real Markdown headings so the answer stays
    // scannable even when the model omitted the expected line breaks.
    source = source.replace(/\*{3}([^*\n]{2,90})\*{3}(?=\s|:|$)/g, (full, heading) => {
      const clean = String(heading).trim();
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length <= 12 && !/[.!?]$/.test(clean)) return `\n**✦ ${clean}**\n`;
      return full;
    });

    // Last-resort heading cleanup: a provider or stored chat message must never
    // be able to reintroduce raw Markdown heading syntax after shared repair.
    source = window.NovexaMath.normalizeSectionHeadings(source);

    // Gemini sometimes prefixes table rows with Markdown blockquote markers.
    // Remove those markers only when the following content is clearly a table.
    source = source.replace(/^>\s*(\|.*\|)\s*$/gm, '$1');

    // Normalize Markdown tables before parsing. Providers often return escaped
    // pipes (`\|`), compact separator rows, or table rows stuck together on one
    // line. Keep genuine tables readable instead of showing raw pipes to students.
    const normalizeMarkdownTables = (value) => {
      const input = String(value || '')
        .replace(/\\\|/g, '|')
        .replace(/[\u00a0\t]+/g, ' ')
        .replace(/\r\n?/g, '\n');
      const isTableRow = line => /^\s*\|?.+\|.+\|?\s*$/.test(line) && (String(line).match(/\|/g)||[]).length >= 2;
      const getCells = line => String(line).trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
      const isSeparatorCell = cell => /^:?-+:?$/.test(String(cell).trim());
      const isSeparatorRow = line => {
        if (!isTableRow(line)) return false;
        const parts = getCells(line);
        return parts.length >= 2 && parts.every(isSeparatorCell);
      };
      const isLooseTableRow = line => /^\s*\|?.+\|.+\|?\s*$/.test(String(line || '')) && (String(line||'').match(/\|/g)||[]).length >= 2;
      const getLooseCells = line => String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
      const isLooseSeparatorRow = line => {
        const cells = getLooseCells(line);
        return cells.length >= 2 && cells.every(isSeparatorCell);
      };
      const lines = input.split('\n');
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // A few provider answers start a table with the divider (`|---`) and
        // omit a header. Supply neutral headings, then retain every data row.
        if (isLooseSeparatorRow(line) && i + 1 < lines.length && isLooseTableRow(lines[i + 1]) && !isLooseSeparatorRow(lines[i + 1])) {
          const firstRow = getLooseCells(lines[i + 1]);
          const dividerCells = getLooseCells(line);
          const columnCount = Math.max(2, dividerCells.length, firstRow.length);
          const headings = columnCount === 2 ? ['Key concept', 'Rule / principle'] : Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
          out.push(`| ${headings.join(' | ')} |`);
          out.push(`| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`);
          while (i + 1 < lines.length && isLooseTableRow(lines[i + 1]) && !isLooseSeparatorRow(lines[i + 1])) {
            const row = getLooseCells(lines[++i]);
            out.push(`| ${Array.from({ length: columnCount }, (_, index) => row[index] || '').join(' | ')} |`);
          }
          continue;
        }
        if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
          const header = getCells(line);
          out.push(`| ${header.join(' | ')} |`);
          const separator = getCells(lines[++i]).map(cell => {
            const left = cell.startsWith(':');
            const right = cell.endsWith(':');
            return `${left ? ':' : ''}---${right ? ':' : ''}`;
          });
          out.push(`| ${separator.join(' | ')} |`);
          while (i + 1 < lines.length && isTableRow(lines[i + 1]) && !isSeparatorRow(lines[i + 1])) {
            const row = getCells(lines[++i]);
            out.push(`| ${row.join(' | ')} |`);
          }
          continue;
        }
        const compact = line.match(/^(\s*\|[^\n]*\|)\s*(\|\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|)\s*$/);
        if (compact) { out.push(compact[1].trim(), compact[2].trim()); continue; }
        out.push(line);
      }
      return out.join('\n');
    };
    source = source;

    // Capture raw pipe tables BEFORE any line-level math repair. This is critical:
    // table rows often contain `=` / `_` / braces, which otherwise get mistaken
    // for standalone math and the entire table collapses into italic math text.
    const rawTables = [];
    const rawTableToken = index => `@@NOVEXA_RAW_TABLE_${index}@@`;
    const splitRawTableCells = line => {
      let text = String(line || '').trim();

      // Prevent phantom first/last columns when row-level TeX delimiters leak into a Markdown table.
      // Table rows sometimes arrive wrapped in TeX delimiters. These wrappers
      // belong to the row, not to a cell, and must never create phantom columns.
      text = text
        .replace(/^\\(?:\(|\[)\s*/, '')
        .replace(/\s*\\(?:\)|\])$/, '')
        .replace(/^(?:\(|\[)\s*/, '')
        .replace(/\s*(?:\)|\])$/, '');

      // Split only on REAL table delimiters. An escaped `\|` is content inside
      // a cell and must remain a literal pipe instead of creating an extra column.
      const cells = [];
      let current = '';
      let escaped = false;
      for (const ch of text) {
        if (ch === '|' && !escaped) {
          cells.push(current);
          current = '';
        } else {
          current += ch;
        }
        if (ch === '\\' && !escaped) escaped = true;
        else escaped = false;
      }
      cells.push(current);

      if (cells.length && !cells[0].trim()) cells.shift();
      if (cells.length && !cells[cells.length - 1].trim()) cells.pop();

      return cells.map(cell => String(cell).trim()
        .replace(/^\\(?:\(|\[)\s*/, '')
        .replace(/\s*\\(?:\)|\])$/, '')
        .replace(/^(?:\(|\[)\s*/, '')
        .replace(/\s*(?:\)|\])$/, '')
        .replace(/\\\|/g, '|')
        .trim());
    };
    const looksLikeRawTableRow = line => {
      const text = String(line || '').trim();
      if (!text || /^```/.test(text)) return false;
      return (text.match(/\|/g) || []).length >= 2;
    };
    const looksLikeRawSeparator = line => {
      const cells = splitRawTableCells(line);
      return cells.length >= 2 && cells.every(cell => /^:?-{2,}:?$/.test(cell));
    };
    function extractRawTables(value) {
      const lines = String(value || '').split('\n');
      const out = [];
      for (let i = 0; i < lines.length; i++) {
        if (!looksLikeRawTableRow(lines[i])) { out.push(lines[i]); continue; }
        const block = [];
        let j = i;
        while (j < lines.length && looksLikeRawTableRow(lines[j])) { block.push(lines[j]); j++; }
        const hasSeparator = block.length >= 2 && (looksLikeRawSeparator(block[0]) || looksLikeRawSeparator(block[1]));
        if (!hasSeparator && block.length < 3) { out.push(...block); i = j - 1; continue; }
        const rows = block.map(splitRawTableCells);
        const separatorIndex = looksLikeRawSeparator(block[0]) ? 0 : (looksLikeRawSeparator(block[1]) ? 1 : -1);
        const target = Math.max(2, ...rows.map(r => r.length));
        let header;
        let body;
        if (separatorIndex === 1) { header = rows[0]; body = rows.slice(2); }
        else if (separatorIndex === 0) { header = rows[1] || []; body = rows.slice(2); }
        else { header = rows[0]; body = rows.slice(1); }
        header = Array.from({ length: target }, (_, k) => header[k] ?? `Column ${k + 1}`);
        body = body.filter(row => row.some(cell => String(cell ?? '').trim()))
          .map(row => Array.from({ length: target }, (_, k) => row[k] ?? ''));
        if (!body.length) { out.push(...block); i = j - 1; continue; }
        const idx = rawTables.length;
        rawTables.push({ header, body });
        out.push(rawTableToken(idx));
        i = j - 1;
      }
      return out.join('\n');
    }
    source = extractRawTables(source);

    // Repair mixed prose + raw LaTeX tails before Markdown parsing. Providers
    // frequently answer with `In plain English: \text{Area} \approx \frac{...}`.
    // Keep the prose label normal and send only the formula to MathJax.
    source = source.split('\n').map(line => {
      const m = line.match(/^(\s*[-*+]\s+|\s*\d+[.)]\s+)?([^:]{2,100}:\s*)(\\(?:text|frac|dfrac|tfrac|sqrt|sum|int|prod|operatorname|mathrm|mathbf|mathbb|mathit|left|right|overline|underline|boxed|vec|hat|bar)[\s\S]+)$/);
      if (!m) return line;
      return `${m[1] || ''}${m[2]}\\(${m[3].trim()}\\)`;
    }).join('\n');

    // Any standalone TeX-heavy line that still escaped the earlier wrapper is
    // made into display math. This eliminates visible `\frac`, `\text`, etc.
    source = source.split('\n').map(line => {
      const t = line.trim();
      if (!t || /\\\(|\\\[|\$\$/.test(t) || /^\s*\|/.test(t)) return line;
      const proseHeavy = (t.match(/\b(?:method|taking|both|sides|substitute|substitution|apply|quotient|law|recap|self|check|quick|question|hint|write|answer|explain|using|given|therefore|because|then|and|or|the|this|that|with|from|into|for|when|where|set|add|list|evaluate|each|step|construct|group|multiply|determine|overestimate|underestimate|curve|straight|line|chord|above|below)\b/gi) || []).length >= 2 || (t.match(/[A-Za-z]+/g) || []).length >= 8 || /\*\*/.test(t);
      const commandCount = (t.match(/\\(?:frac|dfrac|tfrac|sqrt|text|mathrm|mathbf|mathbb|mathit|operatorname|sum|int|prod|overline|underline|boxed|vec|hat|bar|left|right|times|cdot|pm|leq|geq|neq|approx|infty|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega|partial|nabla)\b/g) || []).length;
      const proseMathMix = proseHeavy && commandCount > 0;
      if (proseMathMix) return line;
      if (commandCount >= 1 && (t.startsWith('\\text{') || commandCount >= 2 || /^[\\][A-Za-z]+/.test(t))) return `\\[${t}\\]`;
      return line;
    }).join('\n');

    // Final guard against raw heading markers and undelimited math fragments.
    source = source
      .replace(/(^|\n)(\s*)#{1,6}\s+(.+)$/gm, (_, prefix, indent, title) => `${prefix}${indent}**✦ ${String(title).trim()}**`)
      .replace(/(:\s*)(\\(?:int|sum|prod|frac|dfrac|tfrac|sqrt|lim)\S[^\n]{1,220})/g, (_, prefix, expr) => `${prefix}\(${expr.trim()}\)`);
    // Deterministic final source pass: regardless of the provider or an older
    // stored transcript, Novexa must never send raw Markdown headings to the
    // renderer and must wrap short standalone equations before marked sees them.
    source = source.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (/^#{1,6}\s+/.test(trimmed)) {
        return line.replace(/^(\s*)#{1,6}\s+/, '$1**✦ ').replace(/$/, '**');
      }
      if (/^\s*\|.*\|\s*$/.test(trimmed) || /^\s*(?:-\s+|\d+[.)]\s+)/.test(trimmed)) return line;
      if (/\\\(|\\\[|\$\$|\$[^$]+\$/.test(trimmed)) return line;
      const words = (trimmed.match(/[A-Za-z]+/g) || []).length;
      const mathSignal = /[=<>^_]|[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]/.test(trimmed);
      const proseCount = (trimmed.match(/\b(?:the|this|that|because|therefore|using|given|where|when|find|calculate|solve|question|answer|formula|statement|claim|for|every|integer|explain|method|taking|both|sides|substitute|apply|quotient|law|recap|self|check|quick|hint|write|and|or|with|from|into|then)\b/gi) || []).length;
      const proseBlock = proseCount >= 2 || /\*\*/.test(trimmed) || words >= 8;
      if (mathSignal && words <= 12 && !proseBlock) return `\\(${trimmed}\\)`;
      const colon = line.match(/^(\s*[^:]{2,100}:\s*)(.+)$/);
      if (colon && /[=<>^_]|[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]/.test(colon[2])) return `${colon[1]}\\(${colon[2].trim()}\\)`;
      return line;
    }).join('\n');

    // Protect LaTeX from Markdown parsing, then restore it after Markdown has
    // produced the HTML. This prevents $...$ and $$...$$ from being escaped or
    // interpreted as ordinary text, and gives MathJax clean delimiters.
    const math = [];
    const sanitizeLatexFragment = value => String(value ?? '')
      .replace(/(^|[^\\])#/g, '$1\\#')
      .replace(/\\textstyle\s*/g, '')
      .replace(/\\displaystyle\s*/g, '')
      .replace(/\\left\s*([([{|])/g, '\\left$1')
      .replace(/\\right\s*([)\]}|])/g, '\\right$1');
    const putMath = (latex, display) => {
      const token = `@@NOVEXA_MATH_${math.length}@@`;
      math.push({ token, latex: sanitizeLatexFragment(latex).trim(), display });
      return token;
    };

    // Display math first. Supports $$...$$ and \\[...\\].
    source = source
      .replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => putMath(latex, true))
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => putMath(latex, true));

    // Inline \(...\) first, then single-dollar math. The dollar expression
    // requires a closing dollar on the same line to avoid swallowing prose.
    source = source
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => putMath(latex, false))
      .replace(/(^|[^$])\$([^$\n]+?)\$(?!\$)/g, (_, before, latex) => `${before}${putMath(latex, false)}`);

    const restoreMath = html => math.reduce((out, item) => {
      const holder = `<span class="novexa-math-slot" data-display="${item.display ? '1' : '0'}" data-latex="${escapeHtml(item.latex).replace(/&quot;/g,'&amp;quot;')}"></span>`;
      return out.split(item.token).join(holder);
    }, html).replace(/@@NOVEXA_MATH_\d+@@|NOVEXA_MATH_\d+_END/g, '');

    if (window.marked?.parse) {
      try {
        const preparedTableHtml = rawTables.map(table => {
          const renderTableCell = value => {
            let cell = String(value ?? '').trim()
              .replace(/@@NOVEXA_(?:TABLE|RAW_TABLE)_\d+@@/g, '');
            cell = cell.replace(/\\\(([^\\]+?)\\\)/g, (_, latex) => putMath(latex, false));
            cell = cell.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => putMath(latex, true));
            cell = cell.replace(/(^|[^$])\$([^$\n]+?)\$(?!\$)/g,
              (_, before, latex) => `${before}${putMath(latex, false)}`);
            const explicitMath = /\\(?:\(|\[|frac|dfrac|tfrac|sqrt|sum|int|prod|times|cdot|pm|leq|geq|neq|approx|alpha|beta|gamma|delta|theta|pi|partial|nabla)\b|\$[^$]+\$/u.test(cell);
            const standaloneMath = !/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(cell) && /[=<>^_]|[²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉√∑∫πθΔ]/u.test(cell) && /^[A-Za-z0-9_{}()\[\]\s.+*\-/=<>|≈≤≥√∑∫πθΔ]+$/u.test(cell);
            if ((explicitMath || standaloneMath) && !/@@NOVEXA_MATH_\d+@@/.test(cell)) cell = putMath(cell, false);
            const inline = window.marked?.parseInline
              ? window.marked.parseInline(cell, { gfm: true, breaks: true })
              : escapeHtml(cell);
            return restoreMath(inline).trim();
          };
          const header = table.header.map(c => `<th>${renderTableCell(c)}</th>`).join('');
          const body = table.body.map(row => `<tr>${row.map(c => `<td>${renderTableCell(c)}</td>`).join('')}</tr>`).join('');
          return `<table class="novexa-ai-table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
        });
        // Tables were extracted before math normalization; keep this path intentionally lossless.
        const raw = window.marked.parse(source, {
          gfm: true,
          breaks: true,
          headerIds: false,
          mangle: false
        });
        const safe = window.DOMPurify?.sanitize
          ? window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } })
          : raw;
        let restored = restoreMath(safe);
        preparedTableHtml.forEach((html,index)=>{ restored = restored.split(rawTableToken(index)).join(html); });
        restored = restored.replace(/@@NOVEXA_(?:TABLE|RAW_TABLE)_\d+@@/g,'<div class="novexa-table-unavailable">Table data could not be recovered from this saved response.</div>');
        // Never allow MathJax error markup or delimiter-only artefacts to reach
        // the student-facing DOM. The shared cleanup also protects saved chats.
        restored = String(restored)
          .replace(/(^|>)[ \\t]*(?:\\\\\]|\\\\\[|[\\[\\]])[ \\t]*(?=<|$)/g, '$1')
          .replace(/(?:\\\\\]|\\\\\[)\\\\s*(?=<)/g, '');
        // Shared normalization converts Markdown headings into **✦ …** before
        // parsing. Turn that semantic marker into Novexa's visual section
        // treatment rather than leaving it as a plain bold paragraph.
        const sectionStyled = restored.replace(/<p>\s*<strong>✦\s*([\s\S]*?)<\/strong>\s*<\/p>/gi,
          '<div class="novexa-section-heading"><span class="novexa-section-symbol">✦</span><span>$1</span></div>');
        // Keep wide tables inside a scroll container so the chat bubble never
        // becomes wider than the viewport. Math remains intact inside cells.
        const tableWrapped = sectionStyled.replace(/<table\b[\s\S]*?<\/table>/gi, table => `<div class="markdown-table-wrap">${table}</div>`);
        const cleaned = String(tableWrapped
          .replace(/<(h[1-6])>\s*#{1,6}\s+/gi, '<$1>✦ ')
          .replace(/<p>\s*#{1,6}\s+([^<]+)<\/p>/gi, '<div class="novexa-section-heading"><span class="novexa-section-symbol">✦</span><span>$1</span></div>')
          .replace(/(^|>)\s*#{1,6}\s+/g, '$1✦ ')
          // Collapse accidental nested inline delimiters produced by some
          // providers, e.g. \(\( ... \)\). MathJax should receive one pair.
          .replace(/\\\(\s*\\\(/g, '\\(')
          .replace(/\\\)\s*\\\)/g, '\\)')
          .replace(/\\\[\s*\\\[/g, '\\[')
          .replace(/\\\]\s*\\\]/g, '\\]'));
        return `<div class="markdown-body">${cleaned}</div>`;
      } catch (error) {
        console.warn('Markdown renderer fallback:', error);
      }
    }

    // Dependency-free fallback. Tables are still rendered when a CDN is
    // unavailable, while math tokens remain intact for MathJax.
    const escape = escapeHtml(source);
    const inlineFallback = value => String(value || '')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    const lines = escape.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\|.*\|$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(lines[i + 1])) {
        const parseRow = value => value.replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim());
        const head = parseRow(line); i += 2; const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i])) rows.push(parseRow(lines[i++]));
        out.push(`<table><thead><tr>${head.map(c => `<th>${inlineFallback(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${head.map((_,j)=>`<td>${inlineFallback(r[j]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
        continue;
      }
      if (/^\*\*✦\s+/.test(line)) out.push(`<div class="novexa-section-heading"><span class="novexa-section-symbol">✦</span><span>${line.replace(/^\*\*✦\s+/, '').replace(/\*\*$/, '')}</span></div>`);
      else if (/^###\s+/.test(line)) out.push(`<div class="novexa-section-heading"><span class="novexa-section-symbol">✦</span><span>${line.replace(/^###\s+/, '')}</span></div>`);
      else if (/^##\s+/.test(line)) out.push(`<div class="novexa-section-heading"><span class="novexa-section-symbol">✦</span><span>${line.replace(/^##\s+/, '')}</span></div>`);
      else if (/^#\s+/.test(line)) out.push(`<div class="novexa-section-heading"><span class="novexa-section-symbol">✦</span><span>${line.replace(/^#\s+/, '')}</span></div>`);
      else if (/^[-*]\s+/.test(line)) out.push(`<ul><li>${inlineFallback(line.replace(/^[-*]\s+/, ''))}</li></ul>`);
      else if (/^\d+[.)]\s+/.test(line)) out.push(`<ol><li>${inlineFallback(line.replace(/^\d+[.)]\s+/, ''))}</li></ol>`);
      else if (line.trim()) out.push(`<p>${inlineFallback(line)}</p>`);
      i++;
    }
    return `<div class="markdown-body">${restoreMath(out.join(''))}</div>`;
  }

  let mathJaxReadyPromise = null;
  let mathTypesetQueue = Promise.resolve();

  // Shared guard used by both the successful MathJax path and the readable
  // fallback. This must live outside mathFallback(); the previous build
  // declared it inside one function and referenced it from typesetMath(),
  // producing `ReferenceError: hasRawMathDelimiters is not defined`.
  const hasRawMathDelimiters = (text) => /\\(?:\[|\]|\(|\))|\$\$|(?<!\$)\$[^$\n]+\$(?!\$)/.test(String(text || ''));

  // The fallback must remain useful even when MathJax is unavailable. Preserve
  // simple numeric powers and indices as Unicode rather than exposing `x^2`.
  const readablePlainPowers = (value) => {
    const superscript = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾' };
    const subscript = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎' };
    const convert = (input, marker, glyphs) => String(input || '').replace(new RegExp(`([A-Za-z0-9)\\]}])\\${marker}\\{?([0-9+\\-()=]+)\\}?`, 'g'), (_, base, suffix) => {
      const converted = [...suffix].map(ch => glyphs[ch] || '').join('');
      return converted.length === suffix.length ? `${base}${converted}` : `${base}${marker}${suffix}`;
    });
    return convert(convert(value, '_', subscript), '^', superscript);
  };

  function ensureMathJax() {
    if (mathJaxReadyPromise) return mathJaxReadyPromise;
    mathJaxReadyPromise = new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(Boolean(window.MathJax?.typesetPromise));
      };
      const waitForStartup = () => {
        if (window.MathJax?.startup?.promise?.then) {
          window.MathJax.startup.promise.then(finish).catch(() => finish());
          return;
        }
        if (window.MathJax?.typesetPromise) { finish(); return; }
        window.addEventListener('load', () => {
          if (window.MathJax?.startup?.promise?.then) window.MathJax.startup.promise.then(finish).catch(() => finish());
          else finish();
        }, { once: true });
      };
      // The page loads exactly one local MathJax TeX→SVG bundle. Do not inject
      // another CDN copy and do not use a short timeout: slow local startup
      // previously caused answers to permanently fall back to raw LaTeX.
      waitForStartup();
    });
    return mathJaxReadyPromise;
  }

  function mathFallback(element) {
    const bodies = [
      ...(element?.matches?.('.markdown-body, .novexa-math-target') ? [element] : []),
      ...(element?.querySelectorAll?.('.markdown-body, .novexa-math-target') || [])
    ];
    // This is deliberately a *readable* TeX fallback, not a second markdown
    // renderer. It is used when MathJax is unavailable or rejects a malformed
    // expression, so the student must never see raw \begin/\end/&=\\ tokens.
    // Delegate to the single hardened implementation in math-format.js —
    // do not re-duplicate this logic here. A previous copy of this function
    // used unbounded `\le`/`\in` replacements that matched the first
    // letters of `\left`/`\infty` and corrupted them into "≤ ft"/"∈fty";
    // window.NovexaMath.readableLatex fixes that class of bug in one place.
    const readableLatex = value => window.NovexaMath.readableLatex(value);
    const rawPattern = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;
    bodies.forEach(node => {
      if (!node || !node.isConnected) return;
      const walker = document.createTreeWalker(node, 4);
      const textNodes = [];
      let current;
      while ((current = walker.nextNode())) textNodes.push(current);
      textNodes.forEach(textNode => {
        const parent = textNode.parentElement;
        if (parent?.closest?.('script,style,pre,code')) return;
        const original = String(textNode.nodeValue || '');
        if (!original) return;
        const hasCommands = /\\(?:frac|sqrt|text|mathrm|mathbf|mathit|mathbb|overline|underline|boxed|vec|hat|times|cdot|pm|leq|geq|neq|approx|equiv|in|notin|int|sum|prod|infty|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega|partial|nabla|Rightarrow|Longrightarrow|begin|end)\b/.test(original);
        if (!hasRawMathDelimiters(original) && !hasCommands && !/[&]/.test(original)) return;
        const replacement = readablePlainPowers(readableLatex(
          original.replace(rawPattern, (_, a, b, c, d) => readableLatex(a ?? b ?? c ?? d))
        )
          .replace(/\\\[|\\\]|\\\(|\\\)|\$\$/g, '')
          .replace(/(^|[^$])\$([^$\n]+?)\$(?!\$)/g, '$1$2'));
        if (replacement !== original) textNode.nodeValue = replacement;
      });
      node.dataset.novexaMathReady = '1';
    });
  }

  // Shared math repair lives in frontend/js/utils/math-format.js.

  function removeResidualMathDelimiters(root) {
    if (!root || !root.isConnected) return;
    const mathNodes = Array.from(root.querySelectorAll?.('.mjx-container') || []);
    if (!mathNodes.length) { window.NovexaMath?.cleanRenderedMathArtifacts?.(root); }
    const isDelimiterText = value => /^\s*(?:\\\(|\\\)|\\\[|\\\]|\$\$|\$)\s*$/.test(String(value || ''));
    const removeAround = (mathNode, direction) => {
      let node = direction === 'prev' ? mathNode.previousSibling : mathNode.nextSibling;
      // Markdown can place the duplicate delimiter in a tiny text node immediately
      // beside the SVG. Remove only delimiter-only nodes; never touch normal prose.
      while (node && node.nodeType === Node.TEXT_NODE && !String(node.nodeValue || '').trim()) {
        node = direction === 'prev' ? node.previousSibling : node.nextSibling;
      }
      if (node?.nodeType === Node.TEXT_NODE && isDelimiterText(node.nodeValue)) {
        node.nodeValue = '';
      }
    };
    mathNodes.forEach(node => { removeAround(node, 'prev'); removeAround(node, 'next'); });
    // Final safety net: after MathJax succeeds, no literal TeX delimiter may remain
    // in ordinary text nodes. Never touch MathJax-generated nodes.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; let current;
    while ((current = walker.nextNode())) nodes.push(current);
    nodes.forEach(textNode => {
      const parent = textNode.parentElement;
      if (!parent || parent.closest('.mjx-container,.MathJax,script,style,pre,code,.novexa-math-slot,.paper-math-slot,.flashcard-math-slot,[data-latex]')) return;
      const value = String(textNode.nodeValue || '');
      const cleaned = value.replace(/\\\(|\\\)|\\\[|\\\]/g, '');
      if (cleaned !== value) textNode.nodeValue = cleaned;
    });
  }

  function repairVisibleLatex(element) {
    // Delegate to the single hardened implementation in math-format.js —
    // see the comment in mathFallback() above for why this must not be a
    // separately maintained copy.
    const readableLatex = value => window.NovexaMath.readableLatex(value);
    const root = element?.matches?.('.markdown-body, .novexa-math-target') ? element : element?.querySelector?.('.markdown-body, .novexa-math-target');
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes=[]; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      const parent = node.parentElement;
      if (parent?.closest?.('script,style,pre,code,.MathJax,.mjx-container,.katex')) continue;
      const text = String(node.nodeValue || '');
      const hasBareMathCommand = /\b(?:frac|dfrac|tfrac|sqrt|binom|sum|prod|int|cdot|times|quad|qquad|big|Big|Bigg|overline|underline|boxed|vec|hat|bar|leq|geq|neq|approx|equiv|pm|infty|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega|partial|nabla|Rightarrow|Longrightarrow|leftarrow|rightarrow|dots|ldots|cdots|lim|log|ln|sin|cos|tan|sec|csc|cot|exp)\b/i.test(text);
      if (!/\\(?:frac|dfrac|tfrac|sqrt|text|mathrm|mathbf|mathit|mathbb|overline|underline|boxed|vec|hat|times|cdot|pm|leq|geq|neq|approx|equiv|in|notin|int|sum|prod|infty|alpha|beta|gamma|delta|theta|pi|lambda|mu|sigma|omega|partial|nabla|Rightarrow|Longrightarrow|leftarrow|rightarrow|begin|end|left|right|quad|dots|ldots|cdots)|&[=<>]|\\\{|\\\}|\\\[|\\\]|\\\(|\\\)/.test(text) && !hasBareMathCommand) continue;
      const repaired = readablePlainPowers(readableLatex(window.NovexaMath.repairBareTextMathCommands(text)));
      if (repaired !== text) node.nodeValue = repaired;
    }
  }

  function typesetMath(element) {
    if (!element) return Promise.resolve();
    const wasNearBottom = chatThread ? (chatThread.scrollHeight - chatThread.scrollTop - chatThread.clientHeight < 140) : false;
    // Serialize all bubbles. MathJax mutates shared internal state, so parallel
    // typeset/clear operations can create the "Package ... only has a getter"
    // crash shown in the browser console.
    mathTypesetQueue = mathTypesetQueue.then(async () => {
      const bodies = [
        ...(element.matches?.('.markdown-body, .novexa-math-target') ? [element] : []),
        ...element.querySelectorAll('.markdown-body, .novexa-math-target')
      ]
        .filter(node => node.isConnected && node.dataset.novexaMathReady !== '1');
      if (!bodies.length) return;

      const ready = await ensureMathJax();
      if (!ready || !window.MathJax?.typesetPromise) {
        mathFallback(element);
        repairVisibleLatex(element);
        element.dataset.novexaMathPending = '1';
        window.setTimeout(() => {
          if (element.isConnected && element.dataset.novexaMathPending === '1') {
            element.removeAttribute('data-novexa-math-ready');
            delete element.dataset.novexaMathReady;
            typesetMath(element);
          }
        }, 1200);
        return;
      }

      const mathPattern = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;
      const validLatex = value => {
        const text = String(value || '').trim();
        if (!text || /\b(?:NaN|undefined|null)\b/i.test(text)) return false;
        let braces = 0;
        for (const ch of text) {
          if (ch === '{') braces += 1;
          if (ch === '}') {
            braces -= 1;
            if (braces < 0) return false;
          }
        }
        return braces === 0;
      };

      const validBodies = [];
      const snapshots = new Map();
      bodies.forEach(node => {
        const slots = Array.from(node.querySelectorAll('.novexa-math-slot[data-latex]'));
        slots.forEach(slot => {
          try {
            const latex = slot.getAttribute('data-latex') || '';
            const display = slot.getAttribute('data-display') === '1';
            slot.textContent = display ? `\\[${latex}\\]` : `\\(${latex}\\)`;
            slot.classList.add('novexa-math-slot-source');
            slot.style.display = display ? 'block' : 'inline';
            slot.style.visibility = 'hidden';
          } catch (_) {}
        });
        snapshots.set(node, node.innerHTML);
        const source = node.textContent || '';
        let invalid = false;
        source.replace(mathPattern, (full, a, b, c, d) => {
          if (!validLatex(a ?? b ?? c ?? d)) invalid = true;
          return full;
        });
        if (invalid) {
          node.innerHTML = snapshots.get(node);
          mathFallback(node);
        } else {
          validBodies.push(node);
        }
      });

      if (!validBodies.length) return;
      try {
        // Each body is new after the final Markdown replacement. It has not
        // been processed yet, so clearing it is unnecessary and unsafe.
        await window.MathJax.typesetPromise(validBodies);
        validBodies.forEach(node => {
          const hasMathError = Boolean(node.querySelector?.('.mjx-merror, .MathJax_Error, [data-mjx-error]'))
            || /You can't use macro parameter character|Undefined control sequence|Missing delimiter/.test(node.textContent || '');
          // Only fall back when MathJax actually failed. A successful MathJax pass
          // must be left completely untouched; running a text-only LaTeX repair
          // after typesetting is what turns valid fractions/radicals into strings
          // such as `frac5√(6)2`.
          if (hasMathError) {
            node.innerHTML = snapshots.get(node) || node.innerHTML;
            mathFallback(node);
            repairVisibleLatex(node);
          } else {
            // MathJax rendered the equation successfully. Remove only duplicated
            // literal delimiters left beside the generated SVG; never rewrite the
            // rendered math back into text.
            removeResidualMathDelimiters(node);
            node.querySelectorAll('.novexa-math-slot-source').forEach(slot => { slot.style.visibility='visible'; slot.style.display=''; slot.removeAttribute('data-latex'); slot.removeAttribute('data-display'); slot.classList.remove('novexa-math-slot-source'); });
            window.NovexaMath?.cleanRenderedMathArtifacts?.(node);
            node.dataset.novexaMathReady = '1';
            delete node.dataset.novexaMathPending;
          }
        });
        if (wasNearBottom) chatThread.scrollTop = chatThread.scrollHeight;
      } catch (error) {
        console.warn('Math rendering failed; using readable fallback:', error?.message || error);
        validBodies.forEach(node => {
          node.innerHTML = snapshots.get(node) || node.innerHTML;
          mathFallback(node);
          repairVisibleLatex(node);
        });
      }
    }).catch(error => console.warn('Math rendering queue failed:', error));
    return mathTypesetQueue;
  }

  function storageKey() { return `novexa_ai_${state.user?.id || 'guest'}`; }
  function localChatStoreKey() { return `${storageKey()}_chat_store_v2`; }
  function makeLocalChatId() {
    try { return crypto.randomUUID(); } catch (_) { return `${Date.now().toString(16).padStart(12,'0').slice(-12)}-${Math.random().toString(16).slice(2,6)}-4${Math.random().toString(16).slice(2,5)}-8${Math.random().toString(16).slice(2,5)}-${Math.random().toString(16).slice(2,14)}`; }
  }
  function makeChatTitle(value) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').replace(/^[#*_\-•✦\s]+/, '').trim();
    if (!cleaned) return 'New chat';
    return cleaned.replace(/[.!?]+$/,'').slice(0,72).trim() || 'New chat';
  }
  function readLocalChatStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(localChatStoreKey()) || '{}');
      const chats = raw && typeof raw.chats === 'object' ? raw.chats : {};
      const order = Array.isArray(raw.order) ? raw.order.map(String) : Object.keys(chats);
      return { version: 2, chats, order };
    } catch (_) { return { version: 2, chats: {}, order: [] }; }
  }
  function writeLocalChatStore(store) {
    if (!state.user) return;
    try {
      const chats = store.chats || {};
      const order = (store.order || Object.keys(chats)).map(String).filter((id, i, arr) => chats[id] && arr.indexOf(id) === i).slice(0, 200);
      localStorage.setItem(localChatStoreKey(), JSON.stringify({ version: 2, order, chats }));
    } catch (error) { console.warn('[Novexa Chats] local store write failed:', error?.message || error); }
  }
  function upsertLocalChatRecord(record) {
    if (!state.user || !record?.id) return;
    const store = readLocalChatStore();
    const id = String(record.id);
    const current = store.chats[id] || {};
    const now = new Date().toISOString();
    store.chats[id] = {
      ...current, ...record, id,
      server_id: record.server_id || current.server_id || (String(record.id).startsWith('local-') ? null : String(record.id)),
      title: makeChatTitle(record.title || current.title || 'New chat'),
      subject: String(record.subject || current.subject || 'General').slice(0,80),
      messages: sanitizeFlashcardHistory(Array.isArray(record.messages) ? record.messages : (current.messages || [])),
      created_at: record.created_at || current.created_at || now,
      updated_at: record.updated_at || now
    };
    store.order = [id, ...(store.order || []).filter(x => String(x) !== id)];
    writeLocalChatStore(store);
  }
  function removeLocalChatRecord(id) {
    const store = readLocalChatStore(); const key = String(id);
    delete store.chats[key]; store.order = (store.order || []).filter(x => String(x) !== key); writeLocalChatStore(store);
  }
  function readLocalChatList() {
    const store = readLocalChatStore();
    return store.order.map(id => store.chats[id]).filter(Boolean).sort((a,b)=>new Date(b.updated_at||0)-new Date(a.updated_at||0));
  }
  function readLocalChatCache() {
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey())||'{}');
      if (saved?.chatId) {
        const store = readLocalChatStore();
        const item = store.chats[String(saved.chatId)];
        if (item?.messages?.length) return sanitizeFlashcardHistory(item.messages);
      }
      return Array.isArray(saved.history)?sanitizeFlashcardHistory(saved.history):[];
    } catch (_) { return []; }
  }
  function readLocalChatRecord(id) { const store = readLocalChatStore(); return store.chats[String(id)] || null; }
  function saveLocalState() {
    if (!state.user) return;
    state.history=sanitizeFlashcardHistory(state.history);
    const now = new Date().toISOString();
    if (state.chatId && state.history.length) {
      const existing=(state.chatList||[]).find(c=>String(c?.id)===String(state.chatId));
      upsertLocalChatRecord({id:String(state.chatId),title:state.chatTitle||existing?.title||'New chat',subject:state.subject||'General',messages:state.history,created_at:existing?.created_at||now,updated_at:now,is_favorite:Boolean(existing?.is_favorite)});
    }
    localStorage.setItem(storageKey(),JSON.stringify({history:state.history.slice(-200),chatId:state.chatId,chatTitle:state.chatTitle,updatedAt:Date.now()}));
  }
  let chatSyncTimer=null, chatSyncInFlight=null, archiveInFlight=null;
  function draftStoreKey(){ return `${storageKey()}_draft_v3`; }
  function saveDraftState(){
    if(!state.user || !state.history.length) return;
    try{ localStorage.setItem(draftStoreKey(),JSON.stringify({chatId:state.chatArchived?null:state.chatId,chatTitle:state.chatTitle,subject:state.subject,history:sanitizeFlashcardHistory(state.history).slice(-200),updatedAt:Date.now()})); }catch(_){ }
  }
  function clearDraftState(){try{localStorage.removeItem(draftStoreKey());}catch(_){} }
  function scheduleChatSync(){ if(!state.user||!state.chatId||!state.chatArchived||!state.history.length)return; clearTimeout(chatSyncTimer); chatSyncTimer=setTimeout(()=>syncCurrentChat().catch(e=>console.warn('[Novexa Chats] sync failed:',e?.message||e)),350); }
  async function syncCurrentChat(){
    if(!state.user||!state.chatId||!state.chatArchived||!state.history.length){saveDraftState();return;}
    if(chatSyncInFlight) await chatSyncInFlight.catch(()=>{});
    const payload={subject:String(state.subject||'General').slice(0,80),title:makeChatTitle(state.chatTitle||state.history.find(x=>x.role==='user')?.content||'New chat'),messages:state.history.map(x=>({role:x.role,content:String(x.content||'').slice(0,30000),attachments:Array.isArray(x.attachments)?x.attachments.slice(0,5):[]}))};
    upsertLocalChatRecord({id:String(state.chatId),...payload,updated_at:new Date().toISOString()});
    chatSyncInFlight=(async()=>{try{
      let r=await authenticatedFetch(`${apiBase}/api/chats/${encodeURIComponent(state.chatId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(r.status===404) r=await authenticatedFetch(`${apiBase}/api/chats`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||`Chat sync failed (${r.status})`);
      if(d.chat){state.chatId=String(d.chat.id||state.chatId);state.chatTitle=String(d.chat.title||payload.title);state.chatArchived=true;upsertLocalChatRecord({...d.chat,server_id:state.chatId,messages:payload.messages});state.chatList=mergeChatLists([...(state.chatList||[]).filter(c=>String(c.id)!==String(state.chatId)),d.chat]);renderRecentChats();}
      saveLocalState();
    }finally{chatSyncInFlight=null;}})();
    return chatSyncInFlight;
  }
  async function archiveCurrentChat(){
    if(archiveInFlight) return archiveInFlight;
    if(!state.user||!state.history.some(x=>x.role==='user')){clearDraftState();return null;}
    archiveInFlight=(async()=>{
    const payload={subject:String(state.subject||'General').slice(0,80),title:makeChatTitle(state.chatTitle||state.history.find(x=>x.role==='user')?.content||'New chat'),messages:state.history.map(x=>({role:x.role,content:String(x.content||'').slice(0,30000),attachments:Array.isArray(x.attachments)?x.attachments.slice(0,5):[]}))};
    const localId=String(state.chatId||makeLocalChatId());
    try{const r=await authenticatedFetch(`${apiBase}/api/chats`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not archive chat');const chat=d.chat||{};const id=String(chat.id||localId);upsertLocalChatRecord({...chat,id,server_id:id,messages:payload.messages});state.chatList=mergeChatLists([...(state.chatList||[]),chat]);renderRecentChats();clearDraftState();return chat;}
    catch(e){const now=new Date().toISOString();const local={id:localId,title:payload.title,subject:payload.subject,messages:payload.messages,created_at:now,updated_at:now,archived_local:true};upsertLocalChatRecord(local);state.chatList=mergeChatLists([...(state.chatList||[]),local]);renderRecentChats();clearDraftState();console.warn('[Novexa Chats] archive deferred:',e?.message||e);return local;}})();
    try{return await archiveInFlight;}finally{archiveInFlight=null;}
  }
  function mergeChatLists(serverList){
    const server = Array.isArray(serverList) ? serverList.filter(Boolean) : [];
    const local = readLocalChatList().filter(Boolean);
    const serverById = new Map();
    for (const chat of server) {
      const id = String(chat.id || '').trim();
      if (!id) continue;
      const prev = serverById.get(id);
      if (!prev || new Date(chat.updated_at || chat.created_at || 0) >= new Date(prev.updated_at || prev.created_at || 0)) {
        serverById.set(id, chat);
      }
    }
    const result = [...serverById.values()].map(chat => {
      const id = String(chat.id);
      const cached = local.find(item => String(item.server_id || '') === id || String(item.id || '') === id);
      return cached ? { ...cached, ...chat, server_id: id, messages: chat.messages || cached.messages || [] } : chat;
    });
    const pending = local.filter(item => item.archived_local === true && !item.server_id);
    const pendingByFingerprint = new Map();
    const fingerprint = item => {
      const msgs = Array.isArray(item?.messages) ? item.messages : [];
      return msgs.map(m => `${m?.role || ''}:${String(m?.content || '').replace(/\s+/g,' ').trim()}`).join('|').slice(0, 1200);
    };
    for (const item of pending) {
      const fp = fingerprint(item);
      const key = fp ? `fp:${fp}` : `id:${item.id}`;
      const prev = pendingByFingerprint.get(key);
      if (!prev || new Date(item.updated_at || 0) > new Date(prev.updated_at || 0)) pendingByFingerprint.set(key, item);
    }
    result.push(...pendingByFingerprint.values());
    return result.sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0,200);
  }
  async function loadPersistentChats(){
    if(!state.user)return;let server=[];
    try{const r=await authenticatedFetch(`${apiBase}/api/chats?limit=100`,{cache:'no-store'});const d=await r.json().catch(()=>({}));if(r.ok){server=Array.isArray(d.chats)?d.chats:[];state.serverHistoryAvailable=true;}else{state.serverHistoryAvailable=false;console.warn('[Novexa Chats] list load failed:',d.error||r.status);}}catch(e){state.serverHistoryAvailable=false;console.warn('[Novexa Chats] list load failed:',e?.message||e);}
    state.chatList=mergeChatLists(server);renderRecentChats();
    const deferred=readLocalChatList().filter(c=>c?.archived_local && !c?.server_id);
    for(const item of deferred.slice(0,20)){
      try{const r=await authenticatedFetch(`${apiBase}/api/chats`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:item.title,subject:item.subject,messages:item.messages||[]})});const d=await r.json().catch(()=>({}));if(r.ok&&d.chat){removeLocalChatRecord(item.id);upsertLocalChatRecord({...d.chat,server_id:String(d.chat.id),messages:item.messages||[]});}}catch(_){break;}
    }
    state.chatList=mergeChatLists(server);renderRecentChats();
    try{const draft=JSON.parse(localStorage.getItem(draftStoreKey()||'null'));if(draft?.history?.length){state.chatId=draft.chatId||makeLocalChatId();state.chatTitle=draft.chatTitle||'';state.subject=draft.subject||state.subject;state.chatArchived=false;state.history=sanitizeFlashcardHistory(draft.history);if(subjectSelect)subjectSelect.value=state.subject;renderHistory();}}catch(_){ }
  }
  async function loadPersistentChat(id){
    if(!state.user||!id)return;const local=readLocalChatRecord(id);
    if(local?.messages?.length&&String(id).startsWith('local-')){state.chatId=String(local.id);state.chatTitle=String(local.title||'');state.subject=String(local.subject||'General');state.chatArchived=true;state.history=sanitizeFlashcardHistory(local.messages);if(subjectSelect)subjectSelect.value=state.subject;renderHistory();renderRecentChats();return;}
    try{const r=await authenticatedFetch(`${apiBase}/api/chats/${encodeURIComponent(id)}`,{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load this chat');const c=d.chat;state.chatId=String(c.id);state.chatTitle=String(c.title||'');state.subject=String(c.subject||'General');state.chatArchived=true;state.history=sanitizeFlashcardHistory(c.messages||[]);if(subjectSelect)subjectSelect.value=state.subject;renderHistory();renderRecentChats();upsertLocalChatRecord({...c,messages:state.history});clearDraftState();}
    catch(e){if(local?.messages?.length){state.chatId=String(local.id);state.chatTitle=String(local.title||'');state.subject=String(local.subject||'General');state.chatArchived=true;state.history=sanitizeFlashcardHistory(local.messages);renderHistory();renderRecentChats();}else showNotice('That conversation could not be loaded.');}
  }
  function renderRecentChats(){
    if(!recentChats)return;recentChats.innerHTML='';if(recentChatsPlan)recentChatsPlan.textContent='Saved';const q=String(recentChatsSearch?.value||'').trim().toLowerCase();const chats=(state.chatList||[]).filter(c=>{const t=String(c?.title||'New chat');return !q||t.toLowerCase().includes(q)||String(c?.subject||'').toLowerCase().includes(q);});
    if(!chats.length){const e=document.createElement('div');e.className='recent-chat-empty';e.textContent=state.user?'Your saved conversations will appear here after you start a new chat.':'Sign in to save conversations.';recentChats.appendChild(e);return;}
    chats.forEach(chat=>{if(!chat?.id)return;const row=document.createElement('div');row.className='recent-chat-item';row.dataset.chatId=String(chat.id);const b=document.createElement('button');b.className=`recent-chat${String(chat.id)===String(state.chatId)?' active':''}`;b.type='button';b.title=String(chat.title||'New chat');const copy=document.createElement('span');copy.className='recent-chat-copy';copy.textContent=String(chat.title||'New chat');const time=document.createElement('small');time.className='recent-chat-time';const stamp=new Date(chat.updated_at||chat.created_at||Date.now());const diff=Math.max(0,Date.now()-stamp.getTime());time.textContent=diff<60000?'Just now':diff<3600000?`${Math.floor(diff/60000)}m`:diff<86400000?`${Math.floor(diff/3600000)}h`:stamp.toLocaleDateString(undefined,{month:'short',day:'numeric'});b.append(copy,time);b.onclick=()=>loadPersistentChat(String(chat.id));const del=document.createElement('button');del.type='button';del.className='recent-chat-delete';del.setAttribute('aria-label',`Delete ${chat.title||'chat'}`);del.textContent='🗑';del.onclick=e=>{e.stopPropagation();deletePersistentChat(String(chat.id));};const more=document.createElement('button');more.type='button';more.className='recent-chat-more';more.textContent='⋯';more.onclick=e=>{e.stopPropagation();const title=prompt('Rename chat',String(chat.title||'New chat'));if(title?.trim())updatePersistentChat(String(chat.id),{title:title.trim()});};row.append(b,more,del);recentChats.appendChild(row);});
  }
  async function updatePersistentChat(id,patch={}){const local=readLocalChatRecord(id);if(local){upsertLocalChatRecord({...local,...patch,updated_at:new Date().toISOString()});state.chatList=mergeChatLists(state.chatList);renderRecentChats();}try{const r=await authenticatedFetch(`${apiBase}/api/chats/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not update chat');upsertLocalChatRecord({...d.chat,messages:local?.messages||[]});state.chatList=mergeChatLists([...(state.chatList||[]).filter(c=>String(c.id)!==String(id)),d.chat]);renderRecentChats();}catch(e){console.warn('[Novexa Chats] rename failed:',e?.message||e);}}
  async function deletePersistentChat(id){if(!state.user||!id)return;const c=(state.chatList||[]).find(x=>String(x.id)===String(id));if(!c)return;if(!window.confirm(`Delete "${c.title||'this chat'}"? This cannot be undone.`))return;if(String(id).startsWith('local-')){removeLocalChatRecord(id);state.chatList=(state.chatList||[]).filter(x=>String(x.id)!==String(id));if(String(id)===String(state.chatId)){state.chatId=null;state.chatTitle='';state.chatArchived=false;state.history=[];renderHistory();}renderRecentChats();return;}try{const r=await authenticatedFetch(`${apiBase}/api/chats/${encodeURIComponent(id)}`,{method:'DELETE'});if(!r.ok)throw new Error('Could not delete chat');removeLocalChatRecord(id);state.chatList=(state.chatList||[]).filter(x=>String(x.id)!==String(id));if(String(id)===String(state.chatId)){state.chatId=null;state.chatTitle='';state.chatArchived=false;state.history=[];renderHistory();}renderRecentChats();}catch(e){console.warn('[Novexa Chats] delete failed:',e?.message||e);}}
  function save(){if(!state.user)return;state.history=sanitizeFlashcardHistory(state.history);if(!state.chatId&&state.history.some(x=>x.role==='user')){state.chatTitle=makeChatTitle(state.history.find(x=>x.role==='user')?.content||'New chat');state.chatId=makeLocalChatId();state.chatArchived=false;}if(state.history.length){saveDraftState();if(state.chatArchived){saveLocalState();scheduleChatSync();}}}
  function deleteCurrentChat(){if(!state.user||state.busy||!state.history.length)return;if(!state.chatArchived){startNewChat(true);return;}if(!window.confirm('Delete this conversation from your Novexa account?'))return;const id=state.chatId;if(id)deletePersistentChat(id);else startNewChat(true);}

  function isFlashcardPayloadText(value) {
    const text = String(value || '').trim();
    if (!text.startsWith('{') || !text.includes('\"cards\"')) return false;
    try {
      const parsed = JSON.parse(text);
      return Boolean(parsed && Array.isArray(parsed.cards));
    } catch (_) {
      return /\"title\"\s*:\s*[^,]+[\s\S]*\"cards\"\s*:/.test(text);
    }
  }

  function isLegacyFlashcardTableText(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    const lower = text.toLowerCase();
    const pipeRows = (text.match(/^\s*\|.*\|\s*$/gm) || []).length;
    const hasCardColumns = /\bfront\b.*\b(back|answer)\b|\b(back|answer)\b.*\bfront\b/i.test(lower);
    const hasCardTitle = /flashcards?|active[- ]recall|front\s*[-–:]?\s*(question|prompt)|back\s*[-–:]?\s*(answer|response)/i.test(lower);
    return (pipeRows >= 3 && (hasCardColumns || hasCardTitle)) || (hasCardTitle && pipeRows >= 1);
  }

  function isFlashcardConversationTable(item, previousUserMessage = '') {
    if (!item || item.role !== 'assistant') return false;
    const text = String(item.content || '').trim();
    const previous = String(previousUserMessage || '').trim();
    const requestedCards = /\b(?:create|make|generate|build|give|turn|convert)\b[\s\w-]{0,100}\bflashcards?\b/i.test(previous)
      || /\bflashcards?\b/i.test(previous) && /\b(?:create|make|generate|build|give|turn|convert)\b/i.test(previous);
    return requestedCards && (isLegacyFlashcardTableText(text) || /(?:^|\n)\s*\|?\s*(?:#|front|question|prompt)\b/i.test(text));
  }

  function sanitizeFlashcardHistory(history) {
    const out = [];
    for (const item of (Array.isArray(history) ? history : [])) {
      if (item?.kind === 'flashcard_deck') { out.push(item); continue; }
      const previousUser = [...out].reverse().find(x => x?.role === 'user')?.content || '';
      if (item?.role === 'assistant' && (isFlashcardPayloadText(item.content) || isLegacyFlashcardTableText(item.content) || isFlashcardConversationTable(item, previousUser) || /\bflashcards? created\b/i.test(String(item.content || '')))) continue;
      out.push(item);
    }
    return out;
  }

  function purgeLegacyFlashcardHistory() {
    if (!state.user) return;
    try {
      const key = storageKey();
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      const history = Array.isArray(saved.history) ? saved.history : [];
      const cleaned = sanitizeFlashcardHistory(history);
      if (cleaned.length !== history.length) {
        localStorage.setItem(key, JSON.stringify({ ...saved, history: cleaned }));
      }
    } catch (_) {}
  }

  function load() {
    try {
      purgeLegacyFlashcardHistory();
      // The active conversation is a draft until the user clicks New Chat.
      // Never resurrect the legacy generic `history/chatId` store as a Recent chat.
      state.history = [];
      state.chatId = null;
      state.chatTitle = '';
      state.chatArchived = false;
      renderHistory();
      renderRecentChats();
      // Flashcard success is a separate study artifact and may be restored safely.
      try {
        const last = JSON.parse(localStorage.getItem(`novexa_last_flashcard_success_${state.user.id}`) || 'null');
        if (last?.title && Number(last.cardCount) > 0) {
          const alreadyShown = state.history.some(item => item?.kind === 'flashcard_deck' && String(item.deckId) === String(last.deckId));
          if (!alreadyShown) {
            state.history.push({ role:'assistant', kind:'flashcard_deck', content:`FLASHCARDS CREATED: ${last.title}`, title:last.title, cardCount:Number(last.cardCount), deckId:String(last.deckId||''), createdAt:last.createdAt||new Date().toISOString(), attachments:[] });
            saveDraftState();
            renderHistory();
          }
        }
      } catch (_) {}
    } catch (_) { renderRecentChats(); }
  }

  function renderHistory() {
    chatThread.innerHTML = '';
    // Keep stored history generous, but only mount a bounded recent window on first
    // paint. Hundreds of MathJax-heavy bubbles can make a direct page load appear to
    // crash and can repeatedly move the browser scroll position while typesetting.
    const visibleHistory = state.history.length > 80 ? state.history.slice(-80) : state.history;
    if (!visibleHistory.length) {
      chatThread.innerHTML = `
        <div class="ai-welcome-message">
          <div class="welcome-icon">✦</div>
          <h3>What would you like to learn?</h3>
          <p>Ask a question, upload a photo of a question, or attach a PDF/Word/text file. Novexa will use the material you provide rather than guessing.</p>
          <div class="starter-grid">
            <button class="starter-btn" type="button" data-prompt="Explain quadratic equations from the basics, then solve x² - 5x + 6 = 0 step by step.">Explain a maths problem</button>
            <button class="starter-btn" type="button" data-prompt="Explain photosynthesis simply, then give me the key points I should remember for an exam.">Learn a science topic</button>
            <button class="starter-btn" type="button" data-prompt="Give me a structured plan for answering a 12-mark business question.">Improve exam technique</button>
            <button class="starter-btn" type="button" data-prompt="Quiz me on a topic I choose. Start easy, then increase the difficulty.">Start a quiz</button>
          </div>
        </div>`;
      bindStarterButtons();
      return;
    }
    if (state.history.length > visibleHistory.length) {
      const notice = document.createElement('div');
      notice.className = 'ai-history-window-notice';
      notice.textContent = `Showing the latest ${visibleHistory.length} messages to keep Novexa AI fast. Your full chat history remains saved.`;
      chatThread.appendChild(notice);
    }
    visibleHistory.forEach(item => {
      if (item?.kind === 'flashcard_deck') renderSavedFlashcardConfirmation(item);
      else addBubble(item.content, item.role, false, item.attachments || [], item.attachments || []);
    });
    requestAnimationFrame(() => hardRenderAllAssistantMessages());
  }

  function hardRenderAssistantContent(content, sourceText) {
    if (!content) return null;
    const source = String(sourceText ?? content.dataset.novexaRawText ?? content.textContent ?? '');
    if (!source.trim()) return null;
    content.dataset.novexaRawText = source;
    content.innerHTML = renderMarkdown(source);
    content.dataset.novexaRendered = '1';
    return content.closest('.chat-bubble') || content;
  }

  function hardRenderAllAssistantMessages() {
    if (!chatThread) return;
    chatThread.querySelectorAll('.chat-bubble.assistant .assistant-content').forEach(content => {
      const source = content.dataset.novexaRawText;
      if (!source) return;
      const raw = /(^|\n)\s*#{1,6}\s+/m.test(source)
        || /(^|\n)\s*\|.*\|/m.test(source)
        || /\b(?:frac|dfrac|tfrac|sqrt|aligned|matrix|cases)\b/.test(source)
        || /[A-Za-z]\s*\^\s*\d+/.test(source);
      const needs = raw && (!content.querySelector('.mjx-container') || /#{1,6}\s+|\b(?:frac|sqrt|dfrac|tfrac|aligned|matrix|cases)\b/.test(content.textContent || ''));
      if (needs) {
        const bubble = hardRenderAssistantContent(content, source);
        if (bubble) typesetMath(bubble);
      }
    });
  }

  function addBubble(text, role, persist = true, attachmentNames = [], attachmentMeta = []) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    const normalizedAttachments = (Array.isArray(attachmentMeta) && attachmentMeta.length ? attachmentMeta : (attachmentNames || []).map(name => ({ name }))).slice(0, 5);

    if (normalizedAttachments.length) {
      const attachmentBlock = document.createElement('div');
      attachmentBlock.className = 'message-attachments';
      normalizedAttachments.forEach((item) => {
        const name = String(item?.name || 'Attachment');
        const card = document.createElement('div');
        card.className = 'message-attachment-card';
        if (item?.url && String(item.type || '').startsWith('image/')) {
          const image = document.createElement('img');
          image.className = 'message-attachment-image';
          image.src = item.url;
          image.alt = name;
          // Chat attachments are already visible in the active conversation.
          // Eager loading avoids Chromium's lazy-image placeholder warning and
          // prevents a late image-size update from shifting message layout.
          image.loading = 'eager';
          image.decoding = 'async';
          image.addEventListener('click', () => window.open(item.url, '_blank', 'noopener,noreferrer'));
          card.appendChild(image);
        } else {
          const icon = document.createElement('span');
          icon.className = 'message-attachment-file-icon';
          icon.textContent = String(item.type || '').includes('pdf') ? 'PDF' : 'FILE';
          card.appendChild(icon);
        }
        const details = document.createElement('div');
        details.className = 'message-attachment-details';
        const title = document.createElement('strong');
        title.textContent = name;
        details.appendChild(title);
        if (item?.url) {
          const open = document.createElement('a');
          open.href = item.url;
          open.target = '_blank';
          open.rel = 'noopener noreferrer';
          open.textContent = 'Open file';
          details.appendChild(open);
        } else {
          const caption = document.createElement('small');
          caption.textContent = 'Attached to this question';
          details.appendChild(caption);
        }
        card.appendChild(details);
        attachmentBlock.appendChild(card);
      });
      bubble.appendChild(attachmentBlock);
    }

    const body = document.createElement('div');
    if (role === 'assistant') {
      const pet = state.pet || { name: 'Nova', emoji: '🦊' };
      body.innerHTML = `<div class="assistant-identity"><span class="assistant-pet-avatar">${pet.emoji}</span><strong>${escapeHtml(pet.name)}</strong></div><div class="assistant-content"></div>`;
      hardRenderAssistantContent(body.querySelector('.assistant-content'), text);
    } else {
      body.innerHTML = `<div>${escapeHtml(text)}</div>`;
    }
    bubble.appendChild(body);

    if (role === 'assistant') {
      const actions = document.createElement('div');
      actions.className = 'message-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = 'Copy';
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = 'Copied';
          setTimeout(() => copy.textContent = 'Copy', 1200);
        } catch (_) {}
      };
      actions.appendChild(copy);
      bubble.appendChild(actions);
    }

    chatThread.appendChild(bubble);
    if (role === 'assistant') typesetMath(bubble);
    chatThread.scrollTop = chatThread.scrollHeight;

    if (persist) {
      state.history.push({
        role,
        content: text,
        attachments: normalizedAttachments.map(item => ({
          name: String(item?.name || 'Attachment'),
          type: String(item?.type || ''),
          size: Number(item?.size || 0)
        }))
      });
      save();
      renderRecentChats();
    }
    return bubble;
  }

  function showTyping() {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant';
    const pet = state.pet || { name: 'Nova', emoji: '🦊' };
    bubble.innerHTML = `<div class="typing"><span class="typing-pet-avatar">${pet.emoji}</span><i></i><i></i><i></i><span class="typing-label"><strong>${escapeHtml(pet.name)}</strong> is preparing your answer…</span></div>`;
    chatThread.appendChild(bubble);
    chatThread.scrollTop = chatThread.scrollHeight;
    return bubble;
  }

  function animateThinking(bubble) {
    const label = bubble?.querySelector('.typing-label');
    const pet = state.pet || { name: 'Nova', emoji: '🦊' };
    const messages = [
      `${pet.name} is preparing your answer…`,
      `${pet.name} is checking the details…`,
      `${pet.name} is organising the working…`,
      `${pet.name} is writing the explanation…`
    ];
    let index = 0;
    const update = () => { if (label) label.innerHTML = `<strong>${escapeHtml(pet.name)}</strong> ${escapeHtml(messages[index].replace(`${pet.name} `, ''))}`; };
    const timer = window.setInterval(() => { index = (index + 1) % messages.length; update(); }, 1800);
    return () => window.clearInterval(timer);
  }

  async function getSession(options = {}) {
    if (window.NovexaAuth?.getValidSession) return window.NovexaAuth.getValidSession(options);
    if (!window.supabaseClient) throw new Error('Supabase client did not load.');
    const { data, error } = await window.supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function authenticatedFetch(url, options = {}) {
    if (window.NovexaAuth?.authorizedFetch) return window.NovexaAuth.authorizedFetch(url, options);
    const session = await getSession();
    if (!session?.access_token) throw new Error('Your Novexa session has expired. Please sign in again.');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${session.access_token}`);
    return fetch(url, { ...options, headers });
  }

  function sessionFailureMessage() {
    return window.NovexaAuth?.signInMessage?.() || 'Your sign-in session could not be refreshed. Please sign out and sign in again.';
  }

  async function loadPet() {
    const fallback = { name: 'Nova', emoji: '🦊' };
    state.pet = fallback;
    if (!state.user || !window.supabaseClient) return;
    const emoji = { fox:'🦊', cat:'🐱', panda:'🐼', owl:'🦉', dog:'🐶', rabbit:'🐰', tiger:'🐯', lion:'🦁', koala:'🐨', penguin:'🐧' };
    try {
      const { data } = await window.supabaseClient
        .from('pets').select('pet_type,pet_name').eq('user_id', state.user.id).maybeSingle();
      if (data) state.pet = { name: String(data.pet_name || 'Nova').slice(0,24), emoji: emoji[data.pet_type] || '🦊' };
    } catch (_) {}
    if (aiPetTopName) aiPetTopName.textContent = state.pet.name;
    if (aiPetTopAvatar) aiPetTopAvatar.textContent = state.pet.emoji;
  }

  async function refreshAuth() {
    if (refreshAuthInFlight) return refreshAuthInFlight;
    refreshAuthInFlight = (async () => {
      try {
        const session = await getSession();
        const nextUser = session?.user || null;
        const userChanged = (nextUser?.id || '') !== (state.user?.id || '');
        state.user = nextUser;
        try { state.sidebarCollapsed = Boolean(state.user && localStorage.getItem(`novexa_ai_${state.user.id}_sidebar_collapsed`) === '1'); applySidebarState(false); } catch (_) {}

        if (!state.user) {
          lastLoadedUserId = '';
          lastRecoveredJobId = '';
          aiStatus.textContent = 'Sign in to start chatting';
          aiUserName.textContent = 'Student';
          aiUserEmail.textContent = 'Sign in to use Novexa AI';
          aiAvatar.innerHTML = '<i data-lucide="user" aria-hidden="true"></i>';
          if (aiPetTopName) aiPetTopName.textContent = 'Novexa AI';
          if (aiPetTopAvatar) aiPetTopAvatar.textContent = '✦';
          window.lucide?.createIcons();
          if (aiLoginBtn) aiLoginBtn.textContent = 'Sign in to Novexa';
          setEnabled(false);
          return;
        }

        const meta = state.user.user_metadata || {};
        const name = meta.full_name || meta.name || state.user.email?.split('@')[0] || 'Student';
        aiUserName.textContent = name;
        aiUserEmail.textContent = state.user.email || '';
        const avatarUrl = meta.avatar_url || meta.picture || '';
        if (avatarUrl) {
          aiAvatar.innerHTML = `<img src="${String(avatarUrl).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" alt="" class="ai-avatar-image">`;
        } else {
          aiAvatar.textContent = name.trim().charAt(0).toUpperCase() || 'U';
        }
        if (aiLoginBtn) aiLoginBtn.textContent = 'Sign out';
        setEnabled(true);

        // Auth events can fire more than once during token refresh. Only perform the
        // expensive pet/history/job bootstrap when the user actually changes.
        if (userChanged || lastLoadedUserId !== state.user.id) {
          lastLoadedUserId = state.user.id;
          await loadPet();
          load();
          await loadPersistentChats({ openLatest: true });
          checkHealth();
          refreshCredits();
          const pendingKey = `novexa_ai_pending_job_${state.user.id}`;
          let pending = null;
          try { pending = JSON.parse(localStorage.getItem(pendingKey) || 'null'); } catch (_) {}
          const pendingId = pending?.jobId || '';
          if (pendingId && pendingId !== lastRecoveredJobId) {
            lastRecoveredJobId = pendingId;
            recoverBackgroundJob();
          }
        } else {
          refreshCredits();
        }
        updateStudyReminder();
        if (!window.__novexaReminderTimer) window.__novexaReminderTimer = setInterval(updateStudyReminder, 12000);
      } catch (error) {
        console.error(error);
        aiStatus.textContent = 'Authentication unavailable';
        setEnabled(false);
      } finally {
        refreshAuthInFlight = null;
      }
    })();
    return refreshAuthInFlight;
  }

  function updateStudyReminder() {
    if (!aiReminder) return;
    const messages = [
      '🔥 Keep your study streak alive — finish one more paper today.',
      '🎯 Try a quick quiz after this question to lock in recall.',
      '📄 Complete a past paper today and review the MS afterwards.',
      '🧠 10 minutes of active recall beats another hour of rereading.'
    ];
    const idx = Math.floor(Date.now() / 12000) % messages.length;
    aiReminder.textContent = messages[idx];
  }

  const proActions = new Set(['summarize', 'mark', 'weakness', 'planner', 'paper_analysis', 'notes', 'recommendations', 'paper_full']);

  function isPro() { return state.plan === 'pro'; }

  function promptUpgrade(feature = 'this feature') {
    showNotice(`${feature} is included in Novexa Pro. Opening upgrade options…`);
    window.setTimeout(() => { location.href = `payment.html?feature=${encodeURIComponent(feature)}`; }, 550);
  }

  function renderPlanGates() {
    document.querySelectorAll('[data-pro="true"]').forEach(button => {
      const locked = !isPro();
      button.classList.toggle('pro-locked', locked);
      button.setAttribute('aria-label', locked ? `${button.textContent.trim()} · Pro feature` : button.textContent.trim());
      const small = button.querySelector('small');
      if (small) small.dataset.baseLabel = small.dataset.baseLabel || small.textContent;
      if (small) small.textContent = locked ? 'Pro feature · Upgrade' : small.dataset.baseLabel;
    });
    if (recentChatsPlan) recentChatsPlan.textContent = 'Saved';
    if (aiPlanBadge) {
      aiPlanBadge.textContent = isPro() ? 'Pro' : 'Basic';
      aiPlanBadge.classList.toggle('pro', isPro());
    }
    if (aiUpgradeBtn) aiUpgradeBtn.hidden = isPro();
  }

  function setEnabled(enabled) {
    const usable = enabled && !state.creditExhausted;
    chatInput.disabled = !usable || state.busy;
    chatSubmit.disabled = !usable || state.busy;
    attachButton.disabled = !usable || state.busy;
    if (chatStop) {
      chatStop.hidden = !state.busy || chatStop.dataset.completionBound === 'true';
      chatStop.disabled = !usable || state.stopRequested;
    }
    document.querySelectorAll('.starter-btn,.ai-quick-tool').forEach(el => {
      el.classList.toggle('ai-disabled', !usable || state.busy);
    });
  }

  function setCreditAvailability(plan, credits) {
    // V40: display the same daily AI_USAGE_UNITS allowance enforced by Supabase.
    // A usage unit is an internal cost budget, not a 1:1 API request counter.
    const exhausted = Number(credits) <= 0;
    state.creditExhausted = exhausted;
    if (aiCreditExhausted) aiCreditExhausted.hidden = !exhausted;
    composerWrap?.classList.toggle('ai-credit-locked', exhausted);
    setEnabled(Boolean(state.user));
  }

  async function refreshCredits() {
    if (!state.user || !creditBadge) return;
    try {
      const response = await authenticatedFetch(`${apiBase}/api/ai/credits`);
      let data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load credits');
      // If the usage endpoint reports Basic, perform one entitlement recovery
      // check. This lets a verified PayPal/Stripe subscription repair a stale
      // profile row instead of making a paid student look like Basic forever.
      if (data.unavailable || data.plan !== 'pro') {
        try {
          const billingResponse = await authenticatedFetch(`${apiBase}/api/billing/status`, { cache: 'no-store' });
          const billing = await billingResponse.json().catch(() => ({}));
          if (billingResponse.ok && billing.plan === 'pro') {
            data = { ...data, ...billing, plan: 'pro', usageUnitsRemaining: billing.usageUnitsRemaining ?? billing.credits ?? data.usageUnitsRemaining, credits: billing.credits ?? data.credits, limit: 50, usageUnitsLimit: 50 };
          }
        } catch (_) {}
      }
      if (data.unavailable) return;
      state.plan = data.plan === 'pro' ? 'pro' : 'basic';
      const gatewayEnabled = Boolean(data.gateway?.enabled);
      state.gatewayEnabled = gatewayEnabled;
      const isPro = state.plan === 'pro';
      const dailyLimit = isPro ? 50 : 5;
      const dailyRemainingUnits = Math.max(0, Math.min(Number(data.usageUnitsRemaining ?? data.credits ?? dailyLimit), dailyLimit));
      const dailyCap = gatewayEnabled ? Number(data.gateway?.dailyRequestCap || 0) : 0;
      const dailyRemaining = gatewayEnabled ? Number(data.gateway?.remainingToday ?? dailyCap) : 0;
      setCreditAvailability(state.plan, dailyRemainingUnits);
      renderPlanGates();
      const creditText = `${dailyRemainingUnits.toLocaleString()} / ${dailyLimit.toLocaleString()} AI usage units today · ${isPro ? 'Pro' : 'Basic'}`;
      if (creditBadge) creditBadge.textContent = creditText;
      if (chatCreditBadge) {
        chatCreditBadge.textContent = `${dailyRemainingUnits.toLocaleString()} usage units left`;
        chatCreditBadge.title = gatewayEnabled ? `${creditText}. Daily fair-use request cap: ${dailyCap} requests; ${dailyRemaining} remain today.` : `${creditText}.`;
      }
      const resetText = data.resetAt ? new Date(data.resetAt).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }) : 'next daily reset';
      if (creditBadge) creditBadge.title = gatewayEnabled ? `${creditText}. Daily fair-use cap: ${dailyCap} requests; ${dailyRemaining} remain today.` : `Usage units reset ${resetText}`;
      if (aiReminder) aiReminder.textContent = isPro ? 'Priority AI queue · 50 daily AI usage units' : '5 daily AI usage units · shared fair-use queue';
    } catch (error) {
      console.warn('[Novexa AI] Could not refresh AI usage:', error?.message || error);
      // Keep the existing plan/credit state instead of making another authenticated
      // billing request that can produce a cascade of 401s. The backend still
      // enforces the actual entitlement on every AI request.
      if (!state.plan) state.plan = 'basic';
      renderPlanGates();
      if (creditBadge && !creditBadge.textContent.trim()) creditBadge.textContent = state.plan === 'pro' ? 'AI usage available · Pro' : 'AI usage available · Basic';
      if (chatCreditBadge && !chatCreditBadge.textContent.trim()) chatCreditBadge.textContent = state.plan === 'pro' ? 'Pro AI' : 'Basic AI';
    }
  }

  async function deckRequest(path, method, body) {
    const response = await authenticatedFetch(`${apiBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Your deck could not be saved.');
    return data;
  }

  function validDeckCards(cards) {
    return (Array.isArray(cards) ? cards : []).map(card => ({
      front: String(card?.front || '').trim(), back: String(card?.back || '').trim(),
      type: String(card?.type || 'active recall').trim().slice(0, 32), difficulty: 'medium',
      explanation: String(card?.explanation || '').trim().slice(0, 900),
      hint: String(card?.hint || '').trim().slice(0, 420),
      examTip: String(card?.examTip || card?.exam_tip || '').trim().slice(0, 700)
    })).filter(card => card.front && card.back);
  }

  function flashcardType(value) {
    return String(value || 'active recall').replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  }

  function normalizeFlashcardMath(value) {
    const source = normalizeMathSource(value);
    return source.split('\n').map(line => {
      const trimmed = line.trim();
      if (!trimmed || /^\\\(|^\\\[|^\$\$|^\$/.test(trimmed) || /\\\)$|\\\]$|\$\s*$/.test(trimmed)) return line;
      const prefixMatch = /^(Answer:\s*)/i.exec(trimmed);
      const prefix = prefixMatch?.[1] || '';
      const body = prefix ? trimmed.slice(prefix.length).trim() : trimmed;
      const mathish = /\\(?:frac|dfrac|tfrac|sqrt|text|mathrm|mathbf|times|cdot|pm|leq|geq|neq|int|sum|prod|infty|alpha|beta|gamma|theta|pi|lambda|mu|sigma|omega|partial|nabla|quad|left|right)|(?:[A-Za-z]\w*[_^][A-Za-z0-9{])|[A-Za-z0-9)\]}]\s*[=<>]\s*[A-Za-z0-9(\[{]/.test(body);
      return mathish ? `${prefix}\\(${body}\\)` : line;
    }).join('\n');
  }

  function renderFlashcardMath(element, text) {
    element.classList.add('novexa-math-target');
    element.innerHTML = escapeHtml(normalizeFlashcardMath(text)).replace(/\r?\n/g, '<br>');
    delete element.dataset.novexaMathReady;
    typesetMath(element);
  }

  function extractFlashcardsFromAnswer(value) {
    const text = String(value || '').trim();
    if (!text) return null;
    // Accept a JSON object if a provider ignored the structured-response contract.
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        const parsed = JSON.parse(text.slice(first, last + 1));
        const cards = validDeckCards(parsed?.cards);
        if (cards.length) return { title: String(parsed.title || state.flashcardSource?.reference || state.subject || 'AI Flashcards'), cards };
      } catch (_) {}
    }
    // Backward compatibility: V43.0–V43.5 providers sometimes returned a Markdown
    // table. Convert that legacy table into real deck cards instead of displaying the
    // answers in chat. This is deliberately conservative and only accepts a table with
    // Front/Question/Prompt and Back/Answer columns.
    const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
    const table = lines.filter(line => line.startsWith('|') && line.endsWith('|'));
    if (table.length < 3) return null;
    const cells = line => line.slice(1, -1).split('|').map(cell => cell.trim());
    const header = cells(table[0]).map(cell => cell.toLowerCase().replace(/[^a-z]/g, ''));
    const frontIndex = header.findIndex(cell => /^(front|question|prompt|frontprompt)$/.test(cell));
    const backIndex = header.findIndex(cell => /^(back|answer|response|backanswer)$/.test(cell));
    if (frontIndex < 0 || backIndex < 0 || /^[-:]+$/.test(cells(table[1])[0] || '') === false) return null;
    const cards = [];
    for (const row of table.slice(2)) {
      const values = cells(row);
      const front = String(values[frontIndex] || '').replace(/^\d+\s*[.)]\s*/, '').trim();
      const back = String(values[backIndex] || '').replace(/^\d+\s*[.)]\s*/, '').trim();
      if (front && back && !/^[-:]+$/.test(front) && !/^[-:]+$/.test(back)) cards.push({ front, back, type: 'active recall' });
    }
    if (!cards.length) return null;
    const title = String(state.flashcardSource?.reference || state.subject || 'AI Flashcards').trim();
    return { title, cards: validDeckCards(cards) };
  }

  function renderSavedFlashcardConfirmation(item) {
    const topic = String(item?.title || 'AI Flashcards').trim();
    const cardCount = Math.max(0, Number(item?.cardCount || 0));
    const deckId = String(item?.deckId || '').trim();
    const wrap = document.createElement('section');
    wrap.className = 'flashcard-created-confirmation is-saved';
    wrap.innerHTML = `<div class="flashcard-created-icon">✓</div><div class="flashcard-created-copy"><div class="flashcard-created-label">FLASHCARDS CREATED</div><h3></h3><p class="flashcard-created-status">Your ${cardCount} active-recall cards are saved in Decks.</p><div class="flashcard-created-links"><a class="ai-tool-btn flashcard-view-decks" href="flashcards.html">View decks</a><a class="ai-tool-btn flashcard-study-deck" href="flashcards.html">Study deck</a></div></div>`;
    wrap.querySelector('h3').textContent = topic;
    wrap.querySelector('.flashcard-study-deck').href = deckId ? `flashcards.html?deck=${encodeURIComponent(deckId)}&study=1` : 'flashcards.html';
    chatThread.appendChild(wrap);
    chatThread.scrollTop = chatThread.scrollHeight;
    return wrap;
  }

  function renderFlashcardSaveFailure(topic, error) {
    const wrap = document.createElement('section');
    wrap.className = 'flashcard-created-confirmation is-error';
    wrap.innerHTML = '<div class="flashcard-created-icon">!</div><div class="flashcard-created-copy"><div class="flashcard-created-label">DECK NOT SAVED</div><h3></h3><p class="flashcard-created-status"></p><div class="flashcard-created-links"><button class="ai-tool-btn" type="button">Try again</button></div></div>';
    wrap.querySelector('h3').textContent = topic;
    wrap.querySelector('.flashcard-created-status').textContent = 'Novexa generated the cards but could not verify that the deck was saved to your account. Nothing has been marked as saved.';
    wrap.querySelector('button').addEventListener('click', () => {
      wrap.remove();
      showNotice('Please send the flashcard request again once your connection is restored.');
    });
    wrap.title = String(error?.message || 'Deck storage could not be verified.');
    chatThread.appendChild(wrap);
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  async function renderFlashcards(structured) {
    const cards = validDeckCards(structured?.cards);
    if (!cards.length) return;
    const topic = String(structured?.title || state.flashcardSource?.reference || state.subject || 'your topic').trim();
    const requestId = crypto.randomUUID();
    let savedDeckId = state.deckTarget || '';
    try {
      if (state.deckTarget) {
        await deckRequest(`/api/decks/${encodeURIComponent(state.deckTarget)}/cards`, 'POST', { cards });
      } else {
        const result = await deckRequest('/api/decks', 'POST', { title: topic || 'AI Flashcards', subject: state.subject || 'General', sourceType: state.flashcardSource.type || 'ai', sourceReference: state.flashcardSource.reference || topic, requestId, cards });
        savedDeckId = result?.deck?.id || '';
      }
      const record = { role:'assistant', kind:'flashcard_deck', content:`FLASHCARDS CREATED: ${topic}`, title:topic, cardCount:cards.length, deckId:savedDeckId, createdAt:new Date().toISOString(), attachments:[] };
      state.history.push(record);
      save();
      renderSavedFlashcardConfirmation(record);
      try { localStorage.setItem(`novexa_last_flashcard_success_${state.user.id}`, JSON.stringify({ title: topic, cardCount: cards.length, deckId: savedDeckId, createdAt: record.createdAt })); } catch (_) {}
      renderRecentChats();
    } catch (error) {
      const record={role:'assistant',kind:'flashcard_save_failed',content:`FLASHCARD DECK NOT SAVED: ${topic}`,title:topic,cardCount:cards.length,createdAt:new Date().toISOString(),attachments:[]};
      state.history.push(record);
      save();
      renderFlashcardSaveFailure(topic, error);
      renderRecentChats();
      console.warn('[Novexa Flashcards] account save could not be verified:',error?.message||error);
    }
  }

  function hydrateNoteFlashcardSource() {
    if (new URLSearchParams(location.search).get('source') !== 'notes') return;
    try {
      const source = JSON.parse(sessionStorage.getItem('novexa_note_flashcard_source') || 'null');
      sessionStorage.removeItem('novexa_note_flashcard_source');
      if (!source?.text) return;
      const subject = String(source.subject || 'General');
      state.subject = subject;
      subjectSelect.value = subject;
      state.action = 'flashcards';
      state.flashcardSource = { type: 'notes', reference: String(source.sourceReference || source.title || 'Study notes') };
      const file = new File([String(source.text)], `${String(source.title || 'study-notes').replace(/[^a-z0-9._-]+/gi, '-').slice(0,80)}.txt`, { type: 'text/plain' });
      addFiles([file]);
      chatInput.value = `Create clear active-recall flashcards from my note “${String(source.title || 'Study notes')}”.`;
      resizeChatInput();
      showNotice('Your note is ready. Press Send to generate flashcards.');
    } catch (_) {
      showNotice('Your note could not be prepared. Please try again from Notes.');
    }
  }

  async function checkHealth() {
    try {
      const response = await fetch(`${apiBase}/api/health`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        aiStatus.textContent = data.error || 'Backend health check failed';
        return;
      }
      if (!data.configured) {
        aiStatus.textContent = data.setupMessage || 'AI key not configured · add GEMINI_API_KEY to backend/.env';
        return;
      }
      if (data.authConfigured === false && data.authRequired !== false) {
        aiStatus.textContent = 'Supabase auth is not configured · check backend/.env';
        return;
      }
      aiStatus.textContent = `Ready · ${data.model || 'AI'} connected`;
    } catch (_) {
      aiStatus.textContent = 'Backend offline · run npm start from the project folder';
    }
  }

  function bindStarterButtons() {
    document.querySelectorAll('.starter-btn').forEach(button => {
      button.onclick = () => sendMessage(button.dataset.prompt);
    });
  }

  function addFiles(files) {
    const incoming = Array.from(files || []);
    for (const file of incoming) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const maxSize = (isPro() ? 50 : 10) * 1024 * 1024;
      const maxFiles = isPro() ? 10 : 2;
      if (state.attachments.length >= maxFiles) {
        showNotice(`${isPro() ? 'Pro' : 'Basic'} accounts can attach up to ${maxFiles} files at once${isPdf ? ' for PDF paper uploads' : ''}.`);
        break;
      }
      if (file.size > maxSize) {
        showNotice(`${file.name} is too large. ${isPro() || isPdf ? 'PDF uploads' : 'Basic uploads'} are limited to ${isPro() ? '50 MB' : (isPdf ? '50 MB' : '10 MB')}.`);
        continue;
      }
      const allowed =
        file.type.startsWith('image/') ||
        /^(application\/pdf|text\/.+|application\/json|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/.test(file.type) ||
        /\.(pdf|docx|txt|md|csv|json|xml|html?|js|ts|css|py|java|c|cpp|sql)$/i.test(file.name);

      if (!allowed) {
        showNotice(`${file.name} is not a supported file type.`);
        continue;
      }

      if (!state.attachments.some(x => x.name === file.name && x.size === file.size)) {
        state.attachments.push(file);
      }
    }
    renderAttachments();
  }

  function removeFile(index) {
    state.attachments.splice(index, 1);
    renderAttachments();
  }

  function renderAttachments() {
    attachmentPreview.innerHTML = '';
    state.attachments.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'attachment-chip';
      chip.innerHTML = `<span class="attachment-icon">${file.type.startsWith('image/') ? '🖼️' : file.name.toLowerCase().endsWith('.pdf') ? '📕' : '📄'}</span><span class="attachment-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><button type="button" aria-label="Remove ${escapeHtml(file.name)}">×</button>`;
      chip.querySelector('button').onclick = () => removeFile(index);
      attachmentPreview.appendChild(chip);
    });
  }

  function showNotice(message) {
    aiStatus.textContent = message;
    setTimeout(() => {
      if (!state.busy && state.user) checkHealth();
    }, 2600);
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function prepareImage(file) {
    const dataUrl = await readAsDataURL(file);
    if (file.size < 2_500_000) return dataUrl;

    try {
      const img = await createImageBitmap(file);
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (_) {
      return dataUrl;
    }
  }

  async function extractPdfText(file, renderVisuals = false) {
    if (!window.pdfjsLib) throw new Error('PDF reader is still loading. Please wait a second and try again.');
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    const pages = [];
    const pageImages = [];
    let pagesWithText = 0;

    // Read EVERY page. Whole-paper mode must never silently truncate a paper.
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = Array.isArray(content.items) ? content.items : [];
      const text = items.map(item => String(item?.str || '')).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      pages.push(`Page ${pageNumber}\n${text || '[NO SELECTABLE TEXT ON THIS PAGE]'}`);
      if (text) pagesWithText += 1;

      // In full-paper mode also render every page. This preserves diagrams,
      // graphs, tables and symbols that PDF text extraction may lose.
      if (!renderVisuals) continue;
      try {
        const viewport = page.getViewport({ scale: 1.35 });
        const maxWidth = 1300;
        const scale = Math.min(1, maxWidth / viewport.width);
        const renderViewport = page.getViewport({ scale: 1.35 * scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(renderViewport.width));
        canvas.height = Math.max(1, Math.round(renderViewport.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) {
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
          pageImages.push({ pageNumber, name: `paper-page-${pageNumber}.jpg`, data: canvas.toDataURL('image/jpeg', 0.68) });
        }
      } catch (renderError) {
        console.warn(`[Novexa AI] Could not render PDF page ${pageNumber}:`, renderError?.message || renderError);
      }
    }

    if (!pages.length) throw new Error(`"${file.name}" contains no readable pages.`);
    if (!pagesWithText && !pageImages.length) {
      throw new Error(`"${file.name}" could not be read. Please upload a standard PDF or clear page images.`);
    }

    return { text: pages.join('\n\n'), pageImages, pageCount: pdf.numPages, pagesWithText };
  }

  async function extractDocxText(file) {
    if (!window.mammoth) throw new Error('Word reader is still loading. Please wait a second and try again.');
    const buffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
    const text = (result.value || '').trim();
    if (!text) throw new Error(`"${file.name}" does not contain readable text.`);
    return text.slice(0, 120000);
  }

  function textDataUrl(text) {
    return 'data:text/plain;charset=utf-8;base64,' + btoa(unescape(encodeURIComponent(text)));
  }

  async function prepareAttachment(file, options = {}) {
    if (file.type.startsWith('image/')) {
      return { name: file.name, type: file.type || 'image/jpeg', data: await prepareImage(file) };
    }

    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      // Keep the original PDF for visual inspection AND extract its selectable text.
      // The text gives both Gemini and OpenAI a deterministic page/question context,
      // while the original PDF preserves diagrams, tables and layout.
      const data = await readAsDataURL(file);
      let extracted = { text: '', pageImages: [], pageCount: 0, pagesWithText: 0 };
      try {
        extracted = await extractPdfText(file, Boolean(options.renderPdfPages));
      } catch (error) {
        console.warn('[Novexa AI] PDF extraction unavailable:', error.message);
        throw error;
      }
      return {
        name: file.name,
        type: 'application/pdf',
        data,
        text: extracted.text,
        pageImages: extracted.pageImages,
        pageCount: extracted.pageCount,
        pagesWithText: extracted.pagesWithText
      };
    }

    if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      /\.docx$/i.test(file.name)
    ) {
      const text = await extractDocxText(file);
      return { name: `${file.name} · extracted text`, type: 'text/plain', data: textDataUrl(text) };
    }

    return { name: file.name, type: file.type || 'text/plain', data: await readAsDataURL(file) };
  }

  async function pollBackgroundJobAt(basePath, jobId, onProgress) {
    // Whole-paper jobs are explicitly completion-bound: keep polling until the
    // server says the complete paper result is ready. There is intentionally no
    // browser timeout that can make a long paper look like a failed generation.
    while (true) {
      const response = await authenticatedFetch(`${apiBase}${basePath}${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 404 && data.code === 'PAPER_AI_JOB_NOT_FOUND') {
        const e = new Error('PAPER_JOB_GONE');
        e.code = 'PAPER_AI_JOB_NOT_FOUND';
        throw e;
      }
      if (!response.ok) throw new Error(data.error || `AI job polling failed (${response.status})`);
      if (typeof onProgress === 'function') onProgress(data);
      if (data.status === 'completed') return data.result || {};
      if (data.status === 'failed') throw new Error(data.result?.error || 'The AI job failed.');
      if (state.stopRequested) { const e = new Error('Generation detached. Novexa will keep working in the background.'); e.name = 'AbortError'; throw e; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('The AI request is still running in the background. Return to Novexa AI shortly to retrieve it.');
  }

  async function pollBackgroundJob(jobId) {
    const deadline = Date.now() + 45 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await authenticatedFetch(`${apiBase}/api/ai/jobs/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 404 && data.code === 'AI_JOB_NOT_FOUND') {
        const e = new Error('BACKGROUND_JOB_GONE');
        e.code = 'AI_JOB_NOT_FOUND';
        throw e;
      }
      if (!response.ok) throw new Error(data.error || `AI job polling failed (${response.status})`);
      if (data.status === 'completed') return data.result || {};
      if (data.status === 'failed') throw new Error(data.result?.error || 'The AI job failed.');
      if (state.stopRequested) { const e = new Error('Generation detached. Novexa will keep working in the background.'); e.name = 'AbortError'; throw e; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('The AI request took too long. It is still running on Novexa; return to this chat shortly to retrieve it.');
  }

  function persistAssistantAnswer(text) {
    state.history.push({ role: 'assistant', content: String(text || ''), attachments: [] });
    save();
    renderRecentChats();
  }

  function revealAssistantBubble(bubble, fullText) {
    const text = String(fullText || '').trim();
    const autoFollow = chatThread ? (chatThread.scrollHeight - chatThread.scrollTop - chatThread.clientHeight < 140) : false;
    if (!bubble) return Promise.resolve();
    bubble.classList.add('is-streaming');
    const content = bubble.querySelector('.assistant-content') || bubble;
    content.dataset.novexaRawText = text;
    if (!text) {
      content.innerHTML = '<p>I could not generate an answer. Please try again.</p>';
      bubble.classList.remove('is-streaming');
      return Promise.resolve();
    }

    // Stream plain text first. Never run MathJax against an incomplete LaTeX
    // expression: doing that while tokens are arriving was the source of the
    // broken/overlapping equations in the previous build.
    content.innerHTML = '<div class="streaming-text" aria-live="polite"></div>';
    const stream = content.querySelector('.streaming-text');
    const total = text.length;
    const chunkSize = Math.max(14, Math.min(90, Math.ceil(total / 80)));
    let shown = 0;

    return new Promise(resolve => {
      const tick = () => {
        shown = Math.min(total, shown + chunkSize);
        stream.textContent = text.slice(0, shown);
        if (autoFollow) chatThread.scrollTop = chatThread.scrollHeight;
        if (shown < total) {
          window.setTimeout(tick, 10);
          return;
        }

        // Only after the complete answer is present do we parse Markdown and
        // typeset mathematics. This guarantees balanced delimiters.
        hardRenderAssistantContent(content, text);
        bubble.classList.remove('is-streaming');
        typesetMath(bubble);
        if (autoFollow) chatThread.scrollTop = chatThread.scrollHeight;
        resolve();
      };
      tick();
    });
  }

  function revealPartialPaperProgress(bubble, progress) {
    const autoFollow = chatThread ? (chatThread.scrollHeight - chatThread.scrollTop - chatThread.clientHeight < 140) : false;
    const sections = Array.isArray(progress?.partialAnswers)
      ? [...progress.partialAnswers].sort((a, b) => Number(a.section || 0) - Number(b.section || 0))
      : [];
    if (!bubble?.isConnected || !sections.length) return;
    let content = bubble.querySelector('.partial-paper-content');
    let status = bubble.querySelector('.partial-paper-status');
    if (!content) {
      const pet = state.pet || { name: 'Nova', emoji: '🦊' };
      bubble.className = 'chat-bubble assistant paper-progress-bubble';
      bubble.innerHTML = `<div class="assistant-identity"><span class="assistant-pet-avatar">${pet.emoji}</span><strong>${escapeHtml(pet.name)}</strong></div><div class="partial-paper-content" aria-live="polite"></div><div class="partial-paper-status"></div>`;
      content = bubble.querySelector('.partial-paper-content');
      status = bubble.querySelector('.partial-paper-status');
      content.style.whiteSpace = 'pre-wrap';
    }
    content.innerHTML = sections.map(section => {
      const heading = `<div class="partial-paper-heading"><strong>Section ${escapeHtml(section.section)}</strong><span>Pages ${escapeHtml((section.pageNumbers || []).join(', '))}</span></div>`;
      return `${heading}${renderMarkdown(section.answer || '')}`;
    }).join('<div class="partial-paper-divider">────────────────────</div>');
    if (status) status.textContent = `Live paper progress · ${Math.min(Number(progress.sectionsCompleted || sections.length), Number(progress.sectionsTotal || sections.length))}/${Number(progress.sectionsTotal || sections.length)} sections complete`;
    typesetMath(content);
    if (autoFollow) chatThread.scrollTop = chatThread.scrollHeight;
  }

  async function recoverBackgroundJob() {
    if (!state.user) return;
    let pending;
    try { pending = JSON.parse(localStorage.getItem(`novexa_ai_pending_job_${state.user.id}`) || 'null'); } catch (_) { pending = null; }
    if (!pending?.jobId) return;
    if (!['paper','ai'].includes(String(pending.jobKind || ''))) {
      localStorage.removeItem(`novexa_ai_pending_job_${state.user.id}`);
      return;
    }
    const age = Date.now() - Number(pending.createdAt || 0);
    if (age > 45 * 60 * 1000) { localStorage.removeItem(`novexa_ai_pending_job_${state.user.id}`); return; }
    state.busy = true; setEnabled(true);
    aiStatus.textContent = `${state.pet?.name || 'Nova'} is finishing your answer in the background…`;
    const typing = showTyping();
    try {
      const session = await getSession();
      const data = pending.jobKind === 'paper'
        ? await pollBackgroundJobAt('/api/paper-ai/jobs/', pending.jobId)
        : await pollBackgroundJob(pending.jobId);
      if (data?.message && !data.answer) data.answer = data.message;
      typing.remove();
      if (data.action === 'flashcards' && data.structured?.cards?.length) { await renderFlashcards(data.structured); }
      else {
        const answer = data.answer || 'I could not generate an answer.';
        const b = addBubble('', 'assistant', false);
        await revealAssistantBubble(b, answer);
        persistAssistantAnswer(answer);
      }
      refreshCredits(); save();
      localStorage.removeItem(`novexa_ai_pending_job_${state.user.id}`);
    } catch (error) {
      typing.remove();
      if (error?.code === 'AI_JOB_NOT_FOUND' || error?.code === 'PAPER_AI_JOB_NOT_FOUND') {
        localStorage.removeItem(`novexa_ai_pending_job_${state.user.id}`);
        aiStatus.textContent = `${state.pet?.name || 'Nova'} is ready.`;
        // A job can disappear after a local/server restart. Do not expose
        // backend job persistence details to students or turn a stale job into
        // a visible error card. The next request starts a fresh generation.
      } else {
        showNotice(error.message || 'Nova is ready for another request.');
      }
    }
    finally { state.busy = false; sendRequestLock = false; setEnabled(Boolean(state.user)); }
  }

  async function sendMessage(prefilled, requestedAction) {
    const message = String(prefilled ?? chatInput.value).trim();
    let action = requestedAction || (state.action && state.action !== 'study' ? state.action : state.mode);
    // Treat an explicit flashcard request as the flashcards action BEFORE the
    // request reaches the backend. Previously a typed "create flashcards"
    // prompt could still be sent as action=study; the model then returned a
    // Markdown table and the legacy parser could not reliably recover it.
    // Flashcards must always use the structured JSON contract and never appear
    // as a visible answer table in chat.
    const explicitFlashcardIntent = /\b(?:create|make|generate|build|give|turn|convert)\b[\s\S]{0,100}\bflashcards?\b/i.test(message)
      || /\bflashcards?\b[\s\S]{0,100}\b(?:create|make|generate|build|give|turn|convert)\b/i.test(message);
    if (explicitFlashcardIntent) action = 'flashcards';
    const hasPdfAttachment = Boolean(
      state.attachments.some(file => /pdf/i.test(file.type || '') || /\.pdf$/i.test(file.name || ''))
    );
    // A PDF + a paper-analysis request should use the dedicated whole-paper
    // pipeline. This fixes the old behaviour where a generic
    // "analyse the attached material" request was treated as a tiny chat turn.
    const wholePaperRequest = hasPdfAttachment && /\b(?:whole|entire|full)\s+paper\b|\bevery\s+question\b|\ball\s+questions\b|\bquestion\s+by\s+question\b|\b(?:analy[sz]e|analyse|explain|solve|do|work)\s+(?:the\s+)?(?:attached\s+)?(?:paper|material)\b|\b(?:analy[sz]e|analyse)\s+the\s+attached\s+material\b/i.test(message);
    if (wholePaperRequest || (hasPdfAttachment && !message)) action = 'paper_full';
    if (state.creditExhausted) { showNotice('You’ve used your Basic AI fair-use allowance. Upgrade to Pro for higher limits and priority access.'); return; }
    if (action !== 'paper_full' && proActions.has(action) && !isPro()) {
      promptUpgrade(action === 'paper_analysis' ? 'Past paper analysis' : action === 'notes' ? 'AI Notes Generator' : action === 'mark' ? 'Mark my answer' : action === 'weakness' ? 'Weakness analysis' : action === 'planner' ? 'Adaptive Study Planner' : 'This advanced AI tool');
      return;
    }
    state.action = 'study';
    if ((!message && !state.attachments.length) || state.busy || sendRequestLock || !state.user) return;

    sendRequestLock = true;
    state.busy = true;
    state.stopRequested = false;
    state.abortController = new AbortController();
    if (chatStop) chatStop.dataset.completionBound = String(action === 'paper_full' && hasPdfAttachment);
    setEnabled(true);

    const files = [...state.attachments];
    const attachmentNames = files.map(f => f.name);
    const attachmentMeta = files.map(file => ({
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      url: URL.createObjectURL(file)
    }));
    const priorHistory = state.history.slice(-12);

    addBubble(
      message || 'Please analyze the attached material.',
      'user',
      true,
      attachmentNames,
      attachmentMeta
    );

    chatInput.value = '';
    resizeChatInput();
    const typing = showTyping();
    const stopThinkingAnimation = animateThinking(typing);
    aiStatus.textContent = `${state.pet?.name || 'Novexa'} is preparing a fast answer…`;

    try {
      const session = await getSession();
      if (!session?.access_token) throw new Error(sessionFailureMessage());

      // Prepare attachments concurrently so a PDF and images do not queue one after another.
      const prepared = await Promise.all(files.map(file => prepareAttachment(file, { renderPdfPages: action === 'paper_full' })));
      state.attachments = [];
      renderAttachments();

      if (state.stopRequested) throw Object.assign(new Error('Generation stopped.'), { name: 'AbortError' });
      // Queue the generation on the backend. Whole-paper PDF requests use the
      // dedicated Paper AI pipeline, which chunks the document and preserves
      // question/page order instead of trying to fit an entire paper into one
      // model response. Both job types live on the server, so navigation does
      // not cancel the work.
      const pdfForWholePaper = prepared.find(file => /pdf/i.test(file.type || '') && typeof file.text === 'string' && file.text.trim());
      const jobKind = action === 'paper_full' && pdfForWholePaper ? 'paper' : 'ai';
      const jobPayload = jobKind === 'paper'
        ? {
            message: message || 'Explain the whole paper question by question.',
            history: priorHistory,
            fullPaper: true,
            paperText: pdfForWholePaper.text,
            pageImages: Array.isArray(pdfForWholePaper.pageImages) ? pdfForWholePaper.pageImages : [],
            plan: state.plan,
            paper: { subject: state.subject, paper: pdfForWholePaper.name, documentType: 'Past Paper', petName: state.pet?.name || 'Nova', totalPages: pdfForWholePaper.pageCount || 0 }
          }
        : { prompt: message, history: priorHistory, mode: state.mode, subject: state.subject, action, attachments: prepared };
      let data;
      if (jobKind === 'paper') {
        const jobResponse = await authenticatedFetch(`${apiBase}/api/paper-ai/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jobPayload),
          signal: state.abortController.signal
        });
        const jobData = await jobResponse.json().catch(() => ({}));
        if (!jobResponse.ok) {
          if (jobResponse.status === 401) throw new Error(sessionFailureMessage());
          throw new Error(jobData.error || `Could not start full-paper AI request (${jobResponse.status})`);
        }
        const jobId = jobData.jobId;
        localStorage.setItem(`novexa_ai_pending_job_${state.user.id}`, JSON.stringify({ jobId, jobKind, createdAt: Date.now(), prompt: message }));
        try {
          data = await pollBackgroundJobAt('/api/paper-ai/jobs/', jobId, progress => {
            const done = Number(progress.sectionsCompleted || 0);
            const total = Number(progress.sectionsTotal || 0);
            if (progress.status === 'running' && total) {
              aiStatus.textContent = `${state.pet?.name || 'Novexa'} is delivering your paper… ${Math.min(done, total)}/${total} sections complete`;
              revealPartialPaperProgress(typing, progress);
            } else if (progress.status === 'queued') {
              aiStatus.textContent = `${state.pet?.name || 'Novexa'} has started your paper…`;
            }
          });
        } catch (paperJobError) {
          // Last-resort Paper AI recovery: use the already extracted full-paper text
          // through the direct authenticated Paper AI endpoint. This keeps a queued
          // job/persistence/provider failure from becoming a dead-end error bubble.
          aiStatus.textContent = `${state.pet?.name || 'Novexa'} is switching to text-only paper analysis…`;
          const recoveryTask = action === 'flashcards' || /flashcards?/i.test(message) ? 'flashcards' : 'summarize';
          const recoveryResponse = await authenticatedFetch(`${apiBase}/api/paper-ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Novexa-Paper-Recovery': '1' },
            body: JSON.stringify({
              message: message || (recoveryTask === 'flashcards' ? 'Create flashcards from this entire paper.' : 'Summarize this entire paper and identify the most important topics and question types I should revise.'),
              history: priorHistory,
              task: recoveryTask,
              currentPage: 1,
              fullPaper: false,
              paper: { subject: state.subject, paper: pdfForWholePaper.name, documentType: 'Past Paper', totalPages: pdfForWholePaper.pageCount || 0 },
              pageText: String(pdfForWholePaper.text || '').slice(0, 30000),
              paperText: String(pdfForWholePaper.text || '').slice(0, 140000)
            }),
            signal: state.abortController.signal
          });
          const recoveryData = await recoveryResponse.json().catch(() => ({}));
          if (!recoveryResponse.ok || !recoveryData.answer) throw paperJobError;
          data = recoveryData;
        }
        localStorage.removeItem(`novexa_ai_pending_job_${state.user.id}`);
      } else {
        // Every normal AI request is a durable server-side job. Navigation,
        // refreshes and tab switches no longer cancel the model generation.
        const jobResponse = await authenticatedFetch(`${apiBase}/api/ai/jobs`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(jobPayload), signal:state.abortController.signal
        });
        const jobData = await jobResponse.json().catch(()=>({}));
        if(!jobResponse.ok){ if(jobResponse.status===401) throw new Error(sessionFailureMessage()); throw new Error(jobData.error||`Could not start the AI job (${jobResponse.status})`); }
        const durableJobId=jobData.jobId;
        if(!durableJobId) throw new Error('Novexa could not start the background AI job.');
        localStorage.setItem(`novexa_ai_pending_job_${state.user.id}`,JSON.stringify({jobId:durableJobId,jobKind:'ai',createdAt:Date.now(),prompt:message,action,subject:state.subject}));
        aiStatus.textContent=`${state.pet?.name||'Novexa'} is working in the background…`;
        try {
          data=await pollBackgroundJob(durableJobId);
        } catch (jobError) {
          // A durable job can fail transiently when the worker/provider pool
          // restarts. Do not strand the student behind a generic error bubble.
          // Give the foreground AI endpoint one authenticated recovery attempt.
          const retryMessage = String(jobError?.message || '');
          const transient = /temporarily|available|provider|busy|retry|background ai job|AI job failed/i.test(retryMessage) || jobError?.code === 'AI_PROVIDER_POOL_UNAVAILABLE';
          if (!transient) throw jobError;
          aiStatus.textContent = `${state.pet?.name || 'Novexa'} is retrying through the live AI route…`;
          const direct = await authenticatedFetch(`${apiBase}/api/ai`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify(jobPayload), signal:state.abortController.signal
          });
          const directData = await direct.json().catch(()=>({}));
          if (!direct.ok) throw new Error(directData.error || 'Nova could not complete that request right now.');
          data = directData.jobId ? await pollBackgroundJob(directData.jobId) : directData;
        }
        localStorage.removeItem(`novexa_ai_pending_job_${state.user.id}`);
      }
      if (jobKind === 'paper' && data?.message && !data.answer) data.answer = data.message;
      typing.remove();
      localStorage.removeItem(`novexa_ai_pending_job_${state.user.id}`);
      const flashcardIntent = action === 'flashcards' || data.action === 'flashcards' || /\b(?:create|make|generate|build|give|turn|convert)\b[\s\S]{0,100}\bflashcards?\b/i.test(message) || /\bflashcards?\b[\s\S]{0,100}\b(?:create|make|generate|build|give|turn|convert)\b/i.test(message);
      if (flashcardIntent) {
        // Flashcards are a study asset, never a chat table. Prefer the structured
        // response, but also repair legacy/provider table output so old fallback
        // models cannot leak a useless answer table into the conversation.
        const structuredCards = data.structured?.cards?.length ? { ...data.structured, cards: validDeckCards(data.structured.cards) } : extractFlashcardsFromAnswer(data.answer || data.message || '');
        if (structuredCards?.cards?.length) {
          await renderFlashcards(structuredCards);
        } else {
          addBubble('I could not create a usable flashcard deck. Please try the request again.', 'assistant');
        }
      } else {
        const answer = data.answer || 'I could not generate an answer. Please try again.';
        const bubble = addBubble('', 'assistant', false);
        await revealAssistantBubble(bubble, answer);
        persistAssistantAnswer(answer);
      }
      if (data.plan === 'pro') {
        if (creditBadge) creditBadge.textContent = `${Number(data.usageUnitsRemaining ?? data.credits ?? 50).toLocaleString()} / 50 AI usage units today · Pro`;
        if (chatCreditBadge) chatCreditBadge.textContent = `${Number(data.credits ?? 50).toLocaleString()} usage units left`;
      } else if (Number.isFinite(data.credits)) {
        if (creditBadge) creditBadge.textContent = `${data.credits} / 5 AI usage units today · Basic`;
        if (chatCreditBadge) chatCreditBadge.textContent = `${data.credits} usage units left`;
      }
      aiStatus.textContent = data.fallbackUsed
        ? `Ready · Automatic AI fallback${data.model ? ` · ${data.model}` : ''}`
        : `Ready · ${data.model || 'AI assistant'}`;
      refreshCredits();
      save();
    } catch (error) {
      typing.remove();
      // The user's message is already in local history. Do not save a fake
      // assistant answer as if the AI actually answered it.
      const detached = Boolean(state.stopRequested || error?.name === 'AbortError');
      const last = state.history[state.history.length - 1];
      // If the student detached, keep the user message and pending job. Returning
      // to Novexa AI will recover the server-side answer automatically.
      if (!detached && last?.role === 'user' && last.content === message) {
        state.history.pop();
        save();
      }
      if (detached) {
        aiStatus.textContent = 'Detached · Novexa is continuing in the background';
      } else if (error?.name === 'ProFeatureError') {
        aiStatus.textContent = 'Upgrade to Pro to unlock this tool';
      } else {
        const errorText = String(error?.message || 'Unknown AI error');
        const usageExhausted = /AI_DAILY_USAGE_EXHAUSTED|used your daily AI usage allowance|daily AI usage allowance/i.test(errorText);
        const providerPoolFailure = /Nova could not reach a currently available AI model|AI_PROVIDER_POOL_UNAVAILABLE|AI_FREE_POOL_EXHAUSTED|AI_PROVIDERS_COOLING_DOWN|AI_PROVIDER_POOL_EMPTY|AI_NOT_CONFIGURED|currently available AI model|switching through the available AI providers|temporarily exhausted the available free AI capacity|temporarily unavailable/i.test(errorText);
        const staleJob = error?.code === 'AI_JOB_NOT_FOUND' || error?.code === 'PAPER_AI_JOB_NOT_FOUND' || /^(BACKGROUND_JOB_GONE|PAPER_JOB_GONE)$/.test(errorText);
        if (staleJob) {
          localStorage.removeItem(`novexa_ai_pending_job_${state.user.id}`);
          aiStatus.textContent = `${state.pet?.name || 'Nova'} is ready.`;
        } else if (usageExhausted) {
          addBubble(
            'Your daily AI usage units are used up. Your allowance will reset automatically; no generated answer was saved as if it succeeded.',
            'assistant',
            false
          );
          aiStatus.textContent = 'AI paused · daily usage exhausted';
        } else if (providerPoolFailure) {
          // Provider diagnostics belong in server logs, never in a student chat.
          // The backend has already exhausted its automatic fallback/retry path.
          addBubble(
            'Nova is having a short connection delay. Your question is safe — please try again in a moment.',
            'assistant',
            false
          );
          aiStatus.textContent = 'Ready · automatic AI recovery';
        } else {
          // Never expose provider/API-key/backend diagnostics in the student chat.
          // They are useful in the server console, not to the student.
          addBubble(
            'Nova could not complete that request right now. Please try again in a moment.',
            'assistant',
            false
          );
          aiStatus.textContent = 'Ready · automatic AI recovery';
        }
      }
    } finally {
      stopThinkingAnimation?.();
      sendRequestLock = false;
      state.busy = false;
      state.abortController = null;
      state.stopRequested = false;
      if (chatStop) delete chatStop.dataset.completionBound;
      setEnabled(Boolean(state.user));
    }
  }

  toolGrid?.addEventListener('click', event => {
    const button = event.target.closest('[data-ai-action]');
    if (!button) return;
    const action = button.dataset.aiAction;
    if (button.dataset.pro === 'true' && !isPro()) {
      promptUpgrade(button.querySelector('b')?.textContent || action);
      return;
    }
    const prompt = button.dataset.userPrompt || button.dataset.prompt || '';
    chatInput.value = '';
    resizeChatInput();
    state.action = action;
    sendMessage(prompt, action);
  });

  document.addEventListener('click', event => {
    const promptButton = event.target.closest('[data-prompt]');
    // Quick AI tools submit immediately. Do not let this generic prompt
    // handler put the tool's internal instruction back into the composer.
    if (promptButton?.closest('#aiToolGrid')) return;
    if (promptButton && !promptButton.classList.contains('starter-btn')) {
      chatInput.value = promptButton.dataset.prompt;
      chatInput.focus();
    }
  });

  // Novexa AI intentionally has one adaptive chat mode. The old Study/Exam/Explain/Practice
  // button cluster created routing conflicts with Paper AI and made the UI feel like four
  // different assistants. The backend still supports specialized actions internally.
  state.mode = 'study';
  state.action = 'study';
  localStorage.removeItem('novexa-ai-mode');
  if (composerMode) composerMode.textContent = `Subject: ${state.subject || 'General'}`;
  subjectSelect.addEventListener('change', () => {
    state.subject = subjectSelect.value;
    localStorage.setItem('novexa-ai-subject', state.subject);
    if (composerMode) composerMode.textContent = `Subject: ${state.subject}`;
    aiStatus.textContent = `Ready · ${state.subject} assistant`;
  });
  recentChatsSearch?.addEventListener('input', renderRecentChats);

  function resizeChatInput() {
    if (!chatInput) return;
    chatInput.style.height = 'auto';
    const maxHeight = Math.min(280, Math.max(120, Math.round(window.innerHeight * 0.34)));
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, maxHeight)}px`;
    chatInput.style.overflowY = chatInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  chatInput.addEventListener('input', resizeChatInput);
  chatStop?.addEventListener('click', () => {
    if (!state.busy) return;
    state.stopRequested = true;
    if (chatStop) chatStop.disabled = true;
    aiStatus.textContent = 'Detached from this answer · Novexa will keep working in the background.';
    // The request is server-side now. Do not abort it; the student can leave and
    // return later and the pending job will be recovered automatically.
  });

  chatSubmit.addEventListener('click', () => sendMessage());
  chatInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  attachButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', event => {
    addFiles(event.target.files);
    event.target.value = '';
  });

  ['dragenter', 'dragover'].forEach(type => composerWrap.addEventListener(type, event => {
    event.preventDefault();
    composerWrap.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach(type => composerWrap.addEventListener(type, event => {
    event.preventDefault();
    composerWrap.classList.remove('dragging');
  }));
  composerWrap.addEventListener('drop', event => addFiles(event.dataTransfer.files));

  document.addEventListener('paste', event => {
    const imageItems = Array.from(event.clipboardData?.items || []).filter(item => item.type.startsWith('image/'));
    if (!imageItems.length || !state.user) return;
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (file) addFiles([new File([file], `pasted-image-${Date.now()}.png`, { type: file.type })]);
    });
  });

  document.addEventListener('visibilitychange', () => {
    // Persist chat state when the tab is backgrounded so a fast tab switch/new
    // chat cannot strand the last messages in the debounce timer.
    if (document.hidden && state.user && state.chatId && state.history.length) {
      clearTimeout(chatSyncTimer);
      if(state.chatArchived) syncCurrentChat().catch(error => console.warn('[Novexa Chats] visibility sync failed:', error?.message || error)); else saveDraftState();
    }
    if (!state.busy) return;
    if (document.hidden) aiStatus.textContent = `${state.pet?.name || 'Novexa'} is still working in the background…`;
    else aiStatus.textContent = `${state.pet?.name || 'Novexa'} is finishing your answer…`;
  });

  window.addEventListener('pagehide', () => {
    if (state.user && state.chatId && state.history.length) {
      clearTimeout(chatSyncTimer);
      // The normal authenticated PATCH is preferred; this is best-effort because
      // browsers may terminate async work during page shutdown.
      if(state.chatArchived) syncCurrentChat().catch(() => {}); else saveDraftState();
    }
  });

  function isMobileSidebar(){return window.matchMedia?.('(max-width:760px)').matches;}
  function applySidebarState(openMobile=false){
    if(!aiWorkspace)return;
    const mobile = isMobileSidebar();
    const collapsed = Boolean(state.sidebarCollapsed && !mobile);
    if(mobile){
      aiWorkspace.classList.toggle('sidebar-open',Boolean(openMobile));
      aiWorkspace.classList.remove('sidebar-collapsed');
      sidebarBackdrop?.toggleAttribute('hidden',!openMobile);
      if(sidebarToggle)sidebarToggle.setAttribute('aria-label',openMobile?'Close study sidebar':'Open study sidebar');
      document.body.classList.remove('ai-sidebar-fullscreen');
    }else{
      aiWorkspace.classList.toggle('sidebar-collapsed',collapsed);
      aiWorkspace.classList.remove('sidebar-open');
      sidebarBackdrop?.toggleAttribute('hidden',true);
      document.body.classList.toggle('ai-sidebar-fullscreen',collapsed);
      if(sidebarToggle)sidebarToggle.setAttribute('aria-label',collapsed?'Expand study sidebar':'Collapse study sidebar');
    }
    window.lucide?.createIcons?.();
  }
  function closeSidebarOnMobile(){if(isMobileSidebar())applySidebarState(false);}
  sidebarCollapse?.addEventListener('click',()=>{if(isMobileSidebar()){applySidebarState(false);return;}state.sidebarCollapsed=!state.sidebarCollapsed;try{localStorage.setItem(`novexa_ai_${state.user?.id||'guest'}_sidebar_collapsed`,state.sidebarCollapsed?'1':'0');}catch(_){}applySidebarState();});
  sidebarToggle?.addEventListener('click',()=>{if(isMobileSidebar())applySidebarState(!aiWorkspace?.classList.contains('sidebar-open'));else{state.sidebarCollapsed=!state.sidebarCollapsed;try{localStorage.setItem(`novexa_ai_${state.user?.id||'guest'}_sidebar_collapsed`,state.sidebarCollapsed?'1':'0');}catch(_){}applySidebarState();}});
  sidebarBackdrop?.addEventListener('click',closeSidebarOnMobile);
  window.addEventListener('resize',()=>applySidebarState(aiWorkspace?.classList.contains('sidebar-open')));

  async function startNewChat(force=false) {
    if (!state.user || (state.busy && !force)) return;
    try {
      clearTimeout(chatSyncTimer);
      if (state.history.length && !state.chatArchived && state.history.some(x=>x.role==='user')) await archiveCurrentChat();
      else if (state.history.length && state.chatArchived) await syncCurrentChat();
    } catch (e) { console.warn('[Novexa Chats] archive before new chat failed:', e?.message || e); }
    state.chatId=null;state.chatTitle='';state.chatArchived=false;state.history=[];state.attachments=[];state.action='study';clearDraftState();chatInput.value='';resizeChatInput();renderAttachments();renderHistory();renderRecentChats();aiStatus.textContent='Ready · new chat';closeSidebarOnMobile();chatInput.focus();
  }

  newChat?.addEventListener('click', startNewChat);
  recentChatsSearch?.addEventListener('input', renderRecentChats);
  newChatSidebar?.addEventListener('click', startNewChat);
  deleteChat?.addEventListener('click', deleteCurrentChat);

  exportChat.addEventListener('click', () => {
    const text = state.history
      .map(x => `${x.role === 'user' ? 'Student' : 'Novexa AI'}:\n${x.content}`)
      .join('\n\n---\n\n');
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'novexa-ai-chat.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  aiUpgradeBtn?.addEventListener('click', () => {
    window.location.href = 'payment.html';
  });
  aiZeroCreditUpgrade?.addEventListener('click', () => { window.location.href = 'payment.html'; });
  aiZeroCreditLater?.addEventListener('click', () => { aiCreditExhausted.hidden = true; aiStatus.textContent = 'AI is paused until your daily usage units reset or you upgrade.'; });

  aiLoginBtn?.addEventListener('click', async () => {
    if (state.user) {
      aiLoginBtn.disabled = true;
      aiLoginBtn.textContent = 'Signing out…';
      try {
        await window.supabaseClient.auth.signOut({ scope: 'local' });
      } finally {
        window.location.replace('login.html');
      }
    } else {
      window.location.href = 'login.html';
    }
  });

  window.supabaseClient?.auth.onAuthStateChange((_event, session) => {
    // Refresh immediately after password login, Google OAuth, token refresh or logout.
    refreshAuth();
  });
  try { state.sidebarCollapsed = localStorage.getItem(`novexa_ai_${state.user?.id || 'guest'}_sidebar_collapsed`) === '1'; } catch (_) {}
  resizeChatInput();
  applySidebarState(false);
  renderRecentChats();
  renderPlanGates();
  hydrateNoteFlashcardSource();
  refreshAuth();
  console.info('[Novexa] frontend build:', window.NOVEXA_FRONTEND_BUILD);
})();
