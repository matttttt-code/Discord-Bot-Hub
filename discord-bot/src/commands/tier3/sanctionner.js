const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { success, error, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');
const cfg = require('../../utils/config');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

module.exports = {
  name: 'sanctionner',
  tier: 3,
  description: 'Émettre une sanction formelle à un membre (DM + log salon + enregistrement)',
  usage: '!sanctionner @user [raison]',

  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', '`!sanctionner @user [raison]` — Émettre une sanction formelle\nEx : `!sanctionner @Matt Absences répétées non justifiées`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const raison = args.slice(1).join(' ').trim();
    if (!raison) {
      return message.reply({ embeds: [error('Raison manquante', 'Tu dois préciser une raison.\nEx : `!sanctionner @Matt Absences répétées non justifiées`')] });
    }
    if (raison.length < 5) {
      return message.reply({ embeds: [error('Raison trop courte', 'La raison doit contenir au moins 5 caractères.')] });
    }

    const { id, username } = member.user;
    db.createUser(id, username);

    const warnings = db.getWarnings(id, message.guild.id);
    const sanctionNum = warnings.length + 1;

    const now = Math.floor(Date.now() / 1000);
    db.addWarning(id, message.guild.id, `[SANCTION] ${raison}`, message.author.username);

    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle(`⚠️ | Sanction formelle — ${message.guild.name}`)
      .setDescription(
        `Tu fais l'objet d'une **sanction formelle** de la part de l'équipe de gestion de **${message.guild.name}**.\n\n` +
        `Merci de prendre connaissance de cette décision et d'y remédier au plus vite.`
      )
      .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
      .addFields(
        { name: '📋 Raison', value: raison, inline: false },
        { name: '👮 Émise par', value: message.author.username, inline: true },
        { name: '🔢 Sanction n°', value: `**${sanctionNum}**`, inline: true },
        { name: '📅 Date', value: `<t:${now}:F>`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Sanction formelle` });

    let dmSent = false;
    try {
      await member.user.send({ embeds: [dmEmbed] });
      dmSent = true;
    } catch {}

    const logEmbed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setTitle(`⚠️ | Sanction formelle émise`)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '👤 Membre sanctionné', value: `<@${id}> (${username})`, inline: true },
        { name: '👮 Émise par', value: `<@${message.author.id}>`, inline: true },
        { name: '🔢 Sanction n°', value: `**${sanctionNum}**`, inline: true },
        { name: '📋 Raison', value: raison, inline: false },
        { name: '📨 DM envoyé', value: dmSent ? '✅ Oui' : '❌ Non (MP fermés)', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • ID: ${id}` });

    const adminChannelId = cfg.getAdminChannelId(message.guild.id)
                        || cfg.getManagerChannelId(message.guild.id);
    if (adminChannelId) {
      const logChannel = message.guild.channels.cache.get(adminChannelId);
      if (logChannel) {
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return message.reply({ embeds: [
      success('Sanction émise', `La sanction formelle a été enregistrée pour <@${id}>.`)
        .addFields(
          { name: '👤 Membre', value: `<@${id}>`, inline: true },
          { name: '🔢 Sanction n°', value: `**${sanctionNum}**`, inline: true },
          { name: '📨 DM', value: dmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
          { name: '📋 Raison', value: raison, inline: false },
        )
    ]});
  }
};
