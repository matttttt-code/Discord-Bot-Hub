const db  = require('../../database');
const { success, error } = require('../../utils/embeds');
const { updateAbsenceBoard } = require('../../utils/absenceBoard');

module.exports = {
  name: 'delabsence',
  tier: 1,
  description: 'Supprimer une absence (la sienne ou celle d\'un membre)',
  usage: '!delabsence [@membre]',
  async execute(message, args) {
    const guildId = message.guild.id;

    let targetUser = message.author;
    if (args.length > 0 && message.mentions.users.size > 0) {
      const hasPermission = message.member.permissions.has('ManageRoles') || message.member.permissions.has('Administrator');
      if (!hasPermission) {
        return message.reply({ embeds: [error('Permission refusée', 'Tu n\'as pas la permission de supprimer l\'absence d\'un autre membre.')] });
      }
      targetUser = message.mentions.users.first();
    }

    const existing = db.getUserAbsence(targetUser.id, guildId);
    if (!existing) {
      const isSelf = targetUser.id === message.author.id;
      return message.reply({ embeds: [error('Aucune absence active',
        isSelf
          ? 'Tu n\'as pas d\'absence active en ce moment.'
          : `<@${targetUser.id}> n'a pas d'absence active en ce moment.`
      )] });
    }

    db.deleteAbsence(targetUser.id, guildId);
    await updateAbsenceBoard(message.client, message.guild);

    const isSelf = targetUser.id === message.author.id;
    return message.reply({ embeds: [success('Absence supprimée ✅',
      isSelf
        ? 'Ton absence a bien été supprimée.'
        : `L'absence de <@${targetUser.id}> a bien été supprimée.`
    )] });
  }
};
