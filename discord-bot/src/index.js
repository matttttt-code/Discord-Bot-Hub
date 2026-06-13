require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder } = require('discord.js');
const { loadCommands, handleCommand } = require('./commandHandler');
const db     = require('./database');
const logger = require('./utils/logger');
const cfg    = require('./utils/config');
const pg     = require('./db/pg');
const { COLORS } = require('./utils/embeds');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

loadCommands();
logger.init(client);

// ── Démarrage séquentiel : PG d'abord, Discord ensuite ───────────
async function startup() {
  // 1. Connexion + init PG
  let pgOk = false;
  try {
    await pg.init();
    pgOk = true;
    console.log('[Startup] ✅ PostgreSQL connecté.');
  } catch (err) {
    console.error('[Startup] ❌ PostgreSQL ERREUR :', err.message);
  }

  // 2. Chargement config + données opérationnelles depuis PG
  let configRows = 0;
  let dataRows   = 0;
  if (pgOk) {
    try {
      configRows = await cfg.loadCache();
      console.log(`[Startup] ✅ Config : ${configRows} clé(s) chargée(s).`);
    } catch (err) {
      console.error('[Startup] ❌ Config PG :', err.message);
    }
    try {
      dataRows = await db.init();
      console.log(`[Startup] ✅ Données : ${dataRows} enregistrement(s) restauré(s).`);
    } catch (err) {
      console.error('[Startup] ❌ Données PG :', err.message);
    }
  } else {
    console.warn('[Startup] ⚠️  Démarrage sans persistance (DATABASE_URL manquant ou PG inaccessible).');
  }

  // 3. Connexion Discord
  await client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('[Startup] ❌ Discord login :', err.message);
    process.exit(1);
  });
}

startup();

// ── Ready ─────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`[Bot] Connecté en tant que ${client.user.tag}`);
  console.log(`[Bot] Sur ${client.guilds.cache.size} serveur(s)`);

  const botName = process.env.BOT_NAME || 'CONNEXION BOT';
  client.user.setPresence({
    activities: [{ name: `${process.env.PREFIX || '!'}help | ${botName}`, type: ActivityType.Watching }],
    status: 'online',
  });

  // ── Re-sync des états vocaux Discord → DB ──────────────────
  // Peuple voice_active pour tous les membres actuellement en vocal
  // (après un redémarrage, aucun voiceStateUpdate ne se déclenche pour eux)
  let voiceResynced = 0;
  const { ChannelType } = require('discord.js');
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) continue;
      for (const [, member] of channel.members) {
        if (member.user.bot) continue;
        db.voiceJoin(member.user.id, member.user.username, channel.id, guild.id);
        voiceResynced++;
      }
    }
  }
  if (voiceResynced > 0) {
    console.log(`[Bot] ✅ Re-sync vocal : ${voiceResynced} membre(s) remis en tracking.`);
  }

  // ── Message de démarrage ────────────────────────────────────
  const pool     = pg.getPool();
  const pgStatus = pool ? '🟢 Connectée' : '🔴 Non disponible';

  for (const guild of client.guilds.cache.values()) {
    // 1. Chercher le salon logs configuré
    let targetChannel = null;
    const logsId = cfg.getLogsChannelId(guild.id);
    if (logsId) {
      targetChannel = guild.channels.cache.get(logsId)
        || await guild.channels.fetch(logsId).catch(() => null);
    }

    // 2. Fallback : salon système du serveur
    if (!targetChannel && guild.systemChannel) {
      targetChannel = guild.systemChannel;
    }

    // 3. Fallback : premier salon texte où le bot peut écrire
    if (!targetChannel) {
      targetChannel = guild.channels.cache
        .filter(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'))
        .sort((a, b) => a.position - b.position)
        .first();
    }

    if (!targetChannel) continue;

    try {
      const confKeys  = cfg.getCachedKeyCount(guild.id);
      const onlineNow = db.getOnlineUsers().length;

      const embed = new EmbedBuilder()
        .setColor(pool ? COLORS.success : COLORS.error)
        .setTitle('🤖 Bot redémarré')
        .addFields(
          { name: '🗄️ Base de données', value: pgStatus,                              inline: true },
          { name: '⚙️ Config',           value: `**${confKeys}** clé(s)`,              inline: true },
          { name: '🟢 Connectés',        value: `**${onlineNow}**`,                    inline: true },
          { name: '🎙️ Re-sync vocal',   value: `**${voiceResynced}** membre(s)`,       inline: true },
          { name: '📅 Heure',            value: `<t:${Math.floor(Date.now()/1000)}:F>`,inline: true },
          { name: '\u200B',              value: '\u200B',                               inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `${botName} • Démarrage` });

      if (!pool) {
        embed.setDescription('⚠️ **DATABASE_URL introuvable ou PostgreSQL inaccessible.**\nLa configuration et les connexions ne seront **pas sauvegardées** entre les redémarrages.\nVérifiez la variable `DATABASE_URL` dans les paramètres Railway.');
      } else if (!logsId) {
        embed.setDescription(`ℹ️ Aucun salon logs configuré. Utilise \`${process.env.PREFIX || '!'}setup logs #salon\` pour fixer ça.`);
      }

      await targetChannel.send({ embeds: [embed] });
    } catch {}
  }

  // ── Checker d'absences terminées (toutes les 60s) ──────────
  async function checkAbsences() {
    try {
      const expired = db.getExpiredAbsences();
      for (const absence of expired) {
        db.endAbsence(absence.id);
        try {
          const user = await client.users.fetch(absence.discord_id);
          const d = (ts) => {
            const dt = new Date(ts * 1000);
            const p  = n => String(n).padStart(2, '0');
            return `${p(dt.getDate())}/${p(dt.getMonth() + 1)} à ${p(dt.getHours())}h${p(dt.getMinutes())}`;
          };
          const endEmbed = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('✅ | Absence terminée')
            .setDescription('Ton absence est officiellement terminée. Bienvenue de retour !')
            .addFields(
              { name: '📅 Début', value: d(absence.start_time), inline: true },
              { name: '📅 Fin',   value: d(absence.end_time),   inline: true },
              { name: '📋 Motif', value: absence.reason,         inline: false },
            )
            .setTimestamp()
            .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Fin d'absence` });
          await user.send({ embeds: [endEmbed] });
        } catch {}
      }
    } catch (e) {
      console.error('[Absences] Erreur checker :', e.message);
    }
  }

  setInterval(checkAbsences, 60_000);
  checkAbsences();
});

