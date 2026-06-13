const low  = require('lowdb');
const Mem  = require('lowdb/adapters/Memory');
const pg   = require('./db/pg');

const db = low(new Mem());
db.defaults({
  users: [], sessions: [], badges: [], suggestions: [],
  support_tickets: [], message_stats: [], message_log: [],
  voice_active: [], voice_stats: [], voice_sessions: [],
  warnings: [], absences: [],
}).write();

let _nextId = {};
function nextId(table) {
  const rows = db.get(table).value();
  if (!_nextId[table]) {
    _nextId[table] = rows.length > 0 ? Math.max(...rows.map(r => r.id || 0)) + 1 : 1;
  }
  return _nextId[table]++;
}
const now = () => Math.floor(Date.now() / 1000);
const KEEP_DAYS = 30;

// ── Async fire-and-forget PG write ───────────────────────────────
function pgWrite(sql, params = []) {
  pg.query(sql, params).catch(err => console.error('[DB-PG]', sql.split('\n')[0], err.message));
}

// ── Create all tables ────────────────────────────────────────────
async function createTables() {
  const sqls = [
    `CREATE TABLE IF NOT EXISTS op_users (
      discord_id TEXT PRIMARY KEY, username TEXT,
      total_connexions INT DEFAULT 0, added_connexions INT DEFAULT 0,
      removed_connexions INT DEFAULT 0, session_start BIGINT, created_at BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS op_sessions (
      id BIGINT PRIMARY KEY, discord_id TEXT, start_time BIGINT, end_time BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS op_voice_active (
      discord_id TEXT PRIMARY KEY, guild_id TEXT, channel_id TEXT, username TEXT, join_time BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS op_voice_stats (
      id BIGINT PRIMARY KEY, discord_id TEXT, guild_id TEXT, channel_id TEXT,
      username TEXT, total_seconds BIGINT DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS op_voice_sessions (
      id BIGINT PRIMARY KEY, discord_id TEXT, guild_id TEXT, channel_id TEXT,
      join_time BIGINT, leave_time BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS op_message_stats (
      id BIGINT PRIMARY KEY, discord_id TEXT, guild_id TEXT, channel_id TEXT,
      username TEXT, count INT DEFAULT 0, last_message_at BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS op_message_log (
      id BIGINT PRIMARY KEY, discord_id TEXT, guild_id TEXT, channel_id TEXT,
      username TEXT, sent_at BIGINT
    )`,
    `CREATE TABLE IF NOT EXISTS op_absences (
      id BIGINT PRIMARY KEY, discord_id TEXT, username TEXT, guild_id TEXT,
      reason TEXT, start_time BIGINT, end_time BIGINT,
      ended BOOLEAN DEFAULT FALSE, notified_end BOOLEAN DEFAULT FALSE
    )`,
    `CREATE TABLE IF NOT EXISTS op_warnings (
      id BIGINT PRIMARY KEY, discord_id TEXT, username TEXT, guild_id TEXT,
      issued_by TEXT, reason TEXT, created_at BIGINT
    )`,
  ];
  for (const sql of sqls) await pg.query(sql);
}

