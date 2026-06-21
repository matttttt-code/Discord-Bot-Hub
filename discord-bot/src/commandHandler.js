const fs = require('fs');
const path = require('path');
const cfg = require('./utils/config');
const { hasTier2, hasTier3 } = require('./utils/helpers');

const commands = new Map();

function loadCommands() {
  const tiers = ['tier1', 'tier2', 'tier3'];
  for (const tier of tiers) {
    const dirPath = path.join(__dirname, 'commands', tier);
    if (!fs.existsSync(dirPath)) continue;
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const command = require(path.join(dirPath, file));
      commands.set(command.name, command);
    }
  }
  console.log(`[CommandHandler] ${commands.size} commandes chargées.`);
}

const TIER_LABELS = { 1: 'Tier 1 · Membre', 2: 'Tier 2 · Admin', 3: 'Tier 3 · Manager' };

async function logCommand(message, commandName, command) {
  try {
    const logger = require('./utils/logger');
    const guildId = message.guild.id;
    const tier = command?.tier || 1;
    await logger.log(guildId, 'info', `⌨️ Commande utilisée : \`!${commandName}\``, [
      { name: '👤 Utilisateur', value: `<@${message.author.id}> (\`${message.author.username}\`)`, inline: true },
      { name: '📌 Salon', value: `<#${message.channel.id}>`, inline: true },
      { name: '🎖️ Niveau', value: TIER_LABELS[tier] || 'Inconnu', inline: true },
    ]);
  } catch (_) {}
}

async function handleCommand(message) {
  const prefix = process.env.PREFIX || '!';
  if (!message.content.startsWith(prefix) || message.author.bot) return;
  if (!message.guild) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();

  const command = commands.get(commandName);
  if (!command) return;

  const guildId  = message.guild.id;
  const member   = message.member;
  const isAdmin  = member.permissions.has(8n);
  const isTier3  = hasTier3(member);
  const { error } = require('./utils/embeds');

  // ── Maintenance ────────────────────────────────────────────────────
  if (cfg.isMaintenance(guildId) && !isAdmin) {
    return message.reply({ embeds: [error('🔧 Maintenance', 'Le bot est en **mode maintenance**. Réessaye plus tard.')] });
  }

  // ── Blacklist par tier (bypass : Admin & Tier 3) ───────────────────
  if (!isAdmin && !isTier3) {
    const cmdTier = command.tier || 1;
    if (cfg.isBlacklistedForTier(member, guildId, cmdTier)) {
      const tierLabel = TIER_LABELS[cmdTier] || `Tier ${cmdTier}`;
      return message.reply({ embeds: [error('🚫 Accès refusé', `Tu es **blacklisté** pour les commandes **${tierLabel}** sur ce serveur.`)] });
    }
  }

  // ── Vérification des permissions par tier (avec rôle configuré) ────
  if (command.tier === 2 && !hasTier2(member)) {
    const roleId   = cfg.getTier2RoleId(guildId);
    const roleText = roleId ? `<@&${roleId}>` : 'le rôle Administration';
    return message.reply({ embeds: [error('🔒 Permission refusée', `Cette commande nécessite ${roleText}.`)] });
  }
  if (command.tier === 3 && !isTier3) {
    const roleId   = cfg.getTier3RoleId(guildId);
    const roleText = roleId ? `<@&${roleId}>` : 'le rôle Manager';
    return message.reply({ embeds: [error('🔒 Permission refusée', `Cette commande nécessite ${roleText}.`)] });
  }

  // ── Restrictions salon (bypass : Tier 3) ──────────────────────────
  if (!isTier3) {
    const adminChannelId     = cfg.getAdminChannelId(guildId);
    const managerChannelId   = cfg.getManagerChannelId(guildId);
    const connexionChannelId = cfg.getConnexionChannelId(guildId);

    if (command.tier === 2 && adminChannelId
        && message.channel.id !== adminChannelId
        && message.channel.id !== managerChannelId) {
      const allowed  = [adminChannelId, managerChannelId].filter(Boolean);
      const mention  = allowed.map(id => `<#${id}>`).join(' ou ');
      return message.reply({ embeds: [error('Mauvais salon', `Cette commande doit être utilisée dans ${mention}.`)] });
    }

    const TIER3_ANY_CHANNEL = ['add', 'remove', 'co', 'deco'];
    if (command.tier === 3 && managerChannelId
        && message.channel.id !== managerChannelId
        && !TIER3_ANY_CHANNEL.includes(commandName)) {
      return message.reply({ embeds: [error('Mauvais salon', `Cette commande doit être utilisée dans <#${managerChannelId}>.`)] });
    }

    if ((commandName === 'c' || commandName === 'd') && connexionChannelId && message.channel.id !== connexionChannelId) {
      return message.reply({ embeds: [error('Mauvais salon', `Les connexions doivent être effectuées dans <#${connexionChannelId}>.`)] });
    }
  }

  // ── Exécution ─────────────────────────────────────────────────────
  const NO_AUTO_DELETE = ['c', 'd', 'co', 'deco', 'add', 'remove', 'online', 'view', 'me'];

  try {
    await command.execute(message, args);
    logCommand(message, commandName, command);
    if (!NO_AUTO_DELETE.includes(commandName)) {
      setTimeout(() => message.delete().catch(() => {}), 5000);
    }
  } catch (err) {
    console.error(`[CommandHandler] Erreur dans !${commandName}:`, err);
    await message.reply({ embeds: [error('Erreur interne', 'Une erreur est survenue. Réessaye plus tard.')] }).catch(() => {});
  }
}

module.exports = { loadCommands, handleCommand };
