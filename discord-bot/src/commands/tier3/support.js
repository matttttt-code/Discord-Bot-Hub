const db = require('../../database');
const { success, error } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'support',
  tier: 3,
  description: 'Envoyer un signalement à l\'équipe de développement',
  usage: '!support [texte]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }
    const content = args.join(' ');
    if (!content) {
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!support [votre signalement]`')] });
    }

    db.addSupportTicket(message.author.id, message.author.username, content);

    const channelId = process.env.SUPPORT_CHANNEL_ID;
    if (channelId) {
      const channel = message.guild.channels.cache.get(channelId);
      if (channel) {
        const ticketEmbed = new EmbedBuilder()
          .setColor(0xFF4757)
          .setTitle('🚨 | Nouveau signalement')
          .setDescription(`> ${content}`)
          .addFields(
            { name: '👤 Auteur', value: `<@${message.author.id}> (\`${message.author.username}\`)`, inline: true },
            { name: '📅 Date', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
            { name: '🌐 Serveur', value: message.guild.name, inline: true }
          )
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `ID: ${message.author.id}` });
        await channel.send({ embeds: [ticketEmbed] });
      }
    }

    return message.reply({ embeds: [success('Signalement envoyé', 'Ton signalement a bien été transmis à l\'équipe. Merci ! 🚨')] });
  }
};
