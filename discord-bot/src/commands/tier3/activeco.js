const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const cfg    = require('../../utils/config');
const logger = require('../../utils/logger');

module.exports = {
  name: 'activeco',
  tier: 3,
  description: 'Activer ou désactiver le système de connexion (!c / !d)',
  async execute(message) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }

    const guildId   = message.guild.id;
    const current   = cfg.get('co_enabled', guildId);
    const isEnabled = current !== '0';
    const newValue  = isEnabled ? '0' : '1';

    await cfg.set('co_enabled', newValue, guildId);

    const embed = new EmbedBuilder()
      .setColor(newValue === '1' ? COLORS.success : COLORS.error)
      .setTitle(newValue === '1' ? '🟢 Système de connexion activé' : '🔴 Système de connexion désactivé')
      .setDescription(newValue === '1'
        ? 'Les membres peuvent à nouveau utiliser `!c` et `!d`.'
        : 'Les commandes `!c` et `!d` sont temporairement désactivées.')
      .addFields({ name: '👤 Modifié par', value: `<@${message.author.id}>`, inline: true })
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Système CO` });

    await message.reply({ embeds: [embed] });

    await logger.log(guildId, newValue === '1' ? 'connexion' : 'warning',
      `Système de connexion ${newValue === '1' ? 'activé' : 'désactivé'}`,
      [{ name: '👤 Par', value: `<@${message.author.id}> (${message.author.username})`, inline: true }]
    );
  }
};
