# 🏆 CONNEXION BOT

Bot Discord de gestion des connexions avec système de tiers de permissions, rapport d'activité, tracking messages/vocal, et dashboard de configuration.

---

## 🚀 Mise en route rapide

### Étape 1 — Créer le bot Discord

1. Va sur [discord.com/developers/applications](https://discord.com/developers/applications)
2. Clique **New Application** → donne un nom à ton bot
3. Onglet **Bot** → clique **Add Bot**
4. Active les **Privileged Gateway Intents** :
   - ✅ `SERVER MEMBERS INTENT`
   - ✅ `MESSAGE CONTENT INTENT`
5. Copie le **Token** (bouton "Reset Token")
6. Onglet **OAuth2 → URL Generator** :
   - Scopes : `bot`
   - Permissions recommandées :
     - `Send Messages` · `Embed Links` · `Read Message History`
     - `Add Reactions` · `Manage Roles` · `View Channels`
     - `Connect` (pour lire les événements vocaux)
7. Copie l'URL OAuth2 générée → ouvre-la dans ton navigateur → invite le bot sur ton serveur

### Étape 2 — Installation locale

```bash
git clone https://github.com/TON-PSEUDO/connexion-bot.git
cd connexion-bot
npm install
cp .env.example .env
# Édite .env et colle ton DISCORD_TOKEN
npm start
```

### Étape 3 — Déploiement Railway

1. Push ce repo sur GitHub
2. Va sur [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Dans **Variables**, ajoute :
   - `DISCORD_TOKEN` = ton token
   - `PREFIX` = `!` (ou autre)
   - `BOT_NAME` = nom de ton bot
4. Railway détecte `railway.toml` et démarre automatiquement
5. ⚠️ Monte un **Volume** sur `/app/data` pour la persistance de la base de données

### Étape 4 — Configuration sur Discord

Une fois le bot en ligne, tape **`!setup`** dans n'importe quel salon (en tant qu'Administrateur) pour voir le dashboard de configuration, puis configure chaque paramètre :

```
!setup tier2 @role-administration   → Rôle Administration (Tier 2)
!setup tier3 @role-gerant           → Rôle Gérant (Tier 3)
!setup botmanager @role-bot         → Rôle Gestionnaire Bot
!setup active @role-actif           → Rôle Membre Actif (donné auto en vocal)
!setup logs #logs                   → Salon des logs automatiques
!setup connexion #connexion         → Salon dédié !c / !d
!setup admin #admin-cmds            → Salon réservé commandes Tier 2
!setup manager #manager-cmds        → Salon réservé commandes Tier 3
!setup maintenance on/off           → Mode maintenance
```

---

## 📋 Toutes les commandes

### Tier 1 — Tout le monde

| Commande | Description |
|---|---|
| `!c` | Démarrer une connexion |
| `!d` | Terminer une connexion |
| `!me` | Voir son profil complet |
| `!online` | Voir les personnes connectées |
| `!ping` | Latence du bot |
| `!info` | Informations du bot |
| `!badge` | Système de badges |
| `!update` | Dernière mise à jour |
| `!msgtop [#salon]` | Classement des messages |
| `!vocaltop [#salon]` | Classement temps vocal |
| `!suggestion [texte]` | Envoyer une suggestion |
| `!help` | Liste des commandes |

### Tier 2 — @Administration

| Commande | Description |
|---|---|
| `!check [@user]` | Infos complètes d'un membre |
| `!view` | Classement des connexions |
| `!msgs [@user] [7j/30j] [#salon]` | Messages d'une personne sur une période |
| `!activite [@user] [7j/30j]` | Activité complète (co + msgs + vocal) |
| `!rapport [#salon] [7j/30j]` | Rapport global du serveur |

### Tier 3 — @Gérant

| Commande | Description |
|---|---|
| `!co [@user]` | Connecter un membre de force |
| `!deco [@user]` | Déconnecter un membre de force |
| `!delete [id]` | Supprimer un membre de la BDD |
| `!reset` | Réinitialiser toutes les données |
| `!add [n] [@user]` | Ajouter N connexions |
| `!remove [n] [@user]` | Retirer N connexions |
| `!rewind [date1] [date2] [@user]` | Recalculer sur une période |
| `!support [texte]` | Signalement à l'équipe |
| `!setup [param] [valeur]` | Dashboard de configuration |

---

## ⚙️ Variables d'environnement

| Variable | Description | Requis |
|---|---|---|
| `DISCORD_TOKEN` | Token du bot Discord | ✅ Oui |
| `PREFIX` | Préfixe (défaut `!`) | Non |
| `BOT_NAME` | Nom du bot | Non |
| `TIER2_ROLE_ID` | ID rôle Administration (fallback) | Non |
| `TIER3_ROLE_ID` | ID rôle Gérant (fallback) | Non |
| `SUGGESTIONS_CHANNEL_ID` | ID salon suggestions | Non |
| `SUPPORT_CHANNEL_ID` | ID salon signalements | Non |
| `DB_PATH` | Chemin dossier SQLite | Non |

> Les rôles et salons peuvent aussi être configurés directement avec `!setup` — c'est enregistré dans la base de données par serveur.

---

## 📁 Structure du projet

```
connexion-bot/
├── src/
│   ├── index.js              — Point d'entrée + events (vocal, messages)
│   ├── database.js           — Base de données SQLite (toutes les tables)
│   ├── commandHandler.js     — Dispatch commandes + guards (maintenance, salon)
│   ├── utils/
│   │   ├── embeds.js         — Helpers embeds Discord
│   │   ├── helpers.js        — Résolution membres, vérif rôles
│   │   ├── config.js         — Config par serveur (avec cache)
│   │   └── logger.js         — Logs automatiques dans salon configuré
│   └── commands/
│       ├── tier1/            — Commandes accessibles à tous
│       ├── tier2/            — Commandes Administration
│       └── tier3/            — Commandes Gérant + !setup
├── .env.example
├── railway.toml
├── Procfile
└── package.json
```

---

## 🤖 Fonctionnalités automatiques

- 📊 **Tracking messages** — chaque message est comptabilisé par salon
- 🎙️ **Tracking vocal** — entrées/sorties/changements de salon enregistrés automatiquement
- 🟢 **Rôle Actif** — attribué automatiquement quand un membre rejoint un vocal, retiré quand il part
- 📋 **Logs automatiques** — connexions vocales et événements importants envoyés dans le salon configuré
- 🔧 **Mode maintenance** — bloque toutes les commandes sauf pour les administrateurs

---

*Développé avec ❤️ — discord.js v14 + SQLite (better-sqlite3)*