// ── Load all PG data into memory ─────────────────────────────────
async function init() {
  try {
    await createTables();

    const cutoff = now() - KEEP_DAYS * 86400;
    // Purge anciens logs (message et voice) pour ne pas surcharger PG
    await pg.query(`DELETE FROM op_message_log  WHERE sent_at  < $1`, [cutoff]);
    await pg.query(`DELETE FROM op_voice_sessions WHERE leave_time IS NOT NULL AND leave_time < $1`, [cutoff]);

    const [users, sessions, vActive, vStats, vSess, msgStats, msgLog, absences, warnings] = await Promise.all([
      pg.query('SELECT * FROM op_users'),
      pg.query('SELECT * FROM op_sessions ORDER BY start_time DESC LIMIT 5000'),
      pg.query('SELECT * FROM op_voice_active'),
      pg.query('SELECT * FROM op_voice_stats'),
      pg.query(`SELECT * FROM op_voice_sessions WHERE join_time >= ${cutoff}`),
      pg.query('SELECT * FROM op_message_stats'),
      pg.query(`SELECT * FROM op_message_log WHERE sent_at >= ${cutoff}`),
      pg.query('SELECT * FROM op_absences'),
      pg.query('SELECT * FROM op_warnings'),
    ]);

    db.set('users',          users.rows).write();
    db.set('sessions',       sessions.rows).write();
    db.set('voice_active',   vActive.rows).write();
    db.set('voice_stats',    vStats.rows).write();
    db.set('voice_sessions', vSess.rows).write();
    db.set('message_stats',  msgStats.rows).write();
    db.set('message_log',    msgLog.rows).write();
    db.set('absences',       absences.rows).write();
    db.set('warnings',       warnings.rows).write();

    // Réinitialiser les compteurs nextId depuis les données chargées
    _nextId = {};

    const total = users.rows.length + sessions.rows.length + vStats.rows.length +
                  msgStats.rows.length + absences.rows.length;
    console.log(`[DB] ${total} enregistrements restaurés depuis Railway PostgreSQL.`);
    return total;
  } catch (err) {
    console.error('[DB] Erreur init PG — démarrage en mode mémoire seule :', err.message);
  }
}

