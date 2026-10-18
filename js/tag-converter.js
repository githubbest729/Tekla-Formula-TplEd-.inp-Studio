/* Tekla attribute dictionary, batch tag translator and raw MTO report sanitizer.
 * Attribute names are common Template Editor names; confirm them in your Tekla version's attribute browser. */
const DIM = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(k => [`Bar Dimension ${k}`, `DIM_${k}`, 'Rebar', [`dim ${k.toLowerCase()}`, `bbs dimension ${k.toLowerCase()}`]]);

/* [source term, Tekla attribute, category, aliases] */
const DICTIONARY = [
  ['Assembly Mark', 'ASSEMBLY_POS', 'Assembly', ['assembly position', 'assembly number', 'assembly pos', 'assy mark']],
  ['Assembly Prefix', 'ASSEMBLY_PREFIX', 'Assembly', []],
  ['Assembly Start Number', 'ASSEMBLY_START_NUMBER', 'Assembly', []],
  ['Part Mark', 'PART_POS', 'Part', ['part position', 'part number', 'piece mark']],
  ['Part Prefix', 'PART_PREFIX', 'Part', []],
  ['Part Start Number', 'PART_START_NUMBER', 'Part', []],
  ['Main Part Profile', 'MAINPART.PROFILE', 'Assembly', ['main member profile']],
  ['Main Part Material', 'MAINPART.MATERIAL', 'Assembly', ['main member material']],
  ['Main Part Name', 'MAINPART.NAME', 'Assembly', []],
  ['Main Part Length', 'MAINPART.LENGTH', 'Assembly', []],
  ['Profile', 'PROFILE', 'Profile', ['section', 'section size']],
  ['Web Thickness', 'PROFILE.WEB_THICKNESS', 'Profile', ['tw']],
  ['Flange Thickness', 'PROFILE.FLANGE_THICKNESS_1', 'Profile', ['tf', 'flange thickness 1']],
  ['Flange Thickness 2', 'PROFILE.FLANGE_THICKNESS_2', 'Profile', ['tf2']],
  ['Profile Height', 'PROFILE.HEIGHT', 'Profile', ['section depth']],
  ['Profile Width', 'PROFILE.WIDTH', 'Profile', ['section width']],
  ['Plate Thickness', 'PROFILE.PLATE_THICKNESS', 'Profile', []],
  ['Profile Type', 'PROFILE_TYPE', 'Profile', []],
  ['Name', 'NAME', 'General', ['part name']],
  ['Material', 'MATERIAL', 'General', ['steel grade', 'material grade']],
  ['Material Type', 'MATERIAL_TYPE', 'General', []],
  ['Finish', 'FINISH', 'General', ['coating', 'surface treatment']],
  ['Phase', 'PHASE', 'General', ['phase number']],
  ['Class', 'CLASS', 'General', []],
  ['Length', 'LENGTH', 'Dimensions', ['cut length', 'member length']],
  ['Width', 'WIDTH', 'Dimensions', []],
  ['Height', 'HEIGHT', 'Dimensions', []],
  ['Weight', 'WEIGHT', 'Weight and area', ['gross weight', 'mass']],
  ['Net Weight', 'WEIGHT_NET', 'Weight and area', ['weight net']],
  ['Area', 'AREA', 'Weight and area', ['surface area', 'paint area']],
  ['Net Area', 'AREA_NET', 'Weight and area', []],
  ['Volume', 'VOLUME', 'Weight and area', []],
  ['Quantity', 'QUANTITY', 'General', ['count', 'qty']],
  ['GUID', 'GUID', 'General', ['global id']],
  ['Title 1', 'TITLE1', 'General', []],
  ['Title 2', 'TITLE2', 'General', []],
  ['Title 3', 'TITLE3', 'General', []],
  ['Comment', 'COMMENT', 'General', ['remarks', 'notes']],
  ['User Field 1', 'USER_FIELD_1', 'General', ['udf 1']],
  ['User Field 2', 'USER_FIELD_2', 'General', ['udf 2']],
  ['User Field 3', 'USER_FIELD_3', 'General', ['udf 3']],
  ['User Field 4', 'USER_FIELD_4', 'General', ['udf 4']],
  ['Bolt Size', 'BOLT_SIZE', 'Bolts', ['bolt diameter']],
  ['Bolt Standard', 'BOLT_STANDARD', 'Bolts', ['bolt grade']],
  ['Bolt Length', 'BOLT_LENGTH', 'Bolts', []],
  ['Rebar Mark', 'REBAR_POS', 'Rebar', ['bar mark', 'reinforcement mark']],
  ['Rebar Size', 'REBAR.SIZE', 'Rebar', ['bar size', 'bar diameter']],
  ['Rebar Grade', 'GRADE', 'Rebar', ['bar grade']],
  ['Rebar Bending Radius', 'BENDING_RADIUS', 'Rebar', ['bend radius', 'inner radius']],
  ['Hook Start Length', 'HOOK_START_LENGTH', 'Rebar', ['start hook']],
  ['Hook End Length', 'HOOK_END_LENGTH', 'Rebar', ['end hook']],
  ...DIM,
  ['Web Gauge', 'PROFILE.WEB_THICKNESS', 'MBS', ['web thk']],
  ['Flange Gauge', 'PROFILE.FLANGE_THICKNESS_1', 'MBS', ['flange thk']],
  ['Web Depth', 'PROFILE.HEIGHT', 'MBS', ['web height']],
  ['Flange Width', 'PROFILE.WIDTH', 'MBS', []],
  ['Member Mark', 'ASSEMBLY_POS', 'MBS', ['frame mark']],
  ['Member Length', 'LENGTH', 'MBS', []],
  ['Revit Mark', 'ASSEMBLY_POS', 'Revit / IFC', []],
  ['Revit Type Name', 'PROFILE', 'Revit / IFC', ['revit family type']],
  ['Revit Cut Length', 'LENGTH', 'Revit / IFC', []],
  ['Revit Structural Material', 'MATERIAL', 'Revit / IFC', []],
  ['Revit Comments', 'COMMENT', 'Revit / IFC', []],
  ['Revit Phase Created', 'PHASE', 'Revit / IFC', []],
  ['IFC Name', 'NAME', 'Revit / IFC', []],
  ['IFC Tag', 'ASSEMBLY_POS', 'Revit / IFC', []],
  ['IFC Material', 'MATERIAL', 'Revit / IFC', []],
  ['IFC GlobalId', 'GUID', 'Revit / IFC', []],
  ['IFC Weight', 'WEIGHT', 'Revit / IFC', []]
];

