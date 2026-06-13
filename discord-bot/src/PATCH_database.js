// ═══════════════════════════════════════════════════════════════════
//  PATCH pour database.js — Ajouter le support des notes internes
//  Copiez ces blocs dans votre fichier discord-bot/src/database.js
// ═══════════════════════════════════════════════════════════════════

// ── ÉTAPE 1 ──────────────────────────────────────────────────────
// Dans db.defaults({...}).write(), ajoutez "notes: []" :
//
//   db.defaults({
//     users: [], sessions: [], suggestions: [],
//     support_tickets: [], message_stats: [], message_log: [],
//     voice_active: [], voice_stats: [], voice_sessions: [],
//     warnings: [], absences: [], rewind_log: [],
//     notes: [],          // <-- AJOUTER CETTE LIGNE
//   }).write();


// ── ÉTAPE 2 ──────────────────────────────────────────────────────
// Ajoutez ces 3 fonctions à la fin de database.js,
// juste avant la ligne module.exports = { ... } :

function addNote(discordId, guildId, content, author) {
  const note = {
    id:         nextId('notes'),
    discord_id: discordId,
    guild_id:   guildId,
    content,
    author,
    created_at: now(),
  };
  db.get('notes').push(note).write();

  pg.query(
    `INSERT INTO staff_notes (discord_id, guild_id, content, author, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [discordId, guildId, content, author, note.created_at]
  ).catch(() => {});

  return note;
}

function getNotes(discordId, guildId) {
  // Tente de lire depuis PG en priorité, sinon lowdb
  return db.get('notes')
    .filter(n => n.discord_id === discordId && n.guild_id === guildId)
    .sortBy('created_at')
    .reverse()
    .value();
}

function clearNotes(discordId, guildId) {
  const notes = db.get('notes')
    .filter(n => n.discord_id === discordId && n.guild_id === guildId)
    .value();
  const count = notes.length;
  db.get('notes').remove(n => n.discord_id === discordId && n.guild_id === guildId).write();
  pg.query(
    `DELETE FROM staff_notes WHERE discord_id = $1 AND guild_id = $2`,
    [discordId, guildId]
  ).catch(() => {});
  return count;
}


// ── ÉTAPE 3 ──────────────────────────────────────────────────────
// Dans module.exports = { ... }, ajoutez les 3 fonctions :
//
//   module.exports = {
//     ...  (vos exports existants)
//     addNote, getNotes, clearNotes,     // <-- AJOUTER
//   };


// ── ÉTAPE 4 (optionnel mais recommandé) ─────────────────────────
// Créez la table PostgreSQL sur Railway :
//
//   CREATE TABLE IF NOT EXISTS staff_notes (
//     id          SERIAL PRIMARY KEY,
//     discord_id  TEXT NOT NULL,
//     guild_id    TEXT NOT NULL,
//     content     TEXT NOT NULL,
//     author      TEXT NOT NULL,
//     created_at  BIGINT NOT NULL
//   );
