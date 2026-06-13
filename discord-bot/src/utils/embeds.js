const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x1ABC9C,
  success: 0x1ABC9C,
  error:   0xFF4757,
  info:    0x1ABC9C,
  warning: 0xFEE75C,
  online:  0x1ABC9C,
  offline: 0xFF4757,
};

const BOT_NAME = process.env.BOT_NAME || 'CONNEXION BOT';

function base(color = COLORS.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: `${BOT_NAME} • Développé avec ❤️` });
}

function success(title, description) {
  return base(COLORS.success).setTitle(`✅ | ${title}`).setDescription(description);
}

function error(title, description) {
  return base(COLORS.error).setTitle(`❌ | ${title}`).setDescription(description);
}

function info(title, description) {
  return base(COLORS.info).setTitle(`ℹ️ | ${title}`).setDescription(description);
}

function primary(title, description) {
  return base(COLORS.primary).setTitle(`🏆 | ${title}`).setDescription(description);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatTimestamp(unixTs) {
  return `<t:${unixTs}:F>`;
}

function formatRelative(unixTs) {
  return `<t:${unixTs}:R>`;
}

module.exports = { COLORS, success, error, info, primary, base, formatDuration, formatTimestamp, formatRelative };