module.exports = {
  init,

  /* ======================== CONNEXIONS ======================== */

  getUser(discordId) {
    return db.get('users').find({ discord_id: discordId }).value() || null;
  },

  createUser(discordId, username) {
    if (this.getUser(discordId)) return;
    const u = { discord_id: discordId, username, total_connexions: 0, session_start: null, created_at: now() };
    db.get('users').push(u).write();
    pgWrite(
      `INSERT INTO op_users (discord_id, username, total_connexions, session_start, created_at)
       VALUES ($1,$2,0,NULL,$3) ON CONFLICT (discord_id) DO NOTHING`,
      [discordId, username, u.created_at]
    );
  },

  startSession(discordId, username) {
    this.createUser(discordId, username);
    const t  = now();
    const id = nextId('sessions');
    db.get('users').find({ discord_id: discordId }).assign({ session_start: t, username }).write();
    db.get('sessions').push({ id, discord_id: discordId, start_time: t, end_time: null }).write();
    pgWrite(
      `UPDATE op_users SET session_start=$1, username=$2 WHERE discord_id=$3`,
      [t, username, discordId]
    );
    pgWrite(
      `INSERT INTO op_sessions (id, discord_id, start_time, end_time) VALUES ($1,$2,$3,NULL)
       ON CONFLICT (id) DO NOTHING`,
      [id, discordId, t]
    );
    return t;
  },

  endSession(discordId) {
    const user = this.getUser(discordId);
    if (!user || user.session_start === null) return null;
    const t        = now();
    const duration = t - user.session_start;
    const newTotal = user.total_connexions + 1;
    db.get('users').find({ discord_id: discordId }).assign({ session_start: null, total_connexions: newTotal }).write();
    const openSession = db.get('sessions').find({ discord_id: discordId, end_time: null }).value();
    if (openSession) db.get('sessions').find({ id: openSession.id }).assign({ end_time: t }).write();
    pgWrite(
      `UPDATE op_users SET session_start=NULL, total_connexions=$1 WHERE discord_id=$2`,
      [newTotal, discordId]
    );
    if (openSession) pgWrite(
      `UPDATE op_sessions SET end_time=$1 WHERE id=$2`,
      [t, openSession.id]
    );
    return { start: user.session_start, end: t, duration };
  },

  isConnected(discordId) {
    const u = this.getUser(discordId);
    return u && u.session_start !== null;
  },

  getOnlineUsers() {
    return db.get('users').filter(u => u.session_start !== null).value();
  },

  getLeaderboard(limit = 10) {
    return db.get('users').sortBy(u => -u.total_connexions).take(limit).value();
  },

  addConnexions(discordId, count) {
    const u = this.getUser(discordId);
    if (!u) return;
    const newTotal = u.total_connexions + count;
    const newAdded = (u.added_connexions || 0) + count;
    db.get('users').find({ discord_id: discordId }).assign({
      total_connexions: newTotal, added_connexions: newAdded,
    }).write();
    pgWrite(
      `UPDATE op_users SET total_connexions=$1, added_connexions=$2 WHERE discord_id=$3`,
      [newTotal, newAdded, discordId]
    );
  },

  removeConnexions(discordId, count) {
    const u = this.getUser(discordId);
    if (!u) return;
    const newTotal   = Math.max(0, u.total_connexions - count);
    const newRemoved = (u.removed_connexions || 0) + count;
    db.get('users').find({ discord_id: discordId }).assign({
      total_connexions: newTotal, removed_connexions: newRemoved,
    }).write();
    pgWrite(
      `UPDATE op_users SET total_connexions=$1, removed_connexions=$2 WHERE discord_id=$3`,
      [newTotal, newRemoved, discordId]
    );
  },

  getUserSessions(discordId) {
    return db.get('sessions')
      .filter(s => s.discord_id === discordId && s.end_time !== null)
      .sortBy(s => -s.start_time).value();
  },

  getSessionHistory(discordId, limit = 25) {
    return db.get('sessions')
      .filter(s => s.discord_id === discordId)
      .sortBy(s => -s.start_time).take(limit).value();
  },

  getUserSessionStats(discordId) {
    const sessions   = db.get('sessions').filter(s => s.discord_id === discordId && s.end_time !== null).value();
    const totalSecs  = sessions.reduce((a, s) => a + (s.end_time - s.start_time), 0);
    const avgSeconds = sessions.length > 0 ? Math.floor(totalSecs / sessions.length) : 0;
    return { totalSessions: sessions.length, totalSeconds: totalSecs, avgSeconds };
  },

  getSessionsInRange(discordId, startTs, endTs) {
    return db.get('sessions').filter(s =>
      s.discord_id === discordId && s.start_time >= startTs && (s.end_time <= endTs || s.end_time === null)
    ).value();
  },

  rewindSessions(discordId, startTs, endTs) {
    const sessions = db.get('sessions').filter(s =>
      s.discord_id === discordId && s.start_time >= startTs && s.end_time !== null && s.end_time <= endTs
    ).value();
    if (sessions.length > 0) this.addConnexions(discordId, sessions.length);
    return sessions.length;
  },

  deleteUser(discordId) {
    ['badges','sessions','message_stats','message_log','voice_stats','voice_sessions'].forEach(t => {
      db.get(t).remove({ discord_id: discordId }).write();
    });
    db.get('voice_active').remove({ discord_id: discordId }).write();
    db.get('users').remove({ discord_id: discordId }).write();
    ['op_sessions','op_message_stats','op_message_log','op_voice_stats','op_voice_sessions','op_voice_active']
      .forEach(t => pgWrite(`DELETE FROM ${t} WHERE discord_id=$1`, [discordId]));
    pgWrite(`DELETE FROM op_users WHERE discord_id=$1`, [discordId]);
  },

  resetAll() {
    db.get('users').each(u => { u.total_connexions = 0; u.session_start = null; }).write();
    ['sessions','badges','message_stats','message_log','voice_stats','voice_sessions','voice_active']
      .forEach(t => db.set(t, []).write());
    _nextId = {};
    ['op_sessions','op_message_stats','op_message_log','op_voice_stats','op_voice_sessions','op_voice_active']
      .forEach(t => pgWrite(`DELETE FROM ${t}`));
    pgWrite(`UPDATE op_users SET total_connexions=0, session_start=NULL, added_connexions=0, removed_connexions=0`);
  },

  /* ======================== BADGES ======================== */

  getUserBadges(discordId) {
    return db.get('badges').filter({ discord_id: discordId }).sortBy(b => -b.obtained_at).value();
  },

  addBadge(discordId, badgeName) {
    const exists = db.get('badges').find({ discord_id: discordId, badge_name: badgeName }).value();
    if (exists) return false;
    db.get('badges').push({ id: nextId('badges'), discord_id: discordId, badge_name: badgeName, obtained_at: now() }).write();
    return true;
  },

  /* ======================== SUGGESTIONS & SUPPORT ======================== */

  addSuggestion(discordId, username, content) {
    db.get('suggestions').push({ id: nextId('suggestions'), discord_id: discordId, username, content, created_at: now() }).write();
  },

  addSupportTicket(discordId, username, content) {
    db.get('support_tickets').push({ id: nextId('support_tickets'), discord_id: discordId, username, content, created_at: now() }).write();
  },

  /* ======================== MESSAGES ======================== */

  recordMessage(discordId, username, channelId, guildId) {
    const t        = now();
    const existing = db.get('message_stats').find({ discord_id: discordId, channel_id: channelId }).value();
    if (existing) {
      const newCount = existing.count + 1;
      db.get('message_stats').find({ discord_id: discordId, channel_id: channelId })
        .assign({ count: newCount, last_message_at: t, username }).write();
      pgWrite(
        `UPDATE op_message_stats SET count=$1, last_message_at=$2, username=$3
         WHERE discord_id=$4 AND channel_id=$5`,
        [newCount, t, username, discordId, channelId]
      );
    } else {
      const id = nextId('message_stats');
      db.get('message_stats').push({ id, discord_id: discordId, username, channel_id: channelId, guild_id: guildId, count: 1, last_message_at: t }).write();
      pgWrite(
        `INSERT INTO op_message_stats (id, discord_id, guild_id, channel_id, username, count, last_message_at)
         VALUES ($1,$2,$3,$4,$5,1,$6) ON CONFLICT (id) DO NOTHING`,
        [id, discordId, guildId, channelId, username, t]
      );
    }
    const logId = nextId('message_log');
    db.get('message_log').push({ id: logId, discord_id: discordId, username, channel_id: channelId, guild_id: guildId, sent_at: t }).write();
    pgWrite(
      `INSERT INTO op_message_log (id, discord_id, guild_id, channel_id, username, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
      [logId, discordId, guildId, channelId, username, t]
    );
  },

  getMsgLeaderboard(guildId, channelId = null, limit = 20) {
    const stats  = db.get('message_stats').filter(s => s.guild_id === guildId && (channelId ? s.channel_id === channelId : true)).value();
    const totals = {};
    stats.forEach(s => {
      if (!totals[s.discord_id]) totals[s.discord_id] = { discord_id: s.discord_id, username: s.username, total: 0, last_msg: 0 };
      totals[s.discord_id].total += s.count;
      if ((s.last_message_at || 0) > totals[s.discord_id].last_msg) totals[s.discord_id].last_msg = s.last_message_at;
    });
    return Object.values(totals).sort((a, b) => b.total - a.total).slice(0, limit);
  },

  getUserMsgStats(discordId, guildId, since = null) {
    if (!since) {
      const stats = db.get('message_stats').filter(s => s.discord_id === discordId && s.guild_id === guildId).value();
      return {
        total:     stats.reduce((a, s) => a + s.count, 0),
        byChannel: stats.map(s => ({ channel_id: s.channel_id, count: s.count })).sort((a, b) => b.count - a.count).slice(0, 10),
      };
    }
    const logs  = db.get('message_log').filter(l => l.discord_id === discordId && l.guild_id === guildId && l.sent_at >= since).value();
    const byCh  = {};
    logs.forEach(l => { byCh[l.channel_id] = (byCh[l.channel_id] || 0) + 1; });
    return {
      total:     logs.length,
      byChannel: Object.entries(byCh).map(([channel_id, count]) => ({ channel_id, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    };
  },

  /* ======================== VOCAL ======================== */

  voiceJoin(discordId, username, channelId, guildId) {
    const t  = now();
    const id = nextId('voice_sessions');
    db.get('voice_active').remove({ discord_id: discordId }).write();
    db.get('voice_active').push({ discord_id: discordId, username, channel_id: channelId, guild_id: guildId, join_time: t }).write();
    db.get('voice_sessions').push({ id, discord_id: discordId, channel_id: channelId, guild_id: guildId, join_time: t, leave_time: null }).write();
    pgWrite(
      `INSERT INTO op_voice_active (discord_id, guild_id, channel_id, username, join_time)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (discord_id) DO UPDATE SET guild_id=$2, channel_id=$3, username=$4, join_time=$5`,
      [discordId, guildId, channelId, username, t]
    );
    pgWrite(
      `INSERT INTO op_voice_sessions (id, discord_id, guild_id, channel_id, join_time, leave_time)
       VALUES ($1,$2,$3,$4,$5,NULL) ON CONFLICT (id) DO NOTHING`,
      [id, discordId, guildId, channelId, t]
    );
  },

  voiceLeave(discordId) {
    const active = db.get('voice_active').find({ discord_id: discordId }).value();
    if (!active) return null;
    const t        = now();
    const duration = t - active.join_time;
    const existing = db.get('voice_stats').find({ discord_id: discordId, channel_id: active.channel_id }).value();
    if (existing) {
      const newSecs = existing.total_seconds + duration;
      db.get('voice_stats').find({ discord_id: discordId, channel_id: active.channel_id })
        .assign({ total_seconds: newSecs, username: active.username }).write();
      pgWrite(
        `UPDATE op_voice_stats SET total_seconds=$1, username=$2 WHERE discord_id=$3 AND channel_id=$4`,
        [newSecs, active.username, discordId, active.channel_id]
      );
    } else {
      const id = nextId('voice_stats');
      db.get('voice_stats').push({ id, discord_id: discordId, username: active.username, channel_id: active.channel_id, guild_id: active.guild_id, total_seconds: duration }).write();
      pgWrite(
        `INSERT INTO op_voice_stats (id, discord_id, guild_id, channel_id, username, total_seconds)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [id, discordId, active.guild_id, active.channel_id, active.username, duration]
      );
    }
    const openSess = db.get('voice_sessions').find({ discord_id: discordId, leave_time: null }).value();
    if (openSess) {
      db.get('voice_sessions').find({ id: openSess.id }).assign({ leave_time: t }).write();
      pgWrite(`UPDATE op_voice_sessions SET leave_time=$1 WHERE id=$2`, [t, openSess.id]);
    }
    db.get('voice_active').remove({ discord_id: discordId }).write();
    pgWrite(`DELETE FROM op_voice_active WHERE discord_id=$1`, [discordId]);
    return { duration, channelId: active.channel_id };
  },

  getVocalLeaderboard(guildId, channelId = null, limit = 20) {
    const stats  = db.get('voice_stats').filter(s => s.guild_id === guildId && (channelId ? s.channel_id === channelId : true)).value();
    const totals = {};
    stats.forEach(s => {
      if (!totals[s.discord_id]) totals[s.discord_id] = { discord_id: s.discord_id, username: s.username, total: 0 };
      totals[s.discord_id].total += s.total_seconds;
    });
    const active = db.get('voice_active').filter(v => v.guild_id === guildId && (channelId ? v.channel_id === channelId : true)).value();
    active.forEach(v => {
      const live = now() - v.join_time;
      if (!totals[v.discord_id]) totals[v.discord_id] = { discord_id: v.discord_id, username: v.username, total: 0 };
      totals[v.discord_id].total += live;
    });
    return Object.values(totals).sort((a, b) => b.total - a.total).slice(0, limit);
  },

  getUserVocalStats(discordId, guildId) {
    const stats      = db.get('voice_stats').filter(s => s.discord_id === discordId && s.guild_id === guildId).value();
    const total      = stats.reduce((a, s) => a + s.total_seconds, 0);
    const byChannel  = stats.map(s => ({ channel_id: s.channel_id, total_seconds: s.total_seconds })).sort((a, b) => b.total_seconds - a.total_seconds).slice(0, 10);
    const active     = db.get('voice_active').find({ discord_id: discordId }).value();
    const liveSeconds = active ? now() - active.join_time : 0;
    return { total: total + liveSeconds, byChannel, isLive: !!active, liveSeconds };
  },

  getVocalSessionsSince(discordId, guildId, since) {
    return db.get('voice_sessions').filter(s =>
      s.discord_id === discordId && s.guild_id === guildId && s.join_time >= since
    ).map(s => ({ ...s, duration: (s.leave_time || now()) - s.join_time })).value();
  },

  getFullRapport(guildId, channelId = null, since = null) {
    const users      = db.get('users').filter(u => u.total_connexions > 0).value();
    const msgStats   = db.get('message_stats').filter(s => s.guild_id === guildId && (channelId ? s.channel_id === channelId : true)).value();
    const msgLog     = since ? db.get('message_log').filter(l => l.guild_id === guildId && l.sent_at >= since && (channelId ? l.channel_id === channelId : true)).value() : null;
    const vocalStats = db.get('voice_stats').filter(s => s.guild_id === guildId && (channelId ? s.channel_id === channelId : true)).value();
    const activeVoice = db.get('voice_active').filter(v => v.guild_id === guildId).value();

    const msgTotals = {};
    (msgLog || msgStats).forEach(s => {
      const id = s.discord_id;
      if (!msgTotals[id]) msgTotals[id] = { username: s.username, total: 0 };
      msgTotals[id].total += (s.count || 1);
    });

    const vocalTotals = {};
    vocalStats.forEach(s => {
      if (!vocalTotals[s.discord_id]) vocalTotals[s.discord_id] = { username: s.username, total: 0 };
      vocalTotals[s.discord_id].total += s.total_seconds;
    });
    activeVoice.forEach(v => {
      const live = now() - v.join_time;
      if (!vocalTotals[v.discord_id]) vocalTotals[v.discord_id] = { username: v.username, total: 0 };
      vocalTotals[v.discord_id].total += live;
    });

    const allIds = new Set([...users.map(u => u.discord_id), ...Object.keys(msgTotals), ...Object.keys(vocalTotals)]);

    return Array.from(allIds).map(id => {
      const u = users.find(u => u.discord_id === id) || {};
      const m = msgTotals[id] || {};
      const v = vocalTotals[id] || {};
      return { discord_id: id, username: u.username || m.username || v.username || id, connexions: u.total_connexions || 0, messages: m.total || 0, vocal_seconds: v.total || 0 };
    }).filter(u => u.connexions > 0 || u.messages > 0 || u.vocal_seconds > 0)
      .sort((a, b) => (b.connexions + b.messages + Math.floor(b.vocal_seconds / 60)) - (a.connexions + a.messages + Math.floor(a.vocal_seconds / 60)));
  },

  /* ======================== WARNINGS ======================== */

  addWarning(discordId, username, guildId, issuedBy, reason) {
    const id = nextId('warnings');
    const t  = now();
    db.get('warnings').push({ id, discord_id: discordId, username, guild_id: guildId, issued_by: issuedBy, reason: reason || null, created_at: t }).write();
    pgWrite(
      `INSERT INTO op_warnings (id, discord_id, username, guild_id, issued_by, reason, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [id, discordId, username, guildId, issuedBy, reason || null, t]
    );
  },

  getWarnings(discordId, guildId) {
    return db.get('warnings').filter({ discord_id: discordId, guild_id: guildId }).sortBy('created_at').value();
  },

  clearWarnings(discordId, guildId) {
    db.get('warnings').remove({ discord_id: discordId, guild_id: guildId }).write();
    pgWrite(`DELETE FROM op_warnings WHERE discord_id=$1 AND guild_id=$2`, [discordId, guildId]);
  },

  /* ======================== ABSENCES ======================== */

  addAbsence(discordId, username, guildId, reason, startTime, endTime) {
    const id = nextId('absences');
    db.get('absences').push({ id, discord_id: discordId, username, guild_id: guildId, reason: reason || 'Non précisé', start_time: startTime, end_time: endTime, ended: false, notified_end: false }).write();
    pgWrite(
      `INSERT INTO op_absences (id, discord_id, username, guild_id, reason, start_time, end_time, ended, notified_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,FALSE) ON CONFLICT (id) DO NOTHING`,
      [id, discordId, username, guildId, reason || 'Non précisé', startTime, endTime]
    );
  },

  getUserAbsence(discordId, guildId) {
    const nowTs = now();
    return db.get('absences')
      .filter(a => a.discord_id === discordId && a.guild_id === guildId && !a.ended && a.end_time > nowTs)
      .sortBy('end_time').last().value() || null;
  },

  getActiveAbsences(guildId) {
    const nowTs = now();
    return db.get('absences').filter(a => a.guild_id === guildId && !a.ended && a.end_time > nowTs).sortBy('end_time').value();
  },

  getExpiredAbsences() {
    const nowTs = now();
    return db.get('absences').filter(a => !a.ended && !a.notified_end && a.end_time <= nowTs).value();
  },

  endAbsence(id) {
    db.get('absences').find({ id }).assign({ ended: true, notified_end: true }).write();
    pgWrite(`UPDATE op_absences SET ended=TRUE, notified_end=TRUE WHERE id=$1`, [id]);
  },

  deleteAbsence(discordId, guildId) {
    const removed = db.get('absences').filter(a => a.discord_id === discordId && a.guild_id === guildId && !a.ended).value();
    db.get('absences').remove(a => a.discord_id === discordId && a.guild_id === guildId && !a.ended).write();
    removed.forEach(a => pgWrite(`DELETE FROM op_absences WHERE id=$1`, [a.id]));
  },

  /* ======================== RECAP ======================== */

  getUserRecap(discordId, guildId, since) {
    const sessions      = db.get('sessions').filter(s => s.discord_id === discordId && s.start_time >= since && s.end_time !== null).value();
    const connexions    = sessions.length;
    const connexionTime = sessions.reduce((a, s) => a + (s.end_time - s.start_time), 0);
    const messages      = db.get('message_log').filter(l => l.discord_id === discordId && l.guild_id === guildId && l.sent_at >= since).value().length;
    const voiceSessions = db.get('voice_sessions').filter(s => s.discord_id === discordId && s.guild_id === guildId && s.join_time >= since && s.leave_time !== null).value();
    const vocalTime     = voiceSessions.reduce((a, s) => a + (s.leave_time - s.join_time), 0);
    return { connexions, connexionTime, messages, vocalTime };
  },

  /* ======================== CONFIG (legacy lowdb — migré vers PG via config.js) ======================== */

  getConfig(key, guildId = 'global') {
    const row = db.get('guild_config').find({ guild_id: guildId, key }).value();
    return row ? { value: row.value } : null;
  },

  setConfig(key, value, guildId = 'global') {
    const existing = db.get('guild_config').find({ guild_id: guildId, key }).value();
    if (existing) {
      db.get('guild_config').find({ guild_id: guildId, key }).assign({ value, updated_at: now() }).write();
    } else {
      db.get('guild_config').push({ id: nextId('guild_config'), guild_id: guildId, key, value, updated_at: now() }).write();
    }
  },

  getAllConfig(guildId = 'global') {
    return db.get('guild_config').filter({ guild_id: guildId }).value();
  },
};
