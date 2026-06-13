const { EmbedBuilder } = require('discord.js');
const { COLORS, error } = require('../../utils/embeds');
const { hasTier2 } = require('../../utils/helpers');
const cfg = require('../../utils/config');

module.exports = {
  name: 'config',
  tier: 2,
  description: 'Voir la configuration actuelle du bot',
  async execute(message) {
    if (!hasTier2(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Cette commande nécessite le rôle **Administration**.')] });
    }

    const guildId = message.guild.id;
    const guild   = message.guild;
    const maintenance = cfg.get('maintenance_mode', guildId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`⚙️ | Configuration — ${guild.name}`)
      .setDescription('Vue d\'ensemble de la configuration actuelle. Utilise `!setup` (Tier 3) pour modifier.')
      .setThumbnail(guild.iconURL({ dynamic: true }) || message.client.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Config` });

    // Statut
    embed.addFields({
      name: '🔧 Statut',
      value: maintenance === '1'
        ? '🔴 **Maintenance active** — seuls les admins peuvent utiliser le bot'
        : '🟢 **Opérationnel**',
      inline: false
    });

    // Rôles
    embed.addFields({ name: '\u200B', value: '**── 🎭 Rôles configurés ──**', inline: false });
    const roles = [
      { key: 'tier2_role_id',       icon: '👮', label: 'Administration (Tier 2)' },
      { key: 'tier3_role_id',       icon: '👑', label: 'Manager (Tier 3)' },
      { key: 'bot_manager_role_id', icon: '🤖', label: 'Gestionnaire Bot' },
      { key: 'active_role_id',      icon: '🟢', label: 'Membre Actif (vocal)' },
      { key: 'ping_role_id',        icon: '🔔', label: 'Ping Connexion (!c/!d)' },
      { key: 'enregistree_role_id', icon: '📋', label: 'Enregistrée (rapport)' },
    ];
    for (const r of roles) {
      const val = cfg.get(r.key, guildId);
      embed.addFields({
        name: `${r.icon} ${r.label}`,
        value: val ? `<@&${val}>` : '`Non configuré`',
        inline: true
      });
    }

    // Salons
    embed.addFields({ name: '\u200B', value: '**── 📢 Salons configurés ──**', inline: false });
    const channels = [
      { key: 'logs_channel_id',      icon: '📋', label: 'Logs' },
      { key: 'connexion_channel_id', icon: '🔌', label: 'Connexion' },
      { key: 'admin_channel_id',     icon: '⚙️', label: 'Commandes Admin' },
      { key: 'manager_channel_id',   icon: '🛡️', label: 'Commandes Manager' },
    ];
    for (const c of channels) {
      const val = cfg.get(c.key, guildId);
      embed.addFields({
        name: `${c.icon} ${c.label}`,
        value: val ? `<#${val}>` : '`Non configuré`',
        inline: true
      });
    }

    // Résumé données
    embed.addFields({ name: '\u200B', value: '**── 📊 Données ──**', inline: false });
    const db = require('../../database');
    const absences = db.getActiveAbsences(guildId);
    const online   = db.getOnlineUsers();
    embed.addFields(
      { name: '🟢 Connectés',    value: `**${online.length}**`,    inline: true },
      { name: '🌙 En absence',   value: `**${absences.length}**`,  inline: true },
      { name: '\u200B',          value: '\u200B',                   inline: true },
    );

    return message.reply({ embeds: [embed] });
  }
};
