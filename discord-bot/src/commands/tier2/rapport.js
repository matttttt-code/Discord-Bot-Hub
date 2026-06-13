const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { COLORS, formatDuration, formatTimestamp } = require('../../utils/embeds');
const { hasTier2 } = require('../../utils/helpers');
const cfg = require('../../utils/config');

function parseSince(arg) {
  if (!arg) return null;
  const match7 = arg.match(/^(\d+)j$/i);
  if (match7) return Math.floor(Date.now() / 1000) - parseInt(match7[1]) * 86400;
  const matchH = arg.match(/^(\d+)h$/i);
  if (matchH) return Math.floor(Date.now() / 1000) - parseInt(matchH[1]) * 3600;
  const ddmm = arg.match(/^(\d{2})\/(\d{2})$/);
  if (ddmm) {
    const year = new Date().getFullYear();
    return Math.floor(new Date(year, parseInt(ddmm[2]) - 1, parseInt(ddmm[1])).getTime() / 1000);
  }
  const full = arg.match(/^(\d{2})\/(\d{2})-(\d{2}):(\d{2})$/);
  if (full) {
    const [, day, month, hour, min] = full;
    const year = new Date().getFullYear();
    return Math.floor(new Date(year, parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(min)).getTime() / 1000);
  }
  return null;
}

