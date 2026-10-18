/* Real-time Tekla syntax and rule linter.
 * validate(code, mode) -> [{ line, column, severity: 'error'|'warning'|'info', message, fixSuggestion }]
 * Modes: 'formula' (Custom Component), 'tpled' (Template Editor value field), 'inp' (objects.inp). */
const INP_TYPES = ['string', 'integer', 'float', 'option'];
const NUMERIC_ATTR = /(THICKNESS|WEIGHT|LENGTH|WIDTH|HEIGHT|DEPTH|AREA|DIAMETER|RADIUS|QUANTITY|COUNT|SIZE|SPACING|COVER|ANGLE|DIM_[A-G]|HOOK_)/i;
const STRING_ATTR = /(NAME|MARK|PROFILE|MATERIAL|GRADE|PHASE|TITLE|PREFIX|STATUS|COMMENT)/i;
const CMP = '(==|=|!=|<>|<=|>=|<|>)';
const ORDER = { error: 0, warning: 1, info: 2 };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function validate(code, mode = 'formula') {
  const src = String(code ?? '');
  if (!src.trim()) return [];
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  const where = i => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= i) lo = mid; else hi = mid - 1; }
    return { line: lo + 1, column: i - starts[lo] + 1 };
  };
  const out = [];
  const add = (i, severity, message, fixSuggestion = '') => out.push({ ...where(Math.max(0, i)), severity, message, fixSuggestion });

  const clean = blankLiterals(src, add);
  checkBrackets(clean, mode === 'inp', where, add);
  if (mode === 'inp') checkInp(src, clean, where, add);
  else {
    const conds = checkConditionals(src, clean, add);
    if (mode === 'formula') checkDivision(clean, conds, add);
  }
  return out.sort((a, b) => a.line - b.line || a.column - b.column || ORDER[a.severity] - ORDER[b.severity]);
}

/* Same-length copy of the source with string contents and // comments replaced by spaces. */
function blankLiterals(src, add) {
  const c = src.split('');
  let i = 0;
  while (i < c.length) {
    if (src[i] === '/' && src[i + 1] === '/') { while (i < c.length && src[i] !== '\n') c[i++] = ' '; continue; }
    if (src[i] === '"') {
      let j = i + 1;
      while (j < c.length && src[j] !== '"' && src[j] !== '\n') j++;
      for (let k = i + 1; k < j; k++) c[k] = ' ';
      if (src[j] !== '"') { add(i, 'error', 'Unterminated string: this double quote is never closed', 'Add a closing " at the end of the string'); i = j; }
      else i = j + 1;
      continue;
    }
    i++;
  }
  return c.join('');
}

function checkBrackets(clean, braces, where, add) {
  const open = { '(': ')', '[': ']' };
  if (braces) open['{'] = '}';
  const close = Object.fromEntries(Object.entries(open).map(([k, v]) => [v, k]));
  const stack = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (open[ch]) stack.push({ ch, i });
    else if (close[ch]) {
      const top = stack[stack.length - 1];
      if (!top) add(i, 'error', `Unexpected "${ch}" with no opening "${close[ch]}"`, `Remove this "${ch}" or add "${close[ch]}" earlier`);
      else {
        if (open[top.ch] !== ch) add(i, 'error', `"${ch}" does not match the "${top.ch}" opened on line ${where(top.i).line}`, `Use "${open[top.ch]}" here`);
        stack.pop();
      }
    }
  }
  stack.forEach(s => add(s.i, 'error', `Unclosed "${s.ch}"`, `Add "${open[s.ch]}" to close it`));
}

