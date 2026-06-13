const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, formatRelative } = require('../../utils/embeds');

module.exports = {
  name: 'msgtop',
  tier: 1,
  description: 'Classement des messages du serveur',
  usage: '!msgtop [#salon]',
  async execute(message, args) {
    const channelMention = args[0];
    let channelId = null;
    let channelName = 'Serveur entier';

    if (channelMention) {
      const match = channelMention.match(/^<#(\d+)>$/);
      if (match) {
        channelId = match[1];
        const ch = message.guild.channels.cache.get(channelId);
        channelName = ch ? `#${ch.name}` : `<#${channelId}>`;
      } else if (/^\d+$/.test(channelMention)) {
        channelId = channelMention;
        const ch = message.guild.channels.cache.get(channelId);
        channelName = ch ? `#${ch.name}` : `#${channelId}`;
      }
    }

    const users = db.getMsgLeaderboard(message.guild.id, channelId, 15);
    const medals = ['🥇', '🥈', '🥉'];

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`💬 | Classement des messages — ${channelName}`)
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Messages` });

    if (users.length === 0) {
      embed.setDescription('*Aucune donnée de messages disponible.*');
    } else {
      const lines = users.map((u, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        const last = u.last_msg ? formatRelative(u.last_msg) : '—';
        return `${medal} <@${u.discord_id}> — **${u.total.toLocaleString()}** msg${u.total > 1 ? 's' : ''} *(dernier : ${last})*`;
      });
      embed.setDescription(lines.join('\n'));

      const myRank = db.getMsgLeaderboard(message.guild.id, channelId, 9999).findIndex(u => u.discord_id === message.author.id);
      if (myRank >= 0) {
        const myData = db.getMsgLeaderboard(message.guild.id, channelId, 9999)[myRank];
        embed.addFields({ name: '📍 Ta position', value: `**#${myRank + 1}** — **${myData.total.toLocaleString()}** messages`, inline: false });
      }
    }

    return message.reply({ embeds: [embed] });
  }
};
