/**
 * app.js — Logique principale de Budget Pro
 * ============================================================
 * Cet unique fichier gère :
 *   A. Service Worker (PWA installation mobile)
 *   B. Authentification (PIN local, sans serveur)
 *   C. Tableau de bord : formulaire, filtres, liste
 *   D. Graphiques Chart.js (5 types, tooltips FCFA corrects)
 *   E. Tous les filtres : aujourd'hui, 3 jours, semaine, mois, année, tout
 *   F. Détection online/offline
 *   G. Utilitaires
 * ============================================================
 */

'use strict';

// ════════════════════════════════════════════════════════════════
// A. SERVICE WORKER — Installation PWA
// ════════════════════════════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(r => console.log('[SW] Enregistré, scope:', r.scope))
      .catch(e => console.warn('[SW] Non enregistré:', e));
  });
}

// ════════════════════════════════════════════════════════════════
// B. ÉTAT GLOBAL
// ════════════════════════════════════════════════════════════════

/** Utilisateur connecté (chargé depuis sessionStorage) */
let currentUser = null;

/** Instance Chart.js active (une seule à la fois) */
let activeChart = null;

/** Type de graphique actif */
let activeChartType = 'bar_h';

// Couleurs par catégorie — cohérentes avec le CSS
const CAT_COLORS = {
  'Alimentation': '#e74c3c',
  'Transport':    '#3498db',
  'Loisirs':      '#9b59b6',
  'Santé':        '#27ae60',
};

// ════════════════════════════════════════════════════════════════
// C. DÉMARRAGE
// ════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Détecter online/offline
  updateOfflineBanner();
  window.addEventListener('online',  updateOfflineBanner);
  window.addEventListener('offline', updateOfflineBanner);

  // Récupérer la session (sessionStorage persiste pendant la session d'app)
  const saved = sessionStorage.getItem('bp_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    showApp();
    return;
  }

  // Pas de session → afficher l'écran d'auth
  const hasUsers = await DB.hasUsers();
  showAuth(hasUsers ? 'login' : 'register');
});

// ════════════════════════════════════════════════════════════════
// D. AUTHENTIFICATION
// ════════════════════════════════════════════════════════════════

/** Afficher l'écran d'auth sur le bon onglet */
function showAuth(tab = 'login') {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-screen').classList.remove('active');
  switchAuthTab(tab);
}

/** Basculer entre Connexion et Créer un compte */
function switchAuthTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('login-form').classList.toggle('active', tab === 'login');
  document.getElementById('register-form').classList.toggle('active', tab === 'register');
  clearAuthMsgs();
}

/** Afficher l'app principale */
function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').classList.add('active');

  // Afficher le nom de l'utilisateur dans la barre
  document.getElementById('nav-user').textContent = '👤 ' + currentUser.username;

  initApp();
}

/** Créer un compte */
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = e.target.querySelector('[name=username]').value.trim();
  const pin      = e.target.querySelector('[name=pin]').value;
  const pin2     = e.target.querySelector('[name=pin2]').value;

  if (!username || username.length < 3) {
    return showAuthMsg('reg-msg', 'error', 'Le nom doit faire au moins 3 caractères.');
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return showAuthMsg('reg-msg', 'error', 'Le PIN doit être 4 à 6 chiffres.');
  }
  if (pin !== pin2) {
    return showAuthMsg('reg-msg', 'error', 'Les PINs ne correspondent pas.');
  }

  setLoading('reg-btn', true);
  try {
    const user = await DB.createUser(username, pin);
    sessionStorage.setItem('bp_user', JSON.stringify(user));
    currentUser = user;
    showApp();
  } catch (err) {
    showAuthMsg('reg-msg', 'error', err.message);
  } finally {
    setLoading('reg-btn', false);
  }
});

/** Se connecter */
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = e.target.querySelector('[name=username]').value.trim();
  const pin      = e.target.querySelector('[name=pin]').value;

  setLoading('login-btn', true);
  try {
    const user = await DB.verifyUser(username, pin);
    sessionStorage.setItem('bp_user', JSON.stringify(user));
    currentUser = user;
    showApp();
  } catch (err) {
    showAuthMsg('login-msg', 'error', err.message);
  } finally {
    setLoading('login-btn', false);
  }
});

/** Déconnexion */
document.getElementById('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('bp_user');
  currentUser = null;
  if (activeChart) { activeChart.destroy(); activeChart = null; }
  DB.hasUsers().then(has => showAuth(has ? 'login' : 'register'));
});

