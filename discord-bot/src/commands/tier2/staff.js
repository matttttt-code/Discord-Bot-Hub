const db  = require('../../database');
const cfg = require('../../utils/config');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier2 } = require('../../utils/helpers');

const PER_PAGE = 8;
const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

function getTierInfo(member, guildId) {
  if (!member) return { label: '👤 Membre', level: 1 };
  const tier3Id = cfg.getTier3RoleId(guildId);
  const tier2Id = cfg.getTier2RoleId(guildId);
  const mgrId   = cfg.getBotManagerRoleId(guildId);
  if (member.permissions.has(8n))                       return { label: '🏆 Gérant',      level: 3 };
  if (tier3Id && member.roles.cache.has(tier3Id))       return { label: '🏆 Gérant',      level: 3 };
  if (mgrId   && member.roles.cache.has(mgrId))         return { label: '🤖 Bot Manager', level: 3 };
  if (tier2Id && member.roles.cache.has(tier2Id))       return { label: '👮 Admin',        level: 2 };
  return { label: '👤 Membre', level: 1 };
}

function getHighestRole(member) {
  if (!member) return '`Inconnu`';
  const role = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .first();
  return role ? `<@&${role.id}>` : '`Aucun rôle`';
}

function getStatus(user, activeAbsenceIds, guildId) {
  if (user.gele)                                         return '🔒';
  if (activeAbsenceIds.has(user.discord_id))             return '🌙';
  if (user.session_start !== null)                       return '🟢';
  return '⚫';
}

function buildPage(users, memberMap, activeAbsenceIds, guildId, page, totalPages) {
  const slice = users.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const lines = slice.map(u => {
    const member = memberMap.get(u.discord_id);
    const tier   = getTierInfo(member, guildId);
    const role   = getHighestRole(member);
    const status = getStatus(u, activeAbsenceIds, guildId);
    const name   = member ? (member.displayName || member.user.username) : u.username;
    return [
      `${status} **${name}** — ${tier.label}`,
      `> Rôle : ${role}  ·  Connexions : \`${u.total_connexions}\``,
    ].join('\n');
  });

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('👥 | Staff — Novaguard Protect')
    .setDescription(lines.length ? lines.join('\n\n') : '*Aucun membre enregistré.*')
    .addFields({
      name: '📊 Légende',
      value: '🟢 Connecté  ·  🌙 Absent  ·  🔒 Gelé  ·  ⚫ Inactif',
      inline: false,
    })
    .setFooter({ text: `${BOT()} • Page ${page + 1}/${totalPages}  ·  ${users.length} membres au total` })
    .setTimestamp();
}

function buildRow(authorId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_prev_${authorId}_${page}`)
      .setEmoji('◀️')
      .setLabel('Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`staff_page_${authorId}_${page}`)
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`staff_next_${authorId}_${page}`)
      .setEmoji('▶️')
      .setLabel('Suivant')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages - 1),
  );
}

async function buildStaffData(guild) {
  const guildId = guild.id;
  await guild.members.fetch().catch(() => {});

  const allUsers = db.getAllUsers();
  const memberMap = new Map();
  for (const u of allUsers) {
    const m = guild.members.cache.get(u.discord_id);
    if (m) memberMap.set(u.discord_id, m);
  }

  // Trier : tier3 > tier2 > tier1, puis par connexions desc
  const sorted = allUsers
    .map(u => ({ ...u, tierLevel: getTierInfo(memberMap.get(u.discord_id), guildId).level }))
    .sort((a, b) => b.tierLevel - a.tierLevel || b.total_connexions - a.total_connexions);

  const nowTs = Math.floor(Date.now() / 1000);
  const activeAbsenceIds = new Set(
    db.getActiveAbsences(guildId).map(a => a.discord_id)
  );

  return { sorted, memberMap, activeAbsenceIds };
}

module.exports = {
  name: 'staff',
  tier: 2,
  description: 'Liste paginée de tous les membres enregistrés avec leur tier et rôle',
  usage: '!staff',
  async execute(message) {
    if (!hasTier2(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Cette commande nécessite le rôle **Admin** ou supérieur.')] });
    }

    const guildId = message.guild.id;
    const { sorted, memberMap, activeAbsenceIds } = await buildStaffData(message.guild);

    if (sorted.length === 0) {
      return message.reply({ embeds: [error('Aucun membre', 'Aucun membre n\'est encore enregistré dans le bot.')] });
    }

    const totalPages = Math.ceil(sorted.length / PER_PAGE);
    const embed = buildPage(sorted, memberMap, activeAbsenceIds, guildId, 0, totalPages);
    const row   = buildRow(message.author.id, 0, totalPages);

    await message.reply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
    });
  },

  // Exposé pour le handler de pagination dans index.js
  buildPage,
  buildRow,
  buildStaffData,
  PER_PAGE,
};
