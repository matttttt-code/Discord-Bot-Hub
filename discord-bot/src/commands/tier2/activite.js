const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, formatDuration, formatTimestamp, formatRelative } = require('../../utils/embeds');
const { hasTier2, resolveUser } = require('../../utils/helpers');

function parseSince(arg) {
  if (!arg) return null;
  const match7 = arg.match(/^(\d+)j$/i);
  if (match7) return Math.floor(Date.now() / 1000) - parseInt(match7[1]) * 86400;
  const matchH = arg.match(/^(\d+)h$/i);
  if (matchH) return Math.floor(Date.now() / 1000) - parseInt(matchH[1]) * 3600;
  const ddmm = arg.match(/^(\d{2})\/(\d{2})$/);
  if (ddmm) {
    const year = new Date().getFullYear();
    const date = new Date(year, parseInt(ddmm[2]) - 1, parseInt(ddmm[1]), 0, 0, 0);
    return Math.floor(date.getTime() / 1000);
  }
  return null;
}

module.exports = {
  name: 'activite',
  tier: 2,
  description: 'Voir l\'activité complète d\'un membre (connexions + messages + vocal)',
  usage: '!activite [@user] [7j/30j/JJ/MM]',
  async execute(message, args) {
    if (!hasTier2(message.member)) {
      const { error } = require('../../utils/embeds');
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER2_ROLE_NAME || "EQUIPE D'ADMINISTRATION"}**.`)] });
    }

    if (!args[0]) {
      const { error } = require('../../utils/embeds');
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!activite [@user] [7j/30j/JJ/MM]`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) {
      const { error } = require('../../utils/embeds');
      return message.reply({ embeds: [error('Introuvable', 'Aucun membre trouvé.')] });
    }

    const since = args[1] ? parseSince(args[1]) : null;
    const { id, username } = member.user;
    const guildId = message.guild.id;

    db.createUser(id, username);
    const user = db.getUser(id);
    const msgStats = db.getUserMsgStats(id, guildId, since);
    const vocalStats = db.getUserVocalStats(id, guildId);
    const badges = db.getUserBadges(id);

    let connexions = user.total_connexions;
    if (since) {
      const sessions = db.getSessionsInRange(id, since, Math.floor(Date.now() / 1000));
      connexions = sessions.length;
    }

    const periodLabel = since ? `depuis <t:${since}:D>` : 'depuis toujours';

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📊 | Activité de ${member.user.username}`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Membre', value: `<@${id}> (\`${id}\`)`, inline: true },
        { name: '📅 Période analysée', value: periodLabel, inline: true },
        { name: '📡 Statut actuel', value: db.isConnected(id) ? '🟢 Connecté' : '🔴 Déconnecté', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Rapport généré par ${message.author.username}` });

    embed.addFields({ name: '\u200B', value: '**── 🏆 Connexions ──**', inline: false });
    embed.addFields(
      { name: 'Total', value: `**${connexions}** connexion${connexions > 1 ? 's' : ''}`, inline: true },
    );
    if (!since) {
      embed.addFields(
        { name: 'Inscrit le', value: formatTimestamp(user.created_at), inline: true },
      );
    }

    embed.addFields({ name: '\u200B', value: '**── 💬 Messages ──**', inline: false });
    const topChannelsMsgs = msgStats.byChannel.slice(0, 4).map(c => {
      const ch = message.guild.channels.cache.get(c.channel_id);
      return `${ch ? `<#${c.channel_id}>` : `\`${c.channel_id}\``} — **${c.count.toLocaleString()}**`;
    });
    embed.addFields(
      { name: 'Total messages', value: `**${(msgStats.total || 0).toLocaleString()}**`, inline: true },
      { name: 'Top salons', value: topChannelsMsgs.length > 0 ? topChannelsMsgs.join('\n') : '*Aucun*', inline: true },
    );

    embed.addFields({ name: '\u200B', value: '**── 🎙️ Vocal ──**', inline: false });
    const topVocal = vocalStats.byChannel.slice(0, 4).map(c => {
      const ch = message.guild.channels.cache.get(c.channel_id);
      return `${ch ? `<#${c.channel_id}>` : `\`${c.channel_id}\``} — **${formatDuration(c.total_seconds)}**`;
    });
    embed.addFields(
      { name: 'Temps total', value: `**${formatDuration(vocalStats.total)}**${vocalStats.isLive ? ' 🔴 *en cours*' : ''}`, inline: true },
      { name: 'Top salons', value: topVocal.length > 0 ? topVocal.join('\n') : '*Aucun*', inline: true },
    );

    if (badges.length > 0) {
      embed.addFields({ name: `🎖️ Badges (${badges.length})`, value: badges.map(b => `• ${b.badge_name}`).join('\n'), inline: false });
    }

    return message.reply({ embeds: [embed] });
  }
};
