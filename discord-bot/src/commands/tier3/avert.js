const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { success, error, formatRelative, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');
const { paginate } = require('../../utils/paginate');

module.exports = {
  name: 'avert',
  tier: 3,
  description: 'Donner un avertissement à un membre pour oubli de déconnexion',
  usage: '!avert @user [raison] | !avert @user list',
  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Gérant'}**.`)] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', '`!avert @user [raison]` — Avertir un membre\n`!avert @user list` — Voir ses avertissements')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });

    const { id, username } = member.user;
    const subArgs = args.slice(1);

    if (subArgs[0] === 'list') {
      const warns = db.getWarnings(id, message.guild.id);
      if (warns.length === 0) {
        return message.reply({ embeds: [
          new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('✅ Aucun avertissement')
            .setDescription(`<@${id}> n'a aucun avertissement.`)
            .setTimestamp()
        ]});
      }

      const PER_PAGE  = 8;
      const BOT       = process.env.BOT_NAME || 'CONNEXION BOT';
      const totalPages = Math.ceil(warns.length / PER_PAGE);

      const pages = Array.from({ length: totalPages }, (_, pageIdx) => {
        const slice = warns.slice(pageIdx * PER_PAGE, (pageIdx + 1) * PER_PAGE);
        const lines = slice.map((w, i) => {
          const rank = pageIdx * PER_PAGE + i;
          return `**${rank + 1}.** ${formatRelative(w.created_at)} — par <@${w.issued_by}>\n> ${w.reason || '*Aucune raison*'}`;
        }).join('\n');

        return new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle(`⚠️ Avertissements de ${username} (${warns.length})`)
          .setDescription(lines)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setFooter({ text: `${BOT} • Avertissements • Page ${pageIdx + 1}/${totalPages}` });
      });

      return paginate(message, pages);
    }

    const reason = subArgs.join(' ') || 'Oubli de déconnexion';
    db.addWarning(id, username, message.guild.id, message.author.id, reason);
    const allWarns = db.getWarnings(id, message.guild.id);

    const dmEmbed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle(`⚠️ | Avertissement — ${message.guild.name}`)
      .setDescription(`Tu as reçu un **avertissement** sur le serveur **${message.guild.name}**.`)
      .addFields(
        { name: '📋 Raison', value: reason, inline: false },
        { name: '⚠️ Total avertissements', value: `**${allWarns.length}**`, inline: true },
        { name: '👮 Émis par', value: `<@${message.author.id}>`, inline: true },
      )
      .setTimestamp()
      .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Avertissement` });

    try { await member.user.send({ embeds: [dmEmbed] }); } catch {}

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle('⚠️ Avertissement envoyé')
        .addFields(
          { name: '👤 Membre', value: `<@${id}>`, inline: true },
          { name: '📋 Raison', value: reason, inline: true },
          { name: '⚠️ Total', value: `**${allWarns.length}** avertissement${allWarns.length > 1 ? 's' : ''}`, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `${process.env.BOT_NAME || 'CONNEXION BOT'} • Avertissements` })
    ]});
  }
};
