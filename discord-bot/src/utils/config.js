const pg = require('../db/pg');

const DEFAULTS = {
  tier2_role_id:          '',
  tier3_role_id:          '',
  bot_manager_role_id:    '',
  active_role_id:         '',
  ping_role_id:           '',
  enregistree_role_id:    '',
  maintenance_mode:       '0',
  logs_channel_id:        '',
  connexion_channel_id:   '',
  admin_channel_id:       '',
  manager_channel_id:     '',
  absence_log_channel_id: '',
  rapport_start_date:     '',
  partner_guild_id:       '',
  rapport_role_id:        '',
  co_enabled:             '1',
};

const cache = {};

async function loadCache() {
  try {
    const res = await pg.query('SELECT guild_id, key, value FROM guild_config');
    for (const row of res.rows) {
      cache[`${row.guild_id}:${row.key}`] = row.value;
    }
    console.log(`[Config] ${res.rows.length} entrée(s) chargée(s) depuis Railway DB.`);
    return res.rows.length;
  } catch (err) {
    console.error('[Config] Erreur chargement depuis PG :', err.message);
    return 0;
  }
}

function getCachedKeyCount(guildId) {
  return Object.keys(cache).filter(k => k.startsWith(`${guildId}:`)).length;
}

function get(key, guildId = 'global') {
  const val = cache[`${guildId}:${key}`];
  return (val !== undefined && val !== null && val !== '') ? val : (DEFAULTS[key] ?? null);
}

async function set(key, value, guildId = 'global') {
  cache[`${guildId}:${key}`] = value;
  try {
    await pg.query(
      `INSERT INTO guild_config (guild_id, key, value, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id, key) DO UPDATE SET value = $3, updated_at = $4`,
      [guildId, key, value, Math.floor(Date.now() / 1000)]
    );
  } catch (err) {
    console.error('[Config] Erreur écriture PG :', err.message);
  }
}

function invalidateCache(guildId) {
  Object.keys(cache).forEach(k => { if (k.startsWith(`${guildId}:`)) delete cache[k]; });
}

function isMaintenance(guildId)           { return get('maintenance_mode', guildId) === '1'; }
function getLogsChannelId(guildId)        { return get('logs_channel_id', guildId) || null; }
function getConnexionChannelId(guildId)   { return get('connexion_channel_id', guildId) || null; }
function getAdminChannelId(guildId)       { return get('admin_channel_id', guildId) || null; }
function getManagerChannelId(guildId)     { return get('manager_channel_id', guildId) || null; }
function getAbsenceLogChannelId(guildId)  { return get('absence_log_channel_id', guildId) || null; }
function getTier2RoleId(guildId)          { return get('tier2_role_id', guildId) || null; }
function getTier3RoleId(guildId)          { return get('tier3_role_id', guildId) || null; }
function getBotManagerRoleId(guildId)     { return get('bot_manager_role_id', guildId) || null; }
function getActiveRoleId(guildId)         { return get('active_role_id', guildId) || null; }
function getPingRoleId(guildId)           { return get('ping_role_id', guildId) || null; }
function getEnregistreeRoleId(guildId)    { return get('enregistree_role_id', guildId) || null; }
function getRapportStartDate(guildId)     { const v = get('rapport_start_date', guildId); return v ? parseInt(v) : null; }
function getPartnerGuildId(guildId)       { return get('partner_guild_id', guildId) || null; }
function getRapportRoleId(guildId)        { return get('rapport_role_id', guildId) || null; }
function isCoEnabled(guildId)             { return get('co_enabled', guildId) !== '0'; }

module.exports = {
  get, set, loadCache, getCachedKeyCount, invalidateCache, DEFAULTS,
  isMaintenance,
  getLogsChannelId, getConnexionChannelId,
  getAdminChannelId, getManagerChannelId, getAbsenceLogChannelId,
  getTier2RoleId, getTier3RoleId,
  getBotManagerRoleId, getActiveRoleId, getPingRoleId,
  getEnregistreeRoleId, getRapportStartDate, getPartnerGuildId, getRapportRoleId, isCoEnabled,
};
