const db = require('../../database');
const { success, error, formatTimestamp } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');

module.exports = {
  name: 'co',
  tier: 3,
  description: 'Connecter une personne au service de connexions',
  usage: '!co [mention/pseudonyme/identifiant]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }
    if (!args[0]) {
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!co [mention/pseudonyme/identifiant]`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) return message.reply({ embeds: [error('Introuvable', 'Aucun membre trouvé.')] });

    const { id, username } = member.user;
    if (db.isConnected(id)) {
      return message.reply({ embeds: [error('Déjà connecté', `<@${id}> est déjà connecté !`)] });
    }

    const now = db.startSession(id, username);
    const embed = success('Connexion forcée', `<@${id}> a été connecté au service.`)
      .addFields(
        { name: '👤 Membre', value: `<@${id}>`, inline: true },
        { name: '👮 Modérateur', value: `<@${message.author.id}>`, inline: true },
        { name: '🕐 Heure de début', value: formatTimestamp(now), inline: true }
      );
    return message.reply({ embeds: [embed] });
  }
};
