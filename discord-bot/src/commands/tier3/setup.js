const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { COLORS, error, success } = require('../../utils/embeds');
const cfg = require('../../utils/config');

const SETTINGS = {
  tier2:       { label: 'Rôle Administration (Tier 2)', icon: '👮', key: 'tier2_role_id',          type: 'role' },
  tier3:       { label: 'Rôle Manager (Tier 3)',         icon: '🏆', key: 'tier3_role_id',          type: 'role' },
  botmanager:  { label: 'Rôle Gestionnaire Bot',        icon: '🤖', key: 'bot_manager_role_id',    type: 'role' },
  active:      { label: 'Rôle Membre Actif (vocal)',    icon: '🟢', key: 'active_role_id',         type: 'role' },
  pingrole:    { label: 'Rôle Ping Connexion',          icon: '🔔', key: 'ping_role_id',           type: 'role' },
  enregistree: { label: 'Rôle Enregistrée (rapport)',   icon: '📋', key: 'enregistree_role_id',    type: 'role' },
  logs:        { label: 'Salon Logs',                   icon: '📋', key: 'logs_channel_id',        type: 'channel' },
  connexion:   { label: 'Salon Connexion',              icon: '🔌', key: 'connexion_channel_id',   type: 'channel' },
  admin:       { label: 'Salon Commandes Admin',        icon: '⚙️', key: 'admin_channel_id',       type: 'channel' },
  manager:     { label: 'Salon Commandes Manager',       icon: '🛡️', key: 'manager_channel_id',     type: 'channel' },
  abslog:      { label: 'Salon Log Absences',           icon: '🌙', key: 'absence_log_channel_id', type: 'channel' },
  maintenance: { label: 'Mode Maintenance',             icon: '🔧', key: 'maintenance_mode',       type: 'toggle' },
  startdate:   { label: 'Date de début rapport',        icon: '📅', key: 'rapport_start_date',     type: 'date' },
  partner:     { label: 'Serveur partenaire (messages/vocal)', icon: '🔗', key: 'partner_guild_id', type: 'snowflake' },
};

function resolveValue(guild, setting, rawArg) {
  if (setting.type === 'toggle') {
    const val = rawArg?.toLowerCase();
    if (['on', '1', 'oui', 'true', 'activer'].includes(val)) return '1';
    if (['off', '0', 'non', 'false', 'desactiver', 'désactiver'].includes(val)) return '0';
    return null;
  }
  if (setting.type === 'role') {
    const match = rawArg?.match(/^<@&(\d+)>$/);
    if (match) return match[1];
    if (/^\d{17,19}$/.test(rawArg)) return rawArg;
    if (rawArg) {
      const found = guild.roles.cache.find(r => r.name.toLowerCase() === rawArg.toLowerCase());
      return found ? found.id : null;
    }
    return null;
  }
  if (setting.type === 'channel') {
    const match = rawArg?.match(/^<#(\d+)>$/);
    if (match) return match[1];
    if (/^\d{17,19}$/.test(rawArg)) return rawArg;
    if (rawArg) {
      const found = guild.channels.cache.find(c => c.name.toLowerCase() === rawArg.toLowerCase());
      return found ? found.id : null;
    }
    return null;
  }
  if (setting.type === 'date') {
    const ddmm = rawArg?.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (ddmm) {
      const year = new Date().getFullYear();
      const ts = Math.floor(new Date(year, parseInt(ddmm[2]) - 1, parseInt(ddmm[1])).getTime() / 1000);
      return ts > 0 ? String(ts) : null;
    }
    const ddmmyyyy = rawArg?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      const ts = Math.floor(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime() / 1000);
      return ts > 0 ? String(ts) : null;
    }
    return null;
  }
  if (setting.type === 'snowflake') {
    if (/^\d{17,19}$/.test(rawArg)) return rawArg;
    return null;
  }
  return null;
}