function checkConditionals(src, clean, add) {
  const stack = [], conds = [];
  const re = /[A-Za-z_][A-Za-z0-9_.]*/g;
  const handle = (w, i) => {
    const top = stack[stack.length - 1];
    if (w === 'if') stack.push({ i, state: 'cond', from: i + 2 });
    else if (w === 'elseif') {
      if (!top || top.state !== 'then') add(i, 'error', 'elseif must follow the then-branch of an open if', 'Remove it or start a new if block');
      else { top.state = 'cond'; top.from = i + 6; }
    } else if (w === 'then') {
      if (!top || top.state !== 'cond') add(i, 'error', 'then without a matching if condition', 'Remove this then or add the if before it');
      else { conds.push([top.from, i]); top.state = 'then'; }
    } else if (w === 'else') {
      if (!top) add(i, 'error', 'Orphaned else: there is no open if block', 'Remove this else or add an if ... then before it');
      else if (top.state === 'else') add(i, 'error', 'Duplicate else in the same if block', 'Remove the second else');
      else if (top.state === 'cond') add(i, 'error', 'else appears before the then of its if', 'Add then after the if condition');
      else top.state = 'else';
    } else if (w === 'endif') {
      if (!top) add(i, 'error', 'endif without a matching if', 'Remove this endif or add an if block before it');
      else { if (top.state === 'cond') add(top.i, 'error', 'This if has no then', 'Add then after the condition'); stack.pop(); }
    }
  };
  let m;
  while ((m = re.exec(clean))) {
    const w = m[0].toLowerCase();
    if (w === 'end') {
      const tail = /^\s+if\b/i.exec(clean.slice(m.index + 3));
      if (tail) {
        add(m.index, 'error', 'Tekla requires "endif", not "end if"', 'Replace "end if" with "endif"');
        handle('endif', m.index);
        re.lastIndex = m.index + 3 + tail[0].length;
      }
    } else handle(w, m.index);
  }
  stack.forEach(s => {
    if (s.state === 'cond') add(s.i, 'error', 'This if has no then', 'Add then after the condition');
    add(s.i, 'error', 'This if has no matching endif', 'Add endif after the last branch');
  });

  conds.forEach(([a, b]) => {
    const cc = clean.slice(a, b), cs = src.slice(a, b);
    const single = /(?<![=<>!])=(?!=)/g;
    let s;
    while ((s = single.exec(cc))) add(a + s.index, 'warning', 'Single "=" inside an if condition', 'Use "==" to compare values');
    const A = new RegExp(`GetValue\\s*\\(\\s*"([^"]+)"\\s*\\)\\s*${CMP}\\s*"([^"]*)"`, 'g');
    while ((s = A.exec(cs))) if (NUMERIC_ATTR.test(s[1])) add(a + s.index, 'warning', `Numeric attribute "${s[1]}" is compared to the text "${s[3]}"`, `Cast it: double(GetValue("${s[1]}")) ${s[2]} ${Number.isFinite(+s[3]) && s[3] !== '' ? s[3] : '<number>'}`);
    const B = new RegExp(`"([^"]*)"\\s*${CMP}\\s*GetValue\\s*\\(\\s*"([^"]+)"\\s*\\)`, 'g');
    while ((s = B.exec(cs))) if (NUMERIC_ATTR.test(s[3])) add(a + s.index, 'warning', `Text "${s[1]}" is compared to numeric attribute "${s[3]}"`, `Cast it: double(GetValue("${s[3]}"))`);
    const C = new RegExp(`GetValue\\s*\\(\\s*"([^"]+)"\\s*\\)\\s*${CMP}\\s*(-?\\d+(?:\\.\\d+)?)(?![\\w."])`, 'g');
    while ((s = C.exec(cs))) if (STRING_ATTR.test(s[1]) && !NUMERIC_ATTR.test(s[1])) add(a + s.index, 'warning', `Text attribute "${s[1]}" is compared to the number ${s[3]}`, `Compare as text: GetValue("${s[1]}") ${s[2]} "${s[3]}", or use double(...)`);
  });
  return conds;
}

function checkDivision(clean, conds, add) {
  const re = /\/\s*(\(|[A-Za-z_][A-Za-z0-9_.]*|\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(clean))) {
    const tok = m[1], at = m.index;
    if (/^\d/.test(tok)) { if (parseFloat(tok) === 0) add(at, 'error', 'Division by zero', 'Use a non-zero divisor'); continue; }
    if (tok === '(' || clean[at + m[0].length] === '(') {
      if (!conds.length) add(at, 'info', 'The divisor is an expression that could evaluate to 0', 'Test it first: if (<expression> <> 0) then ... else 0 endif');
      continue;
    }
    const guard = new RegExp('(^|[^A-Za-z0-9_.])' + reEsc(tok) + '($|[^A-Za-z0-9_.])', 'i');
    if (conds.some(([a, b]) => guard.test(clean.slice(a, b)))) continue;
    add(at, 'warning', `Possible division by zero: ${tok} is never tested before dividing`, `Wrap it: if (${tok} <> 0) then ... else 0 endif`);
  }
}

function splitArgs(src, clean, a, b) {
  if (!clean.slice(a, b).trim()) return [];
  const out = [];
  let depth = 0, s = a;
  const push = e => { const raw = src.slice(s, e); out.push({ t: raw.trim(), s: s + raw.length - raw.trimStart().length }); };
  for (let i = a; i < b; i++) {
    const ch = clean[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) { push(i); s = i + 1; }
  }
  push(b);
  return out;
}

