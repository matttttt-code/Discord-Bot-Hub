const { EmbedBuilder } = require('discord.js');
const { error, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');

module.exports = {
  name: 'revive',
  tier: 3,
  description: 'Envoyer un MP à un membre pour lui demander de reprendre son activité',
  usage: '!revive @user [message personnalisé]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', '`!revive @user [message]` — Envoie un MP de relance à un membre')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });

    const customMsg = args.slice(1).join(' ');

    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📣 | Relance d'activité — ${message.guild.name}`)
      .setDescription(
        customMsg ||
        `Hey ! L'équipe du serveur **${message.guild.name}** a remarqué que ton activité a baissé récemment.\n\nOn espère te revoir très bientôt ! N'oublie pas d'utiliser \`!c\` pour enregistrer tes connexions. 💪`
      )
      .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
      .addFields(
        { name: '📡 Serveur', value: message.guild.name, inline: true },
        { name: '👮 Message de', value: message.author.username, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Relance` });

    let dmSent = false;
    try {
      await member.user.send({ embeds: [dmEmbed] });
      dmSent = true;
    } catch {}

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(dmSent ? COLORS.success : COLORS.warning)
        .setTitle(dmSent ? '✅ MP de relance envoyé' : '⚠️ MP impossible à envoyer')
        .setDescription(
          dmSent
            ? `Un message de relance a bien été envoyé à <@${member.user.id}>.`
            : `<@${member.user.id}> a ses MP désactivés. Le message n'a pas pu être envoyé.`
        )
        .addFields({ name: '👤 Membre', value: `<@${member.user.id}>`, inline: true })
        .setTimestamp()
        .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Relance` })
    ]});
  }
};