// ════════════════════════════════════════════════════════════════
// E. INITIALISATION DE L'APP
// ════════════════════════════════════════════════════════════════

function initApp() {
  // Pré-remplir la date d'aujourd'hui
  const dateInput = document.getElementById('f-date');
  if (dateInput) dateInput.value = todayStr();

  // Générer les heures (0h-23h)
  const hourSel = document.getElementById('f-hour');
  if (hourSel && !hourSel.options.length) {
    for (let h = 0; h < 24; h++) {
      hourSel.add(new Option(`${String(h).padStart(2,'0')}h`, h));
    }
    hourSel.value = new Date().getHours();
  }

  // Écouter les changements de filtres
  document.getElementById('filter-period').addEventListener('change', loadData);
  document.getElementById('filter-cat').addEventListener('change', loadData);

  // Charger les données initiales
  loadData();
}

// ════════════════════════════════════════════════════════════════
// F. DONNÉES — Chargement et affichage
// ════════════════════════════════════════════════════════════════

async function loadData() {
  const period   = document.getElementById('filter-period').value;
  const category = document.getElementById('filter-cat').value;

  showListLoading(true);

  try {
    const expenses = await DB.getExpenses(currentUser.id, period, category);
    renderList(expenses);
    await renderChart(period);
  } catch (err) {
    console.error('[App] Erreur chargement:', err);
    toast('Erreur : ' + err.message, 'error');
  } finally {
    showListLoading(false);
  }
}

