const db = require('../../database');
const { error, COLORS, formatTimestamp, formatRelative, formatDuration } = require('../../utils/embeds');
const { hasTier2, resolveUser } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

function dur(sec) {
  if (!sec || sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDt(ts) {
  const d = new Date(ts * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

module.exports = {
  name: 'check',
  tier: 2,
  description: 'Voir toutes les informations d\'une personne',
  usage: '!check [mention/pseudonyme/identifiant]',
  async execute(message, args) {
    if (!hasTier2(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER2_ROLE_NAME || "EQUIPE D'ADMINISTRATION"}**.`)] });
    }

    const target = args[0];
    if (!target) {
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!check [mention/pseudonyme/identifiant]`')] });
    }

    const member = await resolveUser(message.guild, target);
    if (!member) {
      return message.reply({ embeds: [error('Introuvable', 'Aucun membre trouvé avec cet identifiant/pseudonyme.')] });
    }

    const { id, username } = member.user;
    db.createUser(id, username);
    const user      = db.getUser(id);
    const warnings  = db.getWarnings(id, message.guild.id);
    const sessions  = db.getSessionHistory(id, 5);
    const stats     = db.getUserSessionStats(id);

    const isConnected     = user.session_start !== null;
    const currentDuration = isConnected ? Math.floor(Date.now() / 1000) - user.session_start : 0;

    const createdAt = Math.floor(member.user.createdTimestamp / 1000);
    const joinedAt  = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

    const embed = new EmbedBuilder()
      .setColor(isConnected ? COLORS.success : COLORS.info)
      .setTitle(`🔍 | ${member.user.username}`)
      .setThumbnail(member.user.displayAvatarURL({ size: 1024 }))
      .setTimestamp()
      .setFooter({ text: `Vérifié par ${message.author.username} • ${BOT()}` });

    // ── Identité ──────────────────────────────────────────────
    embed.addFields(
      { name: '🆔 Identifiant',        value: `\`${id}\``,                                        inline: true },
      { name: '📅 Compte créé le',     value: formatTimestamp(createdAt),                           inline: true },
      { name: '🏠 Rejoint le serveur', value: joinedAt ? formatTimestamp(joinedAt) : '*Inconnu*',   inline: true },
    );

    // ── Connexions ────────────────────────────────────────────
    embed.addFields(
      { name: '🏆 Total connexions',  value: `**${user.total_connexions}**`,                        inline: true },
      { name: '📡 Statut',            value: isConnected ? '🟢 **Connecté**' : '🔴 **Déconnecté**', inline: true },
      { name: '⚠️ Avertissements',    value: `**${warnings.length}**`,                              inline: true },
      { name: '➕ Co. ajoutées',       value: `**${user.added_connexions || 0}**`,                   inline: true },
      { name: '➖ Co. retirées',       value: `**${user.removed_connexions || 0}**`,                 inline: true },
      { name: '⏳ Temps moyen / co.',  value: `**${dur(stats.avgSeconds)}**`,                        inline: true },
    );

    // ── Session en cours (si connecté) ────────────────────────
    if (isConnected) {
      embed.addFields(
        { name: '⏱️ Session en cours', value: `**${formatDuration(currentDuration)}**`, inline: true },
        { name: '🕐 Connecté depuis',  value: formatRelative(user.session_start),        inline: true },
        { name: '\u200B',              value: '\u200B',                                  inline: true },
      );
    }

    // ── Dernières sessions ────────────────────────────────────
    if (sessions.length > 0) {
      const sessionLines = sessions.map((s, i) => {
        const length = s.end_time ? s.end_time - s.start_time : null;
        const end    = s.end_time ? fmtDt(s.end_time) : '*(en cours)*';
        return `\`${i + 1}.\` **${fmtDt(s.start_time)}** → ${end}${length ? ` · \`${dur(length)}\`` : ''}`;
      });
      embed.addFields({ name: `📋 Dernières sessions (${sessions.length})`, value: sessionLines.join('\n'), inline: false });
    }

    return message.reply({ embeds: [embed] });
  }
};
