const { EmbedBuilder } = require('discord.js');
const { COLORS, error, success } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const cfg = require('../../utils/config');

const VALID_TIERS = ['tier1', 'tier2', 'tier3', 'all'];
const TIER_NUMS   = { tier1: [1], tier2: [2], tier3: [3], all: [1, 2, 3] };
const TIER_LABEL  = { 1: 'Tier 1 · Membre', 2: 'Tier 2 · Admin', 3: 'Tier 3 · Manager' };

module.exports = {
  name: 'blacklist',
  tier: 3,
  description: 'Blacklister un membre ou rôle pour un ou plusieurs tiers',
  usage: '!blacklist add <@user|@role> [tier1|tier2|tier3|all] | !blacklist remove <@user|@role> [tier] | !blacklist list | !blacklist clear [tier]',

  async execute(message, args) {
    const guildId = message.guild.id;
    const sub = args[0]?.toLowerCase();

    if (!sub || !['add', 'remove', 'list', 'clear'].includes(sub)) {
      return message.reply({ embeds: [error('Usage',
        '`!blacklist add @cible [tier1|tier2|tier3|all]` — Blacklister\n' +
        '`!blacklist remove @cible [tier1|tier2|tier3|all]` — Retirer\n' +
        '`!blacklist list` — Voir le blacklist par tier\n' +
        '`!blacklist clear [tier1|tier2|tier3]` — Vider (un tier ou tout)\n\n' +
        '> Sans tier précisé : `all` (tous les tiers)'
      )] });
    }

    // ── LIST ──────────────────────────────────────────────────────────
    if (sub === 'list') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('🚫 Blacklist des commandes par tier')
        .setTimestamp()
        .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Blacklist` });

      for (const t of [1, 2, 3]) {
        const users = cfg.getBlacklistedUsers(guildId, t);
        const roles = cfg.getBlacklistedRoles(guildId, t);
        const usersText = users.length ? users.map(id => `<@${id}>`).join(' ') : '*Aucun*';
        const rolesText = roles.length ? roles.map(id => `<@&${id}>`).join(' ') : '*Aucun*';
        embed.addFields({
          name: `${TIER_LABEL[t]}`,
          value: `👤 ${usersText}\n🎭 ${rolesText}`,
          inline: false,
        });
      }

      return message.reply({ embeds: [embed] });
    }

    // ── CLEAR ─────────────────────────────────────────────────────────
    if (sub === 'clear') {
      const tierArg = args[1]?.toLowerCase();
      const tiers = tierArg && VALID_TIERS.includes(tierArg)
        ? TIER_NUMS[tierArg]
        : [1, 2, 3];

      for (const t of tiers) {
        await cfg.set(`blacklist_t${t}_users`, JSON.stringify([]), guildId);
        await cfg.set(`blacklist_t${t}_roles`, JSON.stringify([]), guildId);
      }
      const label = tiers.length === 3 ? 'tous les tiers' : tiers.map(t => `Tier ${t}`).join(', ');
      return message.reply({ embeds: [success('Blacklist vidé', `Le blacklist a été réinitialisé pour : **${label}**.`)] });
    }

    // ── ADD / REMOVE ──────────────────────────────────────────────────
    const raw = args[1];
    if (!raw) {
      return message.reply({ embeds: [error('Cible manquante', 'Mentionne un membre `@pseudo` ou un rôle `@role`.')] });
    }

    const userMatch = raw.match(/^<@!?(\d+)>$/) || (/^\d{17,19}$/.test(raw) ? [null, raw] : null);
    const roleMatch = raw.match(/^<@&(\d+)>$/);

    if (!userMatch && !roleMatch) {
      return message.reply({ embeds: [error('Cible invalide', 'Mentionne un membre `@pseudo` ou un rôle `@role`.')] });
    }

    const tierArg = args[2]?.toLowerCase();
    const tiers = (tierArg && VALID_TIERS.includes(tierArg)) ? TIER_NUMS[tierArg] : [1, 2, 3];
    const tiersLabel = tiers.length === 3 ? 'tous les tiers' : tiers.map(t => `Tier ${t}`).join(', ');

    // ── Rôle ──────────────────────────────────────────────────────────
    if (roleMatch) {
      const roleId = roleMatch[1];
      const role = message.guild.roles.cache.get(roleId);
      const roleName = role ? role.name : roleId;

      if (sub === 'add') {
        for (const t of tiers) await cfg.addBlacklistRole(roleId, guildId, t);
        return message.reply({ embeds: [success('Rôle blacklisté',
          `Le rôle **${roleName}** est blacklisté pour : **${tiersLabel}**.`
        )] });
      } else {
        for (const t of tiers) await cfg.removeBlacklistRole(roleId, guildId, t);
        return message.reply({ embeds: [success('Rôle retiré',
          `Le rôle **${roleName}** a été retiré du blacklist pour : **${tiersLabel}**.`
        )] });
      }
    }

    // ── Membre ────────────────────────────────────────────────────────
    if (userMatch) {
      const userId = userMatch[1];

      let targetMember = null;
      try { targetMember = await message.guild.members.fetch(userId); } catch {}

      if (sub === 'add' && targetMember) {
        if (targetMember.permissions.has(8n) || hasTier3(targetMember)) {
          return message.reply({ embeds: [error('Action impossible', 'Tu ne peux pas blacklister un **Manager** ou un **Administrateur**.')] });
        }
      }

      const username = targetMember?.user?.username || userId;

      if (sub === 'add') {
        for (const t of tiers) await cfg.addBlacklistUser(userId, guildId, t);
        return message.reply({ embeds: [success('Membre blacklisté',
          `**${username}** (<@${userId}>) est blacklisté pour : **${tiersLabel}**.`
        )] });
      } else {
        for (const t of tiers) await cfg.removeBlacklistUser(userId, guildId, t);
        return message.reply({ embeds: [success('Membre retiré',
          `**${username}** (<@${userId}>) a été retiré du blacklist pour : **${tiersLabel}**.`
        )] });
      }
    }
  }
};