function displayValue(guild, setting, val) {
  if (!val) return '`Non configuré`';
  if (setting.type === 'toggle') return val === '1' ? '🟢 **Activé**' : '🔴 **Désactivé**';
  if (setting.type === 'role') return `<@&${val}>`;
  if (setting.type === 'channel') return `<#${val}>`;
  if (setting.type === 'snowflake') return `\`${val}\``;
  if (setting.type === 'date') {
    const ts = parseInt(val);
    const d = new Date(ts * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} (<t:${ts}:D>)`;
  }
  return `\`${val}\``;
}

module.exports = {
  name: 'setup',
  tier: 3,
  description: 'Configuration du bot — dashboard complet',
  usage: '!setup | !setup [paramètre] [valeur]',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !cfg.getBotManagerRoleId(message.guild.id)) {
      const managerRoleId = cfg.getBotManagerRoleId(message.guild.id);
      const hasBotManager = managerRoleId && message.member.roles.cache.has(managerRoleId);
      const hasTier3Role = cfg.getTier3RoleId(message.guild.id) && message.member.roles.cache.has(cfg.getTier3RoleId(message.guild.id));
      if (!message.member.permissions.has(PermissionFlagsBits.Administrator) && !hasBotManager && !hasTier3Role) {
        return message.reply({ embeds: [error('Permission refusée', 'Tu dois être **Administrateur**, avoir le rôle **Manager** ou **Gestionnaire Bot**.')] });
      }
    }

    const guildId = message.guild.id;

    if (args.length === 0) {
      return sendDashboard(message, guildId);
    }

    const settingKey = args[0].toLowerCase();
    const setting = SETTINGS[settingKey];

    if (!setting) {
      const list = Object.entries(SETTINGS).map(([k, s]) => `\`${k}\` — ${s.icon} ${s.label}`).join('\n');
      return message.reply({ embeds: [error('Paramètre inconnu', `Paramètres disponibles :\n${list}\n\nUtilisation : \`!setup [paramètre] [valeur]\``)] });
    }

    if (args.length < 2) {
      const currentRaw = cfg.get(setting.key, guildId);
      const current = displayValue(message.guild, setting, currentRaw);
      let hint = '';
      if (setting.type === 'toggle') hint = 'Valeurs : `on` / `off`';
      else if (setting.type === 'role') hint = 'Valeur : `@role` ou ID du rôle';
      else if (setting.type === 'channel') hint = 'Valeur : `#salon` ou ID du salon';
      else if (setting.type === 'date') hint = 'Valeur : `DD/MM` ou `DD/MM/YYYY` (ex: `01/06/2025`)';
      else if (setting.type === 'snowflake') hint = 'Valeur : ID du serveur Discord (ex: `1234567890123456789`)';
      return message.reply({ embeds: [
        new EmbedBuilder().setColor(COLORS.info)
          .setTitle(`${setting.icon} | ${setting.label}`)
          .addFields(
            { name: 'Valeur actuelle', value: current, inline: true },
            { name: 'Comment modifier', value: `\`!setup ${settingKey} [valeur]\`\n${hint}`, inline: true }
          ).setTimestamp()
      ]});
    }

    const rawArg = args.slice(1).join(' ');
    const resolved = resolveValue(message.guild, setting, rawArg);

    if (resolved === null) {
      let hint = '';
      if (setting.type === 'toggle') hint = '`on` ou `off`';
      else if (setting.type === 'role') hint = '`@role` ou ID du rôle';
      else if (setting.type === 'channel') hint = '`#salon` ou ID du salon';
      else if (setting.type === 'date') hint = '`DD/MM` ou `DD/MM/YYYY` (ex: `01/06/2025`)';
      else if (setting.type === 'snowflake') hint = 'ID du serveur Discord (ex: `1234567890123456789`)';
      return message.reply({ embeds: [error('Valeur invalide', `Valeur attendue : ${hint}`)] });
    }

    await cfg.set(setting.key, resolved, guildId);

    const logger = require('../../utils/logger');
    await logger.log(guildId, 'config', `Configuration modifiée — ${setting.label}`, [
      { name: setting.icon + ' Paramètre', value: setting.label, inline: true },
      { name: '✅ Nouvelle valeur', value: displayValue(message.guild, setting, resolved), inline: true },
      { name: '👮 Modifié par', value: `<@${message.author.id}>`, inline: true },
    ]);

    return sendDashboard(message, guildId, `✅ **${setting.label}** mis à jour avec succès !`);
  }
};

