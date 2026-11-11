# Focus

## Metas e semana — primeira entrega da issue #1

O menu agora inclui **Metas** e **Semana**, preservando as entradas e funcionalidades anteriores. Em Metas, cadastre áreas da vida, objetivos, marcos verificáveis e vínculos com tarefas existentes. Em Semana, planeje compromissos fixos e blocos flexíveis, com ou sem horário, e remaneje-os pelo editor. Nenhuma meta pessoal é criada automaticamente.

**Configurações → Backup completo** permite exportar e importar todos os conjuntos locais de dados com validação, prévia e confirmação de substituição. O backup completo tem formato próprio; a exportação anterior do rodapé continua disponível e não é importável por esse novo fluxo. Credenciais não entram no arquivo.

Decisões de persistência, limites desta entrega e roteiro de validação: [METAS_SEMANA.md](METAS_SEMANA.md).

## Tarefas em uma só tela

O menu lateral tem **Meu Dia**, **Semana**, **Metas**, **Tarefas**, **Categorias**, **Hábitos**, **Chamados IEMA**, **Desempenho** e **Configurações**. A entrada **Tarefas** usa o ícone `list-todo`; seu contador soma somente tarefas pendentes e em andamento, sem concluídas ou canceladas.

As quatro abas de **Tarefas** usam a mesma lista local e os mesmos componentes:

- **Todas:** inclui todos os status, com filtro opcional de status.
- **Próximas:** pendentes ou em andamento com data de planejamento **ou** vencimento depois de hoje. Inclui tarefas recorrentes futuras e tarefas planejadas sem prazo de entrega.
- **Sem data:** pendentes ou em andamento sem **vencimento**. Ter uma data planejada não exclui a tarefa desta aba. Uma tarefa sem planejamento, mas com vencimento, não entra aqui.
- **Concluídas:** histórico de tarefas finalizadas.

Busca, categoria e ordenação são preservadas ao alternar entre abas. O filtro de status vale somente em Todas e volta com a escolha anterior ao retornar. As abas não recarregam a página, duplicam dados ou criam consultas externas; reutilizam o mesmo `computed` de listagem e `TaskRow`/`TaskEditor`. Nova tarefa, edição, recorrência, conclusão, planejamento e vencimento mantêm os fluxos e o armazenamento existentes.

As abas têm identificação acessível de seleção/painel e navegação por setas, Home e End. Em telas pequenas os ícones decorativos das abas dão lugar aos rótulos, com altura mínima de 42 px e rolagem horizontal restrita à barra se necessário.

O aplicativo não tinha roteador de URL nem rotas públicas separadas para essas páginas. Os antigos nomes internos **Todas as Tarefas**, **Próximas**, **Sem Data** e **Concluídas** continuam sendo aceitos pela navegação, abrindo Tarefas na aba correspondente. Os atalhos antigos da inicial e das categorias continuam funcionando. Não há migração ou alteração de dados locais.

Arquivos desta refatoração: `src/views/FocusView.vue`, `src/style.css`, `tests/task-tabs.test.ts`, ajustes em `tests/interface.test.ts`/`tests/integration-tasks.test.ts` e documentação. Os testes específicos cobrem semântica das datas, todas as abas, filtros compartilhados, contagem de pendências, teclado, recorrência e cadastro rápido. A conferência visual em desktop e em 360 px confirmou as quatro abas visíveis e ausência de rolagem horizontal da página; no celular, as ações ficam abaixo do título para evitar cortes.

## Inicial, desempenho e configurações

**Meu Dia** recebe você com uma saudação por horário, sem nome pessoal ou frase motivacional. O cartão **Minha Única Coisa** considera tarefas, hábitos, chamados IEMA, integrações e rotina opcional. Exibe uma recomendação e até duas **Outras possibilidades**, sem contadores de desempenho ou lista de pendências na inicial. A lista completa permanece em **Tarefas**. **Agora não** pula a atividade sem mudar seus dados; ao percorrer todas, começa outra rodada pela maior prioridade. Fontes continuam com seus próprios cadastros e indicadores. Um link discreto abre **Planejar amanhã**.

