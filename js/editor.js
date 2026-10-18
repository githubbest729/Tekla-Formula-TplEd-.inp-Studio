/* Tekla Studio editor: syntax-highlighted code area, Prettify / One-Line collapse, and the live variable sandbox.
 * createEditor({ host, sandbox, onChange, onCursor }) -> controller used by app.js. */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STRUCT = new Set(['if', 'then', 'else', 'elseif', 'endif']);
const KEYWORDS = new Set([...STRUCT, 'and', 'or', 'not', 'mod']);
const INP_WORDS = new Set(['tab_page', 'attribute', 'modify', 'string', 'integer', 'float', 'option', 'yes', 'no', 'none']);

/* ---------- tokenizer shared by prettify and collapse ---------- */
function tokenize(text) {
  const re = /(\r?\n)|([^\S\n]+)|(\/\/[^\n]*)|("[^"\n]*"?)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)|(==|<=|>=|<>|!=|&&|\|\||[\s\S])/g;
  const toks = [];
  let m, sp = false;
  while ((m = re.exec(text))) {
    if (m[1]) { toks.push({ k: 'nl', v: '\n' }); sp = true; continue; }
    if (m[2]) { sp = true; continue; }
    const k = m[3] ? 'cm' : m[4] ? 'str' : m[5] ? 'num' : m[6] ? 'word' : 'sym';
    const v = m[3] ? m[3].trimEnd() : (m[4] || m[5] || m[6] || m[7]);
    toks.push({ k, v, sp });
    sp = false;
  }
  for (let i = 0; i < toks.length - 1; i++) {
    if (toks[i].k === 'word' && toks[i].v.toLowerCase() === 'end') {
      let j = i + 1;
      while (toks[j] && toks[j].k === 'nl') j++;
      if (toks[j] && toks[j].k === 'word' && toks[j].v.toLowerCase() === 'if') { toks[i] = { k: 'word', v: 'endif', sp: toks[i].sp }; toks.splice(i + 1, j - i); }
    }
  }
  return toks;
}

/* Expand a cramped formula into an indented multi-line block. */
export function prettifyText(text, mode = 'formula') {
  const toks = tokenize(text), inp = mode === 'inp', IND = '  ';
  const out = [];
  let line = '', ind = 0, depth = 0, nl = 0, afterComma = false;
  const flush = () => { if (line) { out.push(IND.repeat(ind) + line); line = ''; } };
  const put = (v, sp) => { line += (line && sp ? ' ' : '') + v; };
  const dedent = () => { ind = Math.max(0, ind - 1); };
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.k === 'nl') { nl++; flush(); continue; }
    if (nl >= 2 && out.length && out[out.length - 1] !== '') out.push('');
    nl = 0;
    const w = tk.k === 'word' ? tk.v.toLowerCase() : '', top = depth === 0;
    if (top && w === 'if') { flush(); put(tk.v, false); }
    else if (top && w === 'then') { put(tk.v, true); flush(); ind++; }
    else if (top && w === 'else') { flush(); dedent(); put(tk.v, false); flush(); ind++; }
    else if (top && w === 'elseif') { flush(); dedent(); put(tk.v, false); }
    else if (top && w === 'endif') { flush(); dedent(); put(tk.v, false); flush(); }
    else if (tk.k === 'cm') { put(tk.v, true); flush(); }
    else if (inp && tk.v === '{') { put('{', true); flush(); ind++; }
    else if (inp && tk.v === '}') { flush(); dedent(); put('}', false); flush(); }
    else if (inp && tk.v === ';') { put(';', false); flush(); }
    else {
      put(tk.v, tk.sp || afterComma);
      if (tk.v === '(' || tk.v === '[') depth++;
      else if (tk.v === ')' || tk.v === ']') {
        depth = Math.max(0, depth - 1);
        if (inp && depth === 0) {
          let j = i + 1;
          while (toks[j] && toks[j].k === 'nl') j++;
          if (!toks[j] || (toks[j].v !== '{' && toks[j].v !== ';')) flush();
        }
      }
    }
    afterComma = tk.v === ',';
  }
  flush();
  return out.join('\n');
}

