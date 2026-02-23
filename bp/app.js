/**
 * app.js — Budget Pro
 * Authentification PIN local, graphiques, filtres, thème
 */
'use strict';

// ── PWA Service Worker ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ── État global ───────────────────────────────────────────────
let currentUser = null;
let chart       = null;
let chartType   = 'bar_h';

const COLORS = {
  Alimentation: '#EF4444',
  Transport:    '#3B82F6',
  Loisirs:      '#8B5CF6',
  Santé:        '#10B981',
};

// ── Démarrage ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Thème sauvegardé
  const savedTheme = localStorage.getItem('bp_theme') || 'light';
  setTheme(savedTheme);

  // Online/offline
  updateOffline();
  window.addEventListener('online',  updateOffline);
  window.addEventListener('offline', updateOffline);

  // Session en cours ?
  const saved = sessionStorage.getItem('bp_user');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      await showApp();
      return;
    } catch { sessionStorage.removeItem('bp_user'); }
  }

  // Afficher écran auth
  const hasUsers = await DB.hasUsers();
  showAuth(hasUsers ? 'login' : 'register');
});

/* ═══════════════════════════════════════════════════════════════
   THÈME
   ═══════════════════════════════════════════════════════════════ */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('bp_theme', theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.querySelector('.icon').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
  // Re-dessiner le graphique avec les nouvelles couleurs
  const period = document.getElementById('filter-period')?.value || 'month';
  renderChart(period);
}

/* ═══════════════════════════════════════════════════════════════
   AUTHENTIFICATION
   ═══════════════════════════════════════════════════════════════ */
function showAuth(tab = 'login') {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').classList.remove('show');
  switchTab(tab);
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.getElementById('form-login').classList.toggle('active', tab === 'login');
  document.getElementById('form-reg').classList.toggle('active', tab === 'register');
  clearMsgs();
}

// Créer un compte
document.getElementById('form-reg').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const username = fd.get('username');
  const pin      = fd.get('pin');
  const pin2     = fd.get('pin2');

  if (!username || username.trim().length < 2)
    return showMsg('reg-msg', 'err', 'Nom trop court (2 caractères min).');
  if (!/^\d{4,6}$/.test(pin))
    return showMsg('reg-msg', 'err', 'Le PIN doit être 4 à 6 chiffres.');
  if (pin !== pin2)
    return showMsg('reg-msg', 'err', 'Les PINs ne correspondent pas.');

  setBtnLoad('btn-reg', true);
  try {
    currentUser = await DB.createUser(username, pin);
    sessionStorage.setItem('bp_user', JSON.stringify(currentUser));
    await showApp();
  } catch (err) {
    showMsg('reg-msg', 'err', err.message);
  } finally {
    setBtnLoad('btn-reg', false);
  }
});

// Connexion
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  setBtnLoad('btn-login', true);
  try {
    currentUser = await DB.verifyUser(fd.get('username'), fd.get('pin'));
    sessionStorage.setItem('bp_user', JSON.stringify(currentUser));
    await showApp();
  } catch (err) {
    showMsg('login-msg', 'err', err.message);
  } finally {
    setBtnLoad('btn-login', false);
  }
});

// Déconnexion
document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('bp_user');
  currentUser = null;
  if (chart) { chart.destroy(); chart = null; }
  DB.hasUsers().then(has => showAuth(has ? 'login' : 'register'));
});

/* ═══════════════════════════════════════════════════════════════
   APP PRINCIPALE
   ═══════════════════════════════════════════════════════════════ */
async function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('show');

  document.getElementById('nav-user').textContent = '👤 ' + currentUser.username;

  // Initialiser date et heure
  const dateInp = document.getElementById('f-date');
  if (dateInp) dateInp.value = todayStr();

  const hourSel = document.getElementById('f-hour');
  if (hourSel && !hourSel.options.length) {
    for (let h = 0; h < 24; h++) {
      hourSel.add(new Option(`${String(h).padStart(2,'0')}h`, h));
    }
    hourSel.value = new Date().getHours();
  }

  // Écouteurs filtres
  document.getElementById('filter-period').addEventListener('change', loadData);
  document.getElementById('filter-cat').addEventListener('change', loadData);

  await loadData();
}

/* ═══════════════════════════════════════════════════════════════
   DONNÉES
   ═══════════════════════════════════════════════════════════════ */
async function loadData() {
  const period   = document.getElementById('filter-period').value;
  const category = document.getElementById('filter-cat').value;

  showLoader(true);
  try {
    const [expenses] = await Promise.all([
      DB.getExpenses(currentUser.id, period, category),
      renderChart(period)
    ]);
    renderList(expenses);
  } catch (err) {
    toast('Erreur : ' + err.message, true);
    console.error(err);
  } finally {
    showLoader(false);
  }
}

