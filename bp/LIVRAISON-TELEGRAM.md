# 📲 Comment livrer l'app au client via Telegram

## Le principe en une phrase
Vous mettez l'app sur **GitHub Pages** (hébergement GRATUIT, HTTPS automatique).
Vous envoyez le lien par **Telegram**. Le client clique → l'app s'ouvre → il installe sur son téléphone → il utilise sans Wi-Fi.

---

## ÉTAPE 1 — Créer un compte GitHub (5 min, gratuit)

1. Aller sur **https://github.com**
2. Cliquer **Sign up** → remplir le formulaire
3. Vérifier votre email

---

## ÉTAPE 2 — Créer le dépôt et envoyer les fichiers (3 min)

### Option A — Interface web (sans Git, la plus simple)

1. Sur GitHub, cliquer **"New repository"** (bouton vert)
2. Nom du dépôt : `budget-pro` (tout en minuscules)
3. Cocher **"Public"** (obligatoire pour GitHub Pages gratuit)
4. Cliquer **"Create repository"**
5. Cliquer **"uploading an existing file"**
6. Glisser-déposer TOUS les fichiers du dossier projet :
   - `index.html`
   - `style.css`
   - `app.js`
   - `db.js`
   - `sw.js`
   - `manifest.json`
   - `.gitignore`
   - Dossier `icons/` (avec toutes les icônes)
7. Cliquer **"Commit changes"**

### Option B — Ligne de commande (si Git installé)

```bash
cd budget-pro/           # Aller dans le dossier du projet
git init
git add .
git commit -m "feat: budget pro pwa v1"
git remote add origin https://github.com/VOTRE_USERNAME/budget-pro.git
git push -u origin main
```

---

## ÉTAPE 3 — Activer GitHub Pages (2 min)

1. Sur la page du dépôt → onglet **Settings**
2. Dans le menu gauche → **Pages**
3. Section "Build and deployment" :
   - Source : **Deploy from a branch**
   - Branch : **main**
   - Dossier : **/ (root)**
4. Cliquer **Save**
5. Attendre 1-2 minutes

✅ **Votre URL sera :**
```
https://VOTRE_USERNAME.github.io/budget-pro/
```
*(remplacez VOTRE_USERNAME par votre nom GitHub)*

---

## ÉTAPE 4 — Envoyer sur Telegram (30 secondes)

Dans Telegram, envoyez simplement ce message au client :

```
Bonjour ! Voici votre application Budget Pro 👇

🔗 https://VOTRE_USERNAME.github.io/budget-pro/

📱 Pour l'installer sur votre téléphone :
  Android : ouvrez le lien dans Chrome → tap "Ajouter à l'écran d'accueil"
  iPhone  : ouvrez le lien dans Safari → bouton Partager → "Sur l'écran d'accueil"

✅ Après installation, l'app fonctionne SANS connexion internet.
```

---

## Ce que vit le client

1. Il reçoit le lien sur Telegram
2. Il clique → l'app s'ouvre dans Chrome/Safari
3. Chrome lui propose **"Ajouter à l'écran d'accueil"** (comme une vraie app)
4. Il confirme → une icône "Budget Pro" apparaît sur son téléphone
5. Il clique sur l'icône → l'app s'ouvre **en plein écran, sans barre de navigateur**
6. Il crée son compte (nom + PIN)
7. Il commence à enregistrer ses dépenses
8. L'app fonctionne même **sans connexion internet**

---

## Questions fréquentes

**Q : Le client doit-il repayer chaque mois ?**
R : Non. GitHub Pages est 100% gratuit pour les projets publics.

**Q : Les données sont-elles sécurisées ?**
R : Oui. Les données restent sur l'appareil du client (IndexedDB).
   Personne d'autre n'y a accès, pas même vous.

**Q : Si le client change de téléphone ?**
R : Il réinstalle l'app depuis le même lien et recrée son compte.
   (Pour migrer les données, une fonction export/import peut être ajoutée)

**Q : L'app marche sur iPhone ?**
R : Oui, via Safari. Sur iPhone, il faut obligatoirement utiliser Safari
   (pas Chrome) pour l'installation PWA.

**Q : Vous mettez à jour l'app, le client récupère automatiquement ?**
R : Oui ! Vous poussez les modifications sur GitHub, le client reçoit
   la mise à jour au prochain lancement de l'app.
