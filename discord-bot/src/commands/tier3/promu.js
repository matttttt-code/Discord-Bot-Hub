const { EmbedBuilder } = require('discord.js');
const { success, error, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');
const cfg = require('../../utils/config');
const db = require('../../database');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

module.exports = {
  name: 'promu',
  tier: 3,
  description: 'Enregistrer une promotion staff avec DM + annonce dans le salon manager',
  usage: '!promu @user [@role] [message personnalisé]',

  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', '`!promu @user [@role] [message]` — Enregistrer une promotion\nEx : `!promu @Matt @Administration Félicitations pour ton travail !`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const { id, username } = member.user;
    db.createUser(id, username);

    const remaining = args.slice(1);

    let newRole = null;
    let customMsg = '';

    if (remaining.length) {
      const roleMentionMatch = remaining[0].match(/^<@&(\d+)>$/);
      if (roleMentionMatch) {
        newRole = message.guild.roles.cache.get(roleMentionMatch[1]) || null;
        customMsg = remaining.slice(1).join(' ').trim();
      } else {
        customMsg = remaining.join(' ').trim();
      }
    }

    const now = Math.floor(Date.now() / 1000);

    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(`🎉 | Félicitations — Promotion — ${message.guild.name}`)
      .setDescription(
        customMsg ||
        `Félicitations ! Tu viens d'être **promu(e)** au sein de l'équipe de **${message.guild.name}**.\n\nContinue comme ça, ton travail est reconnu ! 💪`
      )
      .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
      .addFields(
        ...(newRole ? [{ name: '🏅 Nouveau rôle', value: `<@&${newRole.id}>`, inline: true }] : []),
        { name: '👮 Décidé par', value: message.author.username, inline: true },
        { name: '📅 Date', value: `<t:${now}:F>`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Promotion` });

    let dmSent = false;
    try {
      await member.user.send({ embeds: [dmEmbed] });
      dmSent = true;
    } catch {}

    const logEmbed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('🎉 | Promotion enregistrée')
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '👤 Promu(e)', value: `<@${id}> (${username})`, inline: true },
        { name: '👮 Par', value: `<@${message.author.id}>`, inline: true },
        ...(newRole ? [{ name: '🏅 Nouveau rôle', value: `<@&${newRole.id}>`, inline: true }] : []),
        ...(customMsg ? [{ name: '💬 Message', value: customMsg, inline: false }] : []),
        { name: '📨 DM envoyé', value: dmSent ? '✅ Oui' : '❌ Non (MP fermés)', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • ID: ${id}` });

    const managerChannelId = cfg.getManagerChannelId(message.guild.id)
                           || cfg.getAdminChannelId(message.guild.id);
    if (managerChannelId) {
      const logChannel = message.guild.channels.cache.get(managerChannelId);
      if (logChannel) {
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return message.reply({ embeds: [
      success('Promotion enregistrée', `La promotion de <@${id}> a bien été enregistrée.`)
        .addFields(
          { name: '👤 Promu(e)', value: `<@${id}>`, inline: true },
          ...(newRole ? [{ name: '🏅 Nouveau rôle', value: `<@&${newRole.id}>`, inline: true }] : []),
          { name: '📨 DM', value: dmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
        )
    ]});
  }
};
