const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');

function fmtDate(ts) {
  return new Date(ts * 1000).toLocaleString('fr-FR');
}

module.exports = {
  name: 'cancelrewind',
  tier: 3,
  description: 'Annuler un rewind et retirer les connexions ajoutées',
  usage: '!cancelrewind [id] | !cancelrewind list',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Commande réservée aux gérants.')] });
    }

    const BOT     = process.env.BOT_NAME || 'CONNEXION BOT';
    const guildId = message.guild.id;

    // ── Liste des rewinds récents ──────────────────────────────
    if (!args[0] || args[0].toLowerCase() === 'list') {
      const logs = db.getRewindLogs(guildId).slice(0, 10);

      if (logs.length === 0) {
        return message.reply({ embeds: [
          new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle('🔄 Aucun rewind enregistré')
            .setDescription('Aucun rewind récent trouvé pour ce serveur.')
            .setTimestamp()
            .setFooter({ text: `${BOT} • Rewind` })
        ]});
      }

      const lines = logs.map(r => {
        const totalCo = r.entries.reduce((sum, e) => sum + e.added, 0);
        return `\`ID ${r.id}\` — **${r.entries.length}** membre(s), **+${totalCo}** co — <t:${r.created_at}:R> par <@${r.done_by}>\n> Période : \`${fmtDate(r.start_ts)}\` → \`${fmtDate(r.end_ts)}\``;
      }).join('\n\n');

      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle('🔄 Rewinds récents')
          .setDescription(lines)
          .addFields({ name: '💡 Annuler', value: '`!cancelrewind [ID]`', inline: false })
          .setTimestamp()
          .setFooter({ text: `${BOT} • Rewind` })
      ]});
    }

    // ── Annulation d'un rewind par ID ─────────────────────────
    const id = parseInt(args[0]);
    if (isNaN(id)) {
      return message.reply({ embeds: [error('ID invalide', 'Utilise `!cancelrewind list` pour voir les IDs disponibles.')] });
    }

    const log = db.cancelRewind(id);
    if (!log) {
      return message.reply({ embeds: [error('Rewind introuvable', `Aucun rewind avec l'ID \`${id}\`.\nUtilise \`!cancelrewind list\` pour voir les IDs disponibles.`)] });
    }

    const totalCo = log.entries.reduce((sum, e) => sum + e.added, 0);
    const lines   = log.entries
      .sort((a, b) => b.added - a.added)
      .map(e => `<@${e.uid}> **-${e.added}** co`)
      .join('\n');

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('↩️ Rewind annulé')
        .setDescription(`**${totalCo}** connexion${totalCo > 1 ? 's' : ''} retirée${totalCo > 1 ? 's' : ''} sur **${log.entries.length}** membre${log.entries.length > 1 ? 's' : ''}.`)
        .addFields(
          { name: '📅 Période annulée', value: `\`${fmtDate(log.start_ts)}\` → \`${fmtDate(log.end_ts)}\``, inline: false },
          { name: `👥 Membres affectés`, value: lines.slice(0, 1000) || '*Aucun*', inline: false },
          { name: '👮 Annulé par',       value: `<@${message.author.id}>`, inline: true },
          { name: '🆔 ID rewind',        value: `\`${id}\``, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `${BOT} • Rewind` })
    ]});
  }
};
