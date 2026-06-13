const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');

module.exports = {
  name: 'badge',
  tier: 3,
  description: 'Donner ou retirer un badge à un membre',
  usage: '!badge @user [nom] | !badge @user remove [nom]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Commande réservée aux gérants.')] });
    }

    if (args.length < 2) {
      return message.reply({ embeds: [error('Usage',
        '`!badge @user [nom]` — Donner un badge\n`!badge @user remove [nom]` — Retirer un badge'
      )]});
    }

    const target = await resolveUser(message.guild, args[0]);
    if (!target) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const { id, username } = target.user;
    const BOT = process.env.BOT_NAME || 'CONNEXION BOT';

    if (args[1]?.toLowerCase() === 'remove') {
      const badgeName = args.slice(2).join(' ');
      if (!badgeName) {
        return message.reply({ embeds: [error('Nom manquant', 'Précise le nom du badge à retirer.')] });
      }

      const removed = db.removeBadge(id, badgeName);
      if (!removed) {
        return message.reply({ embeds: [error('Badge introuvable', `<@${id}> ne possède pas le badge **${badgeName}**.`)] });
      }

      const dmEmbed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(`🎖️ Badge retiré — ${message.guild.name}`)
        .setDescription(`Le badge **${badgeName}** t'a été retiré sur **${message.guild.name}**.`)
        .setTimestamp()
        .setFooter({ text: `${BOT} • Badges` });
      try { await target.user.send({ embeds: [dmEmbed] }); } catch {}

      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('🎖️ Badge retiré')
          .addFields(
            { name: '👤 Membre', value: `<@${id}>`, inline: true },
            { name: '🏷️ Badge', value: badgeName,   inline: true },
          )
          .setTimestamp()
          .setFooter({ text: `${BOT} • Badges` })
      ]});
    }

    const badgeName = args.slice(1).join(' ');
    const added = db.addBadge(id, badgeName);

    if (!added) {
      return message.reply({ embeds: [error('Badge déjà attribué', `<@${id}> possède déjà le badge **${badgeName}**.`)] });
    }

    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(`🎖️ Nouveau badge ! — ${message.guild.name}`)
      .setDescription(`Tu viens de recevoir le badge **${badgeName}** sur **${message.guild.name}** !`)
      .setTimestamp()
      .setFooter({ text: `${BOT} • Badges` });
    try { await target.user.send({ embeds: [dmEmbed] }); } catch {}

    const allBadges = db.getUserBadges(id);
    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('🎖️ Badge attribué !')
        .addFields(
          { name: '👤 Membre', value: `<@${id}>`,               inline: true },
          { name: '🏷️ Badge', value: badgeName,                 inline: true },
          { name: '🎖️ Total', value: `**${allBadges.length}**`, inline: true },
        )
        .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
        .setTimestamp()
        .setFooter({ text: `${BOT} • Badges` })
    ]});
  }
};
