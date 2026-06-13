const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../utils/embeds');

const CHANGELOG = [
  { version: 'v1.0.0', date: '13/06/2026', changes: ['Lancement du bot', 'Ajout des commandes !c et !d', 'Système de connexions avec base de données', 'Commandes de modération Tier 2 & 3', 'Système de badges'] },
];

module.exports = {
  name: 'update',
  tier: 1,
  description: 'Voir toutes les informations liées à la dernière mise à jour',
  async execute(message) {
    const latest = CHANGELOG[0];

    const embed = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle(`📋 | Dernière mise à jour — ${latest.version}`)
      .setDescription(`Mise à jour du **${latest.date}**`)
      .addFields({
        name: '✨ Changements',
        value: latest.changes.map(c => `• ${c}`).join('\n')
      })
      .addFields({
        name: '📜 Historique complet',
        value: CHANGELOG.slice(1, 4).map(v => `**${v.version}** — ${v.date}`).join('\n') || '*Aucun historique précédent*'
      })
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Changelog` });

    return message.reply({ embeds: [embed] });
  }
};
