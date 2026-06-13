const db = require('../../database');
const { success, error } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');

module.exports = {
  name: 'reset',
  tier: 3,
  description: 'Réinitialiser toutes les données liées aux connexions du serveur',
  async execute(message) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }

    const confirmMsg = await message.reply({ embeds: [error('⚠️ Confirmation requise', '**Cette action est irréversible !**\nTous les compteurs de connexions, sessions et badges seront réinitialisés.\n\nRéponds `CONFIRMER` dans les 30 secondes pour valider.')] });

    const filter = m => m.author.id === message.author.id && m.content === 'CONFIRMER';
    try {
      await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
    } catch {
      return confirmMsg.edit({ embeds: [error('Annulé', 'La réinitialisation a été annulée (délai dépassé).')] });
    }

    db.resetAll();
    const embed = success('Réinitialisation complète', 'Toutes les données de connexion du serveur ont été réinitialisées.')
      .addFields({ name: '👮 Modérateur', value: `<@${message.author.id}>`, inline: true });
    return message.channel.send({ embeds: [embed] });
  }
};
