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
  if (member.permissions.has(8n))                 return { label: '🏆 Manager',    level: 3 };
  if (tier3Id && member.roles.cache.has(tier3Id)) return { label: '🏆 Manager',    level: 3 };
  if (mgrId   && member.roles.cache.has(mgrId))  return { label: '🤖 Bot Manager', level: 3 };
  if (tier2Id && member.roles.cache.has(tier2Id)) return { label: '👮 Admin',       level: 2 };
  return { label: '👤 Membre', level: 1 };
}

function getHighestRole(member) {
  const role = member.roles.cache
    .filter(r => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .first();
  return role ? `<@&${role.id}>` : '`Aucun rôle`';
}

function getStatus(dbUser, activeAbsenceIds) {
  if (!dbUser)                           return '⚫';
  if (dbUser.gele)                       return '🔒';
  if (activeAbsenceIds.has(dbUser.discord_id)) return '🌙';
  if (dbUser.session_start !== null)     return '🟢';
  return '⚫';
}

function buildPage(members, dbMap, activeAbsenceIds, guildId, page, totalPages) {
  const slice = members.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const lines = slice.map(member => {
    const dbUser = dbMap.get(member.id);
    const tier   = getTierInfo(member, guildId);
    const role   = getHighestRole(member);
    const status = getStatus(dbUser, activeAbsenceIds);
    const co     = dbUser ? dbUser.total_connexions : 0;
    const name   = member.displayName || member.user.username;
    return [
      `${status} **${name}** — ${tier.label}`,
      `> Rôle : ${role}  ·  Connexions : \`${co}\``,
    ].join('\n');
  });

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('👥 | Staff — Novaguard Protect')
    .setDescription(lines.length ? lines.join('\n\n') : '*Aucun membre.*')
    .addFields({
      name: '📊 Légende',
      value: '🟢 Connecté  ·  🌙 Absent  ·  🔒 Gelé  ·  ⚫ Inactif / Non enregistré',
      inline: false,
    })
    .setFooter({ text: `${BOT()} • Page ${page + 1}/${totalPages}  ·  ${members.length} membres` })
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

  // Tous les membres Discord triés par position de rôle le plus haut (hiérarchie Discord)
  const allMembers = guild.members.cache
    .filter(m => !m.user.bot)
    .sort((a, b) => {
      const topA = a.roles.cache.filter(r => r.id !== guild.id).sort((x,y) => y.position - x.position).first()?.position ?? 0;
      const topB = b.roles.cache.filter(r => r.id !== guild.id).sort((x,y) => y.position - x.position).first()?.position ?? 0;
      return topB - topA;
    })
    .map(m => m);

  // Map discord_id → entrée DB
  const dbUsers  = db.getAllUsers();
  const dbMap    = new Map(dbUsers.map(u => [u.discord_id, u]));

  // Absences actives
  const activeAbsenceIds = new Set(db.getActiveAbsences(guildId).map(a => a.discord_id));

  return { members: allMembers, dbMap, activeAbsenceIds };
}

module.exports = {
  name: 'staff',
  tier: 2,
  description: 'Liste paginée de tous les membres du serveur triée par hiérarchie',
  usage: '!staff',
  async execute(message) {
    if (!hasTier2(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Cette commande nécessite le rôle **Admin** ou supérieur.')] });
    }

    const guildId = message.guild.id;
    const { members, dbMap, activeAbsenceIds } = await buildStaffData(message.guild);

    const totalPages = Math.max(1, Math.ceil(members.length / PER_PAGE));
    const embed = buildPage(members, dbMap, activeAbsenceIds, guildId, 0, totalPages);
    const row   = buildRow(message.author.id, 0, totalPages);

    await message.reply({
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
    });
  },

  buildPage,
  buildRow,
  buildStaffData,
  PER_PAGE,
};