// ── Liste des dépenses ────────────────────────────────────────
function renderList(expenses) {
  const container = document.getElementById('expense-list');
  const totalEl   = document.getElementById('total-val');
  const countEl   = document.getElementById('expense-count');

  container.innerHTML = '';

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  totalEl.textContent = fmtMoney(total);
  if (countEl) countEl.textContent = `${expenses.length} dépense${expenses.length > 1 ? 's' : ''}`;

  if (expenses.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">💸</div>
        <p>Aucune dépense pour cette période.</p>
        <p style="font-size:0.8rem;opacity:0.6">Utilisez le formulaire pour commencer.</p>
      </div>`;
    return;
  }

  expenses.forEach(item => {
    const el = document.createElement('div');
    el.className = 'expense-item';
    el.innerHTML = `
      <div class="item-dot dot-${item.category}"></div>
      <div class="item-info">
        <div class="item-name">${escHtml(item.name)}</div>
        <div class="item-meta">${item.category} · ${fmtDate(item.date)} ${String(item.hour).padStart(2,'0')}h${String(item.minute).padStart(2,'0')}</div>
      </div>
      <div class="item-right">
        <span class="item-amount">${fmtMoney(item.amount)} F</span>
        <button class="del-btn" data-id="${item.id}">🗑</button>
      </div>`;
    container.appendChild(el);
  });

  // Gérer les suppressions
  container.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDelete(parseInt(btn.dataset.id)));
  });
}

async function confirmDelete(id) {
  if (!confirm('Supprimer cette dépense ?')) return;
  try {
    await DB.deleteExpense(currentUser.id, id);
    toast('Dépense supprimée', 'success');
    loadData();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════════
// G. GRAPHIQUES — 5 types, tooltips FCFA corrects
// ════════════════════════════════════════════════════════════════

/**
 * renderChart(period) — Dessiner le graphique actif
 *
 * CORRECTION TOOLTIP :
 * Le bug venait du fait que Chart.js retourne des valeurs différentes
 * selon le type de graphique :
 *   - Barres/Ligne : context.parsed.y  (axe Y)
 *   - Camembert/Anneau : context.parsed (valeur directe)
 * On unifie avec une fonction getValue() qui gère les deux cas.
 */
async function renderChart(period) {
  const canvas = document.getElementById('main-chart');
  const ctx    = canvas.getContext('2d');

  // ── Détruire l'ancien graphique AVANT de créer le nouveau ──
  // Sans ça, Chart.js garde des références fantômes → bugs visuels
  if (activeChart) {
    activeChart.destroy();
    activeChart = null;
  }

  let chartData, config;

  // Fonction unifiée pour extraire la valeur selon le type de graphique
  // C'est la correction principale du tooltip faussé
  const getValue = (ctx) => {
    const v = ctx.parsed;
    // Pour les barres horizontales (indexAxis:'y'), la valeur est sur x
    if (typeof v === 'object' && v !== null) return v.y ?? v.x ?? 0;
    // Pour pie/doughnut, c'est un nombre direct
    return typeof v === 'number' ? v : 0;
  };

  // Tooltip commun — affiche le montant en FCFA avec le bon format
  const tooltipCallback = {
    label: (ctx) => {
      const val = getValue(ctx);
      return `  ${fmtMoney(val)} FCFA`;
    }
  };

  switch (activeChartType) {

    // ── BARRES PAR CATÉGORIE (horizontal) ────────────────────
    case 'bar_h': {
      const stats = await DB.getStatsByCategory(currentUser.id, period);
      if (!Object.keys(stats).length) { showEmptyChart(); return; }

      const labels = Object.keys(stats);
      const data   = Object.values(stats);
      const colors = labels.map(l => CAT_COLORS[l] || '#7f8c8d');

      config = {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Dépenses',
            data,
            backgroundColor: colors.map(c => c + 'bb'),
            borderColor: colors,
            borderWidth: 2,
            borderRadius: 6,
          }]
        },
        options: {
          indexAxis: 'y', // ← barres HORIZONTALES
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                // Pour les barres horizontales, la valeur est sur l'axe X
                label: (ctx) => `  ${fmtMoney(ctx.parsed.x)} FCFA`
              }
            }
          },
          scales: {
            x: {
              ticks: {
                color: '#8fa3b8',
                callback: v => fmtMoney(v) + ' F'
              },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: { ticks: { color: '#ecf0f1' }, grid: { display: false } }
          }
        }
      };
      break;
    }

    // ── CAMEMBERT ─────────────────────────────────────────────
    case 'pie': {
      const stats = await DB.getStatsByCategory(currentUser.id, period);
      if (!Object.keys(stats).length) { showEmptyChart(); return; }

      const labels = Object.keys(stats);
      const data   = Object.values(stats);
      const total  = data.reduce((s, v) => s + v, 0);

      config = {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: labels.map(l => CAT_COLORS[l] || '#7f8c8d'),
            borderColor: '#243044',
            borderWidth: 3,
            hoverOffset: 10,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#ecf0f1', padding: 14, usePointStyle: true, font: { size: 12 } }
            },
            tooltip: {
              callbacks: {
                // parsed est un nombre direct pour pie/doughnut
                label: (ctx) => {
                  const val = ctx.parsed; // ← nombre direct (pas d'objet .y)
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return `  ${ctx.label}: ${fmtMoney(val)} FCFA (${pct}%)`;
                }
              }
            }
          }
        }
      };
      break;
    }

    // ── ANNEAU ────────────────────────────────────────────────
    case 'doughnut': {
      const stats = await DB.getStatsByCategory(currentUser.id, period);
      if (!Object.keys(stats).length) { showEmptyChart(); return; }

      const labels = Object.keys(stats);
      const data   = Object.values(stats);
      const total  = data.reduce((s, v) => s + v, 0);

      config = {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data,
            backgroundColor: labels.map(l => CAT_COLORS[l] || '#7f8c8d'),
            borderColor: '#243044',
            borderWidth: 3,
            hoverOffset: 12,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#ecf0f1', padding: 14, usePointStyle: true, font: { size: 12 } }
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const val = ctx.parsed; // nombre direct pour doughnut
                  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                  return `  ${ctx.label}: ${fmtMoney(val)} FCFA (${pct}%)`;
                }
              }
            }
          }
        }
      };
      break;
    }

    // ── COURBE D'ÉVOLUTION ────────────────────────────────────
    case 'line': {
      const stats = await DB.getStatsByDay(currentUser.id, period);
      if (!stats.data.length) { showEmptyChart(); return; }

      config = {
        type: 'line',
        data: {
          labels: stats.labels,
          datasets: [{
            label: 'Dépenses du jour',
            data: stats.data,
            fill: true,
            backgroundColor: 'rgba(74,144,226,0.12)',
            borderColor: '#4a90e2',
            borderWidth: 3,
            pointBackgroundColor: '#4a90e2',
            pointRadius: 5,
            pointHoverRadius: 8,
            tension: 0.4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `  ${fmtMoney(ctx.parsed.y)} FCFA` // axe Y pour line
              }
            }
          },
          scales: {
            y: {
              ticks: { color: '#8fa3b8', callback: v => fmtMoney(v) + ' F' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: { ticks: { color: '#8fa3b8' }, grid: { display: false } }
          }
        }
      };
      break;
    }

    // ── BARRES PAR MOIS ───────────────────────────────────────
    case 'bar_month': {
      const stats = await DB.getStatsByMonth(currentUser.id);
      if (!stats.data.some(v => v > 0)) { showEmptyChart(); return; }

      config = {
        type: 'bar',
        data: {
          labels: stats.labels,
          datasets: [{
            label: 'Total mensuel',
            data: stats.data,
            backgroundColor: 'rgba(39,174,96,0.7)',
            borderColor: '#27ae60',
            borderWidth: 2,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `  ${fmtMoney(ctx.parsed.y)} FCFA` // axe Y pour bar verticale
              }
            }
          },
          scales: {
            y: {
              ticks: { color: '#8fa3b8', callback: v => fmtMoney(v) + ' F' },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            x: { ticks: { color: '#8fa3b8', maxRotation: 45 }, grid: { display: false } }
          }
        }
      };
      break;
    }

    default:
      return;
  }

  canvas.parentElement.querySelector('.chart-empty')?.remove();
  activeChart = new Chart(ctx, config);
}

function showEmptyChart() {
  const wrap = document.querySelector('.chart-wrap');
  const existing = wrap.querySelector('.chart-empty');
  if (!existing) {
    const el = document.createElement('div');
    el.className = 'chart-empty';
    el.textContent = 'Pas de données pour ce graphique';
    wrap.appendChild(el);
  }
}

/** Changer le type de graphique (boutons en haut du card) */
function setChartType(type) {
  activeChartType = type;
  document.querySelectorAll('.chart-type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  const period = document.getElementById('filter-period').value;
  renderChart(period);
}

// ════════════════════════════════════════════════════════════════
// H. FORMULAIRE D'AJOUT DE DÉPENSE
// ════════════════════════════════════════════════════════════════
document.getElementById('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;

  const expense = {
    name:     f.querySelector('[name=name]').value.trim(),
    amount:   parseFloat(f.querySelector('[name=amount]').value),
    category: f.querySelector('[name=category]').value,
    date:     f.querySelector('[name=date]').value,
    hour:     parseInt(f.querySelector('[name=hour]').value) || 0,
    minute:   parseInt(f.querySelector('[name=minute]').value) || 0,
  };

  if (!expense.name || !expense.amount || !expense.date) {
    toast('Remplissez tous les champs obligatoires.', 'error');
    return;
  }

  setLoading('add-btn', true);

  try {
    await DB.addExpense(currentUser.id, expense);
    toast('✅ Dépense enregistrée !', 'success');

    // Reset du formulaire (garder la date d'aujourd'hui)
    f.reset();
    f.querySelector('[name=date]').value = todayStr();
    f.querySelector('[name=hour]').value = new Date().getHours();

    loadData();
  } catch (err) {
    toast('❌ ' + err.message, 'error');
  } finally {
    setLoading('add-btn', false);
  }
});

// FAB → scroll vers le formulaire
document.querySelector('.fab').addEventListener('click', () => {
  document.getElementById('expense-form')
    .closest('.card')
    .scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('f-name').focus();
});

// ════════════════════════════════════════════════════════════════
// I. UTILITAIRES
// ════════════════════════════════════════════════════════════════

/** Date d'aujourd'hui au format YYYY-MM-DD */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** Formater un nombre en FCFA avec séparateurs (ex: 15 000) */
function fmtMoney(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

/** Formater une date YYYY-MM-DD → DD/MM/YYYY */
function fmtDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

/** Échapper le HTML pour éviter les injections XSS */
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** Afficher/cacher la bannière hors ligne */
function updateOfflineBanner() {
  document.querySelector('.offline-bar').classList.toggle('show', !navigator.onLine);
}

/** Afficher l'état de chargement d'un bouton */
function setLoading(id, on) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const txt = btn.querySelector('.btn-txt');
  const spn = btn.querySelector('.btn-spn');
  btn.disabled = on;
  if (txt) txt.style.display = on ? 'none' : '';
  if (spn) spn.style.display = on ? '' : 'none';
}

/** Afficher le spinner de chargement de la liste */
function showListLoading(on) {
  const loader = document.getElementById('list-loading');
  const list   = document.getElementById('expense-list');
  if (loader) loader.classList.toggle('hidden', !on);
  if (list)   list.classList.toggle('hidden', on);
}

/** Toast de notification */
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

/** Messages d'authentification */
function showAuthMsg(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `msg msg-${type} show`;
  el.textContent = msg;
}
function clearAuthMsgs() {
  document.querySelectorAll('.msg').forEach(el => el.classList.remove('show'));
}

// Exposer switchAuthTab et setChartType pour les onclick HTML
window.switchAuthTab = switchAuthTab;
window.setChartType  = setChartType;
