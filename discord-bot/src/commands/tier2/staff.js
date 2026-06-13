const db  = require('../../database');
const cfg = require('../../utils/config');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier2 } = require('../../utils/helpers');

const PER_PAGE    = 8;
const TIMEOUT_MS  = 15 * 60 * 1000; // 15 minutes
const BOT         = () => process.env.BOT_NAME || 'CONNEXION BOT';

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
  if (!dbUser)                                      return '⚫';
  if (dbUser.gele)                                  return '🔒';
  if (activeAbsenceIds.has(dbUser.discord_id))      return '🌙';
  if (dbUser.session_start !== null)                return '🟢';
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

function buildRow(authorId, page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`staff_prev_${authorId}_${page}`)
      .setEmoji('◀️')
      .setLabel('Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
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
      .setDisabled(disabled || page >= totalPages - 1),
  );
}

async function buildStaffData(guild) {
  await guild.members.fetch().catch(() => {});

  const allMembers = guild.members.cache
    .filter(m => !m.user.bot)
    .sort((a, b) => {
      const topA = a.roles.cache.filter(r => r.id !== guild.id).sort((x, y) => y.position - x.position).first()?.position ?? 0;
      const topB = b.roles.cache.filter(r => r.id !== guild.id).sort((x, y) => y.position - x.position).first()?.position ?? 0;
      return topB - topA;
    })
    .map(m => m);

  const dbUsers          = db.getAllUsers();
  const dbMap            = new Map(dbUsers.map(u => [u.discord_id, u]));
  const activeAbsenceIds = new Set(db.getActiveAbsences(guild.id).map(a => a.discord_id));

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
    let   curPage    = 0;

    const embed = buildPage(members, dbMap, activeAbsenceIds, guildId, curPage, totalPages);
    const row   = buildRow(message.author.id, curPage, totalPages);

    const reply = await message.reply({
      embeds:     [embed],
      components: totalPages > 1 ? [row] : [],
    });

    if (totalPages <= 1) return;

    // ── Collecteur de boutons — expire après 15 minutes ──────────
    const collector = reply.createMessageComponentCollector({
      filter: i => i.customId.startsWith('staff_') && i.user.id === message.author.id,
      time:   TIMEOUT_MS,
    });

    collector.on('collect', async interaction => {
      try {
        const dir     = interaction.customId.startsWith('staff_prev_') ? 'prev' : 'next';
        const newPage = dir === 'next' ? curPage + 1 : curPage - 1;

        if (newPage < 0 || newPage >= totalPages) {
          return interaction.reply({ content: '❌ Page invalide.', ephemeral: true });
        }

        curPage = newPage;

        // Rafraîchir les données à chaque changement de page
        const fresh = await buildStaffData(interaction.guild);
        const newEmbed = buildPage(fresh.members, fresh.dbMap, fresh.activeAbsenceIds, guildId, curPage, totalPages);
        const newRow   = buildRow(message.author.id, curPage, totalPages);

        await interaction.update({ embeds: [newEmbed], components: [newRow] });
      } catch (e) {
        console.error('[Staff] Erreur collecteur :', e.message);
      }
    });

    // ── Expiration : désactiver les boutons ──────────────────────
    collector.on('end', async () => {
      try {
        const expiredRow = buildRow(message.author.id, curPage, totalPages, true);
        const expiredEmbed = buildPage(members, dbMap, activeAbsenceIds, guildId, curPage, totalPages)
          .setFooter({ text: `${BOT()} • Interaction expirée (15 min)  ·  ${members.length} membres` });
        await reply.edit({ embeds: [expiredEmbed], components: [expiredRow] });
      } catch {}
    });
  },

  // Exports pour compatibilité (plus utilisés par index.js mais conservés)
  buildPage,
  buildRow,
  buildStaffData,
  PER_PAGE,
};
