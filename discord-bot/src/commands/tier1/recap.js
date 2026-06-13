const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');

function dur(sec) {
  if (!sec || sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function parsePeriod(arg) {
  if (!arg) return { days: 7, since: Math.floor(Date.now() / 1000) - 7 * 86400, label: '7 derniers jours' };
  const jMatch = arg.match(/^(\d+)j$/i);
  if (jMatch) {
    const days = parseInt(jMatch[1]);
    return { days, since: Math.floor(Date.now() / 1000) - days * 86400, label: `${days} derniers jours` };
  }
  const hMatch = arg.match(/^(\d+)h$/i);
  if (hMatch) {
    const hours = parseInt(hMatch[1]);
    return { days: 0, since: Math.floor(Date.now() / 1000) - hours * 3600, label: `${hours} dernières heures` };
  }
  return null;
}

module.exports = {
  name: 'recap',
  tier: 1,
  description: 'Voir son bilan d\'activité sur une période',
  usage: '!recap [7j / 30j / Xh]',
  async execute(message, args) {
    const period = parsePeriod(args[0]);
    if (!period) {
      return message.reply({ embeds: [error('Format invalide', 'Utilise `!recap`, `!recap 7j`, `!recap 30j`, `!recap 24h`…')] });
    }

    const { id, username } = message.author;
    const guildId = message.guild.id;
    db.createUser(id, username);

    const recap = db.getUserRecap(id, guildId, period.since);
    const user  = db.getUser(id);

    // Progression : % du total connexions réalisé sur la période
    const pct = user.total_connexions > 0
      ? Math.round((recap.connexions / user.total_connexions) * 100)
      : 0;

    // Barre de progression visuelle
    const filled = Math.round(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📊 | Récap — ${username}`)
      .setDescription(`Période : **${period.label}**`)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .addFields(
        // Connexions
        { name: '🏆 Connexions', value: `**${recap.connexions}**`, inline: true },
        { name: '⏳ Temps total', value: `**${dur(recap.connexionTime)}**`, inline: true },
        { name: '⌛ Durée moy.',  value: `**${recap.connexions > 0 ? dur(Math.floor(recap.connexionTime / recap.connexions)) : '—'}**`, inline: true },
        // Messages & vocal
        { name: '💬 Messages envoyés', value: `**${recap.messages.toLocaleString()}**`, inline: true },
        { name: '🎙️ Temps vocal',     value: `**${dur(recap.vocalTime)}**`,             inline: true },
        { name: '\u200B',              value: '\u200B',                                   inline: true },
        // Progression globale
        { name: `📈 Part sur le total (${user.total_connexions} co)`,
          value: `\`${bar}\` **${pct}%**`, inline: false },
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Récap` });

    return message.reply({ embeds: [embed] });
  }
};
