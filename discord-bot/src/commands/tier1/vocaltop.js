const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, formatDuration } = require('../../utils/embeds');

module.exports = {
  name: 'vocaltop',
  tier: 1,
  description: 'Classement du temps passé en vocal',
  usage: '!vocaltop [#salon_vocal]',
  async execute(message, args) {
    const channelMention = args[0];
    let channelId = null;
    let channelName = 'Tous les salons';

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

    // Récupérer les membres actuels pour filtrer et nettoyer les absents
    let guildMembers;
    try {
      guildMembers = await message.guild.members.fetch();
    } catch {
      guildMembers = message.guild.members.cache;
    }

    const allUsers = db.getVocalLeaderboard(message.guild.id, channelId, 50);

    const removed = [];
    const active  = [];
    for (const u of allUsers) {
      if (guildMembers.has(u.discord_id)) {
        active.push(u);
      } else {
        db.deleteUser(u.discord_id);
        removed.push(u);
      }
    }

    const top    = active.slice(0, 15);
    const medals = ['🥇', '🥈', '🥉'];

    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(`🎙️ | Classement vocal — ${channelName}`)
      .setTimestamp()
      .setFooter({
        text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Vocal${removed.length > 0 ? ` · ${removed.length} compte(s) nettoyé(s)` : ''}`,
      });

    if (top.length === 0) {
      embed.setDescription('*Aucune donnée vocale disponible.*');
    } else {
      const lines = top.map((u, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        return `${medal} <@${u.discord_id}> — **${formatDuration(u.total)}**`;
      });
      embed.setDescription(lines.join('\n'));
    }

    return message.reply({ embeds: [embed] });
  }
};