function renderList(expenses) {
  const list   = document.getElementById('expense-list');
  const totEl  = document.getElementById('total-val');
  const cntEl  = document.getElementById('exp-count');
  list.innerHTML = '';

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  totEl.textContent = fmt(total);
  if (cntEl) cntEl.textContent = `${expenses.length} dépense${expenses.length !== 1 ? 's' : ''}`;

  if (!expenses.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="ei">📭</div>
      <p class="ep">Aucune dépense pour cette période.</p>
      <p class="ep2">Utilisez le formulaire ci-dessus pour commencer.</p>
    </div>`;
    return;
  }

  expenses.forEach(item => {
    const row = document.createElement('div');
    row.className = 'exp-row';
    row.innerHTML = `
      <div class="exp-dot dot-${esc(item.category)}"></div>
      <div class="exp-info">
        <div class="exp-name">${esc(item.name)}</div>
        <div class="exp-meta">
          ${fmtDate(item.date)} · ${String(item.hour).padStart(2,'0')}h${String(item.minute).padStart(2,'0')}
          <span class="cat-badge badge-${esc(item.category)}">${esc(item.category)}</span>
        </div>
      </div>
      <div class="exp-right">
        <span class="exp-amount">${fmt(item.amount)} F</span>
        <button class="btn btn-sm btn-del" data-id="${item.id}">🗑</button>
      </div>`;
    list.appendChild(row);
  });

  list.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', () => delExpense(+btn.dataset.id));
  });
}

async function delExpense(id) {
  if (!confirm('Supprimer cette dépense ?')) return;
  try {
    await DB.deleteExpense(currentUser.id, id);
    toast('✅ Supprimée');
    await loadData();
  } catch (err) {
    toast('❌ ' + err.message, true);
  }
}

/* ═══════════════════════════════════════════════════════════════
   FORMULAIRE
   ═══════════════════════════════════════════════════════════════ */
document.getElementById('expense-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = {
    name:     fd.get('name'),
    amount:   fd.get('amount'),
    category: fd.get('category'),
    date:     fd.get('date'),
    hour:     fd.get('hour'),
    minute:   fd.get('minute'),
  };

  if (!data.name?.trim() || !data.amount || !data.date) {
    return toast('⚠️ Remplissez tous les champs.', true);
  }

  setBtnLoad('btn-add', true);
  try {
    await DB.addExpense(currentUser.id, data);
    toast('✅ Dépense enregistrée !');
    e.target.reset();
    document.getElementById('f-date').value = todayStr();
    document.getElementById('f-hour').value = new Date().getHours();
    await loadData();
  } catch (err) {
    toast('❌ ' + err.message, true);
  } finally {
    setBtnLoad('btn-add', false);
  }
});

/* ═══════════════════════════════════════════════════════════════
   GRAPHIQUES — tooltips FCFA corrects
   ═══════════════════════════════════════════════════════════════ */
async function renderChart(period) {
  const canvas = document.getElementById('main-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (chart) { chart.destroy(); chart = null; }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const tickColor  = isDark ? '#7D8590' : '#94A3B8';
  const legendColor = isDark ? '#E6EDF3' : '#0F172A';

  // Tooltip commun FCFA
  const ttFCFA = val => `  ${fmt(val)} FCFA`;

  const noData = () => {
    const el = canvas.parentElement;
    let nd = el.querySelector('.chart-no-data');
    if (!nd) { nd = document.createElement('div'); nd.className = 'chart-no-data'; el.appendChild(nd); }
    nd.textContent = 'Aucune donnée pour ce graphique';
  };
  canvas.parentElement.querySelector('.chart-no-data')?.remove();

  let cfg;

  switch (chartType) {

    case 'bar_h': {
      const stats = await DB.statsByCategory(currentUser.id, period);
      if (!Object.keys(stats).length) { noData(); return; }
      const labels = Object.keys(stats);
      const data   = Object.values(stats);
      const clrs   = labels.map(l => COLORS[l] || '#64748B');
      cfg = {
        type: 'bar',
        data: { labels, datasets: [{ data, backgroundColor: clrs.map(c => c+'bb'), borderColor: clrs, borderWidth: 2, borderRadius: 6 }] },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ttFCFA(ctx.parsed.x) } }
          },
          scales: {
            x: { ticks: { color: tickColor, callback: v => fmt(v) + ' F' }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor }, grid: { display: false } }
          }
        }
      };
      break;
    }

    case 'pie':
    case 'doughnut': {
      const stats = await DB.statsByCategory(currentUser.id, period);
      if (!Object.keys(stats).length) { noData(); return; }
      const labels = Object.keys(stats);
      const data   = Object.values(stats);
      const total  = data.reduce((s,v) => s+v, 0);
      const clrs   = labels.map(l => COLORS[l] || '#64748B');
      cfg = {
        type: chartType,
        data: { labels, datasets: [{ data, backgroundColor: clrs, borderColor: isDark ? '#1C2331' : '#fff', borderWidth: 3, hoverOffset: 10 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: chartType === 'doughnut' ? '60%' : 0,
          plugins: {
            legend: { position:'bottom', labels: { color: legendColor, padding: 14, usePointStyle: true, font: { size: 12 } } },
            tooltip: {
              callbacks: {
                // Pour pie/doughnut : ctx.parsed est un nombre direct
                label: ctx => {
                  const v = ctx.parsed;
                  const pct = total > 0 ? ((v/total)*100).toFixed(1) : 0;
                  return `  ${fmt(v)} FCFA (${pct}%)`;
                }
              }
            }
          }
        }
      };
      break;
    }

    case 'line': {
      const stats = await DB.statsByDay(currentUser.id, period);
      if (!stats.data.length) { noData(); return; }
      cfg = {
        type: 'line',
        data: { labels: stats.labels, datasets: [{ data: stats.data, fill: true, backgroundColor: isDark ? 'rgba(68,147,248,0.10)' : 'rgba(37,99,235,0.08)', borderColor: isDark ? '#4493F8' : '#2563EB', borderWidth: 2.5, pointRadius: 4, pointHoverRadius: 7, tension: 0.4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ttFCFA(ctx.parsed.y) } }
          },
          scales: {
            y: { ticks: { color: tickColor, callback: v => fmt(v) + ' F' }, grid: { color: gridColor } },
            x: { ticks: { color: tickColor }, grid: { display: false } }
          }
        }
      };
      break;
    }

    case 'bar_month': {
      const stats = await DB.statsByMonth(currentUser.id);
      if (!stats.data.some(v => v > 0)) { noData(); return; }
      cfg = {
        type: 'bar',
        data: { labels: stats.labels, datasets: [{ data: stats.data, backgroundColor: isDark ? 'rgba(63,185,80,0.7)' : 'rgba(5,150,105,0.75)', borderColor: isDark ? '#3FB950' : '#059669', borderWidth: 2, borderRadius: 5 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ttFCFA(ctx.parsed.y) } }
          },
          scales: {
            y: { ticks: { color: tickColor, callback: v => fmt(v) + ' F' }, grid: { color: gridColor } },
            x: { ticks: { color: tickColor, maxRotation: 45 }, grid: { display: false } }
          }
        }
      };
      break;
    }

    default: return;
  }

  chart = new Chart(ctx, cfg);
}

function setChartType(type) {
  chartType = type;
  document.querySelectorAll('.ctype-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const period = document.getElementById('filter-period')?.value || 'month';
  renderChart(period);
}

// FAB → scroll formulaire
document.querySelector('.fab').addEventListener('click', () => {
  document.getElementById('expense-form')
    .closest('.card')
    .scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('f-name')?.focus();
});

/* ═══════════════════════════════════════════════════════════════
   UTILITAIRES
   ═══════════════════════════════════════════════════════════════ */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmt(n)      { return Math.round(+n).toLocaleString('fr-FR'); }
function fmtDate(s)  { if (!s) return ''; const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; }
function esc(s)      { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function updateOffline() { document.querySelector('.offline-bar').classList.toggle('show', !navigator.onLine); }
function showLoader(on)  {
  document.getElementById('list-loader')?.classList.toggle('hidden', !on);
  document.getElementById('expense-list')?.classList.toggle('hidden', on);
}
function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = isErr
    ? (document.documentElement.getAttribute('data-theme') === 'dark' ? '#F85149' : '#DC2626')
    : '';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}
function showMsg(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `msg msg-${type} show`;
  el.textContent = msg;
}
function clearMsgs() {
  document.querySelectorAll('.msg').forEach(el => el.classList.remove('show'));
}
function setBtnLoad(id, on) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = on;
  const txt = btn.querySelector('.btxt');
  const spn = btn.querySelector('.bspn');
  if (txt) txt.style.display = on ? 'none' : '';
  if (spn) spn.style.display = on ? '' : 'none';
}

// Exposer pour onclick HTML
window.switchTab     = switchTab;
window.setChartType  = setChartType;
window.toggleTheme   = toggleTheme;
