const db  = require('../database');
const cfg = require('./config');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('./embeds');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}

function buildEmbed(absences) {
  if (absences.length === 0) {
    return new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('🌙 | Absences en cours')
      .setDescription('✅ Aucune absence active pour le moment.\nTout le monde est disponible !')
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Mis à jour automatiquement` });
  }

  const now   = Math.floor(Date.now() / 1000);
  const lines = absences.map((a, i) => {
    const remaining = a.end_time - now;
    const d = Math.floor(remaining / 86400);
    const h = Math.floor((remaining % 86400) / 3600);
    const remLabel = d > 0 ? `${d}j ${h}h restants` : `${h}h restantes`;
    return [
      `**${i + 1}.** <@${a.discord_id}> — retour <t:${a.end_time}:R>`,
      `> 📋 ${a.reason}  ·  ⏱️ ${remLabel}  ·  📅 ${fmtDate(a.end_time)}`,
    ].join('\n');
  });

  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(`🌙 | Absences en cours — ${absences.length} membre${absences.length > 1 ? 's' : ''}`)
    .setDescription(lines.join('\n\n'))
    .setTimestamp()
    .setFooter({ text: `${BOT()} • Mis à jour automatiquement` });
}

async function updateAbsenceBoard(client, guild) {
  try {
    const guildId   = guild.id;
    const channelId = cfg.get('absence_channel_id', guildId);
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId)
      || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const absences = db.getActiveAbsences(guildId);
    const embed    = buildEmbed(absences);

    const msgId = cfg.get('absence_board_message_id', guildId);
    if (msgId) {
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) {
        await msg.edit({ embeds: [embed] });
        return;
      }
    }

    const newMsg = await channel.send({ embeds: [embed] });
    await cfg.set('absence_board_message_id', newMsg.id, guildId);
  } catch (e) {
    console.error('[AbsenceBoard] Erreur mise à jour :', e.message);
  }
}

function parseDuration(str) {
  str = str.toLowerCase().trim();
  let sec = 0;
  const d = str.match(/(\d+)j/);
  const h = str.match(/(\d+)h/);
  const m = str.match(/(\d+)m/);
  if (d) sec += parseInt(d[1]) * 86400;
  if (h) sec += parseInt(h[1]) * 3600;
  if (m) sec += parseInt(m[1]) * 60;
  return sec > 0 ? sec : null;
}

function durLabel(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}j`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  return parts.join(' ') || '0m';
}

module.exports = { updateAbsenceBoard, buildEmbed, parseDuration, durLabel, fmtDate };
