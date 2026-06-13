const { EmbedBuilder } = require('discord.js');
const { error, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');
const cfg = require('../../utils/config');
const logger = require('../../utils/logger');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

// ═══════════════════════════════════════════════════════════════
//  HIÉRARCHIE — identique à promo.js
//  Toute modification ici doit être répercutée dans promo.js
// ═══════════════════════════════════════════════════════════════

const RANK_HIERARCHY = [
  // ── Groupe A (rangs supérieurs) ──────────────────────────────
  '1511089747731153046',
  '1511090067207098478',
  '1511090225097736394',
  '1511090650534248599',
  // ── Groupe B ─────────────────────────────────────────────────
  '1492236544940048617',
  '1508096921959399455',
  '1476991164463710228',
  '1488991536107753573',
  // ── Groupe C ─────────────────────────────────────────────────
  '1507999125189427311',
  '1506758354993811536',
  '1506758584443080735',
  // ── Groupe D ─────────────────────────────────────────────────
  '1499337309164929054',
  '1499337608453689394',
  '1508000050142515280',
  '1499339571266064445',
  // ── Groupe E ─────────────────────────────────────────────────
  '1484633779011190894',
  '1477001347592356031',
  '1477001781958672445',
  '1488986984285470790',
  // ── Groupe F (rangs inférieurs) ──────────────────────────────
  '1484634220214358199',
  '1477001887629967481',
  '1477001993405857954',
  '1488987091034701895',
];

const DIVISION_ROLES = [
  '1504870704686829569',
  '1496563079872516327',
  '1488984936969928714',
];

const RANK_TO_DIVISION = {
  '1511089747731153046': '1504870704686829569',
  '1511090067207098478': '1504870704686829569',
  '1511090225097736394': '1504870704686829569',
  '1511090650534248599': '1504870704686829569',
  '1492236544940048617': '1504870704686829569',
  '1508096921959399455': '1504870704686829569',
  '1476991164463710228': '1504870704686829569',
  '1488991536107753573': '1504870704686829569',
  '1507999125189427311': '1496563079872516327',
  '1506758354993811536': '1496563079872516327',
  '1506758584443080735': '1496563079872516327',
  '1499337309164929054': '1496563079872516327',
  '1499337608453689394': '1496563079872516327',
  '1508000050142515280': '1496563079872516327',
  '1499339571266064445': '1496563079872516327',
  '1484633779011190894': '1488984936969928714',
  '1477001347592356031': '1488984936969928714',
  '1477001781958672445': '1488984936969928714',
  '1488986984285470790': '1488984936969928714',
  '1484634220214358199': '1488984936969928714',
  '1477001887629967481': '1488984936969928714',
  '1477001993405857954': '1488984936969928714',
  '1488987091034701895': '1488984936969928714',
};

// ── Utilitaires ──────────────────────────────────────────────────

function getCurrentRankIndex(member) {
  for (let i = 0; i < RANK_HIERARCHY.length; i++) {
    if (member.roles.cache.has(RANK_HIERARCHY[i])) return i;
  }
  return -1;
}

async function applyRoleChange(member, newRoleId) {
  const toRemove = RANK_HIERARCHY.filter(id => member.roles.cache.has(id));
  for (const id of toRemove) {
    await member.roles.remove(id).catch(() => {});
  }

  await member.roles.add(newRoleId).catch(() => {});

  const newDivision = RANK_TO_DIVISION[newRoleId];
  if (newDivision) {
    for (const divId of DIVISION_ROLES) {
      if (divId !== newDivision && member.roles.cache.has(divId)) {
        await member.roles.remove(divId).catch(() => {});
      }
    }
    if (!member.roles.cache.has(newDivision)) {
      await member.roles.add(newDivision).catch(() => {});
    }
  }
}

// ════════════════════════════════════════════════════════════════
module.exports = {
  name: 'retro',
  tier: 3,
  description: 'Rétrograder un membre d\'un rang dans la hiérarchie',
  usage: '!retro @user [raison]',

  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', '`!retro @user [raison]`\nEx : `!retro @Matt Manque d\'implication répété`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const raison = args.slice(1).join(' ').trim() || 'Aucune raison précisée';
    const guildId = message.guild.id;
    const now = Math.floor(Date.now() / 1000);

    const currentIndex = getCurrentRankIndex(member);

    // Pas dans la hiérarchie
    if (currentIndex === -1) {
      return message.reply({ embeds: [error('Non classé', `<@${member.id}> n'a **aucun rang** dans la hiérarchie. Utilisez \`!promo\` pour lui en attribuer un.`)] });
    }

    // Déjà au rang le plus bas
    if (currentIndex === RANK_HIERARCHY.length - 1) {
      return message.reply({ embeds: [error('Rang minimum atteint', `<@${member.id}> est déjà au **rang le plus bas** de la hiérarchie.\nUtilisez \`!renvoi\` pour le retirer complètement.`)] });
    }

    const oldRoleId = RANK_HIERARCHY[currentIndex];
    const newRoleId = RANK_HIERARCHY[currentIndex + 1];
    const newDivisionId = RANK_TO_DIVISION[newRoleId];
    const oldDivisionId = RANK_TO_DIVISION[oldRoleId];
    const divisionChanged = oldDivisionId !== newDivisionId;

    // Appliquer les changements de rôles
    await applyRoleChange(member, newRoleId);

    // ── DM de notification ─────────────────────────────────────
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle(`📉 | Rétrogradation — ${message.guild.name}`)
      .setDescription(
        `Suite à une décision de l'équipe de management de **${message.guild.name}**, ` +
        `tu as été **rétrogradé(e)** d'un rang dans la hiérarchie.\n\n` +
        `Nous espérons que cette décision te motivera à t'investir davantage. 💪`
      )
      .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
      .addFields(
        { name: '📤 Ancien rang', value: `<@&${oldRoleId}>`, inline: true },
        { name: '📥 Nouveau rang', value: `<@&${newRoleId}>`, inline: true },
        ...(divisionChanged && newDivisionId ? [{ name: '🏷️ Nouvelle division', value: `<@&${newDivisionId}>`, inline: true }] : []),
        { name: '📋 Raison', value: raison, inline: false },
        { name: '👮 Décidé par', value: message.author.username, inline: true },
        { name: '📅 Date', value: `<t:${now}:F>`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Rétrogradation` });

    let dmSent = false;
    try {
      await member.user.send({ embeds: [dmEmbed] });
      dmSent = true;
    } catch {}

    // ── Log dans le salon logs ─────────────────────────────────
    await logger.log(guildId, 'warning', `📉 Rétrogradation — ${member.user.username}`, [
      { name: '👤 Membre', value: `<@${member.id}> (${member.user.username})`, inline: true },
      { name: '👮 Par', value: `<@${message.author.id}>`, inline: true },
      { name: '📤 Ancien rang', value: `<@&${oldRoleId}>`, inline: true },
      { name: '📥 Nouveau rang', value: `<@&${newRoleId}>`, inline: true },
      ...(divisionChanged && newDivisionId ? [{ name: '🏷️ Nouvelle division', value: `<@&${newDivisionId}>`, inline: true }] : []),
      { name: '📨 DM', value: dmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
      { name: '📋 Raison', value: raison, inline: false },
    ]);

    // ── Log dans le salon manager si configuré ─────────────────
    const managerChannelId = cfg.getManagerChannelId(guildId) || cfg.getAdminChannelId(guildId);
    if (managerChannelId) {
      const managerChannel = message.guild.channels.cache.get(managerChannelId);
      if (managerChannel) {
        const managerEmbed = new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('📉 | Rétrogradation enregistrée')
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: '👤 Membre', value: `<@${member.id}> (${member.user.username})`, inline: true },
            { name: '👮 Par', value: `<@${message.author.id}>`, inline: true },
            { name: '📤 Ancien rang', value: `<@&${oldRoleId}>`, inline: true },
            { name: '📥 Nouveau rang', value: `<@&${newRoleId}>`, inline: true },
            ...(divisionChanged && newDivisionId ? [{ name: '🏷️ Nouvelle division', value: `<@&${newDivisionId}>`, inline: true }] : []),
            { name: '📋 Raison', value: raison, inline: false },
          )
          .setTimestamp()
          .setFooter({ text: `${BOT()} • ID: ${member.id}` });
        await managerChannel.send({ embeds: [managerEmbed] }).catch(() => {});
      }
    }

    // ── Confirmation dans le salon ─────────────────────────────
    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('✅ | Rétrogradation effectuée')
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '👤 Membre', value: `<@${member.id}>`, inline: true },
          { name: '📤 Ancien rang', value: `<@&${oldRoleId}>`, inline: true },
          { name: '📥 Nouveau rang', value: `<@&${newRoleId}>`, inline: true },
          ...(divisionChanged && newDivisionId ? [{ name: '🏷️ Nouvelle division', value: `<@&${newDivisionId}>`, inline: true }] : []),
          { name: '📨 DM', value: dmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
          { name: '📋 Raison', value: raison, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `${BOT()} • Rétrogradation par ${message.author.username}` })
    ]});
  }
};
