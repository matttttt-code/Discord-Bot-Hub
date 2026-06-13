const db = require('../../database');
const { success, error } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');

module.exports = {
  name: 'delete',
  tier: 3,
  description: 'Supprimer une personne de la base de données',
  usage: '!delete [identifiant]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }
    if (!args[0]) {
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!delete [identifiant]`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    const targetId = member ? member.user.id : (/^\d{17,19}$/.test(args[0]) ? args[0] : null);
    if (!targetId) return message.reply({ embeds: [error('ID invalide', 'Fournissez un identifiant Discord valide (17-19 chiffres).')] });

    const user = db.getUser(targetId);
    if (!user) return message.reply({ embeds: [error('Introuvable', 'Aucune donnée trouvée pour cet identifiant.')] });

    db.deleteUser(targetId);
    const embed = success('Suppression effectuée', `Les données de \`${user.username}\` (\`${targetId}\`) ont été supprimées de la base de données.`)
      .addFields(
        { name: '🆔 ID supprimé', value: `\`${targetId}\``, inline: true },
        { name: '👮 Modérateur', value: `<@${message.author.id}>`, inline: true },
        { name: '📊 Connexions perdues', value: `**${user.total_connexions}**`, inline: true }
      );
    return message.reply({ embeds: [embed] });
  }
};