/* Join everything into one line for pasting into Tekla dialogs. Comments are dropped because they would swallow the rest of the line. */
export function collapseText(text) {
  const toks = tokenize(text).filter(t => t.k !== 'cm');
  let out = '', afterNl = false, prev = null;
  for (const t of toks) {
    if (t.k === 'nl') { afterNl = true; continue; }
    const forced = t.k === 'word' && STRUCT.has(t.v.toLowerCase());
    const nlSpace = afterNl && !(prev && (prev.v === '(' || prev.v === '[')) && ![')', ']', ','].includes(t.v);
    out += (out && (t.sp || nlSpace || forced) ? ' ' : '') + t.v;
    afterNl = false; prev = t;
  }
  return out.trim();
}

/* ---------- highlighting ---------- */
function highlightLine(line, mode) {
  const re = /(\/\/.*$)|("[^"]*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_.]*)|([=<>!+\-*\/%&|]+)/g;
  let html = '', last = 0, m;
  while ((m = re.exec(line))) {
    html += esc(line.slice(last, m.index));
    last = re.lastIndex;
    const v = esc(m[0]);
    if (m[1]) html += `<span class="tok-cmt">${v}</span>`;
    else if (m[2]) html += `<span class="tok-str">${v}</span>`;
    else if (m[3]) html += `<span class="tok-num">${v}</span>`;
    else if (m[4]) {
      const w = m[4].toLowerCase();
      if (KEYWORDS.has(w) || (mode === 'inp' && INP_WORDS.has(w) && !/^\s*\(/.test(line.slice(last)) || (mode === 'inp' && (w === 'tab_page' || w === 'attribute' || w === 'modify')))) html += `<span class="tok-kw">${v}</span>`;
      else if (/^\s*\(/.test(line.slice(last))) html += `<span class="tok-fn">${v}</span>`;
      else if (/^[pd]\d+$/i.test(w)) html += `<span class="tok-var">${v}</span>`;
      else html += v;
    } else html += `<span class="tok-op">${v}</span>`;
  }
  return html + esc(line.slice(last));
}

/* ---------- sandbox evaluator (no eval; degrees for trig) ---------- */
function lex(src) {
  const t = [];
  let i = 0, m;
  while (i < src.length) {
    const rest = src.slice(i), c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '"') {
      const j = src.indexOf('"', i + 1);
      if (j < 0 || src.slice(i, j).includes('\n')) throw new Error('Unterminated string');
      t.push({ k: 'str', v: src.slice(i + 1, j) }); i = j + 1; continue;
    }
    if ((m = /^(\d+(\.\d+)?|\.\d+)/.exec(rest))) { t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest))) {
      const tail = /^\s+if\b/i.exec(rest.slice(m[0].length));
      if (m[0].toLowerCase() === 'end' && tail) { t.push({ k: 'id', v: 'endif' }); i += m[0].length + tail[0].length; }
      else { t.push({ k: 'id', v: m[0] }); i += m[0].length; }
      continue;
    }
    if ((m = /^(==|<=|>=|<>|!=|&&|\|\|)/.exec(rest))) { t.push({ k: 'sym', v: m[0] }); i += 2; continue; }
    if ('+-*/%()=<>,!'.includes(c)) { t.push({ k: 'sym', v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return t;
}

const num = v => {
  const n = typeof v === 'number' ? v : Number(v);
  if (v === '' || v == null || !Number.isFinite(n)) throw new Error(`Expected a number but got "${v}"`);
  return n;
};
const numLike = v => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
const truthy = v => (typeof v === 'number' ? v !== 0 : v !== '' && v != null);
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const glob = (s, p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(s);
const FUNCS = {
  ceil: a => Math.ceil(num(a[0])), floor: a => Math.floor(num(a[0])), abs: a => Math.abs(num(a[0])),
  round: a => (a[1] === undefined ? Math.round(num(a[0])) : Number(num(a[0]).toFixed(num(a[1])))),
  sqrt: a => { const n = num(a[0]); if (n < 0) throw new Error('sqrt of a negative number'); return Math.sqrt(n); },
  sin: a => Math.sin(rad(num(a[0]))), cos: a => Math.cos(rad(num(a[0]))), tan: a => Math.tan(rad(num(a[0]))),
  atan: a => deg(Math.atan(num(a[0]))), asin: a => deg(Math.asin(num(a[0]))), acos: a => deg(Math.acos(num(a[0]))),
  atan2: a => deg(Math.atan2(num(a[0]), num(a[1]))), pow: a => Math.pow(num(a[0]), num(a[1])),
  exp: a => Math.exp(num(a[0])), log: a => Math.log(num(a[0])), log10: a => Math.log10(num(a[0])),
  min: a => Math.min(...a.map(num)), max: a => Math.max(...a.map(num)),
  int: a => Math.trunc(num(a[0])), double: a => num(a[0]), string: a => String(a[0]),
  length: a => String(a[0]).length,
  mid: a => (a[2] === undefined ? String(a[0]).substr(num(a[1])) : String(a[0]).substr(num(a[1]), num(a[2]))),
  find: a => String(a[0]).indexOf(String(a[1])),
  match: a => (glob(String(a[0]), String(a[1])) ? 1 : 0)
};
const CMP_OPS = new Set(['==', '=', '!=', '<>', '<', '>', '<=', '>=']);

function compare(a, b, op) {
  if (numLike(a) && numLike(b)) { a = Number(a); b = Number(b); } else { a = String(a); b = String(b); }
  switch (op) {
    case '==': case '=': return a === b;
    case '!=': case '<>': return a !== b;
    case '<': return a < b; case '>': return a > b; case '<=': return a <= b; default: return a >= b;
  }
}

function compile(src) {
  const t = lex(src);
  let p = 0;
  const isKw = w => t[p] && t[p].k === 'id' && t[p].v.toLowerCase() === w;
  const isSym = s => t[p] && t[p].k === 'sym' && t[p].v === s;
  const expectKw = w => { if (!isKw(w)) throw new Error(`Expected "${w}"`); p++; };
  const expectSym = s => { if (!isSym(s)) throw new Error(`Expected "${s}"`); p++; };

  function block(stops) {
    const list = [];
    while (p < t.length && !stops.some(isKw)) list.push(stmt());
    return env => { let v; for (const s of list) v = s(env); return v; };
  }
  function stmt() {
    if (isKw('if')) return ifStmt();
    if (t[p].k === 'id' && t[p + 1] && t[p + 1].k === 'sym' && t[p + 1].v === '=') {
      const name = t[p].v; p += 2;
      const e = expr();
      return env => { const v = e(env); env.vars.set(name, v); return v; };
    }
    return expr();
  }
  function ifStmt() {
    p++;
    const c = expr();
    expectKw('then');
    const a = block(['else', 'elseif', 'endif']);
    if (isKw('elseif')) { const b = ifStmt(); return env => (truthy(c(env)) ? a(env) : b(env)); }
    let b = () => undefined;
    if (isKw('else')) { p++; b = block(['endif']); }
    expectKw('endif');
    return env => (truthy(c(env)) ? a(env) : b(env));
  }
  function orE() {
    let l = andE();
    while (isKw('or') || isSym('||')) { p++; const a = l, r = andE(); l = env => (truthy(a(env)) || truthy(r(env)) ? 1 : 0); }
    return l;
  }
  function andE() {
    let l = notE();
    while (isKw('and') || isSym('&&')) { p++; const a = l, r = notE(); l = env => (truthy(a(env)) && truthy(r(env)) ? 1 : 0); }
    return l;
  }
  function notE() {
    if (isKw('not') || isSym('!')) { p++; const a = notE(); return env => (truthy(a(env)) ? 0 : 1); }
    return cmpE();
  }
  function cmpE() {
    let l = addE();
    while (t[p] && t[p].k === 'sym' && CMP_OPS.has(t[p].v)) { const op = t[p++].v, a = l, r = addE(); l = env => (compare(a(env), r(env), op) ? 1 : 0); }
    return l;
  }
  function addE() {
    let l = mulE();
    while (isSym('+') || isSym('-')) {
      const op = t[p++].v, a = l, r = mulE();
      l = env => {
        const x = a(env), y = r(env);
        if (op === '+' && (typeof x === 'string' || typeof y === 'string') && !(numLike(x) && numLike(y) && typeof x === 'number' && typeof y === 'number')) return String(x) + String(y);
        return op === '+' ? num(x) + num(y) : num(x) - num(y);
      };
    }
    return l;
  }
  function mulE() {
    let l = unary();
    while (isSym('*') || isSym('/') || isSym('%') || isKw('mod')) {
      const op = t[p++].v.toLowerCase(), a = l, r = unary();
      l = env => {
        const x = num(a(env)), y = num(r(env));
        if (op === '*') return x * y;
        if (y === 0) throw new Error('Division by zero');
        return op === '/' ? x / y : x % y;
      };
    }
    return l;
  }
  function unary() {
    if (isSym('-')) { p++; const a = unary(); return env => -num(a(env)); }
    return primary();
  }
  function primary() {
    const tk = t[p++];
    if (!tk) throw new Error('Formula ends unexpectedly');
    if (tk.k === 'num' || tk.k === 'str') return () => tk.v;
    if (tk.k === 'sym' && tk.v === '(') { const e = orE(); expectSym(')'); return e; }
    if (tk.k === 'id') {
      const name = tk.v, low = name.toLowerCase();
      if (isSym('(')) {
        p++;
        const args = [];
        if (!isSym(')')) { do { args.push(orE()); } while (isSym(',') && ++p); }
        expectSym(')');
        if (low === 'getvalue' || low === 'getfieldformula') {
          return env => `${name}("${args[0] ? args[0](env) : ''}")` && env.input(`${name}("${args[0](env)}")`, '');
        }
        const fn = FUNCS[low];
        if (!fn) throw new Error(`Unknown function "${name}"`);
        return env => fn(args.map(a => a(env)));
      }
      if (low === 'pi') return () => Math.PI;
      if (low === 'true') return () => 1;
      if (low === 'false') return () => 0;
      if (KEYWORDS.has(low)) throw new Error(`Unexpected "${name}"`);
      return env => (env.vars.has(name) ? env.vars.get(name) : env.input(name, name));
    }
    throw new Error(`Unexpected "${tk.v}"`);
  }
  const expr = orE;
  const body = block([]);
  if (p < t.length) throw new Error(`Unexpected "${t[p].v}"`);
  return body;
}

/* Inputs the sandbox must ask for: bare identifiers that are never assigned, plus GetValue / GetFieldFormula keys. */
function detectInputs(src) {
  const t = lex(src), found = [], assigned = new Set();
  const cont = new Set(['if', 'elseif', 'and', 'or', 'not', 'mod']);
  t.forEach((tk, i) => {
    const prev = t[i - 1], next = t[i + 1];
    if (tk.k === 'id' && next && next.k === 'sym' && next.v === '=') {
      const startsStmt = !prev || prev.k === 'num' || prev.k === 'str' || (prev.k === 'sym' && prev.v === ')') || (prev.k === 'id' && !cont.has(prev.v.toLowerCase()));
      if (startsStmt) assigned.add(tk.v);
    }
  });
  t.forEach((tk, i) => {
    if (tk.k !== 'id') return;
    const low = tk.v.toLowerCase(), next = t[i + 1];
    if ((low === 'getvalue' || low === 'getfieldformula') && next && next.v === '(' && t[i + 2] && t[i + 2].k === 'str') {
      const key = `${tk.v}("${t[i + 2].v}")`;
      if (!found.includes(key)) found.push(key);
    } else if (!(next && next.v === '(') && !KEYWORDS.has(low) && !['pi', 'true', 'false'].includes(low) && !assigned.has(tk.v) && !found.includes(tk.v)
      && !(t[i - 1] && t[i - 1].v === '(' && t[i - 2] && /^get/i.test(t[i - 2].v))) found.push(tk.v);
  });
  return found;
}

function fmt(v) {
  if (v === undefined) return 'no value (the formula produced no result)';
  if (typeof v === 'number') return `${Number.isInteger(v) ? v : +v.toFixed(6)} (number)`;
  return `"${v}" (text)`;
}

/* ---------- editor controller ---------- */
export function createEditor({ host, sandbox, onChange = () => {}, onCursor = () => {} }) {
  let mode = 'formula', diagLines = new Map(), sig = '', trapTab = true, compiled = { src: null, fn: null };
  const saved = new Map();

  host.innerHTML = '';
  const wrap = document.createElement('div'); wrap.className = 'ed-wrap';
  const gutter = document.createElement('div'); gutter.className = 'ed-gutter'; gutter.setAttribute('aria-hidden', 'true');
  const scroll = document.createElement('div'); scroll.className = 'ed-scroll'; scroll.style.overflow = 'hidden';
  const pre = document.createElement('pre'); pre.className = 'ed-highlight'; pre.setAttribute('aria-hidden', 'true');
  const input = document.createElement('textarea'); input.className = 'ed-input';
  input.setAttribute('wrap', 'off'); input.setAttribute('aria-label', 'Tekla code editor. Press Escape then Tab to leave the editor.');
  input.spellcheck = false; input.autocapitalize = 'off'; input.autocomplete = 'off';
  scroll.append(pre, input); wrap.append(gutter, scroll); host.append(wrap);

  function render() {
    const lines = input.value.split('\n');
    pre.innerHTML = lines.map((l, i) => {
      const html = highlightLine(l, mode), sev = diagLines.get(i + 1);
      return sev ? `<span class="ed-line-${sev}" style="display:inline-block;min-width:100%">${html || '&#8203;'}</span>` : html;
    }).join('\n') + '\n';
    gutter.textContent = lines.map((_, i) => i + 1).join('\n') + '\n\n\n';
    syncScroll();
  }
  function syncScroll() {
    pre.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`;
    gutter.scrollTop = input.scrollTop;
  }
  function position() {
    const pos = input.selectionStart, before = input.value.slice(0, pos);
    return { line: before.split('\n').length, column: pos - before.lastIndexOf('\n') };
  }
  const report = () => onCursor(position());
  function handleInput() { render(); scheduleSandbox(); onChange(input.value); report(); }
  function setText(v) { input.value = v; render(); scheduleSandbox(); report(); }

  input.addEventListener('input', handleInput);
  input.addEventListener('scroll', syncScroll);
  input.addEventListener('click', report);
  input.addEventListener('focus', report);
  document.addEventListener('selectionchange', () => { if (document.activeElement === input) report(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { trapTab = false; return; }
    if (e.key === 'Tab' && trapTab && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); input.setRangeText('  ', input.selectionStart, input.selectionEnd, 'end'); handleInput(); return;
    }
    trapTab = true;
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const pos = input.selectionStart, before = input.value.slice(0, pos);
      const cur = before.slice(before.lastIndexOf('\n') + 1);
      const extra = /(^|\s)(then|else)\s*$/i.test(cur) ? '  ' : '';
      e.preventDefault();
      input.setRangeText('\n' + /^ */.exec(cur)[0] + extra, pos, input.selectionEnd, 'end');
      handleInput();
    }
  });

  /* sandbox */
  let timer = 0;
  function scheduleSandbox() { clearTimeout(timer); timer = setTimeout(renderSandbox, 150); }
  if (sandbox) sandbox.addEventListener('input', e => {
    const f = e.target.closest('[data-sb]');
    if (f) { saved.set(f.dataset.sb, f.value); evaluate(); }
  });

  function renderSandbox() {
    if (!sandbox) return;
    const src = input.value;
    if (mode === 'inp') { sig = 'inp'; sandbox.innerHTML = '<p class="empty">objects.inp files define dialog attributes, so there is nothing to calculate. Switch to Formula or TplEd mode to test values.</p>'; return; }
    if (!src.trim()) { sig = 'empty'; sandbox.innerHTML = '<p class="empty">Write a formula and its variables (P1, D1, GetValue("...")) appear here as input fields.</p>'; return; }
    let vars = [];
    try { vars = detectInputs(src); } catch { /* syntax errors are shown by evaluate() */ }
    const next = mode + '|' + vars.join('\u0001');
    if (next !== sig) {
      sig = next;
      sandbox.innerHTML = (vars.length ? vars.map(v => `<div class="sb-row"><label>${esc(v)}<input type="text" data-sb="${esc(v)}" value="${esc(saved.get(v) ?? '')}" autocomplete="off"></label></div>`).join('')
        : '<p class="empty">No input variables found.</p>')
        + '<div class="sb-out" role="status"></div><p class="empty">Trig functions use degrees. mid() and find() count from 0. Numbers typed above are treated as numbers.</p>';
    }
    evaluate();
  }

  function evaluate() {
    const out = sandbox && sandbox.querySelector('.sb-out');
    if (!out) return;
    const src = input.value;
    try {
      if (compiled.src !== src) compiled = { src, fn: compile(src) };
      const env = {
        vars: new Map(),
        input: (key, bare) => {
          const raw = (saved.get(key) ?? '').trim();
          if (raw === '') return /^[PD]\d+$/i.test(bare) ? 0 : '';
          return Number.isFinite(Number(raw)) ? Number(raw) : raw;
        }
      };
      out.style.color = '';
      out.textContent = 'Result: ' + fmt(compiled.fn(env));
    } catch (err) {
      out.style.color = 'var(--err)';
      out.textContent = 'Cannot calculate: ' + err.message;
    }
  }

  render();
  renderSandbox();

  return {
    getValue: () => input.value,
    setValue: setText,
    getMode: () => mode,
    setMode(m) { mode = m; sig = ''; render(); scheduleSandbox(); },
    prettify() { const v = prettifyText(input.value, mode); setText(v); return v; },
    collapse() { const v = collapseText(input.value); setText(v); return v; },
    setDiagnostics(list) {
      diagLines = new Map();
      const rank = { error: 0, warning: 1, info: 2 };
      (list || []).forEach(d => { const cur = diagLines.get(d.line); if (!cur || rank[d.severity] < rank[cur]) diagLines.set(d.line, d.severity); });
      render();
    },
    goTo(line, column = 1) {
      const lines = input.value.split('\n');
      const l = Math.min(Math.max(1, line), lines.length);
      let off = 0;
      for (let i = 0; i < l - 1; i++) off += lines[i].length + 1;
      off += Math.min(Math.max(1, column) - 1, lines[l - 1].length);
      input.focus(); input.setSelectionRange(off, off);
      const lh = parseFloat(getComputedStyle(input).lineHeight) || 22;
      input.scrollTop = Math.max(0, (l - 1) * lh - input.clientHeight / 3);
      syncScroll(); report();
    },
    insertAtCursor(text) { input.setRangeText(text, input.selectionStart, input.selectionEnd, 'end'); handleInput(); },
    focus: () => input.focus()
  };
}

/* Exposed for testing and reuse: evaluate a formula with a {key: value} map of inputs. */
export function evaluateText(src, values = {}) {
  const env = { vars: new Map(), input: (key, bare) => { const raw = String(values[key] ?? '').trim(); return raw === '' ? (/^[PD]\d+$/i.test(bare) ? 0 : '') : (Number.isFinite(Number(raw)) ? Number(raw) : raw); } };
  return compile(src)(env);
}
