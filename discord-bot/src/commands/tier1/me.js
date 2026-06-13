const db = require('../../database');
const { COLORS } = require('../../utils/embeds');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

const HIST_PER_PAGE = 8;
const PARTNER_GUILD = '1477000389487366246';
const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

/* ── Formatage ──────────────────────────────────────────────── */

function dur(sec) {
  if (!sec || sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function dt(ts) {
  const d = new Date(ts * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}

function bestSession(sessions) {
  if (!sessions.length) return null;
  return sessions.reduce((b, s) =>
    (s.end_time - s.start_time) > (b.end_time - b.start_time) ? s : b, sessions[0]);
}

function freqHours(sessions) {
  if (sessions.length < 2) return null;
  const sorted = [...sessions].sort((a, b) => a.start_time - b.start_time);
  let gap = 0;
  for (let i = 1; i < sorted.length; i++) gap += sorted[i].start_time - sorted[i - 1].end_time;
  return Math.round((gap / (sorted.length - 1)) / 3600);
}

/* ── Page Profil (page 0) ───────────────────────────────────── */

function buildProfile(author, user, stats, sessions, warnings, totalPages) {
  const online      = user.session_start !== null;
  const liveSec     = online ? Math.floor(Date.now() / 1000) - user.session_start : 0;
  const color       = online ? COLORS.success : COLORS.primary;
  const total       = user.total_connexions;
  const manuelle    = stats.totalSessions;
  const ajoutee     = user.added_connexions  || 0;
  const retiree     = user.removed_connexions || 0;
  const best        = bestSession(sessions);
  const freq        = freqHours(sessions);

  const statusLine  = online
    ? `🟢 **Session en cours** — \`${dur(liveSec)}\` — connecté <t:${user.session_start}:R>`
    : `🔴 **Hors ligne** — tape \`!c\` pour démarrer`;

  // Aperçu des 5 dernières sessions en description simple
  const recent = sessions.slice(0, 5).map((s, i) => {
    const len = s.end_time - s.start_time;
    return `> \`${i + 1}.\` **${dt(s.start_time)}** — \`${dur(len)}\``;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`👤  ${author.username}`)
    .setDescription(statusLine)
    .setThumbnail(author.displayAvatarURL({ dynamic: true }))
    .setTimestamp()
    .setFooter({ text: `Page 1/${Math.max(totalPages, 1)}  •  ${BOT()}` });

  // Connexions
  embed.addFields(
    { name: '🏆 Total',       value: `**${total}**`,    inline: true },
    { name: '👤 Manuelles',   value: `**${manuelle}**`, inline: true },
    { name: '\u200B',         value: '\u200B',           inline: true },
    { name: '➕ Ajoutées',    value: `**${ajoutee}**`,  inline: true },
    { name: '➖ Retirées',    value: `**${retiree}**`,  inline: true },
    { name: '\u200B',         value: '\u200B',           inline: true },
  );

  // Stats
  embed.addFields(
    { name: '⏳ Temps total',    value: `\`${dur(stats.totalSeconds)}\``, inline: true },
    { name: '⌛ Durée moyenne',  value: `\`${dur(stats.avgSeconds)}\``,   inline: true },
    { name: '🏅 Meilleure',      value: best ? `\`${dur(best.end_time - best.start_time)}\`` : '`—`', inline: true },
    { name: '📈 Fréquence',      value: freq !== null ? `~${freq}h entre sessions` : '*N/A*', inline: true },
    { name: '📊 Sessions termin.', value: `**${stats.totalSessions}**`, inline: true },
    { name: '\u200B',            value: '\u200B', inline: true },
  );

  // Aperçu historique
  if (recent) {
    embed.addFields({ name: '📋 Dernières sessions', value: recent, inline: false });
  }

  // Avertissements
  if (warnings.length > 0) {
    embed.addFields({
      name: `⚠️ Avertissements`,
      value: `**${warnings.length}** avertissement${warnings.length > 1 ? 's' : ''} enregistré${warnings.length > 1 ? 's' : ''}`,
      inline: false,
    });
  }

  return embed;
}

/* ── Pages Historique (page 1+) ─────────────────────────────── */

function buildHistory(author, sessions, page, totalPages) {
  const offset = (page - 1) * HIST_PER_PAGE;
  const slice  = sessions.slice(offset, offset + HIST_PER_PAGE);

  const lines = slice.map((s, i) => {
    const idx = offset + i + 1;
    const len = s.end_time - s.start_time;
    return `> **#${idx}** — ${dt(s.start_time)}\n> ↳ durée \`${dur(len)}\`  •  fin ${dt(s.end_time)}`;
  });

  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(`📋  Historique — ${author.username}`)
    .setDescription(lines.join('\n\n') || '*Aucune session sur cette page.*')
    .setTimestamp()
    .setFooter({ text: `Page ${page + 1}/${totalPages}  •  ${BOT()}` });
}

/* ── Boutons ─────────────────────────────────────────────────── */

function navRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('me_prev').setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('me_home').setEmoji('🏠')
      .setStyle(ButtonStyle.Primary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('me_next').setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );
}

/* ── Commande ────────────────────────────────────────────────── */

module.exports = {
  name: 'me',
  tier: 1,
  description: 'Recevoir son profil complet en message privé',
  async execute(message) {
    const { id } = message.author;
    db.createUser(id, message.author.username);

    const user     = db.getUser(id);
    const stats    = db.getUserSessionStats(id);
    const sessions = db.getUserSessions(id);
    const warnings = db.getWarnings(id, message.guild.id);

    const histPages  = Math.max(Math.ceil(sessions.length / HIST_PER_PAGE), 0);
    const totalPages = 1 + histPages;
    let page = 0;

    function getEmbed(p) {
      if (p === 0) return buildProfile(message.author, user, stats, sessions, warnings, totalPages);
      return buildHistory(message.author, sessions, p, totalPages);
    }

    const components = totalPages > 1 ? [navRow(0, totalPages)] : [];

    let dmMsg;
    try {
      dmMsg = await message.author.send({ embeds: [getEmbed(0)], components });
    } catch {
      return message.reply({ embeds: [getEmbed(0)] });
    }

    const { success } = require('../../utils/embeds');
    await message.reply({ embeds: [success('MP envoyé ✉️', 'Ton profil complet t\'a été envoyé en message privé !')] });

    if (totalPages <= 1) return;

    const collector = dmMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 15 * 60 * 1000,
    });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== id) return btn.deferUpdate();
      if (btn.customId === 'me_prev' && page > 0) page--;
      else if (btn.customId === 'me_next' && page < totalPages - 1) page++;
      else if (btn.customId === 'me_home') page = 0;
      await btn.update({ embeds: [getEmbed(page)], components: [navRow(page, totalPages)] });
    });

    collector.on('end', async () => {
      try {
        const off = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('me_prev').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('me_home').setEmoji('🏠').setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId('me_next').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(true),
        );
        await dmMsg.edit({ components: [off] });
      } catch {}
    });
  }
};
