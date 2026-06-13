const { EmbedBuilder } = require('discord.js');
const { success, error, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');
const cfg = require('../../utils/config');
const db = require('../../database');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

module.exports = {
  name: 'renvoi',
  tier: 3,
  description: 'Renvoyer un membre du staff : DM + log salon + kick Discord optionnel',
  usage: '!renvoi @user [raison] | !renvoi @user kick [raison]',

  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', [
        '`!renvoi @user [raison]` — Renvoi avec DM + log (sans kick Discord)',
        '`!renvoi @user kick [raison]` — Renvoi + kick Discord',
      ].join('\n'))] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    if (member.id === message.author.id) {
      return message.reply({ embeds: [error('Action impossible', 'Tu ne peux pas te renvoyer toi-même.')] });
    }

    if (member.permissions.has(8n)) {
      return message.reply({ embeds: [error('Action impossible', 'Impossible de renvoyer un administrateur.')] });
    }

    const { id, username } = member.user;
    db.createUser(id, username);

    const subArgs = args.slice(1);
    let doKick = false;
    let raison = '';

    if (subArgs[0]?.toLowerCase() === 'kick') {
      doKick = true;
      raison = subArgs.slice(1).join(' ').trim();
    } else {
      raison = subArgs.join(' ').trim();
    }

    if (!raison) {
      return message.reply({ embeds: [error('Raison manquante', 'Tu dois préciser une raison.\nEx : `!renvoi @Matt Comportement inapproprié répété`')] });
    }

    const now = Math.floor(Date.now() / 1000);

    const dmEmbed = new EmbedBuilder()
      .setColor(0x2C2F33)
      .setTitle(`📢 | Décision de renvoi — ${message.guild.name}`)
      .setDescription(
        `Suite à une décision de l'équipe de management de **${message.guild.name}**, ` +
        `tu es notifié(e) de ton **renvoi** de l'équipe staff.\n\n` +
        `Nous te remercions pour ta participation et te souhaitons bonne continuation.`
      )
      .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
      .addFields(
        { name: '📋 Motif', value: raison, inline: false },
        { name: '👮 Décidé par', value: message.author.username, inline: true },
        { name: '📅 Date', value: `<t:${now}:F>`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Renvoi` });

    let dmSent = false;
    try {
      await member.user.send({ embeds: [dmEmbed] });
      dmSent = true;
    } catch {}

    let kicked = false;
    if (doKick) {
      try {
        await member.kick(`Renvoi par ${message.author.username} : ${raison}`);
        kicked = true;
      } catch {
        kicked = false;
      }
    }

    db.addWarning(id, message.guild.id, `[RENVOI] ${raison}`, message.author.username);

    const logEmbed = new EmbedBuilder()
      .setColor(0x2C2F33)
      .setTitle('📢 | Renvoi enregistré')
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '👤 Membre renvoyé', value: `<@${id}> (${username})`, inline: true },
        { name: '👮 Décidé par', value: `<@${message.author.id}>`, inline: true },
        { name: '📋 Motif', value: raison, inline: false },
        { name: '📨 DM envoyé', value: dmSent ? '✅ Oui' : '❌ Non (MP fermés)', inline: true },
        { name: '🚪 Kick Discord', value: doKick ? (kicked ? '✅ Effectué' : '❌ Échec (permissions ?)') : '➖ Non demandé', inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • ID: ${id}` });

    const adminChannelId = cfg.getManagerChannelId(message.guild.id)
                        || cfg.getAdminChannelId(message.guild.id);
    if (adminChannelId) {
      const logChannel = message.guild.channels.cache.get(adminChannelId);
      if (logChannel) {
        await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }

    return message.reply({ embeds: [
      success('Renvoi enregistré', `Le renvoi de <@${id}> a été traité.`)
        .addFields(
          { name: '👤 Membre', value: `<@${id}>`, inline: true },
          { name: '📨 DM', value: dmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
          { name: '🚪 Kick', value: doKick ? (kicked ? '✅ Effectué' : '❌ Échec') : '➖ Non demandé', inline: true },
          { name: '📋 Motif', value: raison, inline: false },
        )
    ]});
  }
};
