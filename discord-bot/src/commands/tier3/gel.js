const db = require('../../database');
const { error, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'gel',
  tier: 3,
  description: 'Geler / dégeler le compteur de connexions d\'un membre',
  usage: '!gel @user',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }
    if (!args[0]) {
      return message.reply({ embeds: [error('Argument manquant', 'Utilisation : `!gel @user`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) return message.reply({ embeds: [error('Introuvable', 'Aucun membre trouvé.')] });

    const { id, username } = member.user;
    db.createUser(id, username);

    const wasGele = db.isGele(id);
    if (wasGele) {
      db.degelUser(id);
    } else {
      db.gelUser(id);
    }

    const embed = new EmbedBuilder()
      .setColor(wasGele ? COLORS.success : COLORS.info)
      .setTitle(wasGele ? '🔓 Membre dégelé' : '🧊 Membre gelé')
      .setDescription(wasGele
        ? `Le compteur de <@${id}> est à nouveau **actif**. Il peut relancer ses connexions.`
        : `Le compteur de <@${id}> est **gelé**. Ses stats sont préservées mais il ne peut plus faire \`!c\`.`
      )
      .addFields(
        { name: '👤 Membre', value: `<@${id}>`,                        inline: true },
        { name: '📊 Statut', value: wasGele ? '🟢 Actif' : '🧊 Gelé', inline: true },
        { name: '👮 Par',    value: `<@${message.author.id}>`,          inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Gel` });

    return message.reply({ embeds: [embed] });
  }
};
