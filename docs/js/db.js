// ─────────────────────────────────────────────────────────────────────────────
//  db.js  —  TutorBase local database
//  Uses IndexedDB via a thin promise wrapper.
//  Zero backend. All data lives on the device.
// ─────────────────────────────────────────────────────────────────────────────

const DB_NAME    = 'tutorbase';
const DB_VERSION = 1;

let _db = null;

// Opens (or creates) the database and sets up object stores
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;

      // Students store
      if (!db.objectStoreNames.contains('students')) {
        const s = db.createObjectStore('students', { keyPath: 'id' });
        s.createIndex('name',    'last',    { unique: false });
        s.createIndex('subject', 'subject', { unique: false });
      }

      // Sessions store
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('studentId', 'studentId', { unique: false });
        s.createIndex('date',      'date',      { unique: false });
      }

      // Payments store
      if (!db.objectStoreNames.contains('payments')) {
        const s = db.createObjectStore('payments', { keyPath: 'id' });
        s.createIndex('studentId', 'studentId', { unique: false });
        s.createIndex('date',      'date',      { unique: false });
      }

      // Settings store (single-record key/value)
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

// Generic helpers
function tx(store, mode = 'readonly') {
  return _db.transaction(store, mode).objectStore(store);
}
function all(store) {
  return openDB().then(() => new Promise((res, rej) => {
    const req = tx(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  }));
}
function get(store, id) {
  return openDB().then(() => new Promise((res, rej) => {
    const req = tx(store).get(id);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  }));
}
function put(store, record) {
  return openDB().then(() => new Promise((res, rej) => {
    const req = tx(store, 'readwrite').put(record);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  }));
}
function remove(store, id) {
  return openDB().then(() => new Promise((res, rej) => {
    const req = tx(store, 'readwrite').delete(id);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  }));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─────────────────────────────────────────────────────────────────────────────
//  STUDENTS
// ─────────────────────────────────────────────────────────────────────────────
const Students = {
  getAll: () => all('students'),

  get: id => get('students', id),

  save: data => {
    const record = { ...data, id: data.id || uid(), updatedAt: Date.now() };
    if (!record.createdAt) record.createdAt = Date.now();
    return put('students', record).then(() => record);
  },

  delete: async id => {
    // Cascade delete sessions and payments for this student
    const [sessions, payments] = await Promise.all([
      Sessions.forStudent(id),
      Payments.forStudent(id)
    ]);
    await Promise.all([
      ...sessions.map(s => remove('sessions', s.id)),
      ...payments.map(p => remove('payments', p.id)),
      remove('students', id)
    ]);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  SESSIONS
// ─────────────────────────────────────────────────────────────────────────────
const Sessions = {
  getAll: () => all('sessions'),

  get: id => get('sessions', id),

  forStudent: studentId =>
    all('sessions').then(list => list.filter(s => s.studentId === studentId)),

  save: data => {
    const record = { ...data, id: data.id || uid(), updatedAt: Date.now() };
    if (!record.createdAt) record.createdAt = Date.now();
    return put('sessions', record).then(() => record);
  },

  delete: id => remove('sessions', id)
};

// ─────────────────────────────────────────────────────────────────────────────
//  PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
const Payments = {
  getAll: () => all('payments'),

  forStudent: studentId =>
    all('payments').then(list => list.filter(p => p.studentId === studentId)),

  save: data => {
    const record = { ...data, id: data.id || uid(), updatedAt: Date.now() };
    if (!record.createdAt) record.createdAt = Date.now();
    return put('payments', record).then(() => record);
  },

  delete: id => remove('payments', id),

  // Sum of all paid amounts for a student
  totalPaid: studentId =>
    Payments.forStudent(studentId).then(list =>
      list.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount || 0), 0)
    )
};

// ─────────────────────────────────────────────────────────────────────────────
//  SETTINGS  (tutor profile, preferences)
// ─────────────────────────────────────────────────────────────────────────────
const Settings = {
  get: key => get('settings', key).then(r => r?.value),
  set: (key, value) => put('settings', { key, value })
};

// ─────────────────────────────────────────────────────────────────────────────
//  EXPORT / IMPORT  (JSON backup — replaces cloud sync)
// ─────────────────────────────────────────────────────────────────────────────
const Backup = {
  export: async () => {
    const [students, sessions, payments] = await Promise.all([
      Students.getAll(), Sessions.getAll(), Payments.getAll()
    ]);
    const blob = new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), students, sessions, payments }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `tutorbase-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  import: file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.students) throw new Error('Invalid backup file');
        await Promise.all([
          ...data.students.map(s => put('students', s)),
          ...(data.sessions || []).map(s => put('sessions', s)),
          ...(data.payments || []).map(p => put('payments', p))
        ]);
        resolve(data);
      } catch(err) { reject(err); }
    };
    reader.readAsText(file);
  })
};

// ─────────────────────────────────────────────────────────────────────────────
//  SEED DEMO DATA on first launch
// ─────────────────────────────────────────────────────────────────────────────
async function seedIfEmpty() {
  const existing = await Students.getAll();
  if (existing.length > 0) return;

  const s1 = await Students.save({
    first: 'Emma', last: 'Chen', subject: 'Math', grade: '9th–12th',
    rate: 55, parent: 'Linda Chen', email: 'linda@example.com',
    phone: '(555) 111-2222',
    notes: 'Struggles with quadratics. Visual learner. Prefers evenings.'
  });
  const s2 = await Students.save({
    first: 'Marcus', last: 'Reyes', subject: 'SAT Prep', grade: '9th–12th',
    rate: 75, parent: 'David Reyes', email: 'david@example.com',
    phone: '(555) 333-4444',
    notes: 'Target score: 1400. Strong reading, needs math work.'
  });
  const s3 = await Students.save({
    first: 'Sofia', last: 'Patel', subject: 'English', grade: '6th–8th',
    rate: 45, parent: 'Priya Patel', email: 'priya@example.com',
    phone: '(555) 555-6666',
    notes: 'Essay writing focus. Very motivated.'
  });

  const today = new Date().toISOString().slice(0,10);
  const d = (offset) => {
    const dt = new Date(); dt.setDate(dt.getDate() + offset);
    return dt.toISOString().slice(0,10);
  };

  await Sessions.save({ studentId: s1.id, date: d(2),  duration: 60, subject: 'Math',     notes: 'Quadratics review', status: 'scheduled' });
  await Sessions.save({ studentId: s2.id, date: d(4),  duration: 90, subject: 'SAT Prep', notes: 'Practice test',     status: 'scheduled' });
  await Sessions.save({ studentId: s3.id, date: d(-3), duration: 60, subject: 'English',  notes: 'Essay draft',       status: 'completed' });

  await Payments.save({ studentId: s1.id, amount: 110, date: today, status: 'paid',    method: 'Venmo',    note: '2 sessions' });
  await Payments.save({ studentId: s2.id, amount: 150, date: today, status: 'pending', method: 'Cash',     note: '2 sessions' });
  await Payments.save({ studentId: s3.id, amount: 90,  date: today, status: 'overdue', method: 'Zelle',    note: '2 sessions' });
}
