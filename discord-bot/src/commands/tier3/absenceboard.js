const cfg = require('../../utils/config');
const { success, error, COLORS } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const { updateAbsenceBoard } = require('../../utils/absenceBoard');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'absenceboard',
  tier: 3,
  description: 'Configurer le salon du tableau des absences',
  usage: '!absenceboard #salon | !absenceboard status',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }

    const guildId = message.guild.id;

    if (args[0] === 'status') {
      const channelId = cfg.get('absence_channel_id', guildId);
      const embed = new EmbedBuilder()
        .setColor(channelId ? COLORS.success : COLORS.error)
        .setTitle('📋 Absence Board — Configuration')
        .addFields({ name: '📢 Salon', value: channelId ? `<#${channelId}>` : '*Non configuré*', inline: true })
        .setTimestamp()
        .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Absence Board` });
      return message.reply({ embeds: [embed] });
    }

    const channelMatch = args[0]?.match(/^<#(\d+)>$/);
    if (!channelMatch) {
      return message.reply({ embeds: [error('Usage', '`!absenceboard #salon` — Configurer le salon\n`!absenceboard status` — Voir la config')] });
    }

    const channelId = channelMatch[1];
    await cfg.set('absence_channel_id', channelId, guildId);
    await cfg.set('absence_board_message_id', '', guildId);

    await updateAbsenceBoard(message.client, message.guild);

    return message.reply({ embeds: [success('Absence Board configuré ✅',
      `Le tableau des absences sera affiché et mis à jour automatiquement dans <#${channelId}>.`
    )] });
  }
};