function checkInp(src, clean, where, add) {
  const re = /\b(tab_page|attribute|modify)\s*\(/gi;
  const names = new Map(), placed = [];
  const quoted = t => /^"[^"]*"$/.test(t);
  const numeric = t => /^-?\d+(\.\d+)?$/.test(t);
  let tab = 0, m;
  while ((m = re.exec(clean))) {
    const kind = m[1].toLowerCase(), open = m.index + m[0].length - 1;
    let depth = 0, close = -1;
    for (let i = open; i < clean.length; i++) {
      if (clean[i] === '(') depth++;
      else if (clean[i] === ')' && --depth === 0) { close = i; break; }
    }
    if (close < 0) continue;
    re.lastIndex = close + 1;
    const args = splitArgs(src, clean, open + 1, close);

    if (kind === 'tab_page') {
      tab++;
      if (!args.length || !quoted(args[0].t) || args[0].t === '""') add(args.length ? args[0].s : open, 'error', 'tab_page needs a quoted tab title as its first parameter', 'Example: tab_page("Fabrication", ...)');
      continue;
    }
    if (kind === 'modify') {
      if (args.length > 1 || (args.length === 1 && !/^[01]$/.test(args[0].t))) add(args.length ? args[0].s : open, 'error', 'modify() takes a single 0 or 1', 'Use modify(1) to allow changes or modify(0) to lock');
      continue;
    }

    if (args.length !== 11) add(m.index, 'error', `attribute() needs 11 parameters (name, label, type, format, mandatory, list, min, max, x, y, width) but has ${args.length}`, 'Example: attribute("STATUS", "Status", string, "%s", no, none, "0.0", "0.0", 0, 0, 100)');
    const g = i => args[i];
    const nm = g(0);
    let name = '';
    if (nm) {
      if (!quoted(nm.t)) add(nm.s, 'error', 'The attribute name must be a quoted string', 'Wrap it in double quotes');
      else {
        name = nm.t.slice(1, -1);
        if (/\s/.test(name)) add(nm.s, 'error', `Attribute name "${name}" contains spaces`, `Use "${name.trim().replace(/\s+/g, '_')}"`);
        else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) add(nm.s, 'error', `Attribute name "${name}" must start with a letter or underscore and use letters, digits or underscores only`, 'Rename the attribute');
        if (name.length > 30) add(nm.s, 'error', `Attribute name "${name}" is longer than 30 characters`, 'Shorten the identifier');
        const key = name.toLowerCase();
        if (names.has(key)) add(nm.s, 'error', `Duplicate attribute identifier "${name}" (first defined on line ${names.get(key)})`, 'Give every attribute a unique name');
        else names.set(key, where(nm.s).line);
      }
    }
    if (g(1) && !quoted(g(1).t)) add(g(1).s, 'warning', 'The label should be a quoted string', 'Wrap it in double quotes');
    let type = '';
    if (g(2)) {
      type = g(2).t.toLowerCase();
      if (!INP_TYPES.includes(type)) add(g(2).s, 'error', `Invalid data type "${g(2).t}"`, 'Use string, integer, float or option');
    }
    if (g(3)) {
      const f = g(3).t;
      if (!quoted(f)) add(g(3).s, 'error', 'The format must be a quoted string such as "%s"', 'Wrap the format in double quotes');
      else if ((type === 'string' && !/%s/.test(f)) || (type === 'integer' && !/%d/.test(f)) || (type === 'float' && !/%[-+ 0#]*\d*(\.\d+)?[fge]/i.test(f)))
        add(g(3).s, 'warning', `Format ${f} does not suit the ${type} type`, type === 'string' ? '"%s"' : type === 'integer' ? '"%d"' : '"%.2f"');
    }
    if (g(4) && !/^(yes|no)$/i.test(g(4).t)) add(g(4).s, 'error', 'The mandatory flag must be yes or no', 'Use yes or no without quotes');
    if (g(5) && !g(5).t) add(g(5).s, 'warning', 'The option list parameter is empty', 'Use none when the attribute has no list');
    [6, 7].forEach(i => { if (g(i) && !/^"-?\d+(\.\d+)?"$/.test(g(i).t)) add(g(i).s, 'warning', `The ${i === 6 ? 'minimum' : 'maximum'} should be a quoted number such as "0.0"`, 'Example: "0.0"'); });
    [8, 9, 10].forEach(i => { if (g(i) && !numeric(g(i).t)) add(g(i).s, 'error', `The ${['x', 'y', 'width'][i - 8]} value must be a number`, 'Use a plain number such as 100'); });
    if (g(10) && numeric(g(10).t) && parseFloat(g(10).t) <= 0) add(g(10).s, 'error', 'The width must be greater than 0', 'Use a positive width such as 100');

    if (name && args.length >= 11 && [8, 9, 10].every(i => numeric(g(i).t))) {
      const x = +g(8).t, y = +g(9).t, w = +g(10).t;
      const hit = placed.find(p => p.tab === tab && p.y === y && x < p.x + p.w && p.x < x + w);
      if (hit) add(m.index, 'warning', `"${name}" overlaps "${hit.name}" on the same row of this tab`, `Move x to ${hit.x + hit.w} or change y`);
      placed.push({ tab, name, x, y, w });
    }
  }
}
