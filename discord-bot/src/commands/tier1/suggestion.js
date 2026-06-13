const db = require('../../database');
const { success, error } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'suggestion',
  tier: 1,
  description: 'Envoyer une suggestion à l\'équipe de développement',
  usage: '!suggestion [texte]',
  async execute(message, args) {
    const content = args.join(' ');
    if (!content) {
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!suggestion [votre suggestion]`')] });
    }
    if (content.length < 10) {
      return message.reply({ embeds: [error('Suggestion trop courte', 'Ta suggestion doit contenir au moins 10 caractères.')] });
    }

    db.addSuggestion(message.author.id, message.author.username, content);

    const channelId = process.env.SUGGESTIONS_CHANNEL_ID;
    if (channelId) {
      const channel = message.guild.channels.cache.get(channelId);
      if (channel) {
        const suggEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('💡 | Nouvelle suggestion')
          .setDescription(`> ${content}`)
          .addFields(
            { name: '👤 Auteur', value: `<@${message.author.id}> (\`${message.author.username}\`)`, inline: true },
            { name: '📅 Date', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true }
          )
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `ID: ${message.author.id}` });
        const sent = await channel.send({ embeds: [suggEmbed] });
        await sent.react('✅');
        await sent.react('❌');
      }
    }

    return message.reply({ embeds: [success('Suggestion envoyée', 'Ta suggestion a bien été transmise à l\'équipe ! Merci 💡')] });
  }
};
