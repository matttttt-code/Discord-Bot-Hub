const db  = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier2, resolveUser } = require('../../utils/helpers');

function dur(sec) {
  if (!sec || sec <= 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = {
  name: 'lastco',
  tier: 2,
  description: 'Dernière connexion d\'un membre',
  usage: '!lastco [@membre]',
  async execute(message, args) {
    if (!hasTier2(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Commande réservée aux modérateurs.')] });
    }

    const target = args[0]
      ? await resolveUser(message.guild, args[0])
      : message.member;

    if (!target) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const { id, username } = target.user;
    const user     = db.getUser(id);
    const sessions = db.getUserSessions(id);

    if (!user) {
      return message.reply({ embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('❓ Aucune donnée')
          .setDescription(`<@${id}> n'a jamais utilisé \`!c\`.`)
          .setTimestamp()
      ]});
    }

    const isOnline  = user.session_start !== null;
    const lastSess  = sessions[0] || null;
    const BOT       = process.env.BOT_NAME || 'CONNEXION BOT';

    const embed = new EmbedBuilder()
      .setColor(isOnline ? COLORS.success : COLORS.primary)
      .setTitle(`🕓 Dernière connexion — ${username}`)
      .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: `${BOT} • Dernière co` });

    if (isOnline) {
      const liveSec = Math.floor(Date.now() / 1000) - user.session_start;
      embed.setDescription(`🟢 **En session actuellement** — connecté <t:${user.session_start}:R>`);
      embed.addFields(
        { name: '⏱️ Durée en cours', value: `\`${dur(liveSec)}\``,               inline: true },
        { name: '🏆 Total sessions', value: `**${user.total_connexions}**`,        inline: true },
      );
    } else if (lastSess) {
      const sessLen = lastSess.end_time - lastSess.start_time;
      embed.setDescription(`🔴 **Hors ligne** — dernière session terminée <t:${lastSess.end_time}:R>`);
      embed.addFields(
        { name: '📅 Début',          value: `<t:${lastSess.start_time}:f>`,        inline: true },
        { name: '📅 Fin',            value: `<t:${lastSess.end_time}:f>`,           inline: true },
        { name: '⏱️ Durée',         value: `\`${dur(sessLen)}\``,                  inline: true },
        { name: '🏆 Total sessions', value: `**${user.total_connexions}**`,         inline: true },
      );
    } else {
      embed.setDescription(`🔴 **Hors ligne** — aucune session terminée enregistrée.`);
      embed.addFields({ name: '🏆 Total sessions', value: `**${user.total_connexions}**`, inline: true });
    }

    return message.reply({ embeds: [embed] });
  }
};
