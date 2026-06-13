const db  = require('../../database');
const cfg = require('../../utils/config');
const { EmbedBuilder } = require('discord.js');
const { COLORS, formatDuration } = require('../../utils/embeds');

module.exports = {
  name: 'd',
  tier: 1,
  description: 'Terminer une connexion',
  async execute(message) {
    const { id, username } = message.author;
    const { error } = require('../../utils/embeds');

    if (!cfg.isCoEnabled(message.guild.id)) {
      return message.reply({ embeds: [error('Système désactivé', 'Le système de connexion est actuellement désactivé.')] });
    }

    if (!db.isConnected(id)) {
      return message.reply({ embeds: [error('Non connecté', 'Tu n\'es pas connecté. Utilise `!c` pour démarrer une connexion.')] });
    }

    const session    = db.endSession(id);
    const user       = db.getUser(id);
    const guildId    = message.guild.id;
    const pingRoleId = cfg.getPingRoleId(guildId);
    const dur        = formatDuration(session.duration);

    const embed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setDescription(`🔴 **Déconnexion enregistrée** — <@${id}> · ${dur} · **${user.total_connexions} co**`)
      .setTimestamp();

    const pingContent = pingRoleId ? `<@&${pingRoleId}>` : null;
    await message.reply({ content: pingContent, embeds: [embed], allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] } });
  }
};
