// Minimal promise wrapper over IndexedDB. IndexedDB is the single source of truth.
// Schema changes MUST be added as additive `if (old < N)` migrations below.
// Stores are never deleted or recreated on upgrade.
export const DB_NAME = 'study-time-tracker';
export const DB_VERSION = 1;
export const STORES = ['sessions', 'days', 'cycles', 'examModes', 'meta'];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available in this browser.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      const old = e.oldVersion;
      if (old < 1) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('status', 'status');
        s.createIndex('dayKey', 'dayKey');
        s.createIndex('start', 'startDateTime');
        db.createObjectStore('days', { keyPath: 'dayKey' });
        db.createObjectStore('cycles', { keyPath: 'id' });
        db.createObjectStore('examModes', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      // if (old < 2) { migrate in place here — never clear or delete existing stores }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('The database is open in another tab that needs to be closed.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export const r = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// Runs fn(tx) inside one transaction. Resolves only after the transaction commits.
// fn may only await IDB requests (so the transaction stays alive).
export async function transact(stores, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    let failed = false;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => { if (!failed) reject(tx.error); };
    tx.onabort = () => { if (!failed) reject(tx.error || new Error('Transaction aborted')); };
    let p;
    try { p = Promise.resolve(fn(tx)); } catch (e) { p = Promise.reject(e); }
    p.then((v) => { result = v; }).catch((err) => {
      failed = true;
      try { tx.abort(); } catch { /* already finished */ }
      reject(err);
    });
  });
}

export async function getOne(store, key) {
  return transact([store], 'readonly', (tx) => r(tx.objectStore(store).get(key)));
}

export async function loadAll() {
  const [sessions, days, cycles, examModes, meta] = await transact(STORES, 'readonly', (tx) =>
    Promise.all(STORES.map((s) => r(tx.objectStore(s).getAll()))));
  const settings = meta.find((m) => m.key === 'settings') || null;
  const app = meta.find((m) => m.key === 'app') || null;
  return { sessions, days, cycles, examModes, settings, app };
}

export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
