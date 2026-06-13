const db  = require('../../database');
const cfg = require('../../utils/config');
const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../utils/embeds');

module.exports = {
  name: 'c',
  tier: 1,
  description: 'Démarrer une connexion',
  async execute(message) {
    const { id, username } = message.author;
    const { error } = require('../../utils/embeds');

    if (!cfg.isCoEnabled(message.guild.id)) {
      return message.reply({ embeds: [error('Système désactivé', 'Le système de connexion est actuellement désactivé.')] });
    }

    if (db.isConnected(id)) {
      return message.reply({ embeds: [error('Déjà connecté', 'Tu es déjà connecté. Utilise `!d` pour terminer ta connexion.')] });
    }

    const now       = db.startSession(id, username);
    const guildId   = message.guild.id;
    const pingRoleId = cfg.getPingRoleId(guildId);

    const hhmm = (() => {
      const d = new Date(now * 1000);
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    })();

    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setDescription(`🟢 **Connexion enregistrée** — <@${id}> · ${hhmm}`)
      .setTimestamp();

    const pingContent = pingRoleId ? `<@&${pingRoleId}>` : null;
    await message.reply({ content: pingContent, embeds: [embed], allowedMentions: { roles: pingRoleId ? [pingRoleId] : [] } });
  }
};
