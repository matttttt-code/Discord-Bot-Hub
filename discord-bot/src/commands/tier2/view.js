const db     = require('../../database');
const logger = require('../../utils/logger');
const { error, COLORS } = require('../../utils/embeds');
const { hasTier2 } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'view',
  tier: 2,
  description: 'Voir le classement des connexions',
  async execute(message) {
    if (!hasTier2(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER2_ROLE_NAME || "EQUIPE D'ADMINISTRATION"}**.`)] });
    }

    // Récupère tous les membres actuels du serveur
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
        // Plus sur le serveur → suppression DB
        db.deleteUser(u.discord_id);
        removed.push(u);
      }
    }

    // Log des suppressions
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

    // Embed classement (max 20)
    const top   = active.slice(0, 20);
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('🏆 | Classement des connexions')
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Classement` });

    if (top.length === 0) {
      embed.setDescription('*Aucune donnée disponible pour le moment.*');
    } else {
      const medals = ['🥇', '🥈', '🥉'];
      const lines  = top.map((u, i) => {
        const medal  = medals[i] || `**${i + 1}.**`;
        const status = u.session_start !== null ? '🟢' : '🔴';
        return `${medal} ${status} <@${u.discord_id}> — **${u.total_connexions}** connexion${u.total_connexions > 1 ? 's' : ''}`;
      });
      embed.setDescription(lines.join('\n'));

      const onlineCount = top.filter(u => u.session_start !== null).length;
      let footer = `🟢 En ligne : **${onlineCount}** | Total membres : **${active.length}**`;
      if (removed.length > 0) footer += ` | 🗑️ **${removed.length}** compte${removed.length > 1 ? 's' : ''} retiré${removed.length > 1 ? 's' : ''} (absents du serveur)`;
      embed.addFields({ name: '📊 Statistiques', value: footer, inline: false });
    }

    return message.reply({ embeds: [embed] });
  }
};