module.exports = {
  name: 'rapport',
  tier: 2,
  description: 'Rapport d\'activité complet — classement connexions, messages, vocal',
  usage: '!rapport [#salon | ID_salon] [7j/30j/Xh/JJ/MM]',
  async execute(message, args) {
    if (!hasTier2(message.member)) {
      const { error } = require('../../utils/embeds');
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **Administration**.`)] });
    }

    let channelId      = null;   // filtre de salon pour les messages
    let channelName    = 'Serveur entier';
    let dataGuildId    = null;   // serveur source des messages + vocal (null = partner config)
    let since          = null;
    let periodLabel    = 'Depuis toujours';

    for (const arg of args) {
      // Mention <#ID> → filtre par salon (messages uniquement)
      const chanMatch = arg.match(/^<#(\d+)>$/);
      if (chanMatch) {
        channelId = chanMatch[1];
        const ch  = message.client.channels.cache.get(channelId);
        if (ch) {
          channelName = `#${ch.name}`;
          if (ch.guild && ch.guild.id !== message.guild.id) dataGuildId = ch.guild.id;
        } else {
          channelName = `<#${channelId}>`;
        }
        continue;
      }

      // ID brut → peut être un ID de serveur OU de salon
      if (/^\d{17,19}$/.test(arg)) {
        // Priorité : serveur (guild) si le bot y est présent
        const guild = message.client.guilds.cache.get(arg);
        if (guild) {
          dataGuildId = guild.id;
          channelName = `Serveur "${guild.name}"`;
          continue;
        }
        // Sinon : salon (filtre messages)
        const ch = message.client.channels.cache.get(arg);
        if (ch) {
          channelId   = arg;
          channelName = `#${ch.name}${ch.guild && ch.guild.id !== message.guild.id ? ` (${ch.guild.name})` : ''}`;
          if (ch.guild && ch.guild.id !== message.guild.id) dataGuildId = ch.guild.id;
        } else {
          // ID inconnu → on suppose que c'est un serveur (bot peut ne pas l'avoir en cache)
          dataGuildId = arg;
          channelName = `Serveur \`${arg}\``;
        }
        continue;
      }

      const s = parseSince(arg);
      if (s) {
        since = s;
        if (/^\d+j$/i.test(arg))      periodLabel = `${arg.replace(/j/i, '')} derniers jours`;
        else if (/^\d+h$/i.test(arg)) periodLabel = `${arg.replace(/h/i, '')} dernières heures`;
        else                          periodLabel = `depuis le <t:${s}:D>`;
        continue;
      }
    }

    // Si aucune période spécifiée → date configurée → sinon 15j par défaut
    if (!since) {
      const configStartDate = cfg.getRapportStartDate(message.guild.id);
      if (configStartDate) {
        since = configStartDate;
        periodLabel = `depuis le <t:${since}:D>`;
      } else {
        since = Math.floor(Date.now() / 1000) - 15 * 86400;
        periodLabel = '15 derniers jours';
      }
    }

    const loading = await message.reply({ content: '⏳ Génération du rapport en cours...' });

    // Charger les membres du serveur courant pour résoudre les mentions
    let guildMemberIds = new Set();
    try {
      const fetched = await message.guild.members.fetch();
      fetched.forEach((_, id) => guildMemberIds.add(id));
    } catch {
      message.guild.members.cache.forEach((_, id) => guildMemberIds.add(id));
    }

    // Serveur source des messages + vocal :
    // priorité à l'ID passé en argument, sinon la config partner, sinon le serveur courant
    const configPartner   = cfg.getPartnerGuildId(message.guild.id);
    const sourceGuildId   = dataGuildId || configPartner || null;

    // ── Connexions depuis le serveur courant (staff) ──────────────
    const coResults = db.getFullRapport(message.guild.id, null, since);
    const coMap     = {};
    coResults.forEach(r => { coMap[r.discord_id] = r; });

    // ── Messages + vocal depuis le serveur source ─────────────────
    let results;
    if (sourceGuildId && sourceGuildId !== message.guild.id) {
      const dataResults = db.getFullRapport(sourceGuildId, channelId, since);
      // Fusionner : connexions (staff) + messages/vocal (serveur source)
      const allIds = new Set([...Object.keys(coMap), ...dataResults.map(r => r.discord_id)]);
      results = Array.from(allIds).map(id => {
        const co   = coMap[id]   || { discord_id: id, username: id, connexions: 0 };
        const data = dataResults.find(r => r.discord_id === id) || { messages: 0, vocal_seconds: 0 };
        return {
          discord_id:    id,
          username:      co.username || data.username || id,
          connexions:    co.connexions,
          messages:      data.messages,
          vocal_seconds: data.vocal_seconds,
        };
      }).filter(u => u.connexions > 0 || u.messages > 0 || u.vocal_seconds > 0)
        .sort((a, b) =>
          (b.connexions + b.messages + Math.floor(b.vocal_seconds / 60)) -
          (a.connexions + a.messages + Math.floor(a.vocal_seconds / 60))
        );
    } else {
      // Pas de serveur partenaire → tout depuis le serveur courant
      results = db.getFullRapport(message.guild.id, channelId, since);
    }

    // Libellé source dans le titre
    const sourceLabel = sourceGuildId && sourceGuildId !== message.guild.id
      ? ` · msgs/vocal depuis ${channelName !== 'Serveur entier' ? channelName : `\`${sourceGuildId}\``}`
      : (channelName !== 'Serveur entier' ? ` · ${channelName}` : '');

    // ── Inclure les membres avec le rôle "enregistrée" ──────────
    const enregistreeRoleId = cfg.getEnregistreeRoleId(message.guild.id);
    if (enregistreeRoleId) {
      try {
        await message.guild.members.fetch();
        const role = message.guild.roles.cache.get(enregistreeRoleId);
        if (role) {
          const dbIds = new Set(results.map(r => r.discord_id));
          role.members.forEach(m => {
            if (!dbIds.has(m.id)) {
              results.push({
                discord_id: m.id,
                username: m.user.username,
                connexions: 0,
                messages: 0,
                vocal_seconds: 0,
              });
            }
          });
        }
      } catch {}
    }

    if (results.length === 0) {
      await loading.edit({ content: '', embeds: [new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('📊 | Rapport d\'activité')
        .setDescription('*Aucune donnée disponible pour cette période ou ce salon.*')
        .setTimestamp()
      ]});
      return;
    }

    const medals = ['🥇', '🥈', '🥉'];

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📊 | Rapport d'activité${sourceLabel || (channelName !== 'Serveur entier' ? ` — ${channelName}` : '')}`)
      .setDescription(`Période : **${periodLabel}** • ${results.length} membre${results.length > 1 ? 's' : ''} actif${results.length > 1 ? 's' : ''}`)
      .setTimestamp()
      .setFooter({ text: `Rapport généré par ${message.author.username} • ${process.env.BOT_NAME || 'CONNEXION BOT'}` });

    const lines = results.slice(0, 20).map((u, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      const co  = u.connexions     > 0 ? `🏆 ${u.connexions}co`              : '';
      const msg = u.messages       > 0 ? `💬 ${u.messages.toLocaleString()}msg` : '';
      const vo  = u.vocal_seconds  > 0 ? `🎙️ ${formatDuration(u.vocal_seconds)}` : '';
      const stats = [co, msg, vo].filter(Boolean).join(' · ');
      // Si le membre est dans le serveur courant → mention résolvable ; sinon afficher le nom en texte
      const display = guildMemberIds.has(u.discord_id)
        ? `<@${u.discord_id}>`
        : `**${u.username || u.discord_id}**`;
      return `${medal} ${display} — ${stats || '*inactif*'}`;
    });

    embed.addFields({ name: `🏆 Classement (${results.length} membres)`, value: lines.join('\n'), inline: false });

    const totalCo    = results.reduce((a, u) => a + u.connexions,    0);
    const totalMsg   = results.reduce((a, u) => a + u.messages,      0);
    const totalVocal = results.reduce((a, u) => a + u.vocal_seconds, 0);

    embed.addFields({
      name: '📈 Totaux',
      value: [
        `🏆 Connexions : **${totalCo}**`,
        `💬 Messages : **${totalMsg.toLocaleString()}**`,
        `🎙️ Vocal cumulé : **${formatDuration(totalVocal)}**`,
      ].join('\n'),
      inline: false
    });

    const topCo  = results.slice().sort((a, b) => b.connexions    - a.connexions)[0];
    const topMsg = results.slice().sort((a, b) => b.messages      - a.messages)[0];
    const topVo  = results.slice().sort((a, b) => b.vocal_seconds - a.vocal_seconds)[0];
    const fmtUser = (u) => guildMemberIds.has(u.discord_id) ? `<@${u.discord_id}>` : `**${u.username || u.discord_id}**`;
    const records = [
      topCo.connexions    > 0 ? `🏆 ${fmtUser(topCo)} — **${topCo.connexions}** co`                    : '',
      topMsg.messages     > 0 ? `💬 ${fmtUser(topMsg)} — **${topMsg.messages.toLocaleString()}** msg`   : '',
      topVo.vocal_seconds > 0 ? `🎙️ ${fmtUser(topVo)} — **${formatDuration(topVo.vocal_seconds)}**` : '',
    ].filter(Boolean).join('\n');

    if (records) embed.addFields({ name: '🌟 Records', value: records, inline: false });

    await loading.edit({ content: '', embeds: [embed] });
  }
};
