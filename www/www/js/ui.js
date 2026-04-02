// ─────────────────────────────────────────────────────────────────────────────
//  ui.js  —  TutorBase rendering
// ─────────────────────────────────────────────────────────────────────────────

const UI = {

  // ── HELPERS ─────────────────────────────────────
  initials: (f, l) => ((f||'')[0] + (l||'')[0]).toUpperCase(),

  fmtDate(str) {
    if (!str) return '—';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  fmtMoney: n => '$' + (n || 0).toFixed(0),

  payBadge(status) {
    const map = { paid: ['Paid','badge-paid'], pending: ['Pending','badge-pending'], overdue: ['Overdue','badge-overdue'] };
    const [label, cls] = map[status] || ['Unknown','badge-pending'];
    return `<span class="badge ${cls}">${label}</span>`;
  },

  sessBadge(status) {
    const map = { scheduled: ['Scheduled','badge-scheduled'], completed: ['Completed','badge-paid'], cancelled: ['Cancelled','badge-overdue'] };
    const [label, cls] = map[status] || ['Unknown','badge-pending'];
    return `<span class="badge ${cls}">${label}</span>`;
  },

  toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
  },

  openModal(title) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-overlay').classList.add('open');
  },

  // ── DASHBOARD ───────────────────────────────────
  async renderDashboard() {
    const [students, sessions, payments] = await Promise.all([
      Students.getAll(), Sessions.getAll(), Payments.getAll()
    ]);

    const today = new Date().toISOString().slice(0,10);
    const thisWeek = (() => {
      const d = new Date(); d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0,10);
    })();

    const upcomingSessions = sessions
      .filter(s => s.date >= today && s.status === 'scheduled')
      .sort((a,b) => a.date.localeCompare(b.date));

    const pendingAmt = payments
      .filter(p => p.status === 'pending' || p.status === 'overdue')
      .reduce((s,p) => s + (p.amount || 0), 0);

    const overdueCount = payments.filter(p => p.status === 'overdue').length;

    document.getElementById('stat-students').textContent = students.length;
    document.getElementById('stat-upcoming').textContent = upcomingSessions.length;
    document.getElementById('stat-pending').textContent  = UI.fmtMoney(pendingAmt);
    document.getElementById('stat-overdue').textContent  = overdueCount;

    // Build a quick lookup of student names
    const nameMap = {};
    students.forEach(s => { nameMap[s.id] = s.first + ' ' + s.last; });

    const el = document.getElementById('upcoming-list');
    if (upcomingSessions.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>No upcoming sessions</p></div>`;
    } else {
      el.innerHTML = upcomingSessions.slice(0,5).map(s => `
        <div class="list-row" onclick="App.openDetail('${s.studentId}')">
          <div class="row-avatar">${UI.initials(...(nameMap[s.studentId]||'? ?').split(' '))}</div>
          <div class="row-info">
            <div class="row-name">${nameMap[s.studentId] || 'Unknown'}</div>
            <div class="row-sub">${s.subject || ''} · ${s.duration || 60} min</div>
          </div>
          <div class="row-right">
            <div class="row-date">${UI.fmtDate(s.date)}</div>
            ${UI.sessBadge(s.status)}
          </div>
        </div>`).join('');
    }
  },

  // ── STUDENT LIST ─────────────────────────────────
  async renderStudentList() {
    const query = (document.getElementById('search-input')?.value || '').toLowerCase();
    let students = await Students.getAll();
    if (query) students = students.filter(s =>
      (s.first + ' ' + s.last + ' ' + s.subject).toLowerCase().includes(query)
    );
    students.sort((a,b) => a.last.localeCompare(b.last));

    const el = document.getElementById('student-list');
    if (students.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">🎓</div><p>No students yet.<br>Tap + to add your first student.</p></div>`;
      return;
    }
    el.innerHTML = students.map(s => `
      <div class="list-row" onclick="App.openDetail('${s.id}')">
        <div class="row-avatar">${UI.initials(s.first, s.last)}</div>
        <div class="row-info">
          <div class="row-name">${s.first} ${s.last}</div>
          <div class="row-sub">${s.subject || '—'} · ${s.grade || '—'}</div>
        </div>
        <div class="row-right">
          <div class="row-rate">${s.rate ? '$' + s.rate + '/hr' : '—'}</div>
        </div>
      </div>`).join('');
  },

  // ── SESSIONS ─────────────────────────────────────
  async renderSessions() {
    const [sessions, students] = await Promise.all([Sessions.getAll(), Students.getAll()]);
    const nameMap = {};
    students.forEach(s => { nameMap[s.id] = s.first + ' ' + s.last; });

    sessions.sort((a,b) => b.date.localeCompare(a.date));

    const el = document.getElementById('sessions-list');
    if (sessions.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><p>No sessions logged yet.<br>Tap + to add a session.</p></div>`;
      return;
    }
    el.innerHTML = sessions.map(s => `
      <div class="list-row">
        <div class="row-avatar">${UI.initials(...(nameMap[s.studentId]||'? ?').split(' '))}</div>
        <div class="row-info">
          <div class="row-name">${nameMap[s.studentId] || 'Unknown Student'}</div>
          <div class="row-sub">${s.subject || ''} · ${s.duration || 60} min${s.notes ? ' · ' + s.notes : ''}</div>
        </div>
        <div class="row-right">
          <div class="row-date">${UI.fmtDate(s.date)}</div>
          ${UI.sessBadge(s.status)}
        </div>
      </div>`).join('');
  },

  // ── PAYMENTS ─────────────────────────────────────
  async renderPayments() {
    const [payments, students] = await Promise.all([Payments.getAll(), Students.getAll()]);
    const nameMap = {};
    students.forEach(s => { nameMap[s.id] = s.first + ' ' + s.last; });

    payments.sort((a,b) => b.date.localeCompare(a.date));

    const totalEarned  = payments.filter(p => p.status === 'paid').reduce((s,p) => s + (p.amount||0), 0);
    const totalPending = payments.filter(p => p.status === 'pending').reduce((s,p) => s + (p.amount||0), 0);
    const totalOverdue = payments.filter(p => p.status === 'overdue').reduce((s,p) => s + (p.amount||0), 0);

    document.getElementById('pay-earned').textContent  = UI.fmtMoney(totalEarned);
    document.getElementById('pay-pending').textContent = UI.fmtMoney(totalPending);
    document.getElementById('pay-overdue').textContent = UI.fmtMoney(totalOverdue);

    const el = document.getElementById('payments-list');
    if (payments.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-icon">💰</div><p>No payments yet.</p></div>`;
      return;
    }
    el.innerHTML = payments.map(p => `
      <div class="list-row">
        <div class="row-avatar">${UI.initials(...(nameMap[p.studentId]||'? ?').split(' '))}</div>
        <div class="row-info">
          <div class="row-name">${nameMap[p.studentId] || 'Unknown'}</div>
          <div class="row-sub">${p.method || '—'}${p.note ? ' · ' + p.note : ''}</div>
        </div>
        <div class="row-right">
          <div class="row-amount">${UI.fmtMoney(p.amount)}</div>
          ${UI.payBadge(p.status)}
        </div>
      </div>`).join('');
  },

  // ── STUDENT DETAIL PANEL ─────────────────────────
  async renderDetail(student, sessions, payments) {
    if (!student) return;
    document.getElementById('detail-avatar-text').textContent = UI.initials(student.first, student.last);
    document.getElementById('detail-name').textContent = student.first + ' ' + student.last;
    document.getElementById('detail-subject').textContent = [student.subject, student.grade].filter(Boolean).join(' · ');

    const totalPaid    = payments.filter(p => p.status === 'paid').reduce((s,p) => s+(p.amount||0), 0);
    const totalOwed    = payments.filter(p => p.status !== 'paid').reduce((s,p) => s+(p.amount||0), 0);
    const sessionCount = sessions.length;

    document.getElementById('detail-stats').innerHTML = `
      <div class="detail-stat"><div class="ds-val">${sessionCount}</div><div class="ds-label">Sessions</div></div>
      <div class="detail-stat"><div class="ds-val">${UI.fmtMoney(totalPaid)}</div><div class="ds-label">Paid</div></div>
      <div class="detail-stat"><div class="ds-val" style="color:var(--amber)">${UI.fmtMoney(totalOwed)}</div><div class="ds-label">Owed</div></div>
    `;

    document.getElementById('detail-info-rows').innerHTML = `
      <div class="info-row"><span class="ik">Rate</span><span>${student.rate ? '$' + student.rate + '/hr' : '—'}</span></div>
      <div class="info-row"><span class="ik">Parent</span><span>${student.parent || '—'}</span></div>
      <div class="info-row"><span class="ik">Email</span><span>${student.email || '—'}</span></div>
      <div class="info-row"><span class="ik">Phone</span><span>${student.phone || '—'}</span></div>
    `;

    document.getElementById('detail-notes').textContent = student.notes || 'No notes.';

    // Recent sessions
    const recentSessions = sessions.sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
    document.getElementById('detail-sessions').innerHTML = recentSessions.length
      ? recentSessions.map(s => `
          <div class="mini-row">
            <span>${UI.fmtDate(s.date)}</span>
            <span>${s.duration || 60} min</span>
            ${UI.sessBadge(s.status)}
          </div>`).join('')
      : '<div class="empty-mini">No sessions yet</div>';

    // Quick add buttons
    document.getElementById('detail-add-session').onclick = () => {
      App.closeDetail();
      App.openSessionForm(student.id);
    };
    document.getElementById('detail-add-payment').onclick = () => {
      App.closeDetail();
      App.openPaymentForm(student.id);
    };
  },

  // ── SETTINGS ─────────────────────────────────────
  renderSettings() {}  // static HTML handles this page
};