const call = raw => `GetValue("${raw}")`;
const norm = s => String(s).replace(/^\[|\]$/g, '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

function entries(mappings = []) {
  const custom = mappings.map(m => ({ source: String(m.source).replace(/^\[|\]$/g, '').trim(), attribute: m.attribute, category: 'Custom', aliases: [] }));
  const builtin = DICTIONARY.map(([source, raw, category, aliases]) => ({ source, attribute: call(raw), category, aliases }));
  return [...custom, ...builtin];
}

/* All dictionary rows (custom mappings first) whose terms contain every word of the query. */
export function searchDictionary(query = '', mappings = []) {
  const words = norm(query).split(' ').filter(Boolean);
  return entries(mappings)
    .filter(e => { const hay = norm([e.source, e.attribute, e.category, ...e.aliases].join(' ')); return words.every(w => hay.includes(w)); })
    .map(({ source, attribute, category }) => ({ source, attribute, category }));
}

/* Replace every [Tag] with its Tekla attribute call. Raw names such as [ASSEMBLY_POS] are wrapped in GetValue. */
export function translateTags(text, mappings = []) {
  const lookup = new Map();
  entries(mappings).forEach(e => [e.source, ...e.aliases].forEach(k => { const n = norm(k); if (!lookup.has(n)) lookup.set(n, e.attribute); }));
  const matched = new Map(), unmatched = new Set();
  const output = String(text ?? '').replace(/\[([^\[\]\n]+)\]/g, (whole, inner) => {
    const hit = lookup.get(norm(inner)) || (/^[A-Z][A-Z0-9_.]+$/.test(inner.trim()) ? call(inner.trim()) : null);
    if (hit) { matched.set(whole, hit); return hit; }
    unmatched.add(whole);
    return whole;
  });
  return { output, matched: [...matched].map(([tag, attribute]) => ({ tag, attribute })), unmatched: [...unmatched] };
}

/* ---------- raw MTO / BBS report sanitizer ---------- */
const isNum = s => /^-?[\d,]*\.?\d+$/.test(String(s).trim().replace(/\s?(kg|t|mm|m|lb|lbs)$/i, ''));
function toNumber(s) {
  let v = String(s).trim().replace(/\s?(kg|t|mm|m|lb|lbs)$/i, '');
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(v)) v = v.replace(/,/g, '');
  else if (/^-?\d+,\d+$/.test(v)) v = v.replace(',', '.');
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/* Split one line on a delimiter, keeping quoted cells (and doubled quotes) intact. */
function splitLine(line, d) {
  const cells = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
    else if (ch === '"' && cur.trim() === '') { inQ = true; cur = ''; }
    else if (ch === d) { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function splitDelimited(lines) {
  for (const d of ['\t', '|', ';', ',']) {
    const split = lines.map(l => splitLine(l, d));
    const counts = split.map(r => r.length).sort((a, b) => a - b);
    const common = counts[Math.floor(counts.length / 2)];
    if (common >= 2 && counts.filter(c => c === common).length >= counts.length * 0.6) {
      return split.map(r => (d === '|' && r[0] === '' ? r.slice(1) : r)).map(r => (d === '|' && r[r.length - 1] === '' ? r.slice(0, -1) : r));
    }
  }
  return null;
}

/* Split aligned text at columns that are blank in every line for two or more characters in a row. */
function splitFixedWidth(lines) {
  const width = Math.max(...lines.map(l => l.length));
  const blank = Array.from({ length: width }, (_, i) => lines.every(l => i >= l.length || l[i] === ' '));
  const bounds = [];
  let start = 0, i = 0;
  while (i < width) {
    if (blank[i]) {
      let j = i;
      while (j < width && blank[j]) j++;
      if (j - i >= 2 && i > start) { bounds.push([start, i]); start = j; }
      i = j;
    } else i++;
  }
  if (start < width) bounds.push([start, width]);
  if (bounds.length >= 2) return lines.map(l => bounds.map(([a, b]) => l.slice(a, b).trim()));
  return lines.map(l => l.trim().split(/\s{2,}/));
}

export function parseReport(text) {
  const raw = String(text ?? '').replace(/\r/g, '').replace(/\u00a0/g, ' ').split('\n').map(l => l.replace(/\s+$/, ''));
  const lines = raw.filter(l => l.trim() && !/^[\s\-=_+|*#.~]{5,}$/.test(l) && !/^\s*page\s+\d+(\s+of\s+\d+)?\s*$/i.test(l));
  if (lines.length < 2) throw new Error('Paste at least a header line and one data row');
  let rows = splitDelimited(lines) || splitFixedWidth(lines);
  let cols = Math.max(...rows.map(r => r.length));
  if (cols < 2) { rows = lines.map(l => l.trim().split(/\s+/)); cols = Math.max(...rows.map(r => r.length)); }
  if (cols < 2) throw new Error('Could not detect columns in this text');
  rows = rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? ''));

  const first = rows[0];
  const hasHeader = first.filter(c => c && !isNum(c)).length >= Math.ceil(cols / 2) && rows.slice(1).some(r => r.some(c => isNum(c)));
  const headers = hasHeader ? first.map((c, i) => c || `Col ${i + 1}`) : first.map((_, i) => `Col ${i + 1}`);
  let data = hasHeader ? rows.slice(1) : rows;

  let skipped = 0;
  const headKey = headers.join('\u0001').toLowerCase();
  data = data.filter(r => {
    const total = /^(total|sub-?total|grand total|sum)\b/i.test(r.find(c => c) || '');
    const repeatedHeader = r.join('\u0001').toLowerCase() === headKey;
    const sparse = r.filter(Boolean).length < 2;
    if (total || repeatedHeader || sparse) { skipped++; return false; }
    return true;
  });

  const seen = new Set();
  let duplicatesRemoved = 0;
  data = data.filter(r => { const k = r.join('\u0001').toLowerCase(); if (seen.has(k)) { duplicatesRemoved++; return false; } seen.add(k); return true; });

  const idx = re => headers.findIndex(h => re.test(h));
  const W = /(weight|wt|mass|tonn|kg)/i;
  const totalCol = headers.findIndex(h => W.test(h) && /total/i.test(h));
  const unitCol = headers.findIndex(h => W.test(h) && /(unit|each|single|per)/i.test(h));
  const qtyCol = idx(/^(qty|quantity|no\.?|nos?|count|pcs|number)$/i);
  const anyCol = idx(W);
  let totalWeight = 0, weightBasis = 'No weight column found';
  if (totalCol >= 0) { totalWeight = data.reduce((s, r) => s + toNumber(r[totalCol]), 0); weightBasis = `Sum of "${headers[totalCol]}"`; }
  else if (unitCol >= 0 && qtyCol >= 0) { totalWeight = data.reduce((s, r) => s + toNumber(r[unitCol]) * (toNumber(r[qtyCol]) || 1), 0); weightBasis = `"${headers[unitCol]}" x "${headers[qtyCol]}"`; }
  else if (anyCol >= 0) { totalWeight = data.reduce((s, r) => s + toNumber(r[anyCol]), 0); weightBasis = `Sum of "${headers[anyCol]}"`; }

  return { headers, rows: data, summary: { rowCount: data.length, duplicatesRemoved, skipped, totalWeight, weightBasis } };
}

export function toCSV(table) {
  const q = c => (/[",\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : String(c));
  return [table.headers, ...table.rows].map(r => r.map(q).join(',')).join('\n');
}

export function toMarkdown(table) {
  const esc = c => String(c).replace(/\|/g, '\\|');
  const all = [table.headers, ...table.rows].map(r => r.map(esc));
  const widths = table.headers.map((_, i) => Math.max(3, ...all.map(r => r[i].length)));
  const numeric = table.headers.map((_, i) => table.rows.length > 0 && table.rows.every(r => isNum(r[i])));
  const pad = (c, i) => (numeric[i] ? c.padStart(widths[i]) : c.padEnd(widths[i]));
  const line = r => '| ' + r.map(pad).join(' | ') + ' |';
  const rule = '| ' + widths.map((w, i) => (numeric[i] ? '-'.repeat(w - 1) + ':' : '-'.repeat(w))).join(' | ') + ' |';
  return [line(all[0]), rule, ...all.slice(1).map(line)].join('\n');
}
