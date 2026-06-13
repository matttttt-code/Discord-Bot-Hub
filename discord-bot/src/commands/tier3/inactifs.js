const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const db  = require('../../database');
const cfg = require('../../utils/config');

function parseSeuil(arg) {
  if (!arg) return null;
  const j = arg.match(/^(\d+)j$/i);
  if (j) return Math.floor(Date.now() / 1000) - parseInt(j[1]) * 86400;
  const h = arg.match(/^(\d+)h$/i);
  if (h) return Math.floor(Date.now() / 1000) - parseInt(h[1]) * 3600;
  return null;
}

module.exports = {
  name: 'inactifs',
  tier: 3,
  description: 'Liste des membres sans activité depuis une période donnée',
  usage: '!inactifs [7j / 30j / Xh]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }

    const guildId = message.guild.id;

    let since = parseSeuil(args[0]);
    let periodLabel;
    if (since) {
      periodLabel = args[0];
    } else {
      const configStart = cfg.getRapportStartDate(guildId);
      if (configStart) {
        since = configStart;
        periodLabel = `<t:${since}:D>`;
      } else {
        since = Math.floor(Date.now() / 1000) - 30 * 86400;
        periodLabel = '30j';
      }
    }

    const partnerGuildId = cfg.getPartnerGuildId(guildId);
    const mainData       = db.getFullRapport(guildId, null, since);
    const partnerData    = partnerGuildId ? db.getFullRapport(partnerGuildId, null, since) : [];

    const activeIds = new Set(mainData.map(u => u.discord_id));
    partnerData.forEach(u => activeIds.add(u.discord_id));

    const enregistreeRoleId = cfg.getEnregistreeRoleId(guildId);
    let membersToCheck = [];

    if (enregistreeRoleId) {
      try {
        await message.guild.members.fetch();
        const role = message.guild.roles.cache.get(enregistreeRoleId);
        if (role) {
          membersToCheck = role.members.map(m => ({ id: m.id, tag: m.user.username, display: m.displayName }));
        }
      } catch {}
    }

    if (membersToCheck.length === 0) {
      const allUsers = db.getFullRapport(guildId, null, null);
      membersToCheck = allUsers.map(u => ({ id: u.discord_id, tag: u.username, display: u.username }));
    }

    const inactifs = membersToCheck.filter(m => !activeIds.has(m.id));

    const embed = new EmbedBuilder()
      .setColor(inactifs.length === 0 ? COLORS.success : COLORS.warning)
      .setTitle(`😴 | Membres inactifs — ${periodLabel}`)
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Inactifs` });

    if (inactifs.length === 0) {
      embed.setDescription(`✅ Aucun membre inactif sur la période **${periodLabel}**. Tout le monde a été actif !`);
      return message.reply({ embeds: [embed] });
    }

    const lines = inactifs.slice(0, 40).map((m, i) => `**${i + 1}.** <@${m.id}>`);
    const extra = inactifs.length > 40 ? `\n*… et ${inactifs.length - 40} autre(s)*` : '';

    embed.setDescription(`**${inactifs.length}** membre${inactifs.length > 1 ? 's' : ''} sans activité depuis **${periodLabel}** :\n\n${lines.join('\n')}${extra}`);

    await message.reply({ embeds: [embed] });
  }
};
