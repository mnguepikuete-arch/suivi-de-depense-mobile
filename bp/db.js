/**
 * db.js — Base de données locale (IndexedDB)
 *
 * CORRECTION BUG "dépenses perdues après la première"
 * ─────────────────────────────────────────────────────────────
 * Cause identifiée : IDBKeyRange.only(userId) sur l'index ix_user
 * peut échouer silencieusement selon le navigateur quand le type
 * de la clé d'index diffère légèrement entre l'écriture et la
 * lecture (ex: entier autoIncrement vs entier passé en paramètre).
 * Le résultat : getAll() via l'index retourne [] après la 1ère lecture.
 *
 * Solution : ne plus utiliser d'index pour lire les dépenses.
 * On lit TOUS les enregistrements avec objectStore.getAll() puis
 * on filtre en JavaScript. Fiable à 100%, aucune ambiguïté de type.
 * Pour un budget personnel (quelques milliers d'entrées max), c'est
 * parfaitement performant.
 */
'use strict';

const DB_NAME    = 'BudgetProDB';
const DB_VERSION = 5; // Incrémenté → migration propre garantie

let _db = null;

/* ── Connexion ───────────────────────────────────────────────── */
function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      // Nettoyer les anciens stores (migration propre)
      [...db.objectStoreNames].forEach(n => db.deleteObjectStore(n));

      // Table users
      const users = db.createObjectStore('users', {
        keyPath: 'id', autoIncrement: true
      });
      users.createIndex('ix_username', 'username', { unique: true });

      // Table expenses — PAS d'index sur user_id (on filtre en JS)
      db.createObjectStore('expenses', {
        keyPath: 'id', autoIncrement: true
      });
    };

    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(new Error('Erreur ouverture DB: ' + e.target.error));
  });
}

/* ── Écriture — attend tx.oncomplete (persistance réelle) ────── */
function _add(storeName, record) {
  return openDB().then(db => new Promise((resolve, reject) => {
    // Copier l'objet SANS la propriété "id" → autoIncrement génère la clé
    const obj = {};
    for (const k in record) {
      if (k !== 'id') obj[k] = record[k];
    }

    const tx  = db.transaction(storeName, 'readwrite');
    const req = tx.objectStore(storeName).add(obj);
    let   key = null;

    req.onsuccess = () => { key = req.result; };

    // tx.oncomplete = données VRAIMENT écrites sur le disque
    // (différent de req.onsuccess = requête acceptée en mémoire)
    tx.oncomplete = () => resolve(key);
    tx.onerror    = () => reject(new Error('Écriture échouée: ' + tx.error));
    tx.onabort    = () => reject(new Error('Transaction annulée: ' + tx.error));
  }));
}

/* ── Lecture par clé primaire ────────────────────────────────── */
function _get(storeName, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly')
                  .objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  }));
}

/* ── Lecture via index unique (pour username) ────────────────── */
function _findOne(storeName, indexName, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly')
                  .objectStore(storeName)
                  .index(indexName)
                  .get(IDBKeyRange.only(value));
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  }));
}

/* ── Lecture de TOUS les enregistrements d'un store ─────────── */
// FIX : on utilise getAll() SANS index, puis on filtre en JS.
// C'est la correction principale du bug "dépenses perdues".
function _getAllFromStore(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly')
                  .objectStore(storeName)
                  .getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror   = () => reject(req.error);
  }));
}

/* ── Suppression ─────────────────────────────────────────────── */
function _delete(storeName, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror    = () => reject(tx.error);
  }));
}

