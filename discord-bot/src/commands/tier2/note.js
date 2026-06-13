const db = require('../../database');
const { EmbedBuilder } = require('discord.js');
const { success, error, COLORS } = require('../../utils/embeds');
const { hasTier2, resolveUser } = require('../../utils/helpers');
const { paginate } = require('../../utils/paginate');

const PER_PAGE = 8;
const BOT = () => process.env.BOT_NAME || 'CONNEXION BOT';

module.exports = {
  name: 'note',
  tier: 2,
  description: 'Ajouter / consulter / supprimer des notes internes sur un membre',
  usage: '!note @user [texte] | !note @user list | !note @user clear',

  async execute(message, args) {
    if (!hasTier2(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', 'Cette commande nécessite le rôle **Administration** ou supérieur.')] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', [
        '`!note @user [texte]` — Ajouter une note',
        '`!note @user list` — Voir toutes les notes',
        '`!note @user clear` — Supprimer toutes les notes',
      ].join('\n'))] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    const { id, username } = member.user;
    db.createUser(id, username);

    const subArgs = args.slice(1);
    const sub = subArgs[0]?.toLowerCase();

    if (sub === 'list') {
      const notes = db.getNotes(id, message.guild.id);

      if (!notes.length) {
        return message.reply({ embeds: [
          new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle('📝 | Aucune note')
            .setDescription(`Aucune note interne pour <@${id}>.`)
            .setTimestamp()
            .setFooter({ text: BOT() })
        ]});
      }

      const totalPages = Math.ceil(notes.length / PER_PAGE);

      await paginate(message, totalPages, (page) => {
        const slice = notes.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
        const lines = slice.map((n, i) => {
          const dt = new Date(n.created_at * 1000);
          const dateStr = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
          return `\`${page * PER_PAGE + i + 1}.\` [${dateStr}] **${n.author}** : ${n.content}`;
        });

        return new EmbedBuilder()
          .setColor(COLORS.primary)
          .setTitle(`📝 | Notes internes — ${member.user.username}`)
          .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
          .setDescription(lines.join('\n'))
          .setFooter({ text: `${BOT()} • ${notes.length} note(s) • Page ${page + 1}/${totalPages}` })
          .setTimestamp();
      });

      return;
    }

    if (sub === 'clear') {
      const count = db.clearNotes(id, message.guild.id);
      return message.reply({ embeds: [
        success('Notes supprimées', `Toutes les notes de <@${id}> ont été supprimées (**${count}** au total).`)
          .addFields(
            { name: '👤 Membre', value: `<@${id}>`, inline: true },
            { name: '🗑️ Supprimées', value: `**${count}**`, inline: true },
            { name: '👮 Par', value: `<@${message.author.id}>`, inline: true },
          )
      ]});
    }

    const content = subArgs.join(' ').trim();
    if (!content) {
      return message.reply({ embeds: [error('Contenu manquant', 'Écris une note après la mention du membre.\nEx : `!note @user Il a été prévenu pour ses absences répétées.`')] });
    }
    if (content.length < 5) {
      return message.reply({ embeds: [error('Note trop courte', 'La note doit contenir au moins 5 caractères.')] });
    }
    if (content.length > 500) {
      return message.reply({ embeds: [error('Note trop longue', 'La note ne peut pas dépasser 500 caractères.')] });
    }

    db.addNote(id, message.guild.id, content, message.author.username);
    const total = db.getNotes(id, message.guild.id).length;

    return message.reply({ embeds: [
      success('Note ajoutée', `Note interne enregistrée pour <@${id}>.`)
        .addFields(
          { name: '👤 Membre', value: `<@${id}>`, inline: true },
          { name: '👮 Auteur', value: `<@${message.author.id}>`, inline: true },
          { name: '📋 Total notes', value: `**${total}**`, inline: true },
          { name: '📝 Contenu', value: content, inline: false },
        )
    ]});
  }
};
