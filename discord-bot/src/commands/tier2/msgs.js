const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, formatRelative, formatTimestamp } = require('../../utils/embeds');
const { hasTier2, resolveUser, parseDate } = require('../../utils/helpers');

function parseDateArg(arg) {
  if (!arg) return null;
  const ddmm = parseDate(arg + '-00:00');
  if (ddmm) return ddmm;

  const full = parseDate(arg);
  if (full) return full;

  const match7 = arg.match(/^(\d+)j$/i);
  if (match7) return Math.floor(Date.now() / 1000) - parseInt(match7[1]) * 86400;
  const matchH = arg.match(/^(\d+)h$/i);
  if (matchH) return Math.floor(Date.now() / 1000) - parseInt(matchH[1]) * 3600;

  return null;
}

module.exports = {
  name: 'msgs',
  tier: 2,
  description: 'Voir les messages d\'une personne après une date ou sur une période',
  usage: '!msgs [@user] [depuis: 7j/30j/JJ/MM] [#salon]',
  async execute(message, args) {
    if (!hasTier2(message.member)) {
      const { error } = require('../../utils/embeds');
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER2_ROLE_NAME || "EQUIPE D'ADMINISTRATION"}**.`)] });
    }

    if (!args[0]) {
      const { error } = require('../../utils/embeds');
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!msgs [@user] [7j/30j/JJ/MM-HH:MM] [#salon]`\n\nExemples :\n`!msgs @jean 7j` — 7 derniers jours\n`!msgs @jean 30j #general` — 30j dans #général\n`!msgs @jean 01/06-00:00` — depuis le 01/06')] });
    }

    let memberArg = args[0];
    let periodArg = args[1] || null;
    let channelArg = args[2] || null;

    if (periodArg && /^<#\d+>$/.test(periodArg)) {
      channelArg = periodArg;
      periodArg = null;
    }

    const member = await resolveUser(message.guild, memberArg);
    if (!member) {
      const { error } = require('../../utils/embeds');
      return message.reply({ embeds: [error('Introuvable', 'Aucun membre trouvé.')] });
    }

    const since = periodArg ? parseDateArg(periodArg) : null;
    let channelId = null;
    let channelName = 'Serveur entier';

    if (channelArg) {
      const match = channelArg.match(/^<#(\d+)>$/);
      if (match) {
        channelId = match[1];
        const ch = message.guild.channels.cache.get(channelId);
        channelName = ch ? `#${ch.name}` : `<#${channelId}>`;
      } else if (/^\d+$/.test(channelArg)) {
        channelId = channelArg;
        const ch = message.guild.channels.cache.get(channelId);
        channelName = ch ? `#${ch.name}` : `#${channelId}`;
      }
    }

    const { id, username } = member.user;
    const stats = db.getUserMsgStats(id, message.guild.id, since);
    const byChannelWithNames = stats.byChannel.map(c => {
      const ch = message.guild.channels.cache.get(c.channel_id);
      return { ...c, name: ch ? `#${ch.name}` : `\`${c.channel_id}\`` };
    });

    const periodLabel = since
      ? `depuis <t:${since}:D>`
      : 'depuis toujours';

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`💬 | Messages de ${member.user.username}`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: '👤 Membre', value: `<@${id}>`, inline: true },
        { name: '📅 Période', value: periodLabel, inline: true },
        { name: '📍 Salon', value: channelName, inline: true },
        { name: '📊 Total messages', value: `**${(stats.total || 0).toLocaleString()}** message${stats.total > 1 ? 's' : ''}`, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `Vérifié par ${message.author.username}` });

    if (byChannelWithNames.length > 0) {
      const topChannels = channelId
        ? byChannelWithNames.filter(c => c.channel_id === channelId)
        : byChannelWithNames.slice(0, 8);

      if (topChannels.length > 0) {
        embed.addFields({
          name: '📋 Par salon',
          value: topChannels.map(c => `${c.name} — **${c.count.toLocaleString()}** msgs`).join('\n'),
          inline: false
        });
      }
    }

    return message.reply({ embeds: [embed] });
  }
};
