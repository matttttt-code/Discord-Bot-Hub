const cfg = require('../../utils/config');
const { success, error, COLORS } = require('../../utils/embeds');
const { hasTier3 } = require('../../utils/helpers');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'sanction-auto',
  tier: 3,
  description: 'Configurer la sanction automatique des membres inactifs',
  usage: '!sanction-auto <jours> <#salon> <@role> | !sanction-auto off | !sanction-auto status',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }

    const guildId = message.guild.id;

    if (!args[0]) {
      return message.reply({ embeds: [error('Usage',
        '`!sanction-auto <jours> <#salon> <@role>` — Activer\n' +
        '`!sanction-auto off` — Désactiver\n' +
        '`!sanction-auto status` — Voir la config'
      )] });
    }

    // ── off ───────────────────────────────────────────────────
    if (args[0] === 'off') {
      await cfg.set('sanction_auto_enabled', '0', guildId);
      return message.reply({ embeds: [success('Sanction auto désactivée', 'Les notifications automatiques d\'inactivité sont désactivées.')] });
    }

    // ── status ────────────────────────────────────────────────
    if (args[0] === 'status') {
      const enabled   = cfg.get('sanction_auto_enabled', guildId) === '1';
      const jours     = cfg.get('sanction_auto_jours', guildId);
      const channelId = cfg.get('sanction_auto_channel_id', guildId);
      const roleId    = cfg.get('sanction_auto_role_id', guildId);

      const embed = new EmbedBuilder()
        .setColor(enabled ? COLORS.success : COLORS.error)
        .setTitle('⚙️ Sanction auto — Configuration')
        .addFields(
          { name: '📡 Statut',     value: enabled ? '🟢 **Activée**' : '🔴 **Désactivée**',              inline: true },
          { name: '📅 Seuil',      value: jours ? `**${jours} jours** sans connexion` : '*Non défini*',   inline: true },
          { name: '📢 Salon',      value: channelId ? `<#${channelId}>` : '*Non défini*',                 inline: true },
          { name: '🎭 Rôle pingé', value: roleId ? `<@&${roleId}>` : '*Non défini*',                     inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Sanction Auto` });

      return message.reply({ embeds: [embed] });
    }

    // ── activation : !sanction-auto <jours> <#salon> <@role> ──
    const jours = parseInt(args[0]);
    if (isNaN(jours) || jours < 1) {
      return message.reply({ embeds: [error('Nombre invalide', 'Le nombre de jours doit être un entier positif.')] });
    }

    const channelMatch = args[1]?.match(/^<#(\d+)>$/);
    if (!channelMatch) {
      return message.reply({ embeds: [error('Salon invalide', 'Mentionne un salon avec `#salon`.')] });
    }
    const channelId = channelMatch[1];

    const roleMatch = args[2]?.match(/^<@&(\d+)>$/);
    if (!roleMatch) {
      return message.reply({ embeds: [error('Rôle invalide', 'Mentionne un rôle avec `@role`.')] });
    }
    const roleId = roleMatch[1];

    await cfg.set('sanction_auto_enabled',   '1',           guildId);
    await cfg.set('sanction_auto_jours',      String(jours), guildId);
    await cfg.set('sanction_auto_channel_id', channelId,    guildId);
    await cfg.set('sanction_auto_role_id',    roleId,        guildId);

    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle('✅ Sanction auto configurée')
      .setDescription(`Les membres sans connexion depuis **${jours} jour${jours > 1 ? 's' : ''}** recevront une alerte automatique.`)
      .addFields(
        { name: '📅 Seuil',      value: `**${jours} jour${jours > 1 ? 's' : ''}** sans connexion`, inline: true },
        { name: '📢 Salon',      value: `<#${channelId}>`,                                          inline: true },
        { name: '🎭 Rôle pingé', value: `<@&${roleId}>`,                                            inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Sanction Auto` });

    return message.reply({ embeds: [embed] });
  }
};
