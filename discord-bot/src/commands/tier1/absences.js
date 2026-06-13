const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../utils/embeds');
const { paginate } = require('../../utils/paginate');

const PER_PAGE = 8;
const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}

module.exports = {
  name: 'absences',
  tier: 1,
  description: 'Voir toutes les absences actives du serveur',
  async execute(message) {
    const guildId = message.guild.id;
    const list    = db.getActiveAbsences(guildId);

    if (list.length === 0) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setTitle('✅ | Aucune absence active')
          .setDescription('Tout le monde est disponible en ce moment !')
          .setTimestamp()
          .setFooter({ text: BOT() })
      ]});
    }

    const totalPages = Math.ceil(list.length / PER_PAGE);

    const pages = Array.from({ length: totalPages }, (_, pageIdx) => {
      const slice = list.slice(pageIdx * PER_PAGE, (pageIdx + 1) * PER_PAGE);
      const lines = slice.map((a, i) => {
        const rank      = pageIdx * PER_PAGE + i;
        const remaining = a.end_time - Math.floor(Date.now() / 1000);
        const remH      = Math.floor(remaining / 3600);
        const remM      = Math.floor((remaining % 3600) / 60);
        const remLabel  = remH > 0 ? `${remH}h ${remM}m restantes` : `${remM}m restantes`;
        return [
          `**${rank + 1}.** <@${a.discord_id}> — *${a.reason}*`,
          `↳ 📅 Fin : **${fmtDate(a.end_time)}** (${remLabel})`,
        ].join('\n');
      });

      return new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(`🌙 | Absences actives — ${list.length} membre${list.length > 1 ? 's' : ''}`)
        .setDescription(lines.join('\n\n'))
        .setTimestamp()
        .setFooter({ text: `${BOT()} • Absences • Page ${pageIdx + 1}/${totalPages}` });
    });

    return paginate(message, pages);
  }
};
