const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const cfg = require('../../utils/config');

module.exports = {
  name: 'announce',
  tier: 3,
  description: 'Envoyer une annonce dans le salon connexion',
  usage: '!announce [message]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }

    if (args.length === 0) {
      return message.reply({ embeds: [error('Message manquant', 'Utilisation : `!announce [message]`')] });
    }

    const guildId            = message.guild.id;
    const connexionChannelId = cfg.getConnexionChannelId(guildId);
    const pingRoleId         = cfg.getPingRoleId(guildId);

    const targetChannel = connexionChannelId
      ? message.guild.channels.cache.get(connexionChannelId)
      : message.channel;

    if (!targetChannel) {
      return message.reply({ embeds: [error('Salon introuvable', 'Le salon de connexion n\'est pas configuré. Configure-le avec `!setup connexion #salon`.')] });
    }

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('📢 Annonce')
      .setDescription(args.join(' '))
      .setTimestamp()
      .setFooter({ text: `Annonce par ${message.author.username} • ${process.env.BOT_NAME || 'CONNEXION BOT'}` });

    await targetChannel.send({
      content: pingRoleId ? `<@&${pingRoleId}>` : null,
      embeds: [embed],
      allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] },
    });

    if (targetChannel.id !== message.channel.id) {
      await message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setDescription(`✅ Annonce envoyée dans <#${targetChannel.id}>.`)
      ]});
    }

    try { await message.delete(); } catch {}
  }
};
