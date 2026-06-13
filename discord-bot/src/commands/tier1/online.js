const db = require('../../database');
const { COLORS, formatRelative, formatDuration } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');
const { paginate } = require('../../utils/paginate');

const PER_PAGE = 15;
const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

module.exports = {
  name: 'online',
  tier: 1,
  description: 'Voir la liste des personnes connectées',
  async execute(message) {
    const users = db.getOnlineUsers();
    const now   = Math.floor(Date.now() / 1000);

    if (users.length === 0) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.online)
          .setTitle('🟢 | Personnes connectées (0)')
          .setDescription('*Aucune personne connectée pour le moment.*')
          .setTimestamp()
          .setFooter({ text: `${BOT()} • En ligne` })
      ]});
    }

    const totalPages = Math.ceil(users.length / PER_PAGE);

    const pages = Array.from({ length: totalPages }, (_, pageIdx) => {
      const slice = users.slice(pageIdx * PER_PAGE, (pageIdx + 1) * PER_PAGE);
      const lines = slice.map((u, i) => {
        const rank     = pageIdx * PER_PAGE + i;
        const duration = now - u.session_start;
        return `**${rank + 1}.** <@${u.discord_id}> — ⏱️ ${formatDuration(duration)} (${formatRelative(u.session_start)})`;
      });

      return new EmbedBuilder()
        .setColor(COLORS.online)
        .setTitle(`🟢 | Personnes connectées (${users.length})`)
        .setDescription(lines.join('\n'))
        .setTimestamp()
        .setFooter({ text: `${BOT()} • En ligne • Page ${pageIdx + 1}/${totalPages}` });
    });

    return paginate(message, pages);
  }
};
