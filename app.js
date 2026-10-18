/* Tekla Studio PWA - main application controller (Batch 1).
 * Module contracts consumed here (implemented in Batches 2-3):
 *  js/editor.js        createEditor({host, sandbox, onChange, onCursor}) -> {getValue,setValue,setMode,getMode,prettify,collapse,
 *                      setDiagnostics,goTo,insertAtCursor,focus}. setValue() never fires onChange. prettify()/collapse() return the new text.
 *  js/validator.js     validate(code, mode) -> [{line,column,severity,message,fixSuggestion}]
 *  js/templates.js     TEMPLATES [{id,category,title,mode,description,code}], CATEGORIES [string]
 *  js/tag-converter.js translateTags(text, mappings) -> {output,matched,unmatched}; searchDictionary(query, mappings) -> [{source,attribute,category}]
 *                      parseReport(text) -> {headers,rows,summary:{rowCount,duplicatesRemoved,totalWeight}}; toCSV(table); toMarkdown(table)
 *  js/db.js            default TeklaDB: init, loadWorkspace, saveWorkspace, listFormulas, putFormula, deleteFormula,
 *                      listMappings, putMapping, deleteMapping, exportAll, importAll(obj) -> {formulas,mappings}
 */
import { createEditor } from './js/editor.js';
import { validate } from './js/validator.js';
import { TEMPLATES, CATEGORIES } from './js/templates.js';
import { translateTags, searchDictionary, parseReport, toCSV, toMarkdown } from './js/tag-converter.js';
import db from './js/db.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const MODE_LABELS = { formula: 'Custom Component Formula', tpled: 'Template Editor value field', inp: 'objects.inp UDA definitions' };

const state = {
  view: 'editor', mode: 'formula', tab: 'diagnostics', theme: 'dark',
  code: { formula: '', tpled: '', inp: '' }, editingId: null,
  diags: [], formulas: [], mappings: [], table: null
};
let editor;
let dbReady = false;

function toast(message, type = 'info', action) {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const span = document.createElement('span');
  span.textContent = message;
  el.append(span);
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn primary';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.onClick(); el.remove(); });
    el.append(b);
  }
  $('#toast-region').append(el);
  if (!action) setTimeout(() => el.remove(), 3500);
}

async function copyText(text, label = 'Copied to clipboard') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement('textarea');
    t.value = text; t.style.cssText = 'position:fixed;opacity:0';
    document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
  }
  toast(label, 'ok');
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const setSaveStatus = (text, cls = '') => { const p = $('#save-status'); p.textContent = text; p.className = 'pill ' + cls; };

/* ---------- theme, views, drawer ---------- */
function setTheme(t) {
  state.theme = t === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = state.theme;
  $('meta[name="theme-color"]').content = state.theme === 'dark' ? '#0f172a' : '#f1f5f9';
  $('#theme-select').value = state.theme;
}

function openDrawer(open) {
  document.body.classList.toggle('drawer-open', open);
  $('#menu-btn').setAttribute('aria-expanded', String(open));
  $('#scrim').hidden = !open;
}

function showView(v) {
  state.view = v;
  $$('[data-view-panel]').forEach(p => { p.hidden = p.dataset.viewPanel !== v; });
  $$('[data-view]').forEach(b => b.setAttribute('aria-current', b.dataset.view === v ? 'page' : 'false'));
  openDrawer(false);
  if (v === 'library') loadFormulas();
  if (v === 'editor') editor.focus();
  persist();
}

/* ---------- editor modes, validation, persistence ---------- */
function setMode(m) {
  state.code[state.mode] = editor.getValue();
  state.mode = m;
  state.editingId = null;
  editor.setMode(m);
  editor.setValue(state.code[m]);
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('#mode-label').textContent = MODE_LABELS[m];
  runValidation();
  persist();
}

