const db  = require('../../database');
const cfg = require('../../utils/config');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { fmtDate } = require('../../utils/absenceBoard');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

module.exports = {
  name: 'absence',
  tier: 1,
  description: 'Se déclarer absent via un formulaire',
  usage: '!absence',
  async execute(message) {
    const { id, username } = message.author;
    const guildId = message.guild.id;

    const existing = db.getUserAbsence(id, guildId);
    if (existing) {
      const embed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('🌙 | Absence déjà active')
        .setDescription('Tu as déjà une absence en cours.')
        .addFields(
          { name: '📅 Fin prévue', value: `${fmtDate(existing.end_time)} (<t:${existing.end_time}:R>)`, inline: false },
          { name: '📋 Motif',      value: existing.reason, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `${BOT()} • Absence` });
      return message.reply({ embeds: [embed] });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`absence_open_modal_${id}`)
        .setLabel('📝 Remplir le formulaire')
        .setStyle(ButtonStyle.Primary),
    );

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle('🌙 | Déclarer une absence')
      .setDescription('Clique sur le bouton ci-dessous pour remplir le formulaire d\'absence.\n\n*Le bouton expire après 5 minutes.*')
      .setThumbnail(message.author.displayAvatarURL({ size: 256 }))
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Absence` });

    await message.reply({ embeds: [embed], components: [row] });
  }
};
