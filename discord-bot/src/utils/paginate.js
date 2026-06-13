const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

/**
 * Envoie un embed paginé avec boutons ◀ / N/Total / ▶.
 * Chaque page est un EmbedBuilder déjà construit.
 * @param {import('discord.js').Message} message
 * @param {import('discord.js').EmbedBuilder[]} pages
 * @param {number} [timeout=10 * 60 * 1000]
 */
async function paginate(message, pages, timeout = 10 * 60 * 1000) {
  if (!pages.length) return;
  if (pages.length === 1) return message.reply({ embeds: [pages[0]] });

  const uid = message.id;
  let page  = 0;

  function row(p) {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pag_prev_${uid}`)
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p === 0),
      new ButtonBuilder()
        .setCustomId(`pag_page_${uid}`)
        .setLabel(`${p + 1} / ${pages.length}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`pag_next_${uid}`)
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p >= pages.length - 1),
    );
  }

  const reply = await message.reply({ embeds: [pages[0]], components: [row(0)] });

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeout,
    filter: (btn) =>
      btn.user.id === message.author.id &&
      (btn.customId === `pag_prev_${uid}` || btn.customId === `pag_next_${uid}`),
  });

  collector.on('collect', async (btn) => {
    if (btn.customId === `pag_prev_${uid}` && page > 0) page--;
    else if (btn.customId === `pag_next_${uid}` && page < pages.length - 1) page++;
    await btn.update({ embeds: [pages[page]], components: [row(page)] });
  });

  collector.on('end', async () => {
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pag_prev_${uid}`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`pag_page_${uid}`).setLabel(`${page + 1} / ${pages.length}`).setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId(`pag_next_${uid}`).setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(true),
      );
      await reply.edit({ components: [disabledRow] });
    } catch {}
  });
}

module.exports = { paginate };
