const db = require('../../database');
const { error, COLORS, formatTimestamp, formatRelative, formatDuration } = require('../../utils/embeds');
const { hasTier2, resolveUser } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

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
    const user = db.getUser(id);
    const badges = db.getUserBadges(id);
    const isConnected = user.session_start !== null;
    const currentDuration = isConnected ? Math.floor(Date.now() / 1000) - user.session_start : 0;

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`🔍 | Informations de ${member.user.username}`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🆔 Identifiant', value: `\`${id}\``, inline: true },
        { name: '📅 Membre depuis', value: formatTimestamp(Math.floor(member.user.createdTimestamp / 1000)), inline: true },
        { name: '🏠 Rejoint le serveur', value: formatTimestamp(Math.floor(member.joinedTimestamp / 1000)), inline: true },
        { name: '🏆 Total connexions', value: `**${user.total_connexions}**`, inline: true },
        { name: '📡 Statut', value: isConnected ? '🟢 **Connecté**' : '🔴 **Déconnecté**', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `Vérifié par ${message.author.username}` });

    if (isConnected) {
      embed.addFields(
        { name: '⏱️ Session en cours', value: `**${formatDuration(currentDuration)}**`, inline: true },
        { name: '🕐 Connecté depuis', value: formatRelative(user.session_start), inline: true }
      );
    }

    if (badges.length > 0) {
      embed.addFields({
        name: `🎖️ Badges (${badges.length})`,
        value: badges.map(b => `• ${b.badge_name}`).join('\n')
      });
    }

    const roles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => `<@&${r.id}>`).join(', ') || '*Aucun rôle*';
    embed.addFields({ name: '🎭 Rôles', value: roles.length > 1024 ? roles.slice(0, 1021) + '...' : roles });

    return message.reply({ embeds: [embed] });
  }
};
