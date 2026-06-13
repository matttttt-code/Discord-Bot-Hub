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
    const user     = db.getUser(id);
    const badges   = db.getUserBadges(id);
    const warnings = db.getWarnings(id, message.guild.id);
    const sessions = db.getSessionHistory(id, 5);

    const isConnected     = user.session_start !== null;
    const currentDuration = isConnected ? Math.floor(Date.now() / 1000) - user.session_start : 0;

    // Dates — joinedTimestamp peut être null sur certains comptes très anciens
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
      { name: '🆔 Identifiant',        value: `\`${id}\``,                                inline: true },
      { name: '📅 Compte créé le',     value: formatTimestamp(createdAt),                 inline: true },
      { name: '🏠 Rejoint le serveur', value: joinedAt ? formatTimestamp(joinedAt) : '*Inconnu*', inline: true },
    );

    // ── Connexions ────────────────────────────────────────────
    embed.addFields(
      { name: '🏆 Total connexions', value: `**${user.total_connexions}**`,              inline: true },
      { name: '📡 Statut',           value: isConnected ? '🟢 **Connecté**' : '🔴 **Déconnecté**', inline: true },
      { name: '⚠️ Avertissements',   value: `**${warnings.length}**`,                   inline: true },
    );

    // ── Session en cours (si connecté) ────────────────────────
    if (isConnected) {
      embed.addFields(
        { name: '⏱️ Session en cours',  value: `**${formatDuration(currentDuration)}**`, inline: true },
        { name: '🕐 Connecté depuis',   value: formatRelative(user.session_start),        inline: true },
        { name: '\u200B',               value: '\u200B',                                  inline: true },
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

    // ── Badges ────────────────────────────────────────────────
    if (badges.length > 0) {
      embed.addFields({
        name: `🎖️ Badges (${badges.length})`,
        value: badges.map(b => `• ${b.badge_name}`).join('\n'),
        inline: false,
      });
    }

    // ── Rôles ─────────────────────────────────────────────────
    const roleList = member.roles.cache
      .filter(r => r.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(r => `<@&${r.id}>`);

    let rolesValue;
    if (roleList.length === 0) {
      rolesValue = '*Aucun rôle*';
    } else {
      // Construire la liste en respectant la limite de 1024 chars
      rolesValue = '';
      for (const r of roleList) {
        const next = rolesValue ? `${rolesValue}, ${r}` : r;
        if (next.length > 1000) { rolesValue += ` *(+${roleList.length - roleList.indexOf(r)} autres)*`; break; }
        rolesValue = next;
      }
    }
    embed.addFields({ name: `🎭 Rôles (${roleList.length})`, value: rolesValue, inline: false });

    return message.reply({ embeds: [embed] });
  }
};
