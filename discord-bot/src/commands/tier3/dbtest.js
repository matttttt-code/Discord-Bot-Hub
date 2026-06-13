const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const pg  = require('../../db/pg');
const cfg = require('../../utils/config');
const db  = require('../../database');

module.exports = {
  name: 'dbtest',
  tier: 3,
  description: 'Diagnostique la connexion PostgreSQL et les données chargées',
  usage: '!dbtest',
  async execute(message) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Commande réservée aux Gérants.')] });
    }

    const loading = await message.reply({ content: '⏳ Test de la base de données…' });

    // Test PG direct
    let pgStatus = '🔴 Non connecté';
    let pgLatency = null;
    let pgError = null;
    const pool = pg.getPool();

    if (!pool) {
      pgError = 'DATABASE_URL non défini ou introuvable.';
    } else {
      try {
        const start = Date.now();
        await pg.query('SELECT 1');
        pgLatency = Date.now() - start;
        pgStatus = `🟢 Connecté (${pgLatency}ms)`;
      } catch (err) {
        pgStatus = '🔴 Erreur de connexion';
        pgError = err.message;
      }
    }

    // Comptes dans les tables PG
    const tables = [
      { label: '👤 Utilisateurs',   sql: 'SELECT COUNT(*) FROM op_users' },
      { label: '🔄 Sessions',        sql: 'SELECT COUNT(*) FROM op_sessions' },
      { label: '💬 Stats messages',  sql: 'SELECT COUNT(*) FROM op_message_stats' },
      { label: '🎙️ Stats vocal',     sql: 'SELECT COUNT(*) FROM op_voice_stats' },
      { label: '🌙 Absences',        sql: 'SELECT COUNT(*) FROM op_absences' },
      { label: '⚙️ Config',          sql: 'SELECT COUNT(*) FROM guild_config' },
    ];

    const pgCounts = [];
    for (const t of tables) {
      try {
        const res = await pg.query(t.sql);
        pgCounts.push(`${t.label}: **${res.rows[0].count}**`);
      } catch {
        pgCounts.push(`${t.label}: ❌`);
      }
    }

    // Données en mémoire
    const guildId    = message.guild.id;
    const confKeys   = cfg.getCachedKeyCount(guildId);
    const memUsers   = db.getLeaderboard(999).length;

    // Config actuelle
    const configLines = [
      `Salon logs : ${cfg.getLogsChannelId(guildId) ? `<#${cfg.getLogsChannelId(guildId)}>` : '❌ non configuré'}`,
      `Salon connexion : ${cfg.getConnexionChannelId(guildId) ? `<#${cfg.getConnexionChannelId(guildId)}>` : '❌ non configuré'}`,
      `Salon admin : ${cfg.getAdminChannelId(guildId) ? `<#${cfg.getAdminChannelId(guildId)}>` : '❌ non configuré'}`,
      `Rôle tier2 : ${cfg.getTier2RoleId(guildId) ? `<@&${cfg.getTier2RoleId(guildId)}>` : '❌ non configuré'}`,
      `Rôle tier3 : ${cfg.getTier3RoleId(guildId) ? `<@&${cfg.getTier3RoleId(guildId)}>` : '❌ non configuré'}`,
      `Co activées : ${cfg.isCoEnabled(guildId) ? '✅ Oui' : '🔴 Non'}`,
    ];

    const embed = new EmbedBuilder()
      .setColor(pgError ? COLORS.error : COLORS.success)
      .setTitle('🗄️ Diagnostic base de données')
      .addFields(
        {
          name: '🔌 PostgreSQL',
          value: pgStatus + (pgError ? `\n\`${pgError}\`` : ''),
          inline: false,
        },
        {
          name: '📊 Données en PG',
          value: pgCounts.join('\n') || '—',
          inline: true,
        },
        {
          name: '💾 Mémoire (chargée)',
          value: [
            `⚙️ Config chargée : **${confKeys}** clé(s)`,
            `👤 Utilisateurs : **${memUsers}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '⚙️ Config de ce serveur',
          value: configLines.join('\n'),
          inline: false,
        },
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • DBTest` });

    if (pgError) {
      embed.setDescription(`⚠️ **La base de données n'est pas accessible.**\nLa configuration et les connexions ne sont **pas sauvegardées**.\n\nVérifie que \`DATABASE_URL\` est bien défini dans les variables Railway du service bot.`);
    }

    await loading.edit({ content: '', embeds: [embed] });
  }
};
