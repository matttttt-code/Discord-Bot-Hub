const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { error, COLORS } = require('../../utils/embeds');
const { hasTier3, resolveUser } = require('../../utils/helpers');
const logger = require('../../utils/logger');

const BOT      = () => process.env.BOT_NAME || 'CONNEXION BOT';
const TIMEOUT  = 30 * 60 * 1000; // 30 minutes pour répondre aux boutons

// ── Parseur de date JJ/MM/AAAA HH:MM ────────────────────────────
function parseDate(dateStr, timeStr) {
  const d = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const t = timeStr.trim().match(/^(\d{2}):(\d{2})$/);
  if (!d || !t) return null;
  const [, dd, mm, yyyy] = d;
  const [, hh, mi] = t;
  const ts = new Date(+yyyy, +mm - 1, +dd, +hh, +mi, 0);
  if (isNaN(ts.getTime())) return null;
  return Math.floor(ts.getTime() / 1000);
}

function fmtDate(ts) {
  const d = new Date(ts * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} à ${p(d.getHours())}h${p(d.getMinutes())}`;
}

module.exports = {
  name: 'convoc',
  tier: 3,
  description: 'Convoquer un membre du staff (salon + DM + suivi)',
  usage: '!convoc @user [raison]',

  async execute(message, args) {
    if (!hasTier3(message.member)) {
      return message.reply({ embeds: [error('Permission refusée', `Cette commande nécessite le rôle **${process.env.TIER3_ROLE_NAME || 'Manager'}**.`)] });
    }

    if (!args.length) {
      return message.reply({ embeds: [error('Usage', '`!convoc @user [raison]`\nEx : `!convoc @Matt Bilan mensuel à effectuer`')] });
    }

    const member = await resolveUser(message.guild, args[0]);
    if (!member) {
      return message.reply({ embeds: [error('Membre introuvable', 'Impossible de trouver ce membre.')] });
    }

    if (member.id === message.author.id) {
      return message.reply({ embeds: [error('Action impossible', 'Tu ne peux pas te convoquer toi-même.')] });
    }

    const raison   = args.slice(1).join(' ').trim() || 'Aucune raison précisée';
    const now      = Math.floor(Date.now() / 1000);
    const guildId  = message.guild.id;

    // ════════════════════════════════════════════════════════
    //  1. EMBED DANS LE SALON (avec ping)
    // ════════════════════════════════════════════════════════
    const salonEmbed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('📋 | Convocation')
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(`<@${member.id}> est convoqué(e) par <@${message.author.id}>`)
      .addFields(
        { name: '📋 Motif',         value: raison,                       inline: false },
        { name: '👮 Convoqué par',  value: `<@${message.author.id}>`,    inline: true  },
        { name: '📅 Date',          value: `<t:${now}:F>`,               inline: true  },
        { name: '⏳ Statut',        value: '🟡 En attente de réponse',   inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Convocation` });

    const salonMsg = await message.channel.send({
      content: `<@${member.id}>`,
      embeds:  [salonEmbed],
      allowedMentions: { users: [member.id] },
    });

    // ════════════════════════════════════════════════════════
    //  2. DM AU MEMBRE CONVOQUÉ
    // ════════════════════════════════════════════════════════
    const dmConvoqueEmbed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setTitle(`📋 | Vous avez été convoqué(e) — ${message.guild.name}`)
      .setDescription(
        `Vous avez été **convoqué(e)** par un membre de l'équipe de management de **${message.guild.name}**.\n\n` +
        `Merci de vous présenter ou de prendre contact dès que possible.`
      )
      .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
      .addFields(
        { name: '📋 Motif',          value: raison,                      inline: false },
        { name: '👮 Convoqué(e) par', value: message.author.username,    inline: true  },
        { name: '📅 Date',            value: `<t:${now}:F>`,             inline: true  },
        { name: '🏠 Serveur',         value: message.guild.name,         inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Convocation` });

    let dmConvoqueSent = false;
    try {
      await member.user.send({ embeds: [dmConvoqueEmbed] });
      dmConvoqueSent = true;
    } catch {}

    // ════════════════════════════════════════════════════════
    //  3. DM À L'AUTEUR AVEC BOUTONS DE SUIVI
    // ════════════════════════════════════════════════════════
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('convoc_done')
        .setLabel('Convocation effectuée')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('convoc_plan')
        .setLabel('Planifier la convocation')
        .setEmoji('📅')
        .setStyle(ButtonStyle.Primary),
    );

    const authorDmEmbed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle('📋 | Suivi de convocation')
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setDescription(`Convocation envoyée pour **${member.user.username}** sur **${message.guild.name}**.\n\nChoisis une action ci-dessous :`)
      .addFields(
        { name: '👤 Membre convoqué', value: `${member.user.username}`,  inline: true  },
        { name: '📋 Motif',           value: raison,                     inline: false },
        { name: '📨 DM envoyé',       value: dmConvoqueSent ? '✅ Reçu' : '❌ MP fermés', inline: true },
        { name: '📅 Convoqué le',     value: `<t:${now}:F>`,             inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: `${BOT()} • Ce message expire dans 30 minutes` });

    let authorDm;
    try {
      authorDm = await message.author.send({ embeds: [authorDmEmbed], components: [row] });
    } catch {
      await message.reply({ embeds: [error('DM impossible', 'Impossible de t\'envoyer un DM. Vérifie tes paramètres de confidentialité.')] });
      return;
    }

    await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setDescription(`✅ Convocation envoyée à <@${member.id}>. Suis les instructions dans ton **DM** pour le suivi.`)
    ]});

    // Log
    await logger.log(guildId, 'admin', `📋 Convocation — ${member.user.username}`, [
      { name: '👤 Convoqué(e)', value: `${member.user.username} (${member.id})`, inline: true },
      { name: '👮 Par',         value: `${message.author.username}`,             inline: true },
      { name: '📋 Motif',       value: raison,                                   inline: false },
      { name: '📨 DM',          value: dmConvoqueSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
    ]);

    // ════════════════════════════════════════════════════════
    //  4. COLLECTOR SUR LE DM DE L'AUTEUR
    // ════════════════════════════════════════════════════════
    const collector = authorDm.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time:   TIMEOUT,
      max:    1,
    });

    collector.on('collect', async (interaction) => {
      try {
        // ── ✅ CONVOCATION EFFECTUÉE ──────────────────────────
        if (interaction.customId === 'convoc_done') {
          const doneTs = Math.floor(Date.now() / 1000);

          // Mettre à jour le salon
          const salonDoneEmbed = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('✅ | Convocation effectuée')
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setDescription(`La convocation de <@${member.id}> a été **effectuée**.`)
            .addFields(
              { name: '👤 Membre',       value: `<@${member.id}>`,           inline: true },
              { name: '👮 Convoqué par', value: `<@${message.author.id}>`,   inline: true },
              { name: '📋 Motif',        value: raison,                      inline: false },
              { name: '📅 Effectuée le', value: `<t:${doneTs}:F>`,           inline: true },
            )
            .setTimestamp()
            .setFooter({ text: `${BOT()} • Convocation clôturée` });

          await message.channel.send({ embeds: [salonDoneEmbed] }).catch(() => {});

          // Mettre à jour le DM de l'auteur
          const dmDoneEmbed = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('✅ | Convocation marquée comme effectuée')
            .setDescription(`La convocation de **${member.user.username}** a été clôturée avec succès.`)
            .addFields(
              { name: '📅 Clôturée le', value: `<t:${doneTs}:F>`, inline: true },
            )
            .setTimestamp()
            .setFooter({ text: BOT() });

          await interaction.update({ embeds: [dmDoneEmbed], components: [] });

          // Log
          await logger.log(guildId, 'admin', `✅ Convocation effectuée — ${member.user.username}`, [
            { name: '👤 Membre',   value: member.user.username,       inline: true },
            { name: '👮 Par',      value: message.author.username,    inline: true },
            { name: '📅 Date',     value: `<t:${doneTs}:F>`,          inline: true },
          ]);
        }

        // ── 📅 PLANIFIER LA CONVOCATION ──────────────────────
        if (interaction.customId === 'convoc_plan') {
          const modal = new ModalBuilder()
            .setCustomId(`convoc_modal_${message.author.id}`)
            .setTitle('📅 Planifier la convocation');

          const dateInput = new TextInputBuilder()
            .setCustomId('convoc_date')
            .setLabel('Date (JJ/MM/AAAA)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('ex: 20/06/2026')
            .setRequired(true)
            .setMaxLength(10);

          const timeInput = new TextInputBuilder()
            .setCustomId('convoc_time')
            .setLabel('Heure (HH:MM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('ex: 19:30')
            .setRequired(true)
            .setMaxLength(5);

          const msgInput = new TextInputBuilder()
            .setCustomId('convoc_message')
            .setLabel('Message (optionnel)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('ex: Rendez-vous sur le serveur vocal principal')
            .setRequired(false)
            .setMaxLength(300);

          modal.addComponents(
            new ActionRowBuilder().addComponents(dateInput),
            new ActionRowBuilder().addComponents(timeInput),
            new ActionRowBuilder().addComponents(msgInput),
          );

          await interaction.showModal(modal);

          // Attendre la soumission du formulaire (10 minutes)
          let modalSubmit;
          try {
            modalSubmit = await interaction.awaitModalSubmit({
              filter: i => i.customId === `convoc_modal_${message.author.id}` && i.user.id === message.author.id,
              time: 10 * 60 * 1000,
            });
          } catch {
            // Timeout modal
            return;
          }

          const dateStr = modalSubmit.fields.getTextInputValue('convoc_date').trim();
          const timeStr = modalSubmit.fields.getTextInputValue('convoc_time').trim();
          const extraMsg = modalSubmit.fields.getTextInputValue('convoc_message').trim();

          const planTs = parseDate(dateStr, timeStr);
          if (!planTs) {
            return modalSubmit.reply({
              content: '❌ Format de date/heure invalide. Utilisez **JJ/MM/AAAA** et **HH:MM**.',
              ephemeral: true,
            });
          }

          if (planTs < Math.floor(Date.now() / 1000)) {
            return modalSubmit.reply({
              content: '❌ La date planifiée est dans le passé. Choisissez une date future.',
              ephemeral: true,
            });
          }

          const dateFormatted = fmtDate(planTs);

          // DM au membre convoqué
          const dmPlanEmbed = new EmbedBuilder()
            .setColor(COLORS.info)
            .setTitle(`📅 | Convocation planifiée — ${message.guild.name}`)
            .setDescription(
              `Votre convocation sur **${message.guild.name}** a été **planifiée**.\n\n` +
              `Merci d'être disponible à la date indiquée.`
            )
            .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
            .addFields(
              { name: '📅 Date & heure',   value: `**${dateFormatted}**\n<t:${planTs}:R>`, inline: false },
              { name: '📋 Motif',          value: raison,                                   inline: false },
              { name: '👮 Convoqué(e) par', value: message.author.username,                 inline: true  },
              ...(extraMsg ? [{ name: '💬 Message', value: extraMsg, inline: false }] : []),
            )
            .setTimestamp()
            .setFooter({ text: `${BOT()} • Convocation planifiée` });

          let planDmSent = false;
          try {
            await member.user.send({ embeds: [dmPlanEmbed] });
            planDmSent = true;
          } catch {}

          // Mettre à jour le DM de l'auteur
          const dmAuthorPlanEmbed = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('📅 | Convocation planifiée')
            .setDescription(`La convocation de **${member.user.username}** a été planifiée.`)
            .addFields(
              { name: '📅 Date & heure',    value: `**${dateFormatted}**\n<t:${planTs}:R>`, inline: false },
              { name: '📨 DM envoyé',       value: planDmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true },
              ...(extraMsg ? [{ name: '💬 Message joint', value: extraMsg, inline: false }] : []),
            )
            .setTimestamp()
            .setFooter({ text: BOT() });

          await modalSubmit.reply({ embeds: [dmAuthorPlanEmbed], ephemeral: true });

          // Mettre à jour le message DM principal (désactiver les boutons)
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('convoc_done_disabled')
              .setLabel('Convocation effectuée')
              .setEmoji('✅')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('convoc_plan_disabled')
              .setLabel(`Planifiée le ${dateFormatted}`)
              .setEmoji('📅')
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true),
          );

          const updatedDmEmbed = new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle('📋 | Suivi de convocation — Planifiée')
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setDescription(`Convocation de **${member.user.username}** planifiée pour le **${dateFormatted}**.`)
            .addFields(
              { name: '📅 Date & heure',  value: `<t:${planTs}:F>`,                      inline: false },
              { name: '📋 Motif',         value: raison,                                   inline: false },
              { name: '📨 DM convoqué',   value: planDmSent ? '✅ Envoyé' : '❌ MP fermés', inline: true  },
            )
            .setTimestamp()
            .setFooter({ text: BOT() });

          await authorDm.edit({ embeds: [updatedDmEmbed], components: [disabledRow] }).catch(() => {});

          // Log
          await logger.log(guildId, 'admin', `📅 Convocation planifiée — ${member.user.username}`, [
            { name: '👤 Membre',    value: member.user.username,    inline: true },
            { name: '👮 Par',       value: message.author.username, inline: true },
            { name: '📅 Planifiée', value: dateFormatted,           inline: true },
            { name: '📋 Motif',     value: raison,                  inline: false },
          ]);
        }
      } catch (e) {
        console.error('[Convoc] Erreur collecteur :', e.message);
      }
    });

    // Expiration des boutons après 30 minutes
    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        try {
          const expiredRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('convoc_done_exp')
              .setLabel('Convocation effectuée')
              .setEmoji('✅')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('convoc_plan_exp')
              .setLabel('Planifier la convocation')
              .setEmoji('📅')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          );
          const expiredEmbed = new EmbedBuilder()
            .setColor(0x7F7F7F)
            .setTitle('📋 | Suivi de convocation — Expiré')
            .setDescription(`Ce suivi a expiré (30 minutes). Refais \`!convoc\` si nécessaire.`)
            .setTimestamp()
            .setFooter({ text: BOT() });
          await authorDm.edit({ embeds: [expiredEmbed], components: [expiredRow] }).catch(() => {});
        } catch {}
      }
    });
  },
};
