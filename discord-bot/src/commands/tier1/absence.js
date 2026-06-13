const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, success, error } = require('../../utils/embeds');
const cfg = require('../../utils/config');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

function parseDuration(args) {
  const str = args.join('').toLowerCase();
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

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}

module.exports = {
  name: 'absence',
  tier: 1,
  description: 'Se déclarer absent pour une durée définie',
  usage: '!absence [3j / 2h / 1j6h] [motif]',
  async execute(message, args) {
    const guildId = message.guild.id;
    const { id, username } = message.author;

    // Vérifie une absence déjà active
    const existing = db.getUserAbsence(id, guildId);
    if (existing) {
      return message.reply({ embeds: [error('Déjà absent',
        `Tu as déjà une absence active jusqu'au **${fmtDate(existing.end_time)}**.\nMotif : *${existing.reason}*`
      )] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage',
        '`!absence 3j Vacances` — Absence de 3 jours\n`!absence 2j6h Repos` — Absence de 2j6h\n`!absence 1j` — Sans motif'
      )] });
    }

    // Sépare durée et motif : prend tous les args type durée au début
    const durationArgs = [];
    const reasonArgs   = [];
    let parsingDur = true;
    for (const arg of args) {
      if (parsingDur && /^\d+[jhm]/i.test(arg)) {
        durationArgs.push(arg);
      } else {
        parsingDur = false;
        reasonArgs.push(arg);
      }
    }

    const durSec = parseDuration(durationArgs);
    if (!durSec) {
      return message.reply({ embeds: [error('Durée invalide',
        'Utilise le format : `3j`, `2h`, `30m`, `1j6h30m`…'
      )] });
    }

    const reason    = reasonArgs.join(' ') || 'Non précisé';
    const now       = Math.floor(Date.now() / 1000);
    const endTime   = now + durSec;

    db.addAbsence(id, username, guildId, reason, now, endTime);

    // ── DM de confirmation ──────────────────────────────────────
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('🌙 | Absence enregistrée')
      .setDescription('Ton absence a bien été enregistrée. Tu seras notifié(e) automatiquement à la fin.')
      .addFields(
        { name: '📅 Début',       value: fmtDate(now),    inline: true },
        { name: '📅 Fin prévue',  value: fmtDate(endTime), inline: true },
        { name: '⏱️ Durée',       value: durLabel(durSec), inline: true },
        { name: '📋 Motif',       value: reason,           inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Absence` });

    try { await message.author.send({ embeds: [dmEmbed] }); } catch {}

    // ── Formulaire dans le salon logs ───────────────────────────
    const connexionChannelId = cfg.getConnexionChannelId(guildId);
    const logsChannelId      = cfg.getLogsChannelId(guildId);
    const targetChannelId    = logsChannelId || connexionChannelId;

    if (targetChannelId) {
      const ch = message.client.channels.cache.get(targetChannelId);
      if (ch) {
        const formEmbed = new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('🌙 | Déclaration d\'absence')
          .setDescription(`Le membre <@${id}> a déclaré une absence.`)
          .addFields(
            { name: '👤 Membre',      value: `<@${id}>`,     inline: true },
            { name: '⏱️ Durée',       value: durLabel(durSec), inline: true },
            { name: '\u200B',         value: '\u200B',         inline: true },
            { name: '📅 Début',       value: fmtDate(now),    inline: true },
            { name: '📅 Fin prévue',  value: `${fmtDate(endTime)}\n<t:${endTime}:R>`, inline: true },
            { name: '\u200B',         value: '\u200B',         inline: true },
            { name: '📋 Motif',       value: reason,           inline: false },
          )
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `${BOT()} • Formulaire d'absence` });

        await ch.send({ content: '@here', allowedMentions: { parse: ['everyone'] }, embeds: [formEmbed] });
      }
    }

    return message.reply({ embeds: [success('Absence enregistrée 🌙',
      `Ton absence de **${durLabel(durSec)}** a été déclarée.\nFin prévue : **${fmtDate(endTime)}**`
    )] });
  }
};