function setSideTab(tab) {
  state.tab = tab;
  $$('[data-side-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sideTab === tab)));
  $('#diag-panel').hidden = tab !== 'diagnostics';
  $('#sandbox-panel').hidden = tab !== 'sandbox';
  persist();
}

function runValidation() {
  const code = editor.getValue();
  try { state.diags = code.trim() ? (validate(code, state.mode) || []) : []; }
  catch (e) { state.diags = [{ line: 1, column: 1, severity: 'error', message: 'Validator failed: ' + e.message, fixSuggestion: '' }]; }
  editor.setDiagnostics(state.diags);
  renderDiagnostics(code.trim().length > 0);
}

function renderDiagnostics(hasCode) {
  $('#diag-count').textContent = state.diags.length;
  const panel = $('#diag-panel');
  if (!hasCode) { panel.innerHTML = '<p class="empty">Type a formula or load a snippet from the Snippet library. Problems appear here as you type.</p>'; return; }
  if (!state.diags.length) { panel.innerHTML = '<p class="empty">No issues found.</p>'; return; }
  panel.innerHTML = '<ul class="diag-list">' + state.diags.map(d =>
    `<li><button class="diag ${esc(d.severity)}" data-line="${d.line}" data-col="${d.column}">
      <span class="sev">${esc(d.severity)}</span><span class="loc">Line ${d.line}, column ${d.column}</span>
      <span>${esc(d.message)}</span>${d.fixSuggestion ? `<span class="fix">Fix: ${esc(d.fixSuggestion)}</span>` : ''}</button></li>`).join('') + '</ul>';
}

const validateSoon = debounce(runValidation, 250);

const persist = debounce(async () => {
  if (!editor) return;
  state.code[state.mode] = editor.getValue();
  if (!dbReady) { setSaveStatus('Not saved', 'warn'); return; }
  try {
    await db.saveWorkspace({ code: state.code, mode: state.mode, view: state.view, tab: state.tab, theme: state.theme });
    setSaveStatus('Saved');
  } catch { setSaveStatus('Not saved', 'warn'); }
}, 600);

function onEditorChange(value) {
  state.code[state.mode] = value;
  setSaveStatus('Saving...');
  validateSoon();
  persist();
}

/* ---------- toolbar actions ---------- */
function doPrettify() { editor.prettify(); state.code[state.mode] = editor.getValue(); runValidation(); persist(); toast('Formatted into indented blocks', 'ok'); }
function doCollapse() { const out = editor.collapse(); copyText(out ?? editor.getValue(), 'Collapsed to one line and copied'); state.code[state.mode] = editor.getValue(); runValidation(); persist(); }

function openSaveDialog() {
  if (!editor.getValue().trim()) { toast('Write something before saving.', 'error'); return; }
  const existing = state.formulas.find(f => f.id === state.editingId);
  $('#sv-name').value = existing?.name || '';
  $('#sv-cat').value = existing?.category || '';
  $('#sv-tags').value = existing ? (existing.tags || []).join(', ') : '';
  $('#save-dialog').showModal();
  $('#sv-name').focus();
}

async function saveFormula() {
  if (!dbReady) { toast('Storage is unavailable in this browser session.', 'error'); return; }
  const rec = {
    id: state.editingId || uid(),
    name: $('#sv-name').value.trim() || 'Untitled formula',
    category: $('#sv-cat').value.trim(),
    tags: $('#sv-tags').value.split(',').map(t => t.trim()).filter(Boolean),
    mode: state.mode, code: editor.getValue(), modified: Date.now()
  };
  try { await db.putFormula(rec); state.editingId = rec.id; toast('Saved "' + rec.name + '"', 'ok'); await loadFormulas(); }
  catch (e) { toast('Could not save: ' + e.message, 'error'); }
}

/* ---------- snippet library ---------- */
function renderTemplates() {
  const q = $('#tpl-search').value.trim().toLowerCase();
  const cat = $('#tpl-category').value;
  const list = TEMPLATES.filter(t => (!cat || t.category === cat) && (!q || (t.title + ' ' + t.description + ' ' + t.code).toLowerCase().includes(q)));
  $('#template-list').innerHTML = list.length ? list.map(t => `
    <article class="card"><h3>${esc(t.title)}</h3>
      <div class="meta"><span class="badge">${esc(t.mode)}</span><span>${esc(t.category)}</span></div>
      <p>${esc(t.description)}</p>
      <details><summary>Preview</summary><pre>${esc(t.code)}</pre></details>
      <div class="row"><button class="btn primary" data-tpl="load" data-id="${esc(t.id)}">Open in editor</button>
      <button class="btn" data-tpl="insert" data-id="${esc(t.id)}">Insert at cursor</button>
      <button class="btn" data-tpl="copy" data-id="${esc(t.id)}">Copy</button></div></article>`).join('')
    : '<p class="empty">No snippets match. Clear the search or choose another category.</p>';
}

function templateAction(action, id) {
  const t = TEMPLATES.find(x => x.id === id);
  if (!t) return;
  if (action === 'copy') { copyText(t.code); return; }
  showView('editor');
  if (action === 'load') {
    if (t.mode !== state.mode) setMode(t.mode);
    editor.setValue(t.code);
    state.code[state.mode] = t.code;
  } else {
    if (t.mode !== state.mode) setMode(t.mode);
    editor.insertAtCursor(t.code);
    state.code[state.mode] = editor.getValue();
  }
  runValidation(); persist();
  toast('Snippet added: ' + t.title, 'ok');
}

/* ---------- saved formulas ---------- */
async function loadFormulas() {
  if (!dbReady) { state.formulas = []; } else { try { state.formulas = await db.listFormulas(); } catch { state.formulas = []; } }
  renderLibrary();
}

function renderLibrary() {
  const q = $('#lib-search').value.trim().toLowerCase();
  const list = state.formulas.filter(f => !q || (f.name + ' ' + (f.category || '') + ' ' + (f.tags || []).join(' ')).toLowerCase().includes(q))
    .sort((a, b) => b.modified - a.modified);
  $('#library-list').innerHTML = list.length ? list.map(f => `
    <article class="card"><h3>${esc(f.name)}</h3>
      <div class="meta"><span class="badge">${esc(f.mode)}</span>${f.category ? `<span>${esc(f.category)}</span>` : ''}<span>${new Date(f.modified).toLocaleString()}</span></div>
      ${(f.tags || []).length ? `<p>${(f.tags).map(esc).join(', ')}</p>` : ''}
      <pre>${esc(f.code.slice(0, 400))}</pre>
      <div class="row"><button class="btn primary" data-lib="open" data-id="${esc(f.id)}">Open</button>
      <button class="btn danger" data-lib="delete" data-id="${esc(f.id)}">Delete</button></div></article>`).join('')
    : '<p class="empty">Nothing saved yet. Write a formula in the Editor and choose Save formula, or import a workspace backup.</p>';
}

async function libraryAction(action, id) {
  const f = state.formulas.find(x => x.id === id);
  if (!f) return;
  if (action === 'open') {
    showView('editor');
    if (f.mode !== state.mode) setMode(f.mode);
    editor.setValue(f.code); state.code[state.mode] = f.code; state.editingId = f.id;
    runValidation(); persist();
  } else if (confirm('Delete "' + f.name + '"? This cannot be undone.')) {
    await db.deleteFormula(id);
    if (state.editingId === id) state.editingId = null;
    toast('Deleted', 'ok'); loadFormulas();
  }
}

async function exportWorkspace() {
  try {
    const data = await db.exportAll();
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    download(`tekla-studio-backup-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('Workspace exported', 'ok');
  } catch (e) { toast('Export failed: ' + e.message, 'error'); }
}

async function importWorkspace(file) {
  if (!file) return;
  try {
    const obj = JSON.parse(await file.text());
    const r = await db.importAll(obj);
    await Promise.all([loadFormulas(), loadMappings()]);
    toast(`Imported ${r.formulas} formulas and ${r.mappings} mappings`, 'ok');
  } catch (e) { toast('Import failed: ' + e.message, 'error'); }
  $('#ws-file').value = '';
}

/* ---------- converter ---------- */
async function loadMappings() {
  if (dbReady) { try { state.mappings = await db.listMappings(); } catch { state.mappings = []; } }
  $('#mapping-list').innerHTML = state.mappings.length ? state.mappings.map(m =>
    `<li><span>${esc(m.source)} &rarr; <code>${esc(m.attribute)}</code></span><button class="btn danger" data-map-del="${esc(m.id)}">Remove</button></li>`).join('')
    : '<li class="hint">No custom mappings yet.</li>';
  renderDictionary();
}

function renderDictionary() {
  const res = searchDictionary($('#dict-search').value.trim(), state.mappings).slice(0, 60);
  $('#dict-results').innerHTML = res.length ? res.map(r =>
    `<li><span>${esc(r.source)} <small>(${esc(r.category)})</small><br><code>${esc(r.attribute)}</code></span><button class="btn" data-copy="${esc(r.attribute)}">Copy</button></li>`).join('')
    : '<li class="hint">No attributes match that search.</li>';
}

function runTags() {
  const r = translateTags($('#tag-input').value, state.mappings);
  $('#tag-output').value = r.output;
  $('#tag-summary').textContent = `${r.matched.length} translated` + (r.unmatched.length ? `, ${r.unmatched.length} not found: ${r.unmatched.slice(0, 5).join(', ')}` : '');
}

async function addMapping() {
  const source = $('#map-source').value.trim(), attribute = $('#map-attr').value.trim();
  if (!source || !attribute) { toast('Enter both a source tag and a Tekla attribute.', 'error'); return; }
  if (!dbReady) { toast('Storage is unavailable in this browser session.', 'error'); return; }
  await db.putMapping({ id: uid(), source, attribute });
  $('#map-source').value = ''; $('#map-attr').value = '';
  toast('Mapping added', 'ok'); loadMappings();
}

function runMto() {
  const raw = $('#mto-input').value;
  if (!raw.trim()) { toast('Paste report text first.', 'error'); return; }
  try { state.table = parseReport(raw); } catch (e) { toast('Could not parse report: ' + e.message, 'error'); return; }
  const t = state.table, s = t.summary;
  $('#mto-summary').textContent = `${s.rowCount} rows, ${s.duplicatesRemoved} duplicates removed, total weight ${Number(s.totalWeight).toFixed(2)}`;
  $('#mto-table').innerHTML = `<table><thead><tr>${t.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    t.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function withTable(fn) { if (!state.table) { toast('Clean a report first.', 'error'); return; } fn(state.table); }

/* ---------- layout helpers ---------- */
function initDivider() {
  const split = $('#split'), div = $('#divider');
  const setW = pct => split.style.setProperty('--code-w', Math.min(80, Math.max(25, pct)) + '%');
  div.addEventListener('pointerdown', e => {
    div.setPointerCapture(e.pointerId);
    const move = ev => { const r = split.getBoundingClientRect(); setW((ev.clientX - r.left) / r.width * 100); };
    const up = () => { div.removeEventListener('pointermove', move); div.removeEventListener('pointerup', up); };
    div.addEventListener('pointermove', move); div.addEventListener('pointerup', up);
  });
  div.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cur = parseFloat(getComputedStyle(split).getPropertyValue('--code-w')) || 58;
    setW(cur + (e.key === 'ArrowRight' ? 3 : -3)); e.preventDefault();
  });
}

function updateNet() {
  const p = $('#net-status'), on = navigator.onLine;
  p.textContent = on ? 'Online' : 'Offline'; p.className = 'pill ' + (on ? 'ok' : 'warn');
}

/* ---------- wiring ---------- */
function bind() {
  $$('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  $$('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('[data-side-tab]').forEach(b => b.addEventListener('click', () => setSideTab(b.dataset.sideTab)));
  $$('[data-conv-tab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-conv-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    $('#conv-tags').hidden = b.dataset.convTab !== 'tags';
    $('#conv-mto').hidden = b.dataset.convTab !== 'mto';
  }));
  $('#menu-btn').addEventListener('click', () => openDrawer(!document.body.classList.contains('drawer-open')));
  $('#scrim').addEventListener('click', () => openDrawer(false));
  $('#theme-btn').addEventListener('click', () => { setTheme(state.theme === 'dark' ? 'light' : 'dark'); persist(); });
  $('#theme-select').addEventListener('change', e => { setTheme(e.target.value); persist(); });
  $('#btn-prettify').addEventListener('click', doPrettify);
  $('#btn-collapse').addEventListener('click', doCollapse);
  $('#btn-copy').addEventListener('click', () => copyText(editor.getValue()));
  $('#btn-save').addEventListener('click', openSaveDialog);
  $('#save-dialog').addEventListener('close', e => { if (e.target.returnValue === 'save') saveFormula(); e.target.returnValue = ''; });
  $('#diag-panel').addEventListener('click', e => { const b = e.target.closest('.diag'); if (b) editor.goTo(+b.dataset.line, +b.dataset.col); });
  $('#tpl-search').addEventListener('input', debounce(renderTemplates, 120));
  $('#tpl-category').addEventListener('change', renderTemplates);
  $('#template-list').addEventListener('click', e => { const b = e.target.closest('[data-tpl]'); if (b) templateAction(b.dataset.tpl, b.dataset.id); });
  $('#lib-search').addEventListener('input', debounce(renderLibrary, 120));
  $('#library-list').addEventListener('click', e => { const b = e.target.closest('[data-lib]'); if (b) libraryAction(b.dataset.lib, b.dataset.id); });
  $('#ws-export').addEventListener('click', exportWorkspace);
  $('#ws-import').addEventListener('click', () => $('#ws-file').click());
  $('#ws-file').addEventListener('change', e => importWorkspace(e.target.files[0]));
  $('#ws-reset').addEventListener('click', () => {
    if (!confirm('Clear the code in all three editor modes? Saved formulas are not affected.')) return;
    state.code = { formula: '', tpled: '', inp: '' }; state.editingId = null;
    editor.setValue(''); runValidation(); persist(); toast('Editor session cleared', 'ok');
  });
  $('#tag-run').addEventListener('click', runTags);
  $('#tag-copy').addEventListener('click', () => copyText($('#tag-output').value));
  $('#dict-search').addEventListener('input', debounce(renderDictionary, 120));
  $('#dict-results').addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy); });
  $('#map-add').addEventListener('click', addMapping);
  $('#mapping-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-map-del]');
    if (b) { await db.deleteMapping(b.dataset.mapDel); loadMappings(); }
  });
  $('#mto-parse').addEventListener('click', runMto);
  $('#mto-csv').addEventListener('click', () => withTable(t => download('tekla-mto.csv', toCSV(t), 'text/csv')));
  $('#mto-csv-copy').addEventListener('click', () => withTable(t => copyText(toCSV(t), 'CSV copied')));
  $('#mto-md').addEventListener('click', () => withTable(t => copyText(toMarkdown(t), 'Markdown table copied')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') openDrawer(false);
    if (state.view !== 'editor') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); openSaveDialog(); }
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'f') { e.preventDefault(); doPrettify(); }
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'c') { e.preventDefault(); doCollapse(); }
  });
  window.addEventListener('online', () => { updateNet(); toast('Back online', 'ok'); });
  window.addEventListener('offline', () => { updateNet(); toast('You are offline. Everything still works.'); });
  window.addEventListener('sw-update-available', e => toast('A new version is ready.', 'info', {
    label: 'Reload', onClick: () => { const w = e.detail && e.detail.waiting; if (w) w.postMessage({ type: 'SKIP_WAITING' }); else location.reload(); }
  }));
  window.addEventListener('beforeunload', () => { state.code[state.mode] = editor.getValue(); });
}

