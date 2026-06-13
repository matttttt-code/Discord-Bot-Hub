const db = require('../../database');
const { base, COLORS, formatRelative, formatDuration } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'online',
  tier: 1,
  description: 'Voir la liste des personnes connectées',
  async execute(message) {
    const users = db.getOnlineUsers();
    const now = Math.floor(Date.now() / 1000);

    const embed = new EmbedBuilder()
      .setColor(COLORS.online)
      .setTitle(`🟢 | Personnes connectées (${users.length})`)
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • En ligne` });

    if (users.length === 0) {
      embed.setDescription('*Aucune personne connectée pour le moment.*');
    } else {
      const lines = users.map((u, i) => {
        const duration = now - u.session_start;
        return `**${i + 1}.** <@${u.discord_id}> — ⏱️ ${formatDuration(duration)} (${formatRelative(u.session_start)})`;
      });
      embed.setDescription(lines.join('\n'));
    }

    return message.reply({ embeds: [embed] });
  }
};
