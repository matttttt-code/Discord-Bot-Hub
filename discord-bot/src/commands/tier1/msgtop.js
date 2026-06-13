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

    // Filtre les membres qui ont quitté le serveur (comme vocaltop)
    let guildMembers;
    try {
      guildMembers = await message.guild.members.fetch();
    } catch {
      guildMembers = message.guild.members.cache;
    }

    const allUsers = db.getMsgLeaderboard(message.guild.id, channelId, 50);
    const removed  = [];
    const users    = [];
    for (const u of allUsers) {
      if (guildMembers.has(u.discord_id)) {
        users.push(u);
      } else {
        db.deleteUser(u.discord_id);
        removed.push(u);
      }
    }

    const medals = ['🥇', '🥈', '🥉'];

    const top = users.slice(0, 15);

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`💬 | Classement des messages — ${channelName}`)
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Messages${removed.length > 0 ? ` · ${removed.length} compte(s) nettoyé(s)` : ''}` });

    if (top.length === 0) {
      embed.setDescription('*Aucune donnée de messages disponible.*');
    } else {
      const lines = top.map((u, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        const last = u.last_msg ? formatRelative(u.last_msg) : '—';
        return `${medal} <@${u.discord_id}> — **${u.total.toLocaleString()}** msg${u.total > 1 ? 's' : ''} *(dernier : ${last})*`;
      });
      embed.setDescription(lines.join('\n'));

      const myRank = users.findIndex(u => u.discord_id === message.author.id);
      if (myRank >= 0) {
        embed.addFields({ name: '📍 Ta position', value: `**#${myRank + 1}** — **${users[myRank].total.toLocaleString()}** messages`, inline: false });
      }
    }

    return message.reply({ embeds: [embed] });
  }
};
