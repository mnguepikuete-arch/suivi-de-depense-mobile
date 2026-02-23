/**
 * db.js — Base de données locale (IndexedDB)
 * ============================================================
 * IndexedDB est la base de données intégrée dans tous les
 * navigateurs modernes (Chrome, Firefox, Safari).
 * Elle stocke les données DIRECTEMENT sur l'appareil,
 * exactement comme SQLite dans une application native.
 *
 * Avantages vs localStorage :
 *   ✅ Peut stocker des milliers d'enregistrements sans limite
 *   ✅ Requêtes par index (filtrage rapide)
 *   ✅ Données structurées (objets JavaScript complets)
 *   ✅ Fonctionne 100% hors ligne — aucun serveur requis
 *
 * Avantages vs MySQL/PHP :
 *   ✅ Aucune installation (Laragon, PHP, MySQL...)
 *   ✅ Fonctionne directement sur le smartphone
 *   ✅ Pas besoin de Wi-Fi ou de serveur allumé
 * ============================================================
 */

'use strict';

// ── Constantes de la base de données ─────────────────────────
const DB_NAME    = 'BudgetProDB';
const DB_VERSION = 1;             // Incrémenter pour migrer le schéma

// Variable globale qui contiendra la connexion ouverte
let _db = null;

/**
 * openDB() — Ouvrir (ou créer) la base de données
 *
 * Retourne une Promise qui se résout avec l'objet IDBDatabase.
 * À appeler UNE SEULE FOIS au démarrage (résultat mis en cache).
 */
function openDB() {
  if (_db) return Promise.resolve(_db); // Déjà ouverte

  return new Promise((resolve, reject) => {
    // indexedDB.open() : ouvre ou crée la base
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // ── onupgradeneeded : appelé à la création ou migration ──
    // C'est ici qu'on définit le "schéma" (équivalent du CREATE TABLE)
    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // ── Store "users" ─────────────────────────────────────
      // Équivalent de la table SQL "users"
      if (!db.objectStoreNames.contains('users')) {
        const users = db.createObjectStore('users', {
          keyPath: 'id',          // Clé primaire
          autoIncrement: true     // Auto-incrémenté
        });
        users.createIndex('username', 'username', { unique: true });
      }

      // ── Store "expenses" ──────────────────────────────────
      // Équivalent de la table SQL "expenses"
      if (!db.objectStoreNames.contains('expenses')) {
        const expenses = db.createObjectStore('expenses', {
          keyPath: 'id',
          autoIncrement: true
        });
        // Index pour filtrer/trier efficacement par date et catégorie
        expenses.createIndex('user_id',  'user_id',  { unique: false });
        expenses.createIndex('date',     'date',     { unique: false });
        expenses.createIndex('category', 'category', { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * dbGet(store, key) — Lire un enregistrement par sa clé
 */
function dbGet(store, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

/**
 * dbGetByIndex(store, indexName, value) — Lire par index
 * Exemple : dbGetByIndex('users', 'username', 'admin')
 */
function dbGetByIndex(store, indexName, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const idx = tx.objectStore(store).index(indexName);
    const req = idx.get(value);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  }));
}

/**
 * dbGetAll(store) — Lire TOUS les enregistrements d'un store
 */
function dbGetAll(store) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

/**
 * dbGetAllByIndex(store, indexName, value) — Lire plusieurs par index
 * Exemple : toutes les dépenses d'un utilisateur
 */
function dbGetAllByIndex(store, indexName, value) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx    = db.transaction(store, 'readonly');
    const idx   = tx.objectStore(store).index(indexName);
    const range = IDBKeyRange.only(value); // Seulement les enregistrements avec cette valeur
    const req   = idx.getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}

/**
 * dbAdd(store, data) — Ajouter un enregistrement
 * Retourne l'ID généré automatiquement
 */
function dbAdd(store, data) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).add(data);
    req.onsuccess = () => resolve(req.result); // req.result = ID généré
    req.onerror   = () => reject(req.error);
  }));
}

/**
 * dbDelete(store, key) — Supprimer un enregistrement par sa clé
 */
function dbDelete(store, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror   = () => reject(req.error);
  }));
}

// ════════════════════════════════════════════════════════════════
// API HAUT NIVEAU — Fonctions métier qui abstraient IndexedDB
// ════════════════════════════════════════════════════════════════