**Desempenho** mostra produtividade e consistência independentes, filtros Hoje/Semana/Mês, estimativas, sessões encerradas e gráfico de evolução. A execução de hábitos fica em Hábitos e nas sugestões de Meu Dia. Regras e limites do histórico estão em [PERFORMANCE.md](PERFORMANCE.md).

**Configurações** reúne a importação de Excel, os cadastros antigos de plataformas, a conexão IEMA e as preferências das sugestões. Os controles de integração saíram da inicial e da lista de tarefas. Nenhum dado foi migrado ou apagado nesta reorganização. A navegação mobile, tema, edição e exportação continuam disponíveis.

O motor, os critérios de prioridade e as regras de compatibilidade estão em [RECOMMENDATIONS.md](RECOMMENDATIONS.md). A identidade minimalista usa azul nos tokens de ação e destaque dos temas claro e escuro; cores de categorias já salvas permanecem intactas. O guia visual está em [DESIGN.md](DESIGN.md).

## Integrações: anexar Excel e seguir no seu ritmo

Em **Configurações → Integrações e planilha Excel**, use **Anexar planilha Excel**. A importação acontece ao selecionar o arquivo: cada plataforma **Pendente** vira uma tarefa **Integrar [plataforma]**, na categoria **Integrações**, com **30 minutos** de duração padrão. Não é criada uma data de entrega nem um planejamento obrigatório para todas as plataformas.

Escolha **Uma por dia** ou **Duas por dia** (padrão: duas). **Meu Dia** mostra até esse número de sugestões de integração junto das suas tarefas. O restante fica na lista completa e em **Sem Data**. As sugestões são opcionais e, sem um planejamento feito por você, não entram no percentual das tarefas planejadas. O cartão **Minha Única Coisa** também respeita esse limite e o tempo disponível. Essas tarefas aparecem na fonte **Integrações** dos filtros e contam como trabalho para o limite diário configurado.

**Agora não**, na recomendação, só pula dentro da rodada e oferece outra atividade; não consome a cota nem altera datas. **Adiar para amanhã**, na linha da integração, é um reagendamento explícito, persistido e contabilizado pela cota do dia. No dia seguinte a cota se renova. Título, próxima ação, bloqueio, estimativa e planejamento podem ser editados no editor normal. Os 30 minutos são o padrão local de importação, não uma garantia de conclusão; registros antigos sem estimativa não recebem duração inventada.

### Revisão de amanhã e lembrete Android

Abra **Planejar amanhã** em Meu Dia para revisar tarefas com prazo, atrasadas, hábitos, chamados e integrações. A proposta reserva compromissos e indisponibilidades, evita sobrecarga e mantém folgas. Você pode mudar datas planejadas e horários, reorganizar atividades e remover sugestões opcionais. Aceitar não muda vencimentos ou dados institucionais; ignorar a revisão não impede as recomendações.

