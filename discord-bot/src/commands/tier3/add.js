const db = require('../../database');
const { success, error } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');

module.exports = {
  name: 'add',
  tier: 3,
  description: 'Ajouter un nombre de connexions à une personne',
  usage: '!add [nombre] [mention/pseudonyme/identifiant]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }
    if (args.length < 2) {
      return message.reply({ embeds: [error('Arguments manquants', 'Utilisation : `!add [nombre] [mention/pseudo/id]`')] });
    }

    const count = parseInt(args[0]);
    if (isNaN(count) || count <= 0) {
      return message.reply({ embeds: [error('Nombre invalide', 'Le nombre doit être un entier positif.')] });
    }

    const member = await resolveUser(message.guild, args.slice(1).join(' '));
    if (!member) return message.reply({ embeds: [error('Introuvable', 'Aucun membre trouvé.')] });

    const { id, username } = member.user;
    db.createUser(id, username);
    db.addConnexions(id, count);
    const user = db.getUser(id);

    const embed = success('Connexions ajoutées', `**+${count}** connexion${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''} à <@${id}>.`)
      .addFields(
        { name: '👤 Membre', value: `<@${id}>`, inline: true },
        { name: '➕ Ajout', value: `**+${count}**`, inline: true },
        { name: '🏆 Nouveau total', value: `**${user.total_connexions}**`, inline: true },
        { name: '👮 Modérateur', value: `<@${message.author.id}>`, inline: true }
      );
    return message.reply({ embeds: [embed] });
  }
};
