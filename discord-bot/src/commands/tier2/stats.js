const { EmbedBuilder } = require('discord.js');
const { COLORS, formatDuration } = require('../../utils/embeds');
const { hasTier2 } = require('../../utils/helpers');
const db  = require('../../database');
const cfg = require('../../utils/config');

module.exports = {
  name: 'stats',
  tier: 2,
  description: 'Statistiques globales du serveur',
  async execute(message) {
    if (!hasTier2(message.member)) {
      const { error } = require('../../utils/embeds');
      return message.reply({ embeds: [error('Permission refusée', 'Cette commande nécessite le rôle **Administration**.')] });
    }

    const guildId   = message.guild.id;
    const partnerGuildId = cfg.getPartnerGuildId(guildId);
    const since     = cfg.getRapportStartDate(guildId) || (Math.floor(Date.now() / 1000) - 15 * 86400);

    // ── Données serveur courant ──────────────────────────────────
    const online   = db.getOnlineUsers();
    const absences = db.getActiveAbsences(guildId);
    const mainData = db.getFullRapport(guildId, null, since);

    // ── Données serveur partenaire ───────────────────────────────
    let partnerData = [];
    if (partnerGuildId) {
      partnerData = db.getFullRapport(partnerGuildId, null, since);
    }

    // ── Fusion stats ─────────────────────────────────────────────
    const allMap = {};
    mainData.forEach(u => {
      allMap[u.discord_id] = { ...u };
    });
    partnerData.forEach(p => {
      if (allMap[p.discord_id]) {
        allMap[p.discord_id].messages      += p.messages;
        allMap[p.discord_id].vocal_seconds += p.vocal_seconds;
      } else {
        allMap[p.discord_id] = { ...p, connexions: 0 };
      }
    });
    const merged = Object.values(allMap);

    const totalCo    = merged.reduce((a, u) => a + u.connexions,    0);
    const totalMsg   = merged.reduce((a, u) => a + u.messages,      0);
    const totalVocal = merged.reduce((a, u) => a + u.vocal_seconds, 0);
    const totalMembers = merged.length;

    const coEnabled  = cfg.get('co_enabled', guildId);
    const maintenance = cfg.isMaintenance(guildId);

    // Top par catégorie
    const topCo  = merged.slice().sort((a, b) => b.connexions    - a.connexions)[0];
    const topMsg = merged.slice().sort((a, b) => b.messages      - a.messages)[0];
    const topVo  = merged.slice().sort((a, b) => b.vocal_seconds - a.vocal_seconds)[0];

    const periodLabel = since
      ? `depuis le <t:${since}:D>`
      : 'depuis le début';

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📊 | Statistiques — ${message.guild.name}`)
      .setDescription(`Période : **${periodLabel}**${partnerGuildId ? `\n🔗 Données combinées avec le serveur partenaire (\`${partnerGuildId}\`)` : ''}`)
      .setThumbnail(message.guild.iconURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Stats` });

    // Statut
    embed.addFields({
      name: '⚙️ Statut',
      value: [
        `Bot : ${maintenance ? '🔴 Maintenance' : '🟢 Opérationnel'}`,
        `Système de co : ${coEnabled === '0' ? '🔴 Désactivé' : '🟢 Actif'}`,
      ].join('\n'),
      inline: false
    });

    // En direct
    embed.addFields(
      { name: '🟢 Connectés maintenant', value: `**${online.length}**`,  inline: true },
      { name: '🌙 Absences actives',     value: `**${absences.length}**`, inline: true },
      { name: '👥 Membres suivis',       value: `**${totalMembers}**`,    inline: true }
    );

    // Totaux période
    embed.addFields({ name: '\u200B', value: '**── 📈 Totaux sur la période ──**', inline: false });
    embed.addFields(
      { name: '🏆 Connexions',     value: `**${totalCo}**`,                       inline: true },
      { name: '💬 Messages',       value: `**${totalMsg.toLocaleString()}**`,      inline: true },
      { name: '🎙️ Vocal cumulé',  value: `**${formatDuration(totalVocal)}**`,     inline: true }
    );

    // Records
    const recordLines = [
      topCo  && topCo.connexions    > 0 ? `🏆 Connexions : <@${topCo.discord_id}> — **${topCo.connexions}**`                   : null,
      topMsg && topMsg.messages     > 0 ? `💬 Messages : <@${topMsg.discord_id}> — **${topMsg.messages.toLocaleString()}**`     : null,
      topVo  && topVo.vocal_seconds > 0 ? `🎙️ Vocal : <@${topVo.discord_id}> — **${formatDuration(topVo.vocal_seconds)}**`    : null,
    ].filter(Boolean);

    if (recordLines.length > 0) {
      embed.addFields({ name: '🌟 Leaders sur la période', value: recordLines.join('\n'), inline: false });
    }

    await message.reply({ embeds: [embed] });
  }
};
