require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ActivityType, EmbedBuilder,
        ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { loadCommands, handleCommand } = require('./commandHandler');
const db     = require('./database');
const logger = require('./utils/logger');
const cfg    = require('./utils/config');
const pg     = require('./db/pg');
const { COLORS }            = require('./utils/embeds');
const { updateAbsenceBoard, parseDuration, durLabel, fmtDate } = require('./utils/absenceBoard');

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

  // ── DM de démarrage aux membres Tier 3 ─────────────────────
  for (const guild of client.guilds.cache.values()) {
    const tier3RoleId = cfg.getTier3RoleId(guild.id);
    if (!tier3RoleId) continue;
    try {
      await guild.members.fetch(); // s'assure que le cache est complet
      const tier3Members = guild.members.cache.filter(m =>
        !m.user.bot && m.roles.cache.has(tier3RoleId)
      );
      const pool     = pg.getPool();
      const pgStatus = pool ? '🟢 Connectée' : '🔴 Non disponible';
      for (const [, member] of tier3Members) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(pool ? COLORS.success : COLORS.warning)
            .setTitle('🔄 Bot redémarré')
            .setDescription(`Le bot **${botName}** sur **${guild.name}** vient de redémarrer.`)
            .addFields(
              { name: '🗄️ Base de données', value: pgStatus,                               inline: true },
              { name: '🟢 Connectés',        value: `**${db.getOnlineUsers().length}**`,    inline: true },
              { name: '📅 Heure',            value: `<t:${Math.floor(Date.now()/1000)}:T>`, inline: true },
            )
            .setTimestamp()
            .setFooter({ text: `${botName} • Notification Manager` });
          await member.send({ embeds: [dmEmbed] });
        } catch {} // DMs désactivés ou autre erreur → on ignore
      }
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
        // Mettre à jour le board des absences
        try {
          const g = client.guilds.cache.find(gr => gr.id === absence.guild_id) || client.guilds.cache.first();
          if (g) await updateAbsenceBoard(client, g);
        } catch {}
      }
    } catch (e) {
      console.error('[Absences] Erreur checker :', e.message);
    }
  }

  setInterval(checkAbsences, 60_000);
  checkAbsences();

  // ── Checker sanction-auto (toutes les heures) ───────────────
  async function checkSanctionAuto() {
    try {
      for (const guild of client.guilds.cache.values()) {
        const guildId = guild.id;
        if (cfg.get('sanction_auto_enabled', guildId) !== '1') continue;

        const jours     = parseInt(cfg.get('sanction_auto_jours', guildId));
        const channelId = cfg.get('sanction_auto_channel_id', guildId);
        const roleId    = cfg.get('sanction_auto_role_id', guildId);
        if (!jours || !channelId || !roleId) continue;

        const channel = guild.channels.cache.get(channelId)
          || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;

        const inactifs = db.getInactiveForSanction(jours, guildId);
        for (const user of inactifs) {
          try {
            const member = await guild.members.fetch(user.discord_id).catch(() => null);
            if (!member) continue;

            const embed = new EmbedBuilder()
              .setColor(COLORS.error)
              .setTitle('⚠️ Membre inactif — Sanction automatique')
              .setDescription(`<@${user.discord_id}> n'a effectué **aucune connexion depuis plus de ${jours} jour${jours > 1 ? 's' : ''}**.`)
              .addFields(
                { name: '👤 Membre',         value: `<@${user.discord_id}>`,    inline: true },
                { name: '🏆 Total co.',       value: `**${user.total_connexions}**`, inline: true },
                { name: '📅 Seuil dépassé',  value: `**${jours} jour${jours > 1 ? 's' : ''}**`, inline: true },
              )
              .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
              .setTimestamp()
              .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Sanction Auto` });

            await channel.send({
              content: `<@&${roleId}> <@${user.discord_id}>`,
              embeds: [embed],
              allowedMentions: { users: [user.discord_id], roles: [roleId] },
            });

            db.markSanctioned(user.discord_id);
          } catch (e) {
            console.error('[SanctionAuto] Erreur membre', user.discord_id, e.message);
          }
        }
      }
    } catch (e) {
      console.error('[SanctionAuto] Erreur checker :', e.message);
    }
  }

  setInterval(checkSanctionAuto, 3_600_000);
  checkSanctionAuto();

  // ── Checker co longue durée (toutes les 5 min) ──────────────
  const MAX_VOICE_SECONDS = 6 * 3600; // 6 heures
  async function checkLongVoice() {
    try {
      const longSessions = db.getVoiceActiveLong(MAX_VOICE_SECONDS);
      for (const v of longSessions) {
        try {
          const guild  = client.guilds.cache.get(v.guild_id);
          if (!guild) continue;
          const member = await guild.members.fetch(v.discord_id).catch(() => null);

          // Vérifier que la personne a une session !c active
          if (!db.hasActiveSession(v.discord_id)) continue;

          // Clôturer uniquement la session connexion (!c) — le membre reste dans le vocal
          const sessionResult = db.endSession(v.discord_id);
          if (!sessionResult) continue;

          const durSec  = Math.floor(Date.now() / 1000) - v.join_time;
          const heures  = Math.floor(durSec / 3600);
          const minutes = Math.floor((durSec % 3600) / 60);

          const warnEmbed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('⚠️ | Connexion retirée automatiquement')
            .setDescription(
              `Ta connexion a été **retirée automatiquement** après **${heures}h${String(minutes).padStart(2,'0')}** de connexion continue.\n\n` +
              `> La durée maximale de connexion sans interruption est de **6 heures**.\n> Tu restes dans le salon vocal, mais tu devras refaire un \`!c\` pour relancer une connexion.`
            )
            .addFields(
              { name: '🔊 Salon', value: `<#${v.channel_id}>`, inline: true },
              { name: '⏱️ Durée enregistrée', value: `${heures}h${String(minutes).padStart(2,'0')}`, inline: true },
            )
            .setTimestamp()
            .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Limite 6h` });

          if (member) try { await member.user.send({ embeds: [warnEmbed] }); } catch {}

          console.log(`[LongVoice] Connexion de ${v.username} retirée après ${heures}h${minutes}m`);
        } catch (e) {
          console.error('[LongVoice] Erreur membre', v.discord_id, e.message);
        }
      }
    } catch (e) {
      console.error('[LongVoice] Erreur checker :', e.message);
    }
  }

  setInterval(checkLongVoice, 5 * 60_000);
  checkLongVoice();
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

// ── Interactions (boutons + modals absence) ───────────────────
client.on('interactionCreate', async (interaction) => {
  try {

    // ── Pagination !staff ────────────────────────────────────
    if (interaction.isButton() && (interaction.customId.startsWith('staff_prev_') || interaction.customId.startsWith('staff_next_'))) {
      const parts    = interaction.customId.split('_');
      // format: staff_prev_{authorId}_{page}  ou  staff_next_{authorId}_{page}
      const dir      = parts[1]; // 'prev' ou 'next'
      const authorId = parts[2];
      const curPage  = parseInt(parts[3]);

      if (interaction.user.id !== authorId) {
        return interaction.reply({ content: `❌ Seul(e) l'auteur de la commande peut tourner les pages.`, ephemeral: true });
      }

      const staffCmd = require('./commands/tier2/staff');
      const guildId  = interaction.guild.id;
      const { sorted, memberMap, activeAbsenceIds } = await staffCmd.buildStaffData(interaction.guild);
      const totalPages = Math.ceil(sorted.length / staffCmd.PER_PAGE);
      const newPage    = dir === 'next' ? curPage + 1 : curPage - 1;

      if (newPage < 0 || newPage >= totalPages) {
        return interaction.reply({ content: '❌ Page invalide.', ephemeral: true });
      }

      const embed = staffCmd.buildPage(sorted, memberMap, activeAbsenceIds, guildId, newPage, totalPages);
      const row   = staffCmd.buildRow(authorId, newPage, totalPages);

      return interaction.update({ embeds: [embed], components: totalPages > 1 ? [row] : [] });
    }

    // ── Bouton : ouvrir le modal d'absence ──────────────────
    if (interaction.isButton() && interaction.customId.startsWith('absence_open_modal_')) {
      const userId  = interaction.customId.replace('absence_open_modal_', '');
      if (interaction.user.id !== userId) {
        return interaction.reply({ content: '❌ Ce bouton ne t\'appartient pas.', ephemeral: true });
      }

      const existing = db.getUserAbsence(interaction.user.id, interaction.guild.id);
      if (existing) {
        return interaction.reply({ content: '⚠️ Tu as déjà une absence active.', ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('absence_modal')
        .setTitle('🌙 Déclarer une absence');

      const startInput = new TextInputBuilder()
        .setCustomId('absence_start')
        .setLabel('Date de début (JJ/MM/AAAA HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex: 14/06/2026 09:00')
        .setRequired(true)
        .setMaxLength(16);

      const endInput = new TextInputBuilder()
        .setCustomId('absence_end')
        .setLabel('Date de fin (JJ/MM/AAAA HH:MM)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ex: 20/06/2026 18:00')
        .setRequired(true)
        .setMaxLength(16);

      const reasonInput = new TextInputBuilder()
        .setCustomId('absence_reason')
        .setLabel('Motif')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Vacances, repos, raison personnelle...')
        .setRequired(false)
        .setMaxLength(300);

      modal.addComponents(
        new ActionRowBuilder().addComponents(startInput),
        new ActionRowBuilder().addComponents(endInput),
        new ActionRowBuilder().addComponents(reasonInput),
      );

      return interaction.showModal(modal);
    }

    // ── Modal submit : créer l'absence ──────────────────────
    if (interaction.isModalSubmit() && interaction.customId === 'absence_modal') {
      const { id, username } = interaction.user;
      const guildId = interaction.guild.id;

      const existing = db.getUserAbsence(id, guildId);
      if (existing) {
        return interaction.reply({ content: '⚠️ Tu as déjà une absence active.', ephemeral: true });
      }

      const startStr = interaction.fields.getTextInputValue('absence_start').trim();
      const endStr   = interaction.fields.getTextInputValue('absence_end').trim();
      const reason   = interaction.fields.getTextInputValue('absence_reason').trim() || 'Non précisé';

      // Parseur de date JJ/MM/AAAA HH:MM (heure optionnelle, défaut 00:00)
      const parseAbsDate = (str) => {
        const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
        if (!m) return null;
        const [, dd, mm, yyyy, hh = '00', mi = '00'] = m;
        const ts = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, 0).getTime();
        if (isNaN(ts)) return null;
        return Math.floor(ts / 1000);
      };

      const startTime = parseAbsDate(startStr);
      const endTime   = parseAbsDate(endStr);

      if (!startTime) {
        return interaction.reply({
          content: '❌ Date de début invalide. Format attendu : `JJ/MM/AAAA HH:MM` (ex: `14/06/2026 09:00`)',
          ephemeral: true,
        });
      }
      if (!endTime) {
        return interaction.reply({
          content: '❌ Date de fin invalide. Format attendu : `JJ/MM/AAAA HH:MM` (ex: `20/06/2026 18:00`)',
          ephemeral: true,
        });
      }
      if (endTime <= startTime) {
        return interaction.reply({
          content: '❌ La date de fin doit être **après** la date de début.',
          ephemeral: true,
        });
      }

      const nowTs  = Math.floor(Date.now() / 1000);
      const durSec = endTime - startTime;

      db.createUser(id, username);
      db.addAbsence(id, username, guildId, reason, startTime, endTime);

      await updateAbsenceBoard(client, interaction.guild);

      // DM de confirmation
      const dmEmbed = new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('🌙 | Absence enregistrée')
        .setDescription('Ton absence a bien été enregistrée. Tu seras notifié(e) automatiquement à la fin.')
        .addFields(
          { name: '📅 Début',      value: `${fmtDate(startTime)} (<t:${startTime}:F>)`, inline: false },
          { name: '📅 Fin prévue', value: `${fmtDate(endTime)} (<t:${endTime}:R>)`,   inline: false },
          { name: '⏱️ Durée',      value: durLabel(durSec),                           inline: true  },
          { name: '📋 Motif',      value: reason,                                   inline: false },
        )
        .setTimestamp()
        .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Absence` });

      try { await interaction.user.send({ embeds: [dmEmbed] }); } catch {}

      // ── Envoi dans le salon abslog ───────────────────────────
      const absLogChannelId = cfg.get('absence_log_channel_id', guildId);
      if (absLogChannelId) {
        try {
          const absLogChannel = interaction.guild.channels.cache.get(absLogChannelId)
            || await interaction.guild.channels.fetch(absLogChannelId).catch(() => null);
          if (absLogChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(COLORS.warning)
              .setTitle('🌙 | Nouvelle absence déclarée')
              .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
              .addFields(
                { name: '👤 Membre',     value: `<@${id}> (\`${username}\`)`,                  inline: false },
                { name: '📅 Début',      value: `${fmtDate(startTime)} (<t:${startTime}:F>)`, inline: true  },
                { name: '📅 Fin prévue', value: `${fmtDate(endTime)} (<t:${endTime}:R>)`,     inline: true  },
                { name: '⏱️ Durée',      value: durLabel(durSec),                             inline: true  },
                { name: '📋 Motif',      value: reason,                                        inline: false },
              )
              .setTimestamp()
              .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Absence Log` });
            await absLogChannel.send({ content: `<@&1506758584443080735>`, embeds: [logEmbed] });
          }
        } catch {}
      }

      return interaction.reply({
        content: `✅ Absence enregistrée ! Fin prévue <t:${endTime}:R>. Tu recevras un DM à la fin.`,
        ephemeral: true,
      });
    }
  } catch (e) {
    console.error('[Interaction] Erreur :', e.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
    }
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