const DB = {

  // ── UTILISATEURS ───────────────────────────────────────────

  /**
   * Créer un compte utilisateur
   * @param {string} username
   * @param {string} pin  - Code PIN (stocké hashé avec SHA-256)
   */
  async createUser(username, pin) {
    const existing = await dbGetByIndex('users', 'username', username.toLowerCase());
    if (existing) throw new Error('Ce nom d\'utilisateur est déjà pris.');

    const pinHash = await hashPin(pin);
    const id = await dbAdd('users', {
      username:  username.toLowerCase(),
      pinHash,
      createdAt: new Date().toISOString()
    });
    return { id, username };
  },

  /**
   * Vérifier un PIN et retourner l'utilisateur
   */
  async verifyUser(username, pin) {
    const user = await dbGetByIndex('users', 'username', username.toLowerCase());
    if (!user) throw new Error('Utilisateur introuvable.');

    const pinHash = await hashPin(pin);
    if (pinHash !== user.pinHash) throw new Error('Code PIN incorrect.');

    return { id: user.id, username: user.username };
  },

  /**
   * Vérifie si au moins un utilisateur existe (première utilisation)
   */
  async hasUsers() {
    const all = await dbGetAll('users');
    return all.length > 0;
  },

  // ── DÉPENSES ───────────────────────────────────────────────

  /**
   * Récupérer les dépenses filtrées
   * @param {number} userId
   * @param {string} period   - 'today'|'3days'|'week'|'month'|'year'|'all'
   * @param {string} category - Catégorie ou 'Toutes'
   */
  async getExpenses(userId, period = 'all', category = 'Toutes') {
    // Récupérer toutes les dépenses de l'utilisateur
    let expenses = await dbGetAllByIndex('expenses', 'user_id', userId);

    // ── Filtre par période ──────────────────────────────────
    const now   = new Date();
    const today = toDateStr(now); // 'YYYY-MM-DD' d'aujourd'hui

    expenses = expenses.filter(e => {
      const d = e.date; // 'YYYY-MM-DD'
      switch (period) {
        case 'today':
          return d === today;
        case '3days': {
          // 3 derniers jours = aujourd'hui + 2 jours avant
          const limit = toDateStr(new Date(now.getTime() - 2 * 86400000));
          return d >= limit;
        }
        case 'week': {
          // Lundi de la semaine courante
          const day  = now.getDay() || 7; // dimanche = 7
          const mon  = new Date(now); mon.setDate(now.getDate() - day + 1);
          return d >= toDateStr(mon);
        }
        case 'month':
          return d.startsWith(today.slice(0, 7)); // même YYYY-MM
        case 'year':
          return d.startsWith(today.slice(0, 4)); // même YYYY
        default:
          return true; // 'all' : tout afficher
      }
    });

    // ── Filtre par catégorie ────────────────────────────────
    if (category !== 'Toutes') {
      expenses = expenses.filter(e => e.category === category);
    }

    // ── Tri : plus récent en premier ────────────────────────
    expenses.sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.hour - a.hour || b.minute - a.minute;
    });

    return expenses;
  },

  /**
   * Ajouter une dépense
   */
  async addExpense(userId, { name, amount, category, date, hour, minute }) {
    if (!name || !name.trim())    throw new Error('Le nom est requis.');
    if (!amount || amount <= 0)   throw new Error('Le montant doit être positif.');
    if (!category)                throw new Error('La catégorie est requise.');
    if (!date)                    throw new Error('La date est requise.');

    const id = await dbAdd('expenses', {
      user_id:   userId,
      name:      name.trim(),
      amount:    parseFloat(amount),
      category,
      date,              // 'YYYY-MM-DD'
      hour:   parseInt(hour)   || 0,
      minute: parseInt(minute) || 0,
      createdAt: new Date().toISOString()
    });
    return id;
  },

  /**
   * Supprimer une dépense (vérifie que ça appartient à l'utilisateur)
   */
  async deleteExpense(userId, expenseId) {
    const expense = await dbGet('expenses', expenseId);
    if (!expense || expense.user_id !== userId) {
      throw new Error('Dépense introuvable.');
    }
    await dbDelete('expenses', expenseId);
    return true;
  },

  /**
   * Statistiques par catégorie (pour les graphiques)
   */
  async getStatsByCategory(userId, period) {
    const expenses = await this.getExpenses(userId, period, 'Toutes');
    const map = {};
    expenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return map; // { 'Alimentation': 15000, 'Transport': 8000, ... }
  },

  /**
   * Statistiques par jour (pour la courbe d'évolution)
   */
  async getStatsByDay(userId, period) {
    const expenses = await this.getExpenses(userId, period, 'Toutes');
    const map = {};
    expenses.forEach(e => {
      map[e.date] = (map[e.date] || 0) + e.amount;
    });
    // Trier les dates chronologiquement
    const sorted = Object.keys(map).sort();
    return {
      labels: sorted.map(d => {
        const [y, m, day] = d.split('-');
        return `${day}/${m}`;
      }),
      data: sorted.map(d => map[d])
    };
  },

  /**
   * Statistiques par mois (12 derniers mois)
   */
  async getStatsByMonth(userId) {
    const all = await dbGetAllByIndex('expenses', 'user_id', userId);
    const now  = new Date();
    const map  = {};

    // Générer les 12 derniers mois (même vides)
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      map[key] = 0;
    }

    all.forEach(e => {
      const key = e.date.slice(0, 7); // 'YYYY-MM'
      if (key in map) map[key] += e.amount;
    });

    const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    return {
      labels: Object.keys(map).map(k => {
        const [y, m] = k.split('-');
        return `${months[parseInt(m)-1]} ${y}`;
      }),
      data: Object.values(map)
    };
  }
};

// ── Utilitaires ───────────────────────────────────────────────

/** Convertit une Date en string 'YYYY-MM-DD' */
function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * hashPin(pin) — Hash SHA-256 du PIN
 * On ne stocke JAMAIS le PIN en clair, même en local.
 * SHA-256 est disponible nativement via l'API Web Crypto.
 */
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data    = encoder.encode('budgetpro_salt_' + pin); // Sel statique
  const buffer  = await crypto.subtle.digest('SHA-256', data);
  // Convertir le buffer en string hexadécimale
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
