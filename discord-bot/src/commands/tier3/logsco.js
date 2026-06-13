const { EmbedBuilder } = require('discord.js');
const { COLORS, error, formatDuration } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const db  = require('../../database');
const cfg = require('../../utils/config');

module.exports = {
  name: 'logsco',
  tier: 3,
  description: 'Historique détaillé des connexions d\'un membre',
  usage: '!logsco @membre',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }

    const mention = message.mentions.users.first();
    const rawId   = args[0]?.replace(/[<@!>]/g, '');
    const target  = mention || (rawId ? await message.client.users.fetch(rawId).catch(() => null) : null);

    if (!target) {
      return message.reply({ embeds: [error('Membre introuvable', 'Utilisation : `!logsco @membre`')] });
    }

    const sessions = db.getSessionHistory(target.id, 25);
    const user     = db.getUser(target.id);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📋 | Historique connexions — ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Logs CO` });

    embed.addFields({
      name: '📊 Résumé global',
      value: [
        `🏆 Total connexions : **${user?.total_connexions ?? 0}**`,
        `📅 Inscrit le : ${user ? `<t:${user.created_at}:D>` : '*inconnu*'}`,
        user?.session_start ? `🟢 Actuellement connecté depuis <t:${user.session_start}:T>` : '⚫ Hors connexion',
      ].join('\n'),
      inline: false,
    });

    if (sessions.length === 0) {
      embed.addFields({ name: '📋 Historique', value: '*Aucune session enregistrée.*', inline: false });
      return message.reply({ embeds: [embed] });
    }

    const pad = (n, w) => String(n).padStart(w, '0');
    const fmt = ts => {
      const d = new Date(ts * 1000);
      return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
    };

    const lines = sessions.map((s, i) => {
      const dur   = s.end_time ? formatDuration(s.end_time - s.start_time) : '*(en cours)*';
      const start = fmt(s.start_time);
      const end   = s.end_time ? fmt(s.end_time) : '—';
      return `\`${pad(i + 1, 2)}.\` **${start}** → **${end}** · ${dur}`;
    });

    const chunk = 12;
    for (let i = 0; i < lines.length; i += chunk) {
      embed.addFields({
        name: i === 0 ? `🕐 25 dernières sessions (${sessions.length} affichées)` : '\u200B',
        value: lines.slice(i, i + chunk).join('\n'),
        inline: false,
      });
    }

    const completed = sessions.filter(s => s.end_time);
    if (completed.length > 0) {
      const avg = completed.reduce((a, s) => a + (s.end_time - s.start_time), 0) / completed.length;
      embed.addFields({ name: '⏱️ Durée moyenne', value: `**${formatDuration(Math.floor(avg))}**`, inline: true });
    }

    await message.reply({ embeds: [embed] });
  }
};