// ── Messages ──────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.guild) {
    db.recordMessage(message.author.id, message.author.username, message.channel.id, message.guild.id);
  }
  await handleCommand(message);
});

// ── Vocal ─────────────────────────────────────────────────────────
client.on('voiceStateUpdate', async (oldState, newState) => {
  const userId = newState.id || oldState.id;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  const username = member.user.username;
  const guildId  = newState.guild?.id || oldState.guild?.id;

  const joined = !oldState.channelId && newState.channelId;
  const left   = oldState.channelId && !newState.channelId;
  const moved  = oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId;

  if (joined) {
    db.voiceJoin(userId, username, newState.channelId, guildId);
    await logger.log(guildId, 'connexion', '🎙️ Rejoint le vocal', [
      { name: '👤 Membre', value: `<@${userId}>`,          inline: true },
      { name: '🔊 Salon',  value: `<#${newState.channelId}>`, inline: true },
    ]);
  } else if (left) {
    const result = db.voiceLeave(userId);
    if (result) {
      const { formatDuration } = require('./utils/embeds');
      await logger.log(guildId, 'deconnexion', '🎙️ Quitté le vocal', [
        { name: '👤 Membre', value: `<@${userId}>`,             inline: true },
        { name: '🔊 Salon',  value: `<#${result.channelId}>`,    inline: true },
        { name: '⏱️ Durée',  value: formatDuration(result.duration), inline: true },
      ]);
    }
  } else if (moved) {
    db.voiceLeave(userId);
    db.voiceJoin(userId, username, newState.channelId, guildId);
  }

  const activeRoleId = cfg.getActiveRoleId(guildId);
  if (activeRoleId && member) {
    try {
      if (joined || moved)  await member.roles.add(activeRoleId).catch(() => {});
      else if (left)        await member.roles.remove(activeRoleId).catch(() => {});
    } catch {}
  }
});

// ── Nettoyage auto quand un membre quitte ─────────────────────
client.on('guildMemberRemove', (member) => {
  if (member.user.bot) return;
  db.deleteUser(member.user.id);
  console.log(`[Bot] 🗑️ Données supprimées pour ${member.user.username} (quitte le serveur).`);
});

client.on('error', (err) => console.error('[Client] Erreur :', err));
client.on('warn',  (info) => console.warn('[Client] Avertissement :', info));

process.on('unhandledRejection', (reason) => {
  console.error('[Process] Rejection non gérée :', reason);
});
