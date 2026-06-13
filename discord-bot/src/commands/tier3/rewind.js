const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier3, parseDate } = require('../../utils/helpers');
const db     = require('../../database');
const cfg    = require('../../utils/config');
const logger = require('../../utils/logger');

// Récupère jusqu'à maxMessages messages dans un salon entre deux timestamps
async function fetchMessagesBetween(channel, startTs, endTs, maxMessages = 500) {
  const messages = [];
  let before = null;

  while (messages.length < maxMessages) {
    const options = { limit: 100 };
    if (before) options.before = before;

    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;

    const sorted = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    let done = false;

    for (const msg of sorted) {
      const ts = Math.floor(msg.createdTimestamp / 1000);
      if (ts < startTs) { done = true; break; }
      if (ts <= endTs) messages.push(msg);
    }

    before = batch.last().id;
    if (done || batch.size < 100) break;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

module.exports = {
  name: 'rewind',
  tier: 3,
  description: 'Scan le salon connexion entre deux dates et ajoute les !c/!d détectés à chaque membre',
  usage: '!rewind [JJ/MM-HH:MM] [JJ/MM-HH:MM]',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **Gérant**.`)] });
    }

    if (args.length < 2) {
      return message.reply({ embeds: [error('Arguments manquants',
        'Utilisation : `!rewind [JJ/MM-HH:MM] [JJ/MM-HH:MM] [--force]`\nExemple : `!rewind 01/06-08:00 01/06-18:00`\n\nAjoute `--force` pour compter **toutes** les co, même celles déjà enregistrées (utile après un `!reset`).'
      )] });
    }

    const force   = args.includes('--force');
    const startTs = parseDate(args[0]);
    const endTs   = parseDate(args[1]);

    if (!startTs || !endTs) {
      return message.reply({ embeds: [error('Format invalide', 'Format attendu : `JJ/MM-HH:MM` — ex: `01/06-08:00`')] });
    }
    if (startTs >= endTs) {
      return message.reply({ embeds: [error('Dates invalides', 'La date de début doit être antérieure à la date de fin.')] });
    }

    const guildId          = message.guild.id;
    const prefix           = process.env.PREFIX || '!';
    const connexionChanId  = cfg.getConnexionChannelId(guildId);
    const targetChannel    = connexionChanId
      ? message.guild.channels.cache.get(connexionChanId)
      : message.channel;

    if (!targetChannel) {
      return message.reply({ embeds: [error('Salon introuvable', 'Configure le salon connexion avec `!setup connexion #salon`.')] });
    }

    const loading = await message.reply({ content: `⏳ Scan de <#${targetChannel.id}> en cours${force ? ' **(mode --force : toutes les co comptées)**' : ''}…` });

    let msgs;
    try {
      msgs = await fetchMessagesBetween(targetChannel, startTs, endTs);
    } catch (err) {
      return loading.edit({ content: '', embeds: [error('Erreur', `Impossible de lire le salon : ${err.message}`)] });
    }

    // IDs des messages auxquels le bot a déjà répondu (reply Discord)
    const botRepliedTo = new Set(
      msgs
        .filter(m => m.author.bot && m.reference?.messageId)
        .map(m => m.reference.messageId)
    );

    // Construire les sessions par user : !c = début, !d = fin
    // On ignore les messages que le bot a déjà traités (il a répondu = co déjà enregistrée)
    const userSessions = {}; // { userId: { username, sessions: [], openStart: ts|null, skipped: number } }

    for (const msg of msgs) {
      if (msg.author.bot) continue;
      const content = msg.content.trim().toLowerCase();
      if (content !== `${prefix}c` && content !== `${prefix}d`) continue;

      const ts    = Math.floor(msg.createdTimestamp / 1000);
      const uid   = msg.author.id;
      const uname = msg.author.username;

      if (!userSessions[uid]) userSessions[uid] = { username: uname, sessions: [], openStart: null, skipped: 0 };
      const u = userSessions[uid];

      // Si le bot a déjà répondu à ce message → déjà enregistré
      // En mode --force (ex: après un !reset), on les compte quand même
      if (botRepliedTo.has(msg.id) && !force) {
        u.skipped++;
        // On doit quand même fermer/ouvrir la session logiquement pour ne pas décaler les paires
        if (content === `${prefix}c`) {
          if (u.openStart !== null) u.openStart = null;
          u.openStart = null;
        } else if (content === `${prefix}d`) {
          u.openStart = null;
        }
        continue;
      }

      if (content === `${prefix}c`) {
        if (u.openStart !== null) u.sessions.push({ start: u.openStart, end: ts });
        u.openStart = ts;
      } else if (content === `${prefix}d`) {
        if (u.openStart !== null) {
          u.sessions.push({ start: u.openStart, end: ts });
          u.openStart = null;
        }
      }
    }

    // Fermer les sessions encore ouvertes à la fin de la période
    for (const u of Object.values(userSessions)) {
      if (u.openStart !== null) {
        u.sessions.push({ start: u.openStart, end: endTs });
        u.openStart = null;
      }
    }

    // Vérifier quels users sont encore sur le serveur
    let guildMembers;
    try {
      guildMembers = await message.guild.members.fetch();
    } catch {
      guildMembers = message.guild.members.cache;
    }

    const removedUsers = [];
    for (const [uid, u] of Object.entries(userSessions)) {
      if (!guildMembers.has(uid)) {
        db.deleteUser(uid);
        removedUsers.push({ uid, username: u.username });
        u.removed = true;
      }
    }

    // Log des membres supprimés
    if (removedUsers.length > 0) {
      await logger.log(
        message.guild.id, 'admin',
        `🗑️ ${removedUsers.length} membre${removedUsers.length > 1 ? 's' : ''} retiré${removedUsers.length > 1 ? 's' : ''} (plus sur le serveur)`,
        removedUsers.map(u => ({ name: u.username || u.uid, value: `ID: \`${u.uid}\``, inline: true })),
        `Détecté via \`!rewind\` — <@${message.author.id}>`
      );
    }

    // Filtrer les users avec au moins 1 session et encore sur le serveur
    const withSessions = Object.entries(userSessions).filter(([, u]) => u.sessions.length > 0 && !u.removed);

    if (withSessions.length === 0) {
      const desc = removedUsers.length > 0
        ? `Tous les membres détectés (**${removedUsers.length}**) ont quitté le serveur et ont été supprimés.`
        : `Aucun \`${prefix}c\` / \`${prefix}d\` trouvé dans <#${targetChannel.id}> sur cette période.`;
      return loading.edit({ content: '', embeds: [
        new EmbedBuilder().setColor(COLORS.warning)
          .setTitle('🔄 Rewind — Aucun résultat')
          .setDescription(desc)
          .setTimestamp()
      ]});
    }

    // Ajouter les connexions en DB
    const summary  = [];
    let totalCo    = 0;
    let totalSkip  = 0;

    for (const [uid, u] of withSessions) {
      db.createUser(uid, u.username);
      db.addConnexions(uid, u.sessions.length);
      const user = db.getUser(uid);
      summary.push({ uid, username: u.username, added: u.sessions.length, skipped: u.skipped || 0, total: user.total_connexions });
      totalCo   += u.sessions.length;
      totalSkip += u.skipped || 0;
    }

    // Sauvegarder le log du rewind pour pouvoir l'annuler
    const rewindId = db.saveRewindLog(
      guildId,
      message.author.id,
      startTs,
      endTs,
      summary.map(s => ({ uid: s.uid, username: s.username, added: s.added }))
    );
    // Compter aussi les skipped des users sans nouvelles sessions (encore sur le serveur)
    for (const [, u] of Object.entries(userSessions)) {
      if (u.sessions.length === 0 && !u.removed && u.skipped > 0) totalSkip += u.skipped;
    }

    const lines = summary
      .sort((a, b) => b.added - a.added)
      .map(s => {
        const skipNote = s.skipped > 0 ? ` *(${s.skipped} déjà enregistré${s.skipped > 1 ? 's' : ''})*` : '';
        return `<@${s.uid}> **+${s.added}** co → total **${s.total}**${skipNote}`;
      })
      .join('\n');

    const p        = n => n === 1 ? '' : 's';
    const startFmt = new Date(startTs * 1000).toLocaleString('fr-FR');
    const endFmt   = new Date(endTs   * 1000).toLocaleString('fr-FR');

    const skipLine    = totalSkip > 0        ? `\n⏭️ **${totalSkip}** co déjà enregistrée${p(totalSkip)} ignorée${p(totalSkip)} (bot avait répondu)` : '';
    const removedLine = removedUsers.length > 0 ? `\n🗑️ **${removedUsers.length}** membre${p(removedUsers.length)} retiré${p(removedUsers.length)} (plus sur le serveur — voir logs)` : '';

    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('🔄 Rewind effectué')
      .setDescription(`**${msgs.length}** message${p(msgs.length)} scanné${p(msgs.length)} dans <#${targetChannel.id}>${skipLine}${removedLine}`)
      .addFields(
        { name: '📅 Période',         value: `Du \`${startFmt}\`\nAu \`${endFmt}\``,            inline: false },
        { name: `👥 ${summary.length} membre${p(summary.length)} — +${totalCo} co au total`,
          value: lines.slice(0, 1000),                                                             inline: false },
        { name: '👮 Modérateur',      value: `<@${message.author.id}>`,                           inline: true  },
        { name: '🆔 ID rewind',       value: `\`${rewindId}\` *(pour annuler : \`!cancelrewind ${rewindId}\`)*`, inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Rewind` });

    await loading.edit({ content: '', embeds: [embed] });
  }
};
