const db = require('../../database');
const { success, error, formatDuration, formatTimestamp } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');

module.exports = {
  name: 'deco',
  tier: 3,
  description: 'Déconnecter une personne du service de connexions',
  usage: '!deco [mention/pseudonyme/identifiant]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }
    if (!args[0]) {
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!deco [mention/pseudonyme/identifiant]`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) return message.reply({ embeds: [error('Introuvable', 'Aucun membre trouvé.')] });

    const { id } = member.user;
    if (!db.isConnected(id)) {
      return message.reply({ embeds: [error('Non connecté', `<@${id}> n'est pas connecté !`)] });
    }

    const session = db.endSession(id);
    const user = db.getUser(id);
    const embed = success('Déconnexion forcée', `<@${id}> a été déconnecté du service.`)
      .addFields(
        { name: '👤 Membre', value: `<@${id}>`, inline: true },
        { name: '👮 Modérateur', value: `<@${message.author.id}>`, inline: true },
        { name: '⏱️ Durée', value: `**${formatDuration(session.duration)}**`, inline: true },
        { name: '🏆 Total connexions', value: `**${user.total_connexions}**`, inline: true }
      );
    return message.reply({ embeds: [embed] });
  }
};
