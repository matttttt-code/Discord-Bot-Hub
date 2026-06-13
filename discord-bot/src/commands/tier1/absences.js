const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');

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
      return message.reply({ embeds: [new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('✅ | Aucune absence active')
        .setDescription('Tout le monde est disponible en ce moment !')
        .setTimestamp()
        .setFooter({ text: process.env.BOT_NAME || 'CONNEXION BOT' })
      ]});
    }

    const lines = list.map((a, i) => {
      const remaining = a.end_time - Math.floor(Date.now() / 1000);
      const remH = Math.floor(remaining / 3600);
      const remM = Math.floor((remaining % 3600) / 60);
      const remLabel = remH > 0 ? `${remH}h ${remM}m restantes` : `${remM}m restantes`;
      return [
        `**${i + 1}.** <@${a.discord_id}> — *${a.reason}*`,
        `↳ 📅 Fin : **${fmtDate(a.end_time)}** (${remLabel})`,
      ].join('\n');
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle(`🌙 | Absences actives — ${list.length} membre${list.length > 1 ? 's' : ''}`)
      .setDescription(lines.join('\n\n'))
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Absences` });

    return message.reply({ embeds: [embed] });
  }
};