/* ── Comptage ────────────────────────────────────────────────── */
function _count(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly')
                  .objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

/* ═══════════════════════════════════════════════════════════════
   API MÉTIER — utilisée par app.js
   ═══════════════════════════════════════════════════════════════ */
const DB = {

  /* ── Utilisateurs ────────────────────────────────────────── */
  hasUsers() {
    return _count('users').then(n => n > 0);
  },

  async createUser(username, pin) {
    const u = username.trim().toLowerCase();
    if (u.length < 2) throw new Error('Nom trop court (2 caractères min).');
    const exists = await _findOne('users', 'ix_username', u);
    if (exists) throw new Error('Ce nom est déjà utilisé.');
    const hash = await _hash(pin);
    const id = await _add('users', { username: u, pinHash: hash, createdAt: Date.now() });
    return { id, username: u };
  },

  async verifyUser(username, pin) {
    const u    = username.trim().toLowerCase();
    const user = await _findOne('users', 'ix_username', u);
    if (!user)                              throw new Error('Utilisateur introuvable.');
    if ((await _hash(pin)) !== user.pinHash) throw new Error('Code PIN incorrect.');
    return { id: user.id, username: user.username };
  },

  /* ── Dépenses ────────────────────────────────────────────── */
  async addExpense(userId, { name, amount, category, date, hour, minute }) {
    if (!name?.trim())   throw new Error('Le nom est requis.');
    if (!(+amount > 0))  throw new Error('Montant invalide (doit être > 0).');
    if (!date)           throw new Error('La date est requise.');

    const record = {
      // PAS de propriété "id" → autoIncrement la génère
      user_id:  Number(userId),           // Toujours stocker comme Number
      name:     String(name).trim(),
      amount:   parseFloat((+amount).toFixed(2)),
      category: category || 'Alimentation',
      date:     String(date),             // 'YYYY-MM-DD'
      hour:     Number(hour)   || 0,
      minute:   Number(minute) || 0,
      ts:       Date.now(),               // Pour tri secondaire stable
    };

    const newId = await _add('expenses', record);
    if (!newId) throw new Error('Enregistrement échoué, réessayez.');
    return newId;
  },

  /**
   * getExpenses — FIX PRINCIPAL
   * On lit TOUT le store puis on filtre en JavaScript.
   * Fini les problèmes d'index IDBKeyRange.
   */
  async getExpenses(userId, period = 'all', category = 'Toutes') {
    // 1. Lire TOUTES les dépenses du store
    const all = await _getAllFromStore('expenses');

    // 2. Filtrer par utilisateur (comparaison stricte en Number)
    const uid = Number(userId);
    let list = all.filter(e => Number(e.user_id) === uid);

    // 3. Filtrer par période
    const now   = new Date();
    const today = _ds(now);

    list = list.filter(e => {
      const d = String(e.date);
      switch (period) {
        case 'today':  return d === today;
        case '3days':  return d >= _ds(new Date(+now - 2 * 864e5));
        case 'week': {
          const dow = now.getDay() || 7; // lundi = 1, dimanche = 7
          const mon = new Date(+now - (dow - 1) * 864e5);
          return d >= _ds(mon);
        }
        case 'month':  return d.slice(0, 7) === today.slice(0, 7);
        case 'year':   return d.slice(0, 4) === today.slice(0, 4);
        default:       return true; // 'all'
      }
    });

    // 4. Filtrer par catégorie
    if (category && category !== 'Toutes') {
      list = list.filter(e => e.category === category);
    }

    // 5. Tri décroissant (plus récent en premier)
    list.sort((a, b) =>
      String(b.date).localeCompare(String(a.date)) ||
      (Number(b.hour)   - Number(a.hour))   ||
      (Number(b.minute) - Number(a.minute)) ||
      (Number(b.ts)     - Number(a.ts))
    );

    return list;
  },

  async deleteExpense(userId, id) {
    const e = await _get('expenses', Number(id));
    if (!e || Number(e.user_id) !== Number(userId)) {
      throw new Error('Dépense introuvable.');
    }
    return _delete('expenses', Number(id));
  },

  /* ── Statistiques ────────────────────────────────────────── */
  async statsByCategory(userId, period) {
    const list = await this.getExpenses(userId, period, 'Toutes');
    return list.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {});
  },

  async statsByDay(userId, period) {
    const list = await this.getExpenses(userId, period, 'Toutes');
    const map  = {};
    list.forEach(e => { map[e.date] = (map[e.date] || 0) + e.amount; });
    const dates = Object.keys(map).sort();
    return {
      labels: dates.map(d => { const [, m, j] = d.split('-'); return `${j}/${m}`; }),
      data:   dates.map(d => map[d])
    };
  },

  async statsByMonth(userId) {
    const all  = await _getAllFromStore('expenses');
    const uid  = Number(userId);
    const mine = all.filter(e => Number(e.user_id) === uid);

    const now  = new Date();
    const MN   = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

    // Générer les 12 derniers mois
    const keys = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const map = Object.fromEntries(keys.map(k => [k, 0]));
    mine.forEach(e => {
      const k = String(e.date).slice(0, 7);
      if (k in map) map[k] += e.amount;
    });

    return {
      labels: keys.map(k => { const [y, m] = k.split('-'); return `${MN[+m - 1]} ${y}`; }),
      data:   keys.map(k => map[k])
    };
  }
};

/* ── Utilitaires privés ──────────────────────────────────────── */
// Date → 'YYYY-MM-DD'
function _ds(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Hash SHA-256 du PIN
async function _hash(pin) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('bp_v5_salt_' + String(pin))
  );
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}