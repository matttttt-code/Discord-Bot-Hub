const { EmbedBuilder } = require('discord.js');

let _client = null;

const OWNER_DM_ID = '1209963350218248203';

function init(client) {
  _client = client;
}

const LOG_COLORS = {
  connexion: 0x57F287,
  deconnexion: 0xFF4757,
  admin: 0x5865F2,
  warning: 0xFEE75C,
  info: 0xADB5BD,
  config: 0xFFD700,
  maintenance: 0xFF6B35,
};

async function log(guildId, type, title, fields = [], description = null) {
  if (!_client) return;

  const embed = new EmbedBuilder()
    .setColor(LOG_COLORS[type] || 0xADB5BD)
    .setTitle(`📋 ${title}`)
    .setTimestamp()
    .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Logs` });

  if (description) embed.setDescription(description);
  if (fields.length > 0) embed.addFields(fields);

  // Envoi dans le salon logs configuré
  try {
    const cfg = require('./config');
    const channelId = cfg.getLogsChannelId(guildId);
    if (channelId) {
      const channel = _client.channels.cache.get(channelId);
      if (channel) await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[Logger] Erreur salon :', err.message);
  }

  // Envoi en MP à l'owner
  try {
    const ownerUser = await _client.users.fetch(OWNER_DM_ID).catch(() => null);
    if (ownerUser) await ownerUser.send({ embeds: [embed] });
  } catch {}
}

module.exports = { init, log, LOG_COLORS };
