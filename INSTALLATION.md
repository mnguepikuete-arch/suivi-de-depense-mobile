# 📱 Budget Pro — Guide d'installation

## ✅ Ce qui a changé (v4 — version finale)

| Avant | Maintenant |
|-------|-----------|
| Nécessite Laragon + PHP + MySQL allumés | **Aucun serveur requis** |
| Données sur le PC uniquement | **Données sur l'appareil** (IndexedDB) |
| Impossible sur smartphone seul | **Fonctionne comme WhatsApp** |
| Erreurs PHP/SQL fréquentes | **Zéro backend = zéro erreur serveur** |

---

## 🚀 Option 1 — GitHub Pages (RECOMMANDÉ)

C'est la façon la plus simple d'avoir une vraie app installable sur tous les smartphones.

### Étapes (une seule fois)

```bash
# 1. Dans le dossier du projet
git init
git add .
git commit -m "feat: budget pro v4 - pwa standalone"
git remote add origin https://github.com/VOTRE_USERNAME/budget-pro.git
git push -u origin main
```

**Sur GitHub.com :**
1. Aller sur votre dépôt → **Settings** → **Pages**
2. Source : **Deploy from a branch** → Branch : **main** → **/ (root)**
3. Cliquer **Save**

Votre URL sera : `https://VOTRE_USERNAME.github.io/budget-pro/`

**Partager cette URL via Telegram** → le destinataire ouvre dans Chrome → installe → utilise offline.

---

## 📲 Installer sur Android (Chrome)

1. Ouvrir Chrome → aller sur l'URL de l'app
2. Chrome affiche "Ajouter à l'écran d'accueil" → **Confirmer**
3. L'icône Budget Pro apparaît → l'app s'ouvre en plein écran comme WhatsApp

## 🍎 Installer sur iPhone (Safari uniquement)

1. Ouvrir **Safari** (pas Chrome)
2. Aller sur l'URL → bouton Partager ↑ → **Sur l'écran d'accueil**
3. Confirmer → icône sur l'écran d'accueil

---

## 💾 Base de données

**IndexedDB** = base de données native du navigateur/smartphone.
- Stockée directement sur l'appareil (comme les contacts WhatsApp)
- Jusqu'à plusieurs GB de données
- Fonctionne 100% hors ligne
- Persist entre les sessions (données jamais perdues)

## 🔐 Authentification

- PIN local de 4 à 6 chiffres (hashé SHA-256, jamais en clair)
- Aucun compte en ligne requis
- Plusieurs utilisateurs sur le même appareil possible

## 📊 Nouveautés v4

- ✅ Filtre **Aujourd'hui**
- ✅ Filtre **3 derniers jours**
- ✅ Tooltips graphiques affichent le **vrai montant FCFA**
- ✅ 5 types de graphiques (Barres, Camembert, Anneau, Courbe, Mois)
- ✅ Fonctionne sans connexion après installation
