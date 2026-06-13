const { base, COLORS } = require('../../utils/embeds');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ping',
  tier: 1,
  description: 'Tester la latence entre Discord et le bot',
  async execute(message) {
    const sent = await message.reply({ content: '📡 Calcul en cours...' });
    const latency = sent.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(message.client.ws.ping);

    const color = latency < 100 ? COLORS.success : latency < 300 ? COLORS.warning : COLORS.error;
    const status = latency < 100 ? '🟢 Excellent' : latency < 300 ? '🟡 Correct' : '🔴 Élevé';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle('🏓 | Pong !')
      .addFields(
        { name: '📡 Latence bot', value: `**${latency}ms** — ${status}`, inline: true },
        { name: '💬 API Discord', value: `**${apiLatency}ms**`, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'}` });

    await sent.edit({ content: '', embeds: [embed] });
  }
};
