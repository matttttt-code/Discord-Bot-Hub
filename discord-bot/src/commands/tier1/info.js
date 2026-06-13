const { EmbedBuilder } = require('discord.js');
const { COLORS, formatTimestamp } = require('../../utils/embeds');

module.exports = {
  name: 'info',
  tier: 1,
  description: 'Voir toutes les informations liées au bot',
  async execute(message) {
    const client = message.client;
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = Math.floor(uptime % 60);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`ℹ️ | Informations — ${process.env.BOT_NAME || 'CONNEXION BOT'}`)
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '🤖 Nom', value: `**${client.user.username}**`, inline: true },
        { name: '🆔 ID', value: `\`${client.user.id}\``, inline: true },
        { name: '📅 Créé le', value: formatTimestamp(Math.floor(client.user.createdTimestamp / 1000)), inline: true },
        { name: '⬆️ Uptime', value: `**${h}h ${m}m ${s}s**`, inline: true },
        { name: '🏓 Ping', value: `**${Math.round(client.ws.ping)}ms**`, inline: true },
        { name: '📡 Serveurs', value: `**${client.guilds.cache.size}**`, inline: true },
        { name: '👥 Membres', value: `**${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}**`, inline: true },
        { name: '📦 Version discord.js', value: `**v${require('discord.js').version}**`, inline: true },
        { name: '🟢 Node.js', value: `**${process.version}**`, inline: true },
        { name: '⚙️ Préfixe', value: `\`${process.env.PREFIX || '!'}\``, inline: true },
        { name: '📝 Version bot', value: `**v${require('../../../package.json').version}**`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Développé avec ❤️` });

    return message.reply({ embeds: [embed] });
  }
};
