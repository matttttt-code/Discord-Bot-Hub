const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');

module.exports = {
  name: 'clearwarnings',
  tier: 3,
  description: 'Supprimer tous les avertissements d\'un membre',
  usage: '!clearwarnings @user',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Commande réservée aux gérants.')] });
    }

    if (!args[0]) {
      return message.reply({ embeds: [error('Usage', '`!clearwarnings @user` — Efface tous les avertissements d\'un membre.')] });
    }

    const target = await resolveUser(message.guild, args[0]);
    if (!target) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const { id, username } = target.user;
    const BOT   = process.env.BOT_NAME || 'CONNEXION BOT';
    const count = db.getWarnings(id, message.guild.id).length;

    if (count === 0) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('✅ Aucun avertissement')
          .setDescription(`<@${id}> n'a aucun avertissement à effacer.`)
          .setTimestamp()
          .setFooter({ text: `${BOT} • Avertissements` })
      ]});
    }

    db.clearWarnings(id, message.guild.id);

    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(`✅ Avertissements effacés — ${message.guild.name}`)
      .setDescription(`Tous tes avertissements sur **${message.guild.name}** ont été supprimés.`)
      .setTimestamp()
      .setFooter({ text: `${BOT} • Avertissements` });
    try { await target.user.send({ embeds: [dmEmbed] }); } catch {}

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ Avertissements effacés')
        .setDescription(`Les **${count}** avertissement${count > 1 ? 's' : ''} de <@${id}> ont été supprimés.`)
        .addFields(
          { name: '👤 Membre',    value: `<@${id}>`,                           inline: true },
          { name: '🗑️ Effacés', value: `**${count}** avertissement${count > 1 ? 's' : ''}`, inline: true },
          { name: '👮 Par',       value: `<@${message.author.id}>`,             inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `${BOT} • Avertissements` })
    ]});
  }
};