async function sendDashboard(message, guildId, successMsg = null) {
  const guild = message.guild;

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`⚙️ | Dashboard de configuration — ${guild.name}`)
    .setDescription(successMsg ? `${successMsg}\n\nVoici la configuration actuelle du bot.` : 'Configuration actuelle du bot.\n Utilise `!setup [paramètre] [valeur]` pour modifier.')
    .setThumbnail(guild.iconURL({ dynamic: true }) || message.client.user.displayAvatarURL())
    .setTimestamp()
    .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Configuration` });

  const maintenance = cfg.get('maintenance_mode', guildId);
  embed.addFields({
    name: '🔧 Statut du bot',
    value: maintenance === '1'
      ? '🔴 **Mode maintenance actif** — Seuls les admins peuvent utiliser le bot'
      : '🟢 **Opérationnel**',
    inline: false
  });

  embed.addFields({ name: '\u200B', value: '**── 🎭 Rôles ──**', inline: false });
  const roles = [
    { key: 'tier2_role_id',       icon: '👮', label: 'Administration (Tier 2)' },
    { key: 'tier3_role_id',       icon: '🏆', label: 'Manager (Tier 3)' },
    { key: 'bot_manager_role_id', icon: '🤖', label: 'Gestionnaire Bot' },
    { key: 'active_role_id',      icon: '🟢', label: 'Membre Actif (vocal)' },
    { key: 'ping_role_id',        icon: '🔔', label: 'Ping Connexion (!c/!d)' },
    { key: 'enregistree_role_id', icon: '📋', label: 'Enregistrée (rapport)' },
  ];
  for (const r of roles) {
    const val = cfg.get(r.key, guildId);
    embed.addFields({ name: `${r.icon} ${r.label}`, value: val ? `<@&${val}>` : '`Non configuré`', inline: true });
  }

  embed.addFields({ name: '\u200B', value: '**── 📢 Salons ──**', inline: false });
  const channels = [
    { key: 'logs_channel_id',          icon: '📋', label: 'Logs' },
    { key: 'connexion_channel_id',     icon: '🔌', label: 'Connexion' },
    { key: 'admin_channel_id',         icon: '⚙️', label: 'Commandes Admin' },
    { key: 'manager_channel_id',       icon: '🛡️', label: 'Commandes Manager' },
    { key: 'absence_log_channel_id',   icon: '🌙', label: 'Log Absences' },
  ];
  for (const c of channels) {
    const val = cfg.get(c.key, guildId);
    embed.addFields({ name: `${c.icon} ${c.label}`, value: val ? `<#${val}>` : '`Non configuré`', inline: true });
  }

  embed.addFields({ name: '\u200B', value: '**── 🔗 Multi-serveur ──**', inline: false });
  const partnerVal = cfg.get('partner_guild_id', guildId);
  embed.addFields({
    name: '🔗 Serveur partenaire',
    value: partnerVal ? `\`${partnerVal}\`\n*Messages et vocal provenant de ce serveur sont inclus dans \`!rapport\`*` : '`Non configuré`',
    inline: false
  });

  embed.addFields({ name: '\u200B', value: '**── 📊 Rapport ──**', inline: false });
  const startDateVal = cfg.get('rapport_start_date', guildId);
  embed.addFields({
    name: '📅 Date de début rapport',
    value: startDateVal ? (() => {
      const ts = parseInt(startDateVal);
      const d = new Date(ts * 1000);
      const p = n => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} (<t:${ts}:D>)`;
    })() : '`Non configuré`',
    inline: true
  });

  embed.addFields({ name: '\u200B', value: '**── 📋 Commandes disponibles ──**', inline: false });
  embed.addFields({
    name: 'Paramètres modifiables',
    value: [
      '`!setup tier2 @role` — Rôle Administration',
      '`!setup tier3 @role` — Rôle Manager',
      '`!setup botmanager @role` — Rôle Gestionnaire Bot',
      '`!setup active @role` — Rôle Membre Actif (vocal)',
      '`!setup pingrole @role` — Rôle pingé lors des !c / !d',
      '`!setup enregistree @role` — Rôle Enregistrée (rapport)',
      '`!setup logs #salon` — Salon Logs',
      '`!setup connexion #salon` — Salon Connexion',
      '`!setup admin #salon` — Salon Commandes Admin',
      '`!setup manager #salon` — Salon Commandes Manager',
      '`!setup abslog #salon` — Salon Log Absences (ping à chaque déclaration)',
      '`!setup maintenance on/off` — Mode Maintenance',
      '`!setup startdate DD/MM/YYYY` — Date de début rapport',
      '`!setup partner ID_SERVEUR` — Lier serveur principal (messages/vocal)',
    ].join('\n'),
    inline: false
  });

  return message.reply({ embeds: [embed] });
}
