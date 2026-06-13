const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { resolveUser } = require('../../utils/helpers');

module.exports = {
  name: 'badges',
  tier: 1,
  description: 'Voir les badges d\'un membre (ou les siens)',
  usage: '!badges [@membre]',
  async execute(message, args) {
    const target = args[0]
      ? await resolveUser(message.guild, args[0])
      : message.member;

    if (!target) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const { id, username } = target.user;
    const badges = db.getUserBadges(id);
    const BOT    = process.env.BOT_NAME || 'CONNEXION BOT';

    if (badges.length === 0) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('🎖️ Badges')
          .setDescription(`<@${id}> n'a aucun badge pour l'instant.`)
          .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `${BOT} • Badges` })
      ]});
    }

    function dt(ts) {
      const d = new Date(ts * 1000);
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
    }

    const lines = badges.map((b, i) =>
      `**${i + 1}.** ${b.badge_name} — *obtenu le ${dt(b.obtained_at)}*`
    ).join('\n');

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🎖️ Badges de ${username} (${badges.length})`)
        .setDescription(lines)
        .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: `${BOT} • Badges` })
    ]});
  }
};
