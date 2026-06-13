const fs = require('fs');
const path = require('path');
const cfg = require('./utils/config');

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

const TIER_LABELS = { 1: 'Tier 1 · Membre', 2: 'Tier 2 · Admin', 3: 'Tier 3 · Gérant' };
const TIER_COLORS = { 1: 0xADB5BD, 2: 0x5865F2, 3: 0xFFD700 };

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

  const guildId = message.guild.id;

  if (cfg.isMaintenance(guildId) && !message.member.permissions.has(8n)) {
    const { error } = require('./utils/embeds');
    return message.reply({ embeds: [error('🔧 Maintenance', 'Le bot est en **mode maintenance**. Réessaye plus tard.')] });
  }

  const adminChannelId = cfg.getAdminChannelId(guildId);
  const managerChannelId = cfg.getManagerChannelId(guildId);
  const connexionChannelId = cfg.getConnexionChannelId(guildId);

  // Tier 2 autorisé dans le salon admin ET dans le salon gérant (tier 3)
  if (command.tier === 2 && adminChannelId
      && message.channel.id !== adminChannelId
      && message.channel.id !== managerChannelId) {
    const { error } = require('./utils/embeds');
    const allowed = [adminChannelId, managerChannelId].filter(Boolean);
    const mention = allowed.map(id => `<#${id}>`).join(' ou ');
    return message.reply({ embeds: [error('Mauvais salon', `Cette commande doit être utilisée dans ${mention}.`)] });
  }
  // Ces commandes Tier 3 sont autorisées dans n'importe quel salon
  const TIER3_ANY_CHANNEL = ['add', 'remove', 'co', 'deco'];
  if (command.tier === 3 && managerChannelId
      && message.channel.id !== managerChannelId
      && !TIER3_ANY_CHANNEL.includes(commandName)) {
    const { error } = require('./utils/embeds');
    return message.reply({ embeds: [error('Mauvais salon', `Cette commande doit être utilisée dans <#${managerChannelId}>.`)] });
  }
  if ((commandName === 'c' || commandName === 'd') && connexionChannelId && message.channel.id !== connexionChannelId) {
    const { error } = require('./utils/embeds');
    return message.reply({ embeds: [error('Mauvais salon', `Les connexions doivent être effectuées dans <#${connexionChannelId}>.`)] });
  }

  try {
    await command.execute(message, args);
    // Log toutes les commandes dans le salon logs
    logCommand(message, commandName, command);
  } catch (err) {
    console.error(`[CommandHandler] Erreur dans !${commandName}:`, err);
    const { error } = require('./utils/embeds');
    await message.reply({ embeds: [error('Erreur interne', 'Une erreur est survenue. Réessaye plus tard.')] }).catch(() => {});
  }
}

module.exports = { loadCommands, handleCommand };
