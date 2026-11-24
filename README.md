# Bot de correção para Discord

Bot em Node.js para registrar e organizar solicitações de correção no Discord. Os comandos disponíveis são `/correcao`, `/minhas-correcoes`, `/consultar`, `/fila`, `/estatisticas`, `/assumir`, `/atribuir`, `/reabrir`, `/cancelar`, `/buscar`, `/meus-atendimentos` e `/ajuda`. Ao executar `/correcao`, abre um formulário com:

1. Nome do cliente com o código
2. Número da atividade
3. Resumo do problema

Ao enviar, os dados são salvos em `data/correcoes.json` e organizados em um embed com status inicial **Pendente**. Se `REPORT_CHANNEL_ID` estiver configurado, o card é publicado nesse canal e a pessoa recebe uma confirmação privada. Os botões do card permitem marcar a correção como **Pendente**, **Concluída** ou **Negada**, ou excluí-la após uma confirmação. Para usar os botões e os comandos de equipe (`/consultar`, `/fila` e `/estatisticas`), a pessoa precisa da permissão **Gerenciar mensagens** no servidor. As respostas desses comandos são privadas. `/minhas-correcoes` lista as solicitações da própria pessoa e pode filtrar por status.

- `/consultar atividade:<número>` busca correções pelo número da atividade.
- `/fila` lista as correções pendentes, começando pelas mais antigas.
- `/estatisticas` conta correções pendentes, concluídas e negadas.

## Requisitos

- Node.js 20 ou superior
- Uma aplicação e um bot criados no [Discord Developer Portal](https://discord.com/developers/applications)
- Convide o bot para o servidor com os escopos `bot` e `applications.commands`; para este exemplo, conceda permissão para ver e enviar mensagens no canal de registros

## Configuração

1. Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN` e `CLIENT_ID`.
2. Para registrar o comando imediatamente em um servidor de desenvolvimento, preencha também `GUILD_ID`. Sem ele, o comando será registrado globalmente e pode demorar a aparecer.
3. Opcionalmente, defina `REPORT_CHANNEL_ID` para o canal de destino.
4. Instale dependências e registre os comandos:

   ```sh
   npm install
   npm run deploy
   ```

5. Inicie o bot:

   ```sh
   npm start
   ```

### Hospedagem na Railway

1. Publique esta pasta com a Railway CLI usando `railway up` ou conecte um repositório GitHub.
2. Configure `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID` e `REPORT_CHANNEL_ID` nas variáveis do serviço. `GUILD_ID` e `REPORT_CHANNEL_ID` são opcionais.
3. Anexe um volume persistente ao serviço no caminho `/app/data`, onde o bot grava `data/correcoes.json`.
4. Para registrar ou atualizar os comandos, rode `npm run deploy` com `DISCORD_TOKEN`, `CLIENT_ID` e, se quiser registro imediato no servidor de teste, `GUILD_ID` configurados.

O Railway detecta Node.js pelo `package.json` e usa `npm start` como comando de inicialização. O plano gratuito tem limite mensal de uso; acompanhe a cota no painel.

A Railway executa `npm run deploy` antes de iniciar o bot para sincronizar os comandos slash. Localmente, rode `npm run deploy` sempre que alterar comandos. O arquivo de solicitações fica no computador/servidor onde o bot está rodando; mantenha cópias de segurança se precisar preservar os registros.

## Comandos da equipe e protocolos

As listas e os cards mostram um protocolo de 10 caracteres para cada solicitação. Use esse protocolo em `/assumir`, `/atribuir` e `/reabrir`. `/assumir` pega uma solicitação pendente para você; `/atribuir` permite escolher outra pessoa da equipe. `/meus-atendimentos` lista as solicitações atribuídas a você. `/buscar` procura por protocolo, atividade, cliente ou texto do resumo e aceita filtros opcionais de status e responsável.

Quem criou uma solicitação pode usar `/cancelar` enquanto ela estiver pendente. A equipe pode reabrir solicitações concluídas, negadas ou canceladas com `/reabrir`; o motivo fica registrado no card. Os status cancelados também aparecem em `/minhas-correcoes` e `/estatisticas`.

Mantenha o processo do bot em execução para que o comando responda. Não compartilhe o token e não envie o arquivo `.env` para um repositório. O `.gitignore` protege o Git, mas não impede que ferramentas de compactação incluam `.env` em um ZIP. Se um token real for compartilhado, gere outro no Discord Developer Portal.

### Windows PowerShell

Se o PowerShell informar que a execução de scripts está desabilitada ao rodar `npm`, use `npm.cmd` nos comandos:

```powershell
npm.cmd install
npm.cmd run deploy
npm.cmd start
```

