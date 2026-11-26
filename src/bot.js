require('dotenv').config();

const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const { DISCORD_TOKEN, REPORT_CHANNEL_ID } = process.env;

if (!DISCORD_TOKEN || DISCORD_TOKEN.includes('COLE_AQUI')) {
  throw new Error('Configure DISCORD_TOKEN no .env com o token do bot (Discord Developer Portal > Bot).');
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const recordsPath = path.join(__dirname, '..', 'data', 'correcoes.json');
let saveQueue = Promise.resolve();
const statusLabels = {
  pendente: 'Pendente',
  concluida: 'Concluída',
  negada: 'Negada',
  cancelada: 'Cancelada',
};

function getProtocol(record) {
  return record.id.replaceAll('-', '').slice(0, 10).toUpperCase();
}

function findByProtocol(records, protocol) {
  const normalized = protocol.trim().toUpperCase();
  const matches = records.filter((record) => getProtocol(record) === normalized);
  return { record: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}

async function getRecords() {
  try {
    return JSON.parse(await fs.readFile(recordsPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function changeRecords(change) {
  const task = saveQueue.catch(() => {}).then(async () => {
    const records = await getRecords();
    change(records);
    await fs.mkdir(path.dirname(recordsPath), { recursive: true });
    const temporaryPath = `${recordsPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
      await fs.rename(temporaryPath, recordsPath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  });
  saveQueue = task;
  return task;
}

function saveRecord(record) {
  return changeRecords((records) => records.push(record));
}

async function updateRecordStatus(recordId, status, userId, reason) {
  let updatedRecord;
  await changeRecords((records) => {
    updatedRecord = records.find((record) => record.id === recordId);
    if (!updatedRecord) return;
    updatedRecord.status = status;
    updatedRecord.updatedAt = new Date().toISOString();
    updatedRecord.updatedBy = userId;
    if (reason) updatedRecord.statusReason = reason;
  });
  return updatedRecord;
}

async function assignRecord(recordId, userId, assignedBy, force = false) {
  let updatedRecord;
  let alreadyAssigned = false;
  let notPending = false;
  await changeRecords((records) => {
    updatedRecord = records.find((record) => record.id === recordId);
    if (!updatedRecord) return;
    if ((updatedRecord.status || 'pendente') !== 'pendente') {
      notPending = true;
      return;
    }
    if (updatedRecord.assignedTo && !force) {
      alreadyAssigned = true;
      return;
    }
    updatedRecord.assignedTo = userId;
    updatedRecord.assignedAt = new Date().toISOString();
    updatedRecord.assignedBy = assignedBy;
  });
  return { record: updatedRecord, alreadyAssigned, notPending };
}

async function linkReportMessage(recordId, channelId, messageId) {
  let updatedRecord;
  await changeRecords((records) => {
    updatedRecord = records.find((record) => record.id === recordId);
    if (!updatedRecord) return;
    updatedRecord.reportChannelId = channelId;
    updatedRecord.reportMessageId = messageId;
  });
  return updatedRecord;
}

async function cancelRecord(recordId, requesterId, reason) {
  let outcome = 'missing';
  let updatedRecord;
  await changeRecords((records) => {
    const record = records.find((entry) => entry.id === recordId);
    if (!record) return;
    if (record.userId !== requesterId) {
      outcome = 'not_owner';
      return;
    }
    if ((record.status || 'pendente') !== 'pendente') {
      outcome = 'not_pending';
      return;
    }
    record.status = 'cancelada';
    record.updatedAt = new Date().toISOString();
    record.updatedBy = requesterId;
    if (reason) record.statusReason = reason;
    updatedRecord = record;
    outcome = 'cancelled';
  });
  return { outcome, record: updatedRecord };
}

async function syncRecordCard(record) {
  if (!record.reportChannelId || !record.reportMessageId) return REPORT_CHANNEL_ID ? false : null;
  try {
    const channel = await client.channels.fetch(record.reportChannelId);
    const message = await channel?.messages?.fetch(record.reportMessageId);
    if (!message) return false;
    await message.edit({
      embeds: [createCorrectionEmbed(record)],
      components: record.status === 'cancelada' ? [] : createStatusButtons(record.id),
    });
    return true;
  } catch (error) {
    console.error('Não consegui atualizar o card da solicitação:', error);
    return false;
  }
}

async function deleteRecord(recordId) {
  let deleted = false;
  await changeRecords((records) => {
    const index = records.findIndex((record) => record.id === recordId);
    if (index !== -1) {
      records.splice(index, 1);
      deleted = true;
    }
  });
  return deleted;
}

function createStatusButtons(recordId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`correcao:status:${recordId}:pendente`)
      .setLabel('Pendente')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`correcao:status:${recordId}:concluida`)
      .setLabel('Concluída')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`correcao:status:${recordId}:negada`)
      .setLabel('Negada')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`correcao:delete:${recordId}`)
      .setLabel('Excluir')
      .setStyle(ButtonStyle.Secondary),
  )];
}

function createCorrectionEmbed(record) {
  const embed = new EmbedBuilder()
    .setColor(record.status === 'concluida' ? 0x57f287 : record.status === 'negada' ? 0xed4245 : record.status === 'cancelada' ? 0x747f8d : 0xfee75c)
    .setTitle('Solicitação de correção')
    .addFields(
      { name: 'Protocolo', value: getProtocol(record), inline: true },
      { name: 'Cliente', value: record.cliente },
      { name: 'Número da atividade', value: record.atividade },
      { name: 'Resumo do problema', value: record.resumo },
      { name: 'Status', value: statusLabels[record.status] || statusLabels.pendente, inline: true },
      { name: 'Solicitado por', value: `<@${record.userId}>`, inline: true },
    );
  if (record.assignedTo) {
    embed.addFields({ name: 'Responsável', value: `<@${record.assignedTo}>`, inline: true });
  }
  if (record.statusReason) {
    embed.addFields({ name: 'Motivo da última alteração', value: trimField(record.statusReason, 900) });
  }
  if (record.updatedAt) {
    embed.addFields({ name: 'Status atualizado por', value: `<@${record.updatedBy}>`, inline: true });
  }
  embed.setTimestamp(new Date(record.createdAt));
  return embed;
}

function trimField(value, maxLength = 900) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function createRecordsListEmbed(title, records, total, includeRequester = false) {
  const shown = records.slice(0, 10);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(`Exibindo ${shown.length} de ${total} solicitação(ões).`)
    .addFields(shown.map((record) => ({
      name: `${getProtocol(record)} • Atividade ${trimField(record.atividade, 70)}`,
      value: [
        `**Cliente:** ${trimField(record.cliente, 100)}`,
        `**Status:** ${statusLabels[record.status] || statusLabels.pendente}`,
        `**Resumo:** ${trimField(record.resumo, 200)}`,
        ...(record.assignedTo ? [`**Responsável:** <@${record.assignedTo}>`] : []),
        ...(includeRequester ? [`**Solicitado por:** <@${record.userId}>`] : []),
        `**Enviada:** <t:${Math.floor(new Date(record.createdAt).getTime() / 1000)}:f>`,
      ].join('\n'),
    })));
  return embed;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Bot conectado como ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'ajuda') {
    const help = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Ajuda do bot de correções')
      .setDescription('Os comandos marcados com 🔒 exigem a permissão **Gerenciar mensagens**. Use o protocolo de 10 caracteres mostrado nos cards e nas listas.')
      .addFields(
        { name: '/correcao', value: 'Abrir o formulário e registrar uma nova solicitação.' },
        { name: '/minhas-correcoes [status]', value: 'Listar suas solicitações; opcionalmente filtrar por status.' },
        { name: '/cancelar protocolo [motivo]', value: 'Cancelar uma solicitação sua que ainda esteja pendente.' },
        { name: '🔒 /consultar atividade', value: 'Listar solicitações ligadas a um número de atividade.' },
        { name: '🔒 /fila', value: 'Ver solicitações pendentes, começando pelas mais antigas.' },
        { name: '🔒 /estatisticas', value: 'Contar solicitações pendentes, concluídas, negadas e canceladas.' },
        { name: '🔒 /assumir protocolo', value: 'Atribuir uma solicitação pendente a você.' },
        { name: '🔒 /atribuir protocolo responsável', value: 'Atribuir uma solicitação pendente a alguém da equipe.' },
        { name: '🔒 /reabrir protocolo motivo', value: 'Reabrir uma solicitação concluída, negada ou cancelada.' },
        { name: '🔒 /buscar termo [status] [responsável]', value: 'Buscar por protocolo, atividade, cliente ou texto do resumo, com filtros opcionais.' },
        { name: '🔒 /meus-atendimentos [status]', value: 'Listar as solicitações atribuídas a você.' },
        { name: '/ajuda', value: 'Exibir esta lista de comandos.' },
      );
    await interaction.reply({ embeds: [help], ephemeral: true });
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'minhas-correcoes') {
    try {
      const records = await getRecords();
      const requestedStatus = interaction.options.getString('status');
      const mine = records
        .filter((record) => record.userId === interaction.user.id)
        .filter((record) => !requestedStatus || (record.status || 'pendente') === requestedStatus)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (mine.length === 0) {
        await interaction.reply({
          content: requestedStatus
            ? `Você não tem solicitações com status **${statusLabels[requestedStatus]}**.`
            : 'Você ainda não enviou solicitações de correção.',
          ephemeral: true,
        });
        return;
      }

      const title = requestedStatus
        ? `Suas correções: ${statusLabels[requestedStatus]}`
        : 'Suas solicitações de correção';
      await interaction.reply({
        embeds: [createRecordsListEmbed(title, mine, mine.length)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Não foi possível consultar as solicitações:', error);
      await interaction.reply({
        content: 'Não consegui carregar suas solicitações. Tente novamente mais tarde.',
        ephemeral: true,
      });
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'assumir') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({ content: 'Você precisa da permissão **Gerenciar mensagens** para assumir correções.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const protocol = interaction.options.getString('protocolo', true);
      const { record, ambiguous } = findByProtocol(await getRecords(), protocol);
      if (ambiguous) {
        await interaction.editReply('Esse protocolo não é único. Consulte a lista e use o protocolo completo exibido.');
        return;
      }
      if (!record) {
        await interaction.editReply('Não encontrei uma solicitação com esse protocolo.');
        return;
      }
      const result = await assignRecord(record.id, interaction.user.id, interaction.user.id);
      if (result.notPending) {
        await interaction.editReply('Só é possível assumir solicitações pendentes.');
        return;
      }
      if (result.alreadyAssigned) {
        await interaction.editReply(`Essa solicitação já está com <@${result.record.assignedTo}>.`);
        return;
      }
      const cardUpdated = await syncRecordCard(result.record);
      await interaction.editReply(`Você assumiu a correção **${getProtocol(result.record)}**.${cardUpdated === false ? ' O registro foi salvo, mas o card não foi atualizado; confira as permissões do bot.' : ''}`);
    } catch (error) {
      console.error('Não foi possível assumir a correção:', error);
      await interaction.editReply('Não consegui assumir essa correção. Tente novamente.');
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'atribuir') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({ content: 'Você precisa da permissão **Gerenciar mensagens** para atribuir correções.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const protocol = interaction.options.getString('protocolo', true);
      const responsible = interaction.options.getUser('responsavel', true);
      const { record, ambiguous } = findByProtocol(await getRecords(), protocol);
      if (ambiguous) {
        await interaction.editReply('Esse protocolo não é único. Consulte a lista e use o protocolo completo exibido.');
        return;
      }
      if (!record) {
        await interaction.editReply('Não encontrei uma solicitação com esse protocolo.');
        return;
      }
      const result = await assignRecord(record.id, responsible.id, interaction.user.id, true);
      if (result.notPending) {
        await interaction.editReply('Só é possível atribuir solicitações pendentes.');
        return;
      }
      const cardUpdated = await syncRecordCard(result.record);
      await interaction.editReply(`A correção **${getProtocol(result.record)}** foi atribuída a <@${responsible.id}>.${cardUpdated === false ? ' O registro foi salvo, mas o card não foi atualizado; confira as permissões do bot.' : ''}`);
    } catch (error) {
      console.error('Não foi possível atribuir a correção:', error);
      await interaction.editReply('Não consegui atribuir essa correção. Tente novamente.');
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'reabrir') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({ content: 'Você precisa da permissão **Gerenciar mensagens** para reabrir correções.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const protocol = interaction.options.getString('protocolo', true);
      const reason = interaction.options.getString('motivo', true).trim();
      const { record, ambiguous } = findByProtocol(await getRecords(), protocol);
      if (ambiguous) {
        await interaction.editReply('Esse protocolo não é único. Consulte a lista e use o protocolo completo exibido.');
        return;
      }
      if (!record) {
        await interaction.editReply('Não encontrei uma solicitação com esse protocolo.');
        return;
      }
      if ((record.status || 'pendente') === 'pendente') {
        await interaction.editReply('Essa solicitação já está pendente.');
        return;
      }
      const updated = await updateRecordStatus(record.id, 'pendente', interaction.user.id, reason);
      const cardUpdated = await syncRecordCard(updated);
      await interaction.editReply(`A correção **${getProtocol(updated)}** voltou para a fila.${cardUpdated === false ? ' O registro foi salvo, mas o card não foi atualizado; confira as permissões do bot.' : ''}`);
    } catch (error) {
      console.error('Não foi possível reabrir a correção:', error);
      await interaction.editReply('Não consegui reabrir essa correção. Tente novamente.');
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'cancelar') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const protocol = interaction.options.getString('protocolo', true);
      const reason = interaction.options.getString('motivo')?.trim();
      const { record, ambiguous } = findByProtocol(await getRecords(), protocol);
      if (ambiguous) {
        await interaction.editReply('Esse protocolo não é único. Use o protocolo completo exibido no seu histórico.');
        return;
      }
      if (!record) {
        await interaction.editReply('Não encontrei uma solicitação com esse protocolo.');
        return;
      }
      const result = await cancelRecord(record.id, interaction.user.id, reason);
      if (result.outcome === 'not_owner') {
        await interaction.editReply('Você só pode cancelar uma solicitação que enviou.');
        return;
      }
      if (result.outcome === 'not_pending') {
        await interaction.editReply('Só é possível cancelar solicitações pendentes.');
        return;
      }
      if (result.outcome !== 'cancelled') {
        await interaction.editReply('Não encontrei essa solicitação.');
        return;
      }
      await syncRecordCard(result.record);
      await interaction.editReply(`A solicitação **${getProtocol(result.record)}** foi cancelada.`);
    } catch (error) {
      console.error('Não foi possível cancelar a solicitação:', error);
      await interaction.editReply('Não consegui cancelar essa solicitação. Tente novamente.');
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'buscar') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({ content: 'Você precisa da permissão **Gerenciar mensagens** para buscar correções.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const term = interaction.options.getString('termo', true).trim().toLocaleLowerCase('pt-BR');
      const requestedStatus = interaction.options.getString('status');
      const responsible = interaction.options.getUser('responsavel');
      const matches = (await getRecords())
        .filter((record) => !requestedStatus || (record.status || 'pendente') === requestedStatus)
        .filter((record) => !responsible || record.assignedTo === responsible.id)
        .filter((record) => [getProtocol(record), record.cliente, record.atividade, record.resumo, record.userId, record.assignedTo || '']
          .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (matches.length === 0) {
        await interaction.editReply('Não encontrei solicitações com esses filtros.');
        return;
      }
      await interaction.editReply({
        embeds: [createRecordsListEmbed(`Busca: ${trimField(term, 80)}`, matches, matches.length, true)],
      });
    } catch (error) {
      console.error('Não foi possível buscar correções:', error);
      await interaction.editReply('Não consegui fazer essa busca. Tente novamente.');
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'meus-atendimentos') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({ content: 'Você precisa da permissão **Gerenciar mensagens** para consultar seus atendimentos.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const requestedStatus = interaction.options.getString('status');
      const assigned = (await getRecords())
        .filter((record) => record.assignedTo === interaction.user.id)
        .filter((record) => !requestedStatus || (record.status || 'pendente') === requestedStatus)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (assigned.length === 0) {
        await interaction.editReply('Você não tem correções atribuídas com esses filtros.');
        return;
      }
      await interaction.editReply({
        embeds: [createRecordsListEmbed('Seus atendimentos', assigned, assigned.length, true)],
      });
    } catch (error) {
      console.error('Não foi possível consultar seus atendimentos:', error);
      await interaction.editReply('Não consegui carregar seus atendimentos. Tente novamente.');
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'consultar') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({ content: 'Você precisa da permissão **Gerenciar mensagens** para consultar correções.', ephemeral: true });
      return;
    }
    try {
      const activityNumber = interaction.options.getString('atividade', true).trim();
      const matches = (await getRecords())
        .filter((record) => record.atividade === activityNumber)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (matches.length === 0) {
        await interaction.reply({ content: `Não encontrei correções para a atividade **${activityNumber}**.`, ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [createRecordsListEmbed(`Correções da atividade ${activityNumber}`, matches, matches.length, true)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Não foi possível consultar a atividade:', error);
      await interaction.reply({ content: 'Não consegui consultar essa atividade. Tente novamente.', ephemeral: true });
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'fila') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({ content: 'Você precisa da permissão **Gerenciar mensagens** para consultar a fila.', ephemeral: true });
      return;
    }
    try {
      const pending = (await getRecords())
        .filter((record) => (record.status || 'pendente') === 'pendente')
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      if (pending.length === 0) {
        await interaction.reply({ content: 'Não há correções pendentes na fila.', ephemeral: true });
        return;
      }
      await interaction.reply({
        embeds: [createRecordsListEmbed('Fila de correções pendentes', pending, pending.length, true)],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Não foi possível carregar a fila:', error);
      await interaction.reply({ content: 'Não consegui carregar a fila. Tente novamente.', ephemeral: true });
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'estatisticas') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({ content: 'Você precisa da permissão **Gerenciar mensagens** para ver as estatísticas.', ephemeral: true });
      return;
    }
    try {
      const records = await getRecords();
      const counts = { pendente: 0, concluida: 0, negada: 0, cancelada: 0 };
      for (const record of records) {
        const status = record.status || 'pendente';
        if (Object.hasOwn(counts, status)) counts[status] += 1;
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Estatísticas de correções')
        .addFields(
          { name: 'Total', value: String(records.length), inline: true },
          { name: 'Pendentes', value: String(counts.pendente), inline: true },
          { name: 'Concluídas', value: String(counts.concluida), inline: true },
          { name: 'Negadas', value: String(counts.negada), inline: true },
          { name: 'Canceladas', value: String(counts.cancelada), inline: true },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Não foi possível calcular as estatísticas:', error);
      await interaction.reply({ content: 'Não consegui calcular as estatísticas. Tente novamente.', ephemeral: true });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('correcao:status:')) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({
        content: 'Você precisa da permissão **Gerenciar mensagens** para alterar o status.',
        ephemeral: true,
      });
      return;
    }

    const [, , recordId, status] = interaction.customId.split(':');
    if (!Object.hasOwn(statusLabels, status)) {
      await interaction.reply({ content: 'Esse status não é válido.', ephemeral: true });
      return;
    }

    try {
      const current = (await getRecords()).find((record) => record.id === recordId);
      if (current?.status === 'cancelada') {
        await interaction.reply({ content: 'Essa solicitação foi cancelada. A equipe pode reabri-la com `/reabrir`.', ephemeral: true });
        return;
      }
      const record = await updateRecordStatus(recordId, status, interaction.user.id);
      if (!record) {
        await interaction.reply({ content: 'Não encontrei essa solicitação salva.', ephemeral: true });
        return;
      }
      await interaction.update({
        embeds: [createCorrectionEmbed(record)],
        components: createStatusButtons(record.id),
      });
    } catch (error) {
      console.error('Não foi possível atualizar o status:', error);
      await interaction.reply({ content: 'Não consegui atualizar o status. Tente novamente.', ephemeral: true });
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('correcao:delete:')) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.reply({
        content: 'Você precisa da permissão **Gerenciar mensagens** para excluir uma correção.',
        ephemeral: true,
      });
      return;
    }

    const recordId = interaction.customId.split(':')[2];
    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`delok:${recordId}:${interaction.channelId}:${interaction.message.id}:${interaction.message.flags.has(MessageFlags.Ephemeral) ? 'ephemeral' : 'public'}`)
        .setLabel('Sim, excluir')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('delcancel')
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      content: 'Tem certeza que deseja excluir esta correção? Essa ação não pode ser desfeita.',
      components: [confirmRow],
      ephemeral: true,
    });
    return;
  }

  if (interaction.isButton() && interaction.customId === 'delcancel') {
    await interaction.update({ content: 'Exclusão cancelada.', components: [], embeds: [] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('delok:')) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
      await interaction.update({ content: 'Você precisa da permissão **Gerenciar mensagens** para excluir uma correção.', components: [], embeds: [] });
      return;
    }

    const [, recordId, channelId, messageId, visibility] = interaction.customId.split(':');
    await interaction.deferUpdate();
    let cardDeleted = false;
    try {
      if (visibility === 'public') {
        const channel = await client.channels.fetch(channelId);
        const message = await channel?.messages?.fetch(messageId);
        if (!message) throw new Error('Não consegui localizar o card no canal.');
        await message.delete();
        cardDeleted = true;
      }

      const deleted = await deleteRecord(recordId);
      await interaction.editReply({
        content: deleted
          ? 'Correção excluída.'
          : 'Essa correção já foi excluída ou não foi encontrada.',
        components: [],
        embeds: [],
      });
    } catch (error) {
      console.error('Não foi possível concluir a exclusão:', error);
      await interaction.editReply({
        content: cardDeleted
          ? 'O card foi apagado, mas não consegui remover o registro salvo. Avise a equipe para conferir os dados.'
          : 'Não consegui apagar o card; o registro foi mantido. Confira as permissões do bot e tente novamente.',
        components: [],
        embeds: [],
      });
    }
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'correcao') {
    const modal = new ModalBuilder()
      .setCustomId('correcao:formulario')
      .setTitle('Solicitação de correção');

    const cliente = new TextInputBuilder()
      .setCustomId('cliente')
      .setLabel('Nome do cliente com o código')
      .setPlaceholder('Ex.: Empresa Exemplo (CLI-123)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(100)
      .setRequired(true);

    const atividade = new TextInputBuilder()
      .setCustomId('atividade')
      .setLabel('Número da atividade')
      .setPlaceholder('Ex.: 12345')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(50)
      .setRequired(true);

    const resumo = new TextInputBuilder()
      .setCustomId('resumo')
      .setLabel('Resumo do problema')
      .setPlaceholder('Descreva brevemente o que precisa ser corrigido.')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(cliente),
      new ActionRowBuilder().addComponents(atividade),
      new ActionRowBuilder().addComponents(resumo),
    );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'correcao:formulario') {
    await interaction.deferReply({ ephemeral: true });
    const cliente = interaction.fields.getTextInputValue('cliente');
    const atividade = interaction.fields.getTextInputValue('atividade');
    const resumo = interaction.fields.getTextInputValue('resumo');
    let record;

    try {
      record = {
        id: randomUUID(),
        userId: interaction.user.id,
        cliente,
        atividade,
        resumo,
        status: 'pendente',
        createdAt: new Date().toISOString(),
      };
      await saveRecord(record);
    } catch (error) {
      console.error('Não foi possível salvar a solicitação:', error);
      await interaction.editReply({
        content: 'Não consegui salvar sua solicitação. Tente novamente mais tarde.',
      });
      return;
    }

    const embed = createCorrectionEmbed(record);
    const components = createStatusButtons(record.id);

    if (REPORT_CHANNEL_ID) {
      let channel;
      let postedMessage;
      try {
        channel = await client.channels.fetch(REPORT_CHANNEL_ID);
        if (!channel || !channel.isTextBased() || !channel.send) {
          throw new Error('O canal configurado não aceita mensagens.');
        }
        postedMessage = await channel.send({ embeds: [embed], components });
      } catch (error) {
        console.error('Não foi possível publicar no canal configurado:', error);
        await interaction.editReply({
          content: `A solicitação foi salva (atividade ${atividade}), mas não consegui publicar o card no canal. Avise a equipe e evite enviar outra solicitação igual.`,
        });
        return;
      }
      try {
        record.reportChannelId = channel.id;
        record.reportMessageId = postedMessage.id;
        await linkReportMessage(record.id, channel.id, postedMessage.id);
      } catch (error) {
        console.error('O card foi publicado, mas não consegui salvar o vínculo com a solicitação:', error);
      }
      await interaction.editReply({ content: 'Sua solicitação foi registrada.' });
      return;
    }

    await interaction.editReply({ embeds: [embed], components });
  }
});

client.login(DISCORD_TOKEN);
