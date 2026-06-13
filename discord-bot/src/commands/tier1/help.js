const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('../../utils/embeds');
const { hasTier2, hasTier3 } = require('../../utils/helpers');
const cfg = require('../../utils/config');

module.exports = {
  name: 'help',
  tier: 1,
  description: 'Voir la liste des commandes',
  async execute(message) {
    const prefix  = process.env.PREFIX || '!';
    const guildId = message.guild.id;
    const t2      = hasTier2(message.member);
    const t3      = hasTier3(message.member);

    function roleName(roleId, fallback) {
      if (!roleId) return fallback;
      const role = message.guild.roles.cache.get(roleId);
      return role ? role.name : fallback;
    }

    const t2Name = roleName(cfg.getTier2RoleId(guildId), process.env.TIER2_ROLE_NAME || "EQUIPE D'ADMINISTRATION");
    const t3Name = roleName(cfg.getTier3RoleId(guildId), process.env.TIER3_ROLE_NAME || '🏆•Gérant');

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📖 | Commandes — ${process.env.BOT_NAME || 'CONNEXION BOT'}`)
      .setDescription('Utilise les commandes ci-dessous selon ton rôle. Les commandes avec `[options]` sont facultatives.')
      .setThumbnail(message.client.user.displayAvatarURL({ dynamic: true }))
      .setTimestamp()
      .setFooter({ text: `Demandé par ${message.author.username} • ${process.env.BOT_NAME || 'CONNEXION BOT'}` });

    // ── Tier 1 ──────────────────────────────────────────────────
    embed.addFields({
      name: '👥 Tier 1 — Membres',
      value: [
        `\`${prefix}c\` — Démarrer une connexion`,
        `\`${prefix}d\` — Terminer une connexion`,
        `\`${prefix}me\` — Profil complet + historique en MP (paginé)`,
        `\`${prefix}recap [7j/30j/Xh]\` — Bilan d'activité personnel sur une période`,
        `\`${prefix}absence [durée] [motif]\` — Se déclarer absent (ex: \`!absence 3j Vacances\`)`,
        `\`${prefix}delabsence [@membre]\` — Supprimer une absence (la sienne ou celle d'un membre)`,
        `\`${prefix}absences\` — Voir toutes les absences actives du serveur`,
        `\`${prefix}online\` — Liste des membres connectés en ce moment`,
        `\`${prefix}msgtop [#salon]\` — Classement messages du serveur`,
        `\`${prefix}vocaltop [#salon]\` — Classement temps vocal`,
        `\`${prefix}ping\` — Latence du bot`,
        `\`${prefix}info\` — Informations sur le bot`,
        `\`${prefix}update\` — Notes de la dernière mise à jour`,
        `\`${prefix}suggestion [texte]\` — Envoyer une suggestion`,
      ].join('\n'),
      inline: false
    });

    // ── Tier 2 ──────────────────────────────────────────────────
    if (t2 || t3) {
      embed.addFields({
        name: `🛡️ Tier 2 — @${t2Name}`,
        value: [
          `\`${prefix}check [@user]\` — Profil complet d'un membre`,
          `\`${prefix}view\` — Classement des connexions`,
          `\`${prefix}activite [@user] [7j/30j/JJ/MM]\` — Activité complète d'un membre (co + msgs + vocal)`,
          `\`${prefix}msgs [@user] [7j/30j/JJ/MM] [#salon]\` — Messages d'un membre sur une période`,
          `\`${prefix}rapport [#salon | ID_serveur] [7j/30j/Xh]\` — Classement complet (co + messages + vocal)`,
          `\`${prefix}stats\` — Statistiques globales du serveur`,
          `\`${prefix}config\` — Voir la configuration complète du bot`,
        ].join('\n'),
        inline: false
      });
    }

    // ── Tier 3 ──────────────────────────────────────────────────
    if (t3) {
      embed.addFields({
        name: `👑 Tier 3 — @${t3Name}`,
        value: [
          `\`${prefix}co [@user]\` — Connecter manuellement un membre`,
          `\`${prefix}deco [@user]\` — Déconnecter manuellement un membre`,
          `\`${prefix}add [N] [@user]\` — Ajouter N connexions`,
          `\`${prefix}remove [N] [@user]\` — Retirer N connexions`,
          `\`${prefix}rewind [JJ/MM-HH:MM] [JJ/MM-HH:MM] [@user]\` — Recalculer une période`,
          `\`${prefix}cancelrewind [id]\` — Annuler un rewind (retire les co ajoutées)`,
          `\`${prefix}cancelrewind list\` — Voir les rewinds récents et leurs IDs`,
          `\`${prefix}delete [@user]\` — Supprimer un membre de la base`,
          `\`${prefix}reset\` — Réinitialiser toutes les données`,
          `\`${prefix}announce [message]\` — Annonce dans le salon connexion`,
          `\`${prefix}activeco\` — Activer / désactiver les commandes \`!c\` et \`!d\``,
          `\`${prefix}inactifs [7j/30j]\` — Liste des membres sans activité sur la période`,
          `\`${prefix}logsco @membre\` — Historique détaillé des connexions d'un membre`,
          `\`${prefix}avert @user [raison]\` — Avertir un membre (MP automatique)`,
          `\`${prefix}avert @user list\` — Voir les avertissements d'un membre`,
          `\`${prefix}revive @user [message]\` — Envoyer un MP de relance à un membre`,
          `\`${prefix}support [texte]\` — Signalement à l'équipe dev`,
          `\`${prefix}setup [param] [valeur]\` — Configurer le bot`,
        ].join('\n'),
        inline: false
      });
    }

    return message.reply({ embeds: [embed] });
  }
};
