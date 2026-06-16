const { EmbedBuilder } = require('discord.js');
const { COLORS, error, success } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const cfg = require('../../utils/config');

module.exports = {
  name: 'blacklist',
  tier: 3,
  description: 'Blacklister un membre ou rôle des commandes bot',
  usage: '!blacklist add <@user|@role> | !blacklist remove <@user|@role> | !blacklist list | !blacklist clear',

  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }

    const guildId = message.guild.id;
    const sub = args[0]?.toLowerCase();

    if (!sub || !['add', 'remove', 'list', 'clear'].includes(sub)) {
      return message.reply({ embeds: [error('Usage',
        '`!blacklist add @membre` — Blacklister un membre\n' +
        '`!blacklist add @role` — Blacklister un rôle\n' +
        '`!blacklist remove @membre` — Retirer du blacklist\n' +
        '`!blacklist remove @role` — Retirer un rôle du blacklist\n' +
        '`!blacklist list` — Voir le blacklist\n' +
        '`!blacklist clear` — Vider le blacklist'
      )] });
    }

    // ── LIST ──────────────────────────────────────────────────────────
    if (sub === 'list') {
      const users = cfg.getBlacklistedUsers(guildId);
      const roles = cfg.getBlacklistedRoles(guildId);

      const embed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('🚫 Blacklist des commandes')
        .addFields(
          {
            name: `👤 Membres blacklistés (${users.length})`,
            value: users.length ? users.map(id => `<@${id}>`).join('\n') : '*Aucun*',
            inline: false,
          },
          {
            name: `🎭 Rôles blacklistés (${roles.length})`,
            value: roles.length ? roles.map(id => `<@&${id}>`).join('\n') : '*Aucun*',
            inline: false,
          },
        )
        .setTimestamp()
        .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Blacklist` });

      return message.reply({ embeds: [embed] });
    }

    // ── CLEAR ─────────────────────────────────────────────────────────
    if (sub === 'clear') {
      await cfg.set('blacklist_users', JSON.stringify([]), guildId);
      await cfg.set('blacklist_roles', JSON.stringify([]), guildId);
      return message.reply({ embeds: [success('Blacklist vidé', 'Tous les membres et rôles ont été retirés du blacklist.')] });
    }

    // ── ADD / REMOVE ──────────────────────────────────────────────────
    const raw = args[1];
    if (!raw) {
      return message.reply({ embeds: [error('Cible manquante', 'Mentionne un membre `@pseudo` ou un rôle `@role`.')] });
    }

    const userMatch = raw.match(/^<@!?(\d+)>$/) || (/^\d{17,19}$/.test(raw) ? [null, raw] : null);
    const roleMatch = raw.match(/^<@&(\d+)>$/);

    if (!userMatch && !roleMatch) {
      return message.reply({ embeds: [error('Cible invalide', 'Mentionne un membre avec `@pseudo` ou un rôle avec `@role`.')] });
    }

    if (roleMatch) {
      const roleId = roleMatch[1];
      const role = message.guild.roles.cache.get(roleId);
      const roleName = role ? role.name : roleId;

      if (sub === 'add') {
        await cfg.addBlacklistRole(roleId, guildId);
        return message.reply({ embeds: [success('Rôle blacklisté', `Le rôle **${roleName}** ne peut plus utiliser les commandes du bot.`)] });
      } else {
        await cfg.removeBlacklistRole(roleId, guildId);
        return message.reply({ embeds: [success('Rôle retiré', `Le rôle **${roleName}** peut de nouveau utiliser les commandes.`)] });
      }
    }

    if (userMatch) {
      const userId = userMatch[1];

      // Empêcher de blacklister un Tier 3 ou Administrator
      let targetMember = null;
      try { targetMember = await message.guild.members.fetch(userId); } catch {}

      if (targetMember) {
        if (targetMember.permissions.has(8n) || hasTier3(targetMember)) {
          return message.reply({ embeds: [error('Action impossible', 'Tu ne peux pas blacklister un **Manager** ou un **Administrateur**.')] });
        }
      }

      const username = targetMember?.user?.username || userId;

      if (sub === 'add') {
        await cfg.addBlacklistUser(userId, guildId);
        return message.reply({ embeds: [success('Membre blacklisté', `**${username}** (<@${userId}>) ne peut plus utiliser les commandes du bot.`)] });
      } else {
        await cfg.removeBlacklistUser(userId, guildId);
        return message.reply({ embeds: [success('Membre retiré', `**${username}** (<@${userId}>) peut de nouveau utiliser les commandes.`)] });
      }
    }
  }
};
