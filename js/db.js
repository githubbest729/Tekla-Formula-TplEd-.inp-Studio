/* TeklaStudioDB v1: offline IndexedDB storage for formulas, mappings and the editor session. */
const DB_NAME = 'TeklaStudioDB';
const DB_VERSION = 1;
const STORES = { formulas: 'saved_formulas', mappings: 'custom_mappings', workspace: 'workspace_state' };
const MODES = ['formula', 'tpled', 'inp'];
let handle = null;

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
const str = (v, d = '') => (typeof v === 'string' ? v : d);

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available in this browser')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORES.formulas)) {
        const s = d.createObjectStore(STORES.formulas, { keyPath: 'id' });
        s.createIndex('modified', 'modified');
        s.createIndex('category', 'category');
        s.createIndex('mode', 'mode');
      }
      if (!d.objectStoreNames.contains(STORES.mappings)) {
        const s = d.createObjectStore(STORES.mappings, { keyPath: 'id' });
        s.createIndex('source', 'source');
      }
      if (!d.objectStoreNames.contains(STORES.workspace)) d.createObjectStore(STORES.workspace, { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => { d.close(); handle = null; };
      resolve(d);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked by another open tab. Close other Tekla Studio tabs and reload.'));
  });
}

function init() {
  if (!handle) handle = open().catch(e => { handle = null; throw e; });
  return handle;
}

/* Run fn inside one transaction. fn may return an IDBRequest (its result is returned) or a plain value. */
function run(names, mode, fn) {
  return init().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(names, mode);
    const stores = names.map(n => t.objectStore(n));
    let result;
    const out = fn(...stores);
    if (out && typeof out === 'object' && 'onsuccess' in out) out.onsuccess = () => { result = out.result; };
    else result = out;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  }));
}

function cleanFormula(f) {
  if (!f || typeof f !== 'object' || typeof f.code !== 'string') return null;
  return {
    id: str(f.id) || newId(),
    name: str(f.name).trim() || 'Untitled formula',
    category: str(f.category).trim(),
    tags: Array.isArray(f.tags) ? f.tags.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()) : [],
    mode: MODES.includes(f.mode) ? f.mode : 'formula',
    code: f.code,
    modified: Number.isFinite(f.modified) ? f.modified : Date.now()
  };
}

function cleanMapping(m) {
  if (!m || typeof m !== 'object') return null;
  const source = str(m.source).trim(), attribute = str(m.attribute).trim();
  return source && attribute ? { id: str(m.id) || newId(), source, attribute } : null;
}

const TeklaDB = {
  init,

  async loadWorkspace() {
    const row = await run([STORES.workspace], 'readonly', s => s.get('current'));
    if (!row) return null;
    const { key, updated, ...state } = row;
    return state;
  },
  saveWorkspace(state) {
    return run([STORES.workspace], 'readwrite', s => s.put({ ...state, key: 'current', updated: Date.now() }));
  },

  listFormulas() { return run([STORES.formulas], 'readonly', s => s.getAll()); },
  putFormula(f) {
    const rec = cleanFormula(f);
    if (!rec) return Promise.reject(new Error('Formula needs a code string'));
    return run([STORES.formulas], 'readwrite', s => s.put(rec));
  },
  deleteFormula(id) { return run([STORES.formulas], 'readwrite', s => s.delete(id)); },

  listMappings() { return run([STORES.mappings], 'readonly', s => s.getAll()); },
  putMapping(m) {
    const rec = cleanMapping(m);
    if (!rec) return Promise.reject(new Error('Mapping needs a source tag and an attribute'));
    return run([STORES.mappings], 'readwrite', s => s.put(rec));
  },
  deleteMapping(id) { return run([STORES.mappings], 'readwrite', s => s.delete(id)); },

  /* Backup object for sharing company standards. The live editor session is included for reference only. */
  async exportAll() {
    const [formulas, mappings, workspace] = await Promise.all([this.listFormulas(), this.listMappings(), this.loadWorkspace()]);
    return { app: 'TeklaStudioDB', schema: DB_VERSION, exportedAt: new Date().toISOString(), saved_formulas: formulas, custom_mappings: mappings, workspace_state: workspace };
  },

  /* Merge a backup into the database by id. The current editor session is left untouched. */
  async importAll(obj) {
    if (!obj || typeof obj !== 'object' || obj.app !== 'TeklaStudioDB') throw new Error('This file is not a Tekla Studio backup');
    if (Number(obj.schema) > DB_VERSION) throw new Error('This backup was made by a newer version of Tekla Studio');
    const formulas = (Array.isArray(obj.saved_formulas) ? obj.saved_formulas : []).map(cleanFormula).filter(Boolean);
    const mappings = (Array.isArray(obj.custom_mappings) ? obj.custom_mappings : []).map(cleanMapping).filter(Boolean);
    await run([STORES.formulas, STORES.mappings], 'readwrite', (fs, ms) => {
      formulas.forEach(f => fs.put(f));
      mappings.forEach(m => ms.put(m));
      return null;
    });
    return { formulas: formulas.length, mappings: mappings.length };
  }
};

export default TeklaDB;
