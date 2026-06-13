const { EmbedBuilder } = require('discord.js');
const { error, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');
const cfg = require('../../utils/config');
const logger = require('../../utils/logger');

const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

// ═══════════════════════════════════════════════════════════════
//  HIÉRARCHIE — du rang le plus haut (index 0) au plus bas
//  Modifiez uniquement les IDs si vous renommez des rôles.
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

// ── Rôles de division (auto-assignés, pas des rangs) ────────────
//  Groupes A+B → Division 1  |  Groupes C+D → Division 2  |  Groupes E+F → Division 3
//  Ajustez la répartition ci-dessous selon votre serveur.
const DIVISION_ROLES = [
  '1504870704686829569', // Division 1 (ex: Helpeur / Supervision)
  '1496563079872516327', // Division 2 (ex: Modération / Direction)
  '1488984936969928714', // Division 3 (ex: Administration / Fondation)
];

// Mapping rang → rôle de division correspondant
const RANK_TO_DIVISION = {
  // Groupe A → Division 1
  '1511089747731153046': '1504870704686829569',
  '1511090067207098478': '1504870704686829569',
  '1511090225097736394': '1504870704686829569',
  '1511090650534248599': '1504870704686829569',
  // Groupe B → Division 1
  '1492236544940048617': '1504870704686829569',
  '1508096921959399455': '1504870704686829569',
  '1476991164463710228': '1504870704686829569',
  '1488991536107753573': '1504870704686829569',
  // Groupe C → Division 2
  '1507999125189427311': '1496563079872516327',
  '1506758354993811536': '1496563079872516327',
  '1506758584443080735': '1496563079872516327',
  // Groupe D → Division 2
  '1499337309164929054': '1496563079872516327',
  '1499337608453689394': '1496563079872516327',
  '1508000050142515280': '1496563079872516327',
  '1499339571266064445': '1496563079872516327',
  // Groupe E → Division 3
  '1484633779011190894': '1488984936969928714',
  '1477001347592356031': '1488984936969928714',
  '1477001781958672445': '1488984936969928714',
  '1488986984285470790': '1488984936969928714',
  // Groupe F → Division 3
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
  return -1; // Pas encore dans la hiérarchie
}

async function applyRoleChange(member, newRoleId) {
  // 1. Supprimer tous les rôles de rang actuels
  const toRemove = RANK_HIERARCHY.filter(id => member.roles.cache.has(id));
  for (const id of toRemove) {
    await member.roles.remove(id).catch(() => {});
  }

  // 2. Ajouter le nouveau rang
  await member.roles.add(newRoleId).catch(() => {});

  // 3. Mettre à jour le rôle de division
  const newDivision = RANK_TO_DIVISION[newRoleId];
  if (newDivision) {
    // Retirer les autres rôles de division
    for (const divId of DIVISION_ROLES) {
      if (divId !== newDivision && member.roles.cache.has(divId)) {
        await member.roles.remove(divId).catch(() => {});
      }
    }
    // Ajouter la nouvelle division si pas déjà là
    if (!member.roles.cache.has(newDivision)) {
      await member.roles.add(newDivision).catch(() => {});
    }
  }
}

// ════════════════════════════════════════════════════════════════
module.exports = {
  name: 'promo',
  tier: 3,
  description: 'Promouvoir un membre d\'un rang dans la hiérarchie',
  usage: '!promo @user [raison]',

  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', '`!promo @user [raison]`\nEx : `!promo @Matt Investissement exemplaire ce mois-ci`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const raison = args.slice(1).join(' ').trim() || 'Aucune raison précisée';
    const guildId = message.guild.id;
    const now = Math.floor(Date.now() / 1000);

    const currentIndex = getCurrentRankIndex(member);

    // Déjà au rang le plus haut
    if (currentIndex === 0) {
      return message.reply({ embeds: [error('Rang maximum atteint', `<@${member.id}> est déjà au **rang le plus élevé** de la hiérarchie.`)] });
    }

    // Pas encore dans la hiérarchie → entre au rang le plus bas
    const newIndex = currentIndex === -1 ? RANK_HIERARCHY.length - 1 : currentIndex - 1;
    const oldRoleId = currentIndex === -1 ? null : RANK_HIERARCHY[currentIndex];
    const newRoleId = RANK_HIERARCHY[newIndex];
    const newDivisionId = RANK_TO_DIVISION[newRoleId];

    // Appliquer les changements de rôles
    await applyRoleChange(member, newRoleId);

    // ── DM de félicitations ────────────────────────────────────
    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(`🎉 | Félicitations ! Tu as été promu(e) — ${message.guild.name}`)
      .setDescription(
        `Bonne nouvelle ! Tu viens d'être **promu(e)** au sein de la hiérarchie de **${message.guild.name}**.\n\n` +
        `Continue comme ça, ton implication est remarquée. Merci pour ton travail ! 💪`
      )
      .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
      .addFields(
        ...(oldRoleId ? [{ name: '📤 Ancien rang', value: `<@&${oldRoleId}>`, inline: true }] : []),
        { name: '📥 Nouveau rang', value: `<@&${newRoleId}>`, inline: true },
        ...(newDivisionId ? [{ name: '🏷️ Division', value: `<@&${newDivisionId}>`, inline: true }] : []),
        { name: '📋 Raison', value: raison, inline: false },
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

    // ── Log dans le salon logs ─────────────────────────────────
    await logger.log(guildId, 'admin', `🎉 Promotion — ${member.user.username}`, [
      { name: '👤 Membre', value: `<@${member.id}> (${member.user.username})`, inline: true },
      { name: '👮 Par', value: `<@${message.author.id}>`, inline: true },
      ...(oldRoleId ? [{ name: '📤 Ancien rang', value: `<@&${oldRoleId}>`, inline: true }] : [{ name: '📤 Entrée', value: 'Premier rang', inline: true }]),
      { name: '📥 Nouveau rang', value: `<@&${newRoleId}>`, inline: true },
      ...(newDivisionId ? [{ name: '🏷️ Division', value: `<@&${newDivisionId}>`, inline: true }] : []),
      { name: '📨 DM', value: dmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
      { name: '📋 Raison', value: raison, inline: false },
    ]);

    // ── Log dans le salon manager si configuré ─────────────────
    const managerChannelId = cfg.getManagerChannelId(guildId) || cfg.getAdminChannelId(guildId);
    if (managerChannelId) {
      const managerChannel = message.guild.channels.cache.get(managerChannelId);
      if (managerChannel) {
        const managerEmbed = new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('🎉 | Promotion enregistrée')
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: '👤 Promu(e)', value: `<@${member.id}> (${member.user.username})`, inline: true },
            { name: '👮 Par', value: `<@${message.author.id}>`, inline: true },
            ...(oldRoleId ? [{ name: '📤 Ancien rang', value: `<@&${oldRoleId}>`, inline: true }] : [{ name: '📤 Entrée', value: 'Premier rang attribué', inline: true }]),
            { name: '📥 Nouveau rang', value: `<@&${newRoleId}>`, inline: true },
            ...(newDivisionId ? [{ name: '🏷️ Division', value: `<@&${newDivisionId}>`, inline: true }] : []),
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
        .setColor(COLORS.success)
        .setTitle('✅ | Promotion effectuée')
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: '👤 Membre', value: `<@${member.id}>`, inline: true },
          ...(oldRoleId ? [{ name: '📤 Ancien rang', value: `<@&${oldRoleId}>`, inline: true }] : []),
          { name: '📥 Nouveau rang', value: `<@&${newRoleId}>`, inline: true },
          ...(newDivisionId ? [{ name: '🏷️ Division', value: `<@&${newDivisionId}>`, inline: true }] : []),
          { name: '📨 DM', value: dmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
          { name: '📋 Raison', value: raison, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `${BOT()} • Promotion par ${message.author.username}` })
    ]});
  }
};
