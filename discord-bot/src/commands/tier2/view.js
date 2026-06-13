const db     = require('../../database');
const logger = require('../../utils/logger');
const { error, COLORS } = require('../../utils/embeds');
const { hasTier2 } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');
const { paginate } = require('../../utils/paginate');

const PER_PAGE = 10;
const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

module.exports = {
  name: 'view',
  tier: 2,
  description: 'Voir le classement des connexions',
  async execute(message) {
    if (!hasTier2(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER2_ROLE_NAME || "EQUIPE D'ADMINISTRATION"}**.`)] });
    }

    let guildMembers;
    try {
      guildMembers = await message.guild.members.fetch();
    } catch {
      guildMembers = message.guild.members.cache;
    }

    const allUsers = db.getLeaderboard(50);
    const removed  = [];
    const active   = [];

    for (const u of allUsers) {
      if (guildMembers.has(u.discord_id)) {
        active.push(u);
      } else {
        db.deleteUser(u.discord_id);
        removed.push(u);
      }
    }

    if (removed.length > 0) {
      const fields = removed.map(u => ({
        name: u.username || u.discord_id,
        value: `ID: \`${u.discord_id}\` · **${u.total_connexions}** co supprimée${u.total_connexions > 1 ? 's' : ''}`,
        inline: true,
      }));
      await logger.log(
        message.guild.id, 'admin',
        `🗑️ ${removed.length} membre${removed.length > 1 ? 's' : ''} retiré${removed.length > 1 ? 's' : ''} (plus sur le serveur)`,
        fields,
        `Déclenché par \`!view\` — <@${message.author.id}>`
      );
    }

    if (active.length === 0) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('🏆 | Classement des connexions')
          .setDescription('*Aucune donnée disponible pour le moment.*')
          .setTimestamp()
          .setFooter({ text: BOT() })
      ]});
    }

    const medals = ['🥇', '🥈', '🥉'];
    const onlineCount = active.filter(u => u.session_start !== null).length;
    const totalPages  = Math.ceil(active.length / PER_PAGE);

    const pages = Array.from({ length: totalPages }, (_, pageIdx) => {
      const slice = active.slice(pageIdx * PER_PAGE, (pageIdx + 1) * PER_PAGE);
      const lines = slice.map((u, i) => {
        const rank   = pageIdx * PER_PAGE + i;
        const medal  = medals[rank] || `**${rank + 1}.**`;
        const status = u.session_start !== null ? '🟢' : '🔴';
        return `${medal} ${status} <@${u.discord_id}> — **${u.total_connexions}** connexion${u.total_connexions > 1 ? 's' : ''}`;
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle('🏆 | Classement des connexions')
        .setDescription(lines.join('\n'))
        .setTimestamp()
        .setFooter({ text: `${BOT()} • Page ${pageIdx + 1}/${totalPages}` });

      if (pageIdx === 0) {
        let footer = `🟢 En ligne : **${onlineCount}** | Total membres : **${active.length}**`;
        if (removed.length > 0) footer += ` | 🗑️ **${removed.length}** compte${removed.length > 1 ? 's' : ''} retiré${removed.length > 1 ? 's' : ''}`;
        embed.addFields({ name: '📊 Statistiques', value: footer, inline: false });
      }

      return embed;
    });

    return paginate(message, pages);
  }
};
