require('dotenv').config();

const { REST, Routes, SlashCommandBuilder, PermissionsBitField } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  throw new Error('Configure DISCORD_TOKEN e CLIENT_ID no arquivo .env.');
}

const commands = [
  new SlashCommandBuilder()
    .setName('correcao')
    .setDescription('Registrar uma solicitação de correção')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('cliente')
    .setDescription('Cadastrar um cliente com formulário')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('minhas-correcoes')
    .setDescription('Listar suas solicitações de correção')
    .addStringOption((option) => option
      .setName('status')
      .setDescription('Filtrar por status')
      .setRequired(false)
      .addChoices(
        { name: 'Pendente', value: 'pendente' },
        { name: 'Concluída', value: 'concluida' },
        { name: 'Negada', value: 'negada' },
        { name: 'Cancelada', value: 'cancelada' },
      ))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('consultar')
    .setDescription('Consultar solicitações por número de atividade')
    .addStringOption((option) => option
      .setName('atividade')
      .setDescription('Número da atividade')
      .setMaxLength(50)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('fila')
    .setDescription('Listar correções que ainda estão pendentes')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('estatisticas')
    .setDescription('Ver o resumo de correções por status')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('assumir')
    .setDescription('Assumir uma correção pendente')
    .addStringOption((option) => option
      .setName('protocolo')
      .setDescription('Protocolo exibido no card ou nas listas')
      .setMinLength(10)
      .setMaxLength(10)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('atribuir')
    .setDescription('Atribuir uma correção pendente a alguém da equipe')
    .addStringOption((option) => option
      .setName('protocolo')
      .setDescription('Protocolo exibido no card ou nas listas')
      .setMinLength(10)
      .setMaxLength(10)
      .setRequired(true))
    .addUserOption((option) => option
      .setName('responsavel')
      .setDescription('Pessoa responsável pela correção')
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('reabrir')
    .setDescription('Reabrir uma correção concluída, negada ou cancelada')
    .addStringOption((option) => option
      .setName('protocolo')
      .setDescription('Protocolo exibido no card ou nas listas')
      .setMinLength(10)
      .setMaxLength(10)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('motivo')
      .setDescription('Por que a correção voltou para a fila?')
      .setMaxLength(300)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('cancelar')
    .setDescription('Cancelar uma solicitação sua que ainda está pendente')
    .addStringOption((option) => option
      .setName('protocolo')
      .setDescription('Protocolo exibido no seu histórico')
      .setMinLength(10)
      .setMaxLength(10)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('motivo')
      .setDescription('Motivo do cancelamento, se quiser informar')
      .setMaxLength(300)
      .setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('buscar')
    .setDescription('Buscar correções por protocolo, atividade, cliente ou texto')
    .addStringOption((option) => option
      .setName('termo')
      .setDescription('Texto ou protocolo para procurar')
      .setMaxLength(100)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('status')
      .setDescription('Filtrar também pelo status')
      .setRequired(false)
      .addChoices(
        { name: 'Pendente', value: 'pendente' },
        { name: 'Concluída', value: 'concluida' },
        { name: 'Negada', value: 'negada' },
        { name: 'Cancelada', value: 'cancelada' },
      ))
    .addUserOption((option) => option
      .setName('responsavel')
      .setDescription('Filtrar por pessoa responsável')
      .setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('meus-atendimentos')
    .setDescription('Listar correções atribuídas a você')
    .addStringOption((option) => option
      .setName('status')
      .setDescription('Filtrar pelo status')
      .setRequired(false)
      .addChoices(
        { name: 'Pendente', value: 'pendente' },
        { name: 'Concluída', value: 'concluida' },
        { name: 'Negada', value: 'negada' },
        { name: 'Cancelada', value: 'cancelada' },
      ))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('ajuda')
    .setDescription('Mostrar os comandos e como usar o bot')
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function main() {
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);

  await rest.put(route, { body: commands });
  console.log(GUILD_ID
    ? 'Comandos registrados no servidor.'
    : 'Comandos registrados globalmente. A propagação pode levar algum tempo.');
}

main().catch((error) => {
  console.error('Falha ao registrar o comando:', error);
  process.exitCode = 1;
});