async function init() {
  bind();
  updateNet();
  $('#tpl-category').insertAdjacentHTML('beforeend', CATEGORIES.map(c => `<option>${esc(c)}</option>`).join(''));
  editor = createEditor({ host: $('#editor-host'), sandbox: $('#sandbox-panel'), onChange: onEditorChange, onCursor: p => { $('#cursor-pos').textContent = `Line ${p.line}, column ${p.column}`; } });
  initDivider();
  let ws = null;
  try { await db.init(); dbReady = true; ws = await db.loadWorkspace(); }
  catch { toast('Local storage is unavailable, so work will not be saved.', 'error'); setSaveStatus('Not saved', 'warn'); }
  if (ws) {
    state.code = Object.assign(state.code, ws.code || {});
    state.mode = MODE_LABELS[ws.mode] ? ws.mode : 'formula';
    state.tab = ws.tab === 'sandbox' ? 'sandbox' : 'diagnostics';
    state.view = ['editor', 'templates', 'converter', 'library', 'settings'].includes(ws.view) ? ws.view : 'editor';
    setTheme(ws.theme || 'dark');
  } else setTheme('dark');
  editor.setMode(state.mode);
  editor.setValue(state.code[state.mode]);
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  $('#mode-label').textContent = MODE_LABELS[state.mode];
  setSideTab(state.tab);
  runValidation();
  renderTemplates();
  await Promise.all([loadFormulas(), loadMappings()]);
  showView(state.view);
}

init();
