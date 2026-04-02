// ─────────────────────────────────────────────────────────────────────────────
//  app.js  —  TutorBase app logic
//  Navigation, state management, data operations
// ─────────────────────────────────────────────────────────────────────────────

const App = {
  currentPage: 'dashboard',
  currentStudentId: null,
  editingId: null,

  // ── INIT ────────────────────────────────────────
  async init() {
    await openDB();
    await seedIfEmpty();

    // Register service worker for offline/PWA support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // Wire up bottom nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => App.navigate(btn.dataset.page));
    });

    // Wire up FAB
    document.getElementById('fab').addEventListener('click', App.onFab);

    // Wire up modal close
    document.getElementById('modal-overlay').addEventListener('click', e => {
      if (e.target.id === 'modal-overlay') App.closeModal();
    });
    document.getElementById('modal-close').addEventListener('click', App.closeModal);
    document.getElementById('modal-save').addEventListener('click', App.saveForm);

    // Wire up detail panel close
    document.getElementById('detail-close').addEventListener('click', App.closeDetail);
    document.getElementById('detail-edit').addEventListener('click', () => App.openStudentForm(App.currentStudentId));
    document.getElementById('detail-delete').addEventListener('click', App.deleteCurrentStudent);

    // Wire up session form close
    document.getElementById('session-modal-overlay').addEventListener('click', e => {
      if (e.target.id === 'session-modal-overlay') App.closeSessionModal();
    });
    document.getElementById('session-modal-close').addEventListener('click', App.closeSessionModal);
    document.getElementById('session-modal-save').addEventListener('click', App.saveSession);

    // Wire up payment form
    document.getElementById('payment-modal-overlay').addEventListener('click', e => {
      if (e.target.id === 'payment-modal-overlay') App.closePaymentModal();
    });
    document.getElementById('payment-modal-close').addEventListener('click', App.closePaymentModal);
    document.getElementById('payment-modal-save').addEventListener('click', App.savePayment);

    // Wire up search
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', () => UI.renderStudentList());
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') searchInput.blur();
    });

    // Wire up backup
    document.getElementById('btn-export').addEventListener('click', Backup.export);
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        await Backup.import(file);
        UI.toast('Backup imported successfully');
        App.navigate('dashboard');
      } catch { UI.toast('Import failed — check the file', 'error'); }
      e.target.value = '';
    });

    App.navigate('dashboard');
  },

  // ── NAVIGATION ──────────────────────────────────
  navigate(page) {
    App.currentPage = page;
    App.closeDetail();

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    document.getElementById('page-' + page).classList.add('active');

    // FAB visibility — hide on settings
    document.getElementById('fab').style.display = page === 'settings' ? 'none' : 'flex';

    if (page === 'dashboard') UI.renderDashboard();
    if (page === 'students')  UI.renderStudentList();
    if (page === 'sessions')  UI.renderSessions();
    if (page === 'payments')  UI.renderPayments();
    if (page === 'settings')  UI.renderSettings();
  },

  // ── FAB (context-sensitive add button) ──────────
  onFab() {
    if (App.currentPage === 'students' || App.currentPage === 'dashboard') {
      App.openStudentForm(null);
    } else if (App.currentPage === 'sessions') {
      App.openSessionForm(null);
    } else if (App.currentPage === 'payments') {
      App.openPaymentForm(null);
    }
  },

  // ── STUDENT FORM ─────────────────────────────────
  openStudentForm(id) {
    App.editingId = id;
    UI.openModal(id ? 'Edit Student' : 'New Student');
    const form = document.getElementById('student-form');
    form.style.display = 'block';
    document.getElementById('session-form').style.display = 'none';
    document.getElementById('payment-form').style.display = 'none';

    if (id) {
      Students.get(id).then(s => {
        if (!s) return;
        document.getElementById('f-first').value   = s.first    || '';
        document.getElementById('f-last').value    = s.last     || '';
        document.getElementById('f-subject').value = s.subject  || '';
        document.getElementById('f-grade').value   = s.grade    || '';
        document.getElementById('f-rate').value    = s.rate     || '';
        document.getElementById('f-parent').value  = s.parent   || '';
        document.getElementById('f-email').value   = s.email    || '';
        document.getElementById('f-phone').value   = s.phone    || '';
        document.getElementById('f-notes').value   = s.notes    || '';
      });
    } else {
      ['f-first','f-last','f-subject','f-grade','f-rate','f-parent','f-email','f-phone','f-notes']
        .forEach(id => { document.getElementById(id).value = ''; });
    }
  },

  async saveForm() {
    const first = document.getElementById('f-first').value.trim();
    const last  = document.getElementById('f-last').value.trim();
    if (!first || !last) { UI.toast('Name is required', 'error'); return; }

    await Students.save({
      id:      App.editingId || undefined,
      first, last,
      subject: document.getElementById('f-subject').value,
      grade:   document.getElementById('f-grade').value,
      rate:    parseFloat(document.getElementById('f-rate').value) || 0,
      parent:  document.getElementById('f-parent').value.trim(),
      email:   document.getElementById('f-email').value.trim(),
      phone:   document.getElementById('f-phone').value.trim(),
      notes:   document.getElementById('f-notes').value.trim(),
    });

    App.closeModal();
    UI.toast(App.editingId ? 'Student updated' : 'Student added');
    App.editingId = null;

    if (App.currentPage === 'students')  UI.renderStudentList();
    if (App.currentPage === 'dashboard') UI.renderDashboard();
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
  },

  // ── STUDENT DETAIL ───────────────────────────────
  async openDetail(studentId) {
    // Blur search input in case it's focused (dismisses keyboard/resets zoom)
    document.getElementById('search-input').blur();

    App.currentStudentId = studentId;
    const [student, sessions, payments] = await Promise.all([
      Students.get(studentId),
      Sessions.forStudent(studentId),
      Payments.forStudent(studentId)
    ]);
    UI.renderDetail(student, sessions, payments);
    document.getElementById('detail-panel').classList.add('open');
  },

  closeDetail() {
    document.getElementById('detail-panel').classList.remove('open');
    App.currentStudentId = null;
  },

  async deleteCurrentStudent() {
    if (!App.currentStudentId) return;
    if (!confirm('Delete this student and all their sessions/payments?')) return;
    await Students.delete(App.currentStudentId);
    App.closeDetail();
    UI.toast('Student deleted');
    UI.renderStudentList();
    UI.renderDashboard();
  },

  // ── SESSION FORM ─────────────────────────────────
  openSessionForm(studentId) {
    document.getElementById('sf-studentId').value = studentId || '';
    document.getElementById('sf-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('sf-duration').value = '60';
    document.getElementById('sf-notes').value = '';
    document.getElementById('sf-status').value = 'scheduled';

    // Populate student picker
    Students.getAll().then(students => {
      const sel = document.getElementById('sf-student-select');
      sel.innerHTML = '<option value="">Select student...</option>' +
        students.map(s => `<option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>${s.first} ${s.last}</option>`).join('');
    });

    document.getElementById('session-modal-overlay').classList.add('open');
  },

  closeSessionModal() {
    document.getElementById('session-modal-overlay').classList.remove('open');
  },

  async saveSession() {
    const studentId = document.getElementById('sf-student-select').value;
    const date      = document.getElementById('sf-date').value;
    if (!studentId || !date) { UI.toast('Student and date are required', 'error'); return; }

    await Sessions.save({
      studentId,
      date,
      duration: parseInt(document.getElementById('sf-duration').value) || 60,
      notes:    document.getElementById('sf-notes').value.trim(),
      status:   document.getElementById('sf-status').value,
    });

    App.closeSessionModal();
    UI.toast('Session saved');
    if (App.currentPage === 'sessions')  UI.renderSessions();
    if (App.currentPage === 'dashboard') UI.renderDashboard();
  },

  // ── PAYMENT FORM ─────────────────────────────────
  openPaymentForm(studentId) {
    document.getElementById('pf-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('pf-amount').value = '';
    document.getElementById('pf-status').value = 'pending';
    document.getElementById('pf-method').value = 'Venmo';
    document.getElementById('pf-note').value = '';

    Students.getAll().then(students => {
      const sel = document.getElementById('pf-student-select');
      sel.innerHTML = '<option value="">Select student...</option>' +
        students.map(s => `<option value="${s.id}" ${s.id === studentId ? 'selected' : ''}>${s.first} ${s.last}</option>`).join('');
    });

    document.getElementById('payment-modal-overlay').classList.add('open');
  },

  closePaymentModal() {
    document.getElementById('payment-modal-overlay').classList.remove('open');
  },

  async savePayment() {
    const studentId = document.getElementById('pf-student-select').value;
    const amount    = parseFloat(document.getElementById('pf-amount').value);
    if (!studentId || !amount) { UI.toast('Student and amount are required', 'error'); return; }

    await Payments.save({
      studentId,
      amount,
      date:   document.getElementById('pf-date').value,
      status: document.getElementById('pf-status').value,
      method: document.getElementById('pf-method').value,
      note:   document.getElementById('pf-note').value.trim(),
    });

    App.closePaymentModal();
    UI.toast('Payment saved');
    if (App.currentPage === 'payments')  UI.renderPayments();
    if (App.currentPage === 'dashboard') UI.renderDashboard();
  }
};