Em **Configurações → Assistente e revisão noturna**, ative o lembrete local, desligado por padrão, e escolha o horário (sugerido: 20h). O Android pedirá permissão; tocar abre Planejar amanhã. O agendamento usa o plugin oficial `@capacitor/local-notifications` 7, funciona sem servidor e é restaurado pelo receptor nativo de boot. O sistema pode atrasar a entrega por economia de bateria ou restringi-la após encerramento forçado. A entrega real com o app fechado e após reiniciar precisa ser conferida em aparelho físico. [Documentação oficial](https://capacitorjs.com/docs/v7/apis/local-notifications).

### Importação, reimportação e segurança

- O arquivo é processado localmente com [ExcelJS](https://github.com/exceljs/exceljs#reading-xlsx), carregado sob demanda. A primeira coluna deve ter cabeçalho **Plataforma**, **Plataformas** ou **Sistema**. Em **Opções da planilha** é possível ajustar a aba e a linha do cabeçalho.
- O preenchimento da célula com o nome determina o status. Sem preenchimento → Pendente; verde `#00FF00` → Concluída; amarelo `#FFFF00` → A revisar; vermelho `#FF0000` → Verificar situação. Correspondências explícitas de cores já salvas continuam sendo respeitadas. Somente pendentes viram tarefas; os demais status e formatações desconhecidas são ignorados e contabilizados na mensagem final. A importação direta substitui a antiga prévia de cadastro de plataformas.
- Branco explícito não equivale a ausência de preenchimento. Cores não mapeadas, temas/tints, gradientes e padrões não reconhecidos ficam desconhecidos. Na presença de formatação condicional, a aba não é interpretada como pendente automaticamente. Fórmulas na coluna de nomes são recusadas.
- Numerações iniciais como `1.`, `02)` ou `3 -` são removidas. Nomes são comparados sem distinção de caixa, acentos e espaços para evitar duplicação no arquivo e em reimportações. `integrationName` mantém a identidade mesmo que você edite o título da tarefa. Reanexar não reabre tarefas concluídas/canceladas, não desfaz adiamentos e não sobrescreve notas ou estimativas. Ausentes não são apagadas.
- Só o nome permitido é usado para criar a tarefa. **Login, Senha, COD? e demais valores não entram nas tarefas**, nos logs, nos erros ou nos backups. A biblioteca decodifica o arquivo temporariamente em memória; não há upload, serialização ou cache do workbook. A tarefa criada é montada por lista explícita de campos, sem copiar objetos ou linhas da planilha.
- Limites: 10 MB, 20 mil linhas e 200 colunas por aba. Dimensões são verificadas após a decodificação da biblioteca. Arquivos vazios, inválidos ou incompatíveis produzem erro genérico sem conteúdo interno. Nenhuma tarefa é adicionada parcialmente em falha de escrita.

### Persistência, exclusão e dados antigos

As tarefas importadas usam o repositório existente `focus.v1`. Os campos opcionais `integrationName`, `integrationDeferredOn` e a preferência `integrationDailyLimit` mantêm compatibilidade com tarefas antigas. Como agora são tarefas, os nomes e campos locais dessas integrações entram no backup de tarefas e hábitos; o arquivo Excel e credenciais não entram. Dados de hábitos e IEMA continuam independentes.

Use **Apagar tarefas de integração** e confirme para remover somente essas tarefas, inclusive concluídas. Outras tarefas, hábitos, IEMA e histórico de sessões são preservados. Encerre uma sessão de integração em andamento antes de apagar. É possível importar novamente após excluir.

O antigo cadastro separado continua acessível em **Cadastro separado de plataformas (opcional)**. Seus registros, anotações, etapas e identidades não foram apagados nem convertidos automaticamente. Eles não alimentam mais as recomendações automáticas; a planilha agora alimenta a lista de tarefas. A exclusão do cadastro antigo continua disponível dentro dessa área. O cache original de Sheets é preservado para migração; a autorização Google e a sincronização permanecem desativadas. O plugin Android legado é conservado porque também abre links HTTPS.

### Arquivos e validação

- `src/components/ExcelTaskImport.vue`: seletor de arquivo, importação direta, frequência e exclusão das tarefas importadas.
- `src/stores/tasks.ts`, `src/types/index.ts`, `src/services/repository.ts`: importação por allowlist, identidade, persistência, adiamento e preferência diária.
- `src/utils/integrationTasks.ts`: seleção diária limitada por conclusões e adiamentos, sem prazos fictícios.
- `src/components/ActivitySuggestions.vue`, `TaskRow.vue`, `src/utils/recommendations.ts` e `src/views/FocusView.vue`: sugestões, ações de adiamento, filtros e lista de tarefas.
- `src/components/PlatformsPanel.vue`: novo fluxo simples e acesso opcional ao cadastro antigo. O parser Excel, repositório e editor antigos continuam disponíveis para consultar os dados existentes.
- `tests/integration-tasks.test.ts`: criação, duração, deduplicação, preservação local, frequência, conclusão, adiamento persistente, tempo disponível, filtros, sessões, falhas, segurança e interface. `tests/excel.test.ts` cobre a leitura XLSX e os adaptadores antigos; as suítes IEMA, tarefas e hábitos continuam ativas.

Validação: `npm run test` (184 testes em 12 arquivos), `npm run lint` e `npm run build`. O Vite informa um chunk ExcelJS de aproximadamente 937 kB minificado (271 kB gzip), carregado sob demanda. O build web não gera nem publica APK. Seleção de arquivos e desempenho ainda precisam de validação em Android real.

## Suporte IEMA: integração somente leitura

Em **Configurações → Conexão IEMA**, cadastre a URL completa do prefixo da API (sugerida: `https://web.iema.ma.gov.br/iema-suporte-cti/api/v1`) e o token pessoal Sanctum com `tickets:read`, válido por até 30 dias. Salve, teste a conexão e toque em **Sincronizar IEMA**. O prefixo é configurável para proxies/subdiretórios. Não inclua credenciais na URL.

**Chamados IEMA** mostra somente os chamados da sua lista em atendimento/atribuídos, com busca e estimativa local em minutos. O contador e as recomendações usam o mesmo filtro: chamado da fila pessoal (`mine`) nos estados 2, 5 ou 6, conforme o grupo de atendimento já usado pelo aplicativo. Disponíveis de outras pessoas, novos e finalizados ficam fora da lista. O cache sincronizado é preservado. **Abrir no IEMA** abre o navegador externo no Android; assumir, atualizar e finalizar continuam no sistema institucional. Sincronize novamente ao retornar. Somente GET é utilizado.

A tela de chamados mostra contagens e última sincronização. As duas filas são carregadas com todas as páginas antes de substituir o snapshot. Falha parcial, rede, formato inválido ou armazenamento indisponível preservam o cache anterior. Os dados são identificados como cópia da última sincronização, sem garantia de conectividade atual. 401/403 desativam as recomendações até reconfiguração/reativação. Substituir a credencial cria uma nova identidade de conexão e limpa o cache anterior, mesmo no mesmo servidor. Desconectar apaga credencial e cache institucional.

### Arquitetura e segurança

- Vue 3, Pinia, Capacitor 7 e persistência existente foram mantidos, sem dependências novas nem migrações de tarefas/hábitos.
- `src/services/integrations/iema` separa HTTP, normalização, credenciais e reconciliação. `CapacitorHttp` nativo já está incluído no Capacitor 7. No navegador, fetch não envia cookies nem segue redirecionamentos. HTTPS obrigatório e validação TLS padrão; sem proxy público.
- `src/stores/iema.ts` mantém apenas configurações sem segredos e chamados em `focus.integrations.iema.v1`. Cache inválido bloqueia gravações para preservar o original. `focus.v1` e `focus.habits.v1` continuam independentes. As plataformas usam o repositório local e a migração descritos acima.
- `IemaVaultPlugin.java` usa AES/GCM e chave não exportável no Android Keystore. Ciphertext gravado atomicamente em `getNoBackupFilesDir()`. Falha nativa nunca faz fallback para localStorage. Não há logs de tokens/respostas. O formulário limpa o token após salvar. No navegador, a credencial existe somente na memória da sessão; use tokens sintéticos para desenvolvimento.
- O backup pessoal exportado contém somente tarefas e hábitos. Como o cache institucional e os dados pessoais compartilham o armazenamento físico do WebView, o backup automático Android e a transferência de dados do app foram desabilitados com manifesto e regras explícitas. A exportação pessoal manual continua disponível; mantenha cópias pessoais por esse mecanismo.
- `src/utils/recommendations.ts` recebe modelos locais, sem HTTP. Chamados não viram tarefas nem alteram produtividade/consistência. Estados finais 3/4 e estados desconhecidos não são sugeridos. Tarefas importantes conservam precedência. Atribuídos vêm antes de disponíveis; idade é apenas desempate limitado, sem criar urgência. Sem estimativa, a justificativa declara duração desconhecida. Estimativas manuais respeitam o intervalo disponível. Prioridade e prazo não são inventados nem mapeados sem contrato confirmado.

### Contrato e validação no aparelho

**O contrato autenticado real ainda precisa ser confirmado no Android.** A URL institucional não ficou acessível na consulta pública deste ambiente; nenhuma credencial real foi utilizada. O adaptador valida o exemplo fornecido de ticket e aceita paginação Laravel Resource (`data`, `links.next`, `meta`) ou paginator (`data`, `next_page_url`, `current_page`, `last_page`). Ausência de metadados de término, loops e próxima página fora do endpoint/origem são recusados. Formatos diferentes preservam o snapshot e exigem ajuste do adaptador com um exemplo anonimizado do contrato real. Links de tickets devem ser HTTPS da mesma origem, sem query/fragmento para impedir transporte de credenciais.

No aparelho, confirme o prefixo com **Testar conexão**, paginação de ambas as filas, abertura no navegador, leitura offline após reiniciar, remoção da credencial ao desconectar e revogação do token. Um 401 não distingue com segurança expiração, revogação e token inválido: a mensagem apresenta essas possibilidades. Falhas de rede/VPN/certificado são apresentadas como possibilidades, sem inventar um diagnóstico.

`tests/iema.test.ts` utiliza fixtures sintéticas para Bearer, ausência/expiração de token, erros HTTP, paginação, reconciliação, deduplicação, falha parcial, perda de acesso, cache offline, isolamento de contas, credenciais, backups, recomendações e navegação. A suíte existente cobre preservação de tarefas/hábitos. Nenhum teste depende da API institucional. Compilar não substitui validar Keystore e rede em um Android real.

Referências: [CapacitorHttp 7](https://capacitorjs.com/docs/v7/apis/http), [Android Keystore](https://developer.android.com/privacy-and-security/keystore).

## Aplicativo Android (APK)

O projeto inclui um aplicativo Android com Capacitor 7, compatível com o Node 20 e o SDK 35 deste ambiente. Os arquivos da interface ficam dentro do APK; não é necessário manter o Vite ou um servidor ligado.

Para compilar, instale as dependências com `npm install`. É necessário JDK 21, Android SDK 35 e `ANDROID_HOME` apontando para o SDK (ou `android/local.properties` com `sdk.dir`). Depois execute:

```sh
npm run android:apk
```

O APK de desenvolvimento, já assinado para instalação pessoal, fica em `apk/Focus.apk`. A primeira compilação precisa de internet para baixar o Gradle e as dependências Android. No Windows, se houver erro de caminho longo no build nativo, use um caminho de projeto mais curto.

Transfira o APK para o celular, abra o arquivo e autorize a instalação de apps dessa origem quando o Android solicitar. Requer Android 6 ou superior. Para atualizar, instale o novo APK sobre o anterior, mantendo o mesmo identificador e assinatura. A assinatura de desenvolvimento fica em `~/.android/debug.keystore`: preserve esse arquivo para futuras atualizações pessoais. Publicação em loja exige uma versão de produção com assinatura própria.

Os dados ficam no armazenamento local do aplicativo, separado do navegador e de outros aparelhos. Desinstalar ou limpar os dados remove os registros locais. Não há migração automática dos dados do navegador. A exportação por download usada na versão web ainda precisa ser validada no Android WebView; não dependa dela como único backup no APK.

`npm run android:sync` atualiza os arquivos web no projeto Android; `npm run android:open` abre o projeto no Android Studio. Referência: [ambiente do Capacitor 7](https://capacitorjs.com/docs/v7/getting-started/environment-setup).

Gerenciador pessoal de tarefas e hábitos em português. Vue 3, Composition API, TypeScript estrito, Vite, Pinia, Tailwind CSS e Lucide. Aplicação local, sem autenticação, backend ou IA externa. Inicia vazia para que os dados sejam seus.

## Executar

Requer Node.js 20.19+ ou 22.12+ e npm.

```sh
npm install
npm run dev
```

Abra o endereço informado pelo Vite (normalmente http://localhost:5173).

```sh
npm run test
npm run lint
npm run build
npx vite preview
```

## Uso

Crie tarefas pelo botão Nova tarefa. Título e categoria são obrigatórios; vencimento e planejamento são independentes e opcionais. O botão de calendário na linha planeja para hoje; o editor permite reagendar ou remover o planejamento. Mais detalhes revela descrição, importância, duração, horário e recorrência. A estimativa padrão é 30 minutos. Clique no título ou lápis para editar; use o seletor para cancelar, iniciar ou concluir. A caixa à esquerda conclui ou reabre.

Meu Dia inclui uma lista curta de tarefas com vencimento ou planejamento hoje, sugestões de integrações e uma recomendação compatível com o tempo disponível. As demais pendências continuam na lista completa. Outras visualizações permitem buscar, filtrar categoria e ordenar. Tarefas → Todas também filtra por status e inclui canceladas. Categorias permite criar e editar nomes e cores. Os indicadores mostram conclusões de hoje, semana iniciada na segunda, duração estimada realizada e distribuição por categoria. Contadores da barra lateral representam pendências por área.

As recomendações são individuais: até três alternativas que cabem, cada uma, no intervalo informado, sem prometer que a soma cabe. Tarefas planejadas para dias futuros ficam fora das sugestões até o dia planejado. Recorrências sem planejamento usam o vencimento como dia da ocorrência. Assim, concluir uma atividade diária não sugere antecipadamente a ocorrência de amanhã. Uma tarefa comum com apenas vencimento futuro continua elegível para antecipação. A pontuação usa prioridade (0/18/36/72), importância (0/22/44), prazo (36 atrasado, 28 hoje, 14 até três dias), idade limitada a oito pontos e seis pontos por compatibilidade de duração. Tarefas sem vencimento não têm penalidade. Pesos configuráveis em `src/utils/priority.ts`. Justificativas descrevem as regras aplicadas; não inferem dependências entre tarefas.

Ao concluir uma recorrência, mantém-se o registro original e cria-se uma ocorrência futura pendente com novo ID. `nextId` impede duplicação ao reabrir/concluir ou recarregar. Recorrências atrasadas avançam a partir do dia atual, sem criar uma sequência de pendências passadas. Tarefas recorrentes sem vencimento continuam sem prazo, com o próximo dia planejado preenchido. A alteração da recorrência de uma ocorrência não muda outras já geradas.

## Arquitetura e dados

- `components`: editor e linha reutilizável de tarefa.
- `views`: interface e visualizações.
- `composables`: relógio reativo para atualização de data.
- `stores`: estado Pinia e transições.
- `services`: contrato de repositório e implementação localStorage.
- `types`: modelos de domínio.
- `utils`: datas, recorrência e priorização independentes da interface.
- `tests`: regras de priorização, recorrência e persistência.

Datas de planejamento/vencimento são datas locais; criação e conclusão usam timestamps ISO. Armazenamento em `focus.v1`, tema em `focus.theme`. O repositório valida dados carregados e rejeita formatos inválidos sem apagá-los. Falhas de leitura bloqueiam gravação para preservar o original; falhas de escrita exibem aviso. Exporte uma cópia pelo rodapé ou perfil. Para recuperar dados corrompidos, exporte primeiro e remova apenas a chave `focus.v1` pelas ferramentas do navegador antes de recarregar. Não há importação de backups nesta versão. A persistência pertence ao navegador e à origem; use exportação para guardar cópias. Não há sincronização entre abas ou dispositivos.

Uma futura API pode implementar a interface `Repository`; a implementação atual é síncrona e deverá ser adaptada para operações assíncronas na store. O modo escuro e o menu mobile estão disponíveis. Layout com foco visível, rótulos e suporte a movimento reduzido. Testes automatizados não substituem validação de acessibilidade com leitores de tela.

## Hábitos, tarefas e produtividade

Hábitos acompanham práticas; tarefas acompanham entregas. A seção **Hábitos** permite criar e editar nome, descrição, categoria opcional, ícone, horário preferencial e frequência. As frequências são diária, dias específicos da semana ou meta de uma a sete vezes por semana. Cada hábito pode ter apenas uma realização por data local. Não há prioridade nem duração de tarefa nos hábitos.

As áreas ficam separadas por objetivo:

- **Meu Dia:** sugestões e tarefas de hoje, com contadores compactos.
- **Desempenho:** hábitos de hoje, produtividade das tarefas, consistência dos hábitos e resumo semanal. Realizar um hábito não altera tarefas concluídas, minutos estimados ou produtividade. Períodos sem previsão exibem uma mensagem neutra, sem percentual de 0%.
- **Hábitos:** cadastro, calendário e histórico de práticas.

Produtividade usa as tarefas não canceladas com planejamento ou vencimento na data exibida; uma tarefa já concluída conta como realizada nesse conjunto. Conclusões de tarefas fora do planejamento continuam no contador de concluídas hoje e no resumo semanal, sem distorcer o percentual do planejamento.

Clique no nome de um hábito para consultar o calendário, as realizações e a consistência semanal/mensal. No calendário, um dia previsto até hoje pode ser marcado ou desmarcado; não é possível marcar datas futuras nem anteriores à criação. O histórico também oferece a ação de desmarcar. Arquivar oculta o hábito da rotina a partir de hoje e mantém as realizações anteriores. Use **Mostrar arquivados** para consultar ou reativar.

Para frequências diária e dias específicos, o percentual considera somente dias previstos já decorridos, incluindo hoje. Dias futuros e descansos ficam fora do denominador. A sequência conta dias previstos cumpridos; descansos e pausas por arquivamento não interrompem a sequência. Hoje ainda não marcado só interrompe a sequência quando passar a ser um dia anterior. Metas flexíveis semanais não exibem sequência diária.

Para metas semanais, o cumprimento é limitado à meta por semana, iniciada na segunda-feira. A meta da semana atual continua visível até o fim da semana; não se exige realização em todos os dias. No mês, somam-se metas das semanas iniciadas no período ou que o intersectam, sem incluir semanas totalmente futuras. Semanas parciais (criação, arquivamento, mudança de frequência ou limite do mês) têm a meta limitada à quantidade de dias disponíveis naquele trecho. Realizações além da meta não elevam o percentual acima de 100%. Os períodos semanal e mensal são avaliados separadamente, inclusive em semanas que atravessam meses.

Mudanças de frequência e de status entram em vigor hoje e são registradas em `plans`. Elas não reescrevem a programação de datas anteriores; realizações já registradas permanecem no histórico, mesmo se hoje deixar de estar previsto. Nome, descrição e ícone podem ser editados normalmente. Não há conversão automática de tarefas recorrentes em hábitos: ambos coexistem.

### Persistência independente

- `focus.v1` e o modelo `Task` permanecem intactos; não há migração ou remoção dos dados antigos.
- `focus.habits.v1` guarda exclusivamente `Habit`, seus planos por data e `HabitCompletion`.
- `src/services/habitRepository.ts` valida hábitos e realizações (incluindo referências, datas e unicidade por hábito/dia); corrupção bloqueia gravação apenas dos hábitos, preservando o conteúdo original.
- `src/stores/habits.ts` gerencia criação, edição, arquivamento e marcações. A store de tarefas continua independente.
- `src/utils/habits.ts` calcula previsão, metas, consistência e sequência. `src/utils/productivity.ts` recebe somente tarefas, e `src/utils/metrics.ts` contém a operação genérica de percentual.
- `src/components/HabitEditor.vue`, `HabitRow.vue`, `HabitIcon.vue`, `HabitsToday.vue` e `DaySummary.vue` compõem a interface; `src/views/HabitsView.vue` concentra a gestão e o calendário.
- `src/composables/useDialogFocus.ts` compartilha o controle de foco dos editores de tarefas e hábitos.
- `src/habits.css` estende o tema atual com layouts adaptados a telas menores e modo escuro.

A exportação agora gera um backup com `version: 2`, contendo `tasks` e `habits`. Dados ilegíveis são incluídos como texto original para recuperação manual. O armazenamento interno continua na versão original de cada repositório, e ainda não há importação de backups.

Os testes de hábitos cobrem frequência personalizada, metas semanais/mensais, sequência, marcação única, datas locais, histórico persistido, edição, arquivamento, preservação de tarefas antigas, exclusão de hábitos das recomendações e indicadores independentes. Os testes da interface incluem dashboard, calendário, formulário e navegação mobile. A verificação de layout em navegador real deve complementar os testes de componentes.

### Nome do hábito e meta

O cadastro separa **Nome do hábito** (ex.: Devocional) de **Meta** (ex.: Ler 3 capítulos da Bíblia). Você pode alterar a meta sem renomear ou recriar o hábito. A descrição continua disponível para observações adicionais. A meta aparece nos cards, nos detalhes e nos registros históricos.

Há dois tipos de acompanhamento:

- **Feito / Não feito:** um checkbox registra se o critério descrito na meta foi cumprido.
- **Quantidade realizada:** informe uma quantidade por realização e uma unidade (ex.: 3 capítulos, 10 páginas ou 2 litros). A área de hábitos em Desempenho permite registrar quantidades parciais; 2/3 capítulos representa progresso, e 3/3 conclui o hábito naquele dia. Quantidades decimais podem ser digitadas diretamente. Use os botões para aumentar ou diminuir em uma unidade. Corrigir para um valor abaixo da meta remove a conclusão daquele dia e mantém o progresso.

A quantidade por realização é independente da frequência: “5 vezes por semana” define quantos dias praticar; “10 páginas” define o que realizar em cada um desses dias. A consistência continua contando dias cumpridos, sem somar páginas, capítulos ou litros à produtividade das tarefas.

No calendário, clicar em um dia de hábito quantitativo abre o controle da quantidade para aquela data. Dias parciais têm um destaque próprio e aparecem na lista **Em progresso**. O histórico de conclusões guarda a meta e o valor realizados. Por exemplo, mudar de 3 para 4 capítulos preserva um registro anterior de 3/3. Uma realização já concluída hoje também mantém seu critério original; as próximas realizações seguem a nova meta. Progresso ainda não concluído usa a programação e a meta vigentes para a data.

Os novos campos são opcionais no formato persistido: hábitos antigos continuam como Feito / Não feito, sem perder nome, frequência ou histórico. A mesma chave `focus.habits.v1` passa a aceitar `goal` no hábito/plano/conclusão, `value` nas conclusões quantitativas e a lista `progress` para registros parciais. A leitura não sobrescreve os dados antigos; uma próxima alteração salva os campos novos. Não há alteração no armazenamento de tarefas. `HabitTracker.vue` reúne os controles de marcação e quantidade, e `utils/habitGoals.ts` resolve a meta de cada data.

[Regras do motor de atividades](RECOMMENDATIONS.md)


## Minha Rotina e Minha Única Coisa

Configure uma vez em **Configurações → Minha Rotina**: dias, acordar/dormir, janelas de café da manhã, almoço e jantar, períodos de trabalho e descanso. A opção começa desativada. As janelas são referências flexíveis; refeições usam linguagem condicional e não pressupõem que você deixou de comer. Café, almoço e jantar continuam elegíveis depois do horário, durante o mesmo dia, até você marcar **Já fiz**. A janela atual tem preferência sobre as anteriores; entre as passadas, a mais recente vem primeiro. Prazos críticos, sono, descanso e indisponibilidades continuam sendo respeitados.

Em **Meu Dia → Minha rotina hoje está diferente**, uma página própria permite escolher a data e ajustar acordar, refeições, hábitos que não deseja praticar ou períodos reservados para um imprevisto/tempo livre. Somente a data selecionada muda. A opção explícita de atualizar o padrão copia apenas acordar e refeições. A página também abre em **Configurações → Minha Rotina** e pelo botão **Ajustar rotina de amanhã** na revisão noturna, já com a data de amanhã. **Voltar** retorna à tela de origem.

**Já fiz** dispensa somente aquela sugestão de rotina naquela data. **Agora não** a silencia por 30 minutos, inclusive após reiniciar o app ou a rodada. Nenhuma dessas ações cria tarefa, sessão produtiva ou registro de consistência. Tarefas, hábitos e fontes externas mantêm ações próprias e as rodadas existentes. Uma mudança para prioridade urgente pode recuperar uma atividade pulada. Alternativas não substituem um foco crítico automaticamente.

Ao começar uma tarefa ou sessão de hábito/profissional, a inicial destaca o foco atual, com **Pausar**, **Continuar**, **Concluir** (ou **Encerrar sessão** nas fontes externas) e cronômetro opcional. O foco e a preferência de cronômetro persistem localmente. Sessões profissionais usam o registro existente e seus limites; a conclusão institucional continua sendo feita na origem.

O armazenamento novo usa `focus.routine.v1` (preferências, exceções, respostas e preferência de cronômetro) e `focus.execution.v1` (foco atual). Dados ilegíveis são preservados e bloqueiam sobrescrita. O backup pessoal inclui a rotina. Não há migração destrutiva, novas notificações ou publicação de APK nesta alteração.

Validação automatizada inclui janelas, ausência de rotina, exceções, refeição realizada, prioridade crítica, troca de foco, adiamento, rodadas, persistência dos stores após recriação e separação de métricas. A suíte existente cobre hábitos, IEMA e integrações. A recriação dos stores simula a leitura após reinício; validar o ciclo real do APK em dispositivo continua sendo uma verificação manual.
