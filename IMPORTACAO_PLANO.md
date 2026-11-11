# Importação privada e linha do tempo diária

Implementa [#3](https://github.com/vinisf/Focus/issues/3) sobre a estrutura do [PR #2](https://github.com/vinisf/Focus/pull/2), sem mudar a entrega anterior ou encerrar a issue #1. O novo PR tem a branch do PR #2 como base enquanto ele estiver aberto.

## Importar um plano

Em **Metas → Importar plano pessoal**, selecione um JSON `LifePlanningData`: `version: 1`, `timezone`, `areas`, `goals`, `blocks`. O arquivo é lido em memória no dispositivo; o conteúdo não é enviado à rede, registrado em logs ou salvo como arquivo do projeto. A seleção não grava no armazenamento. Ao cancelar ou sair da tela, a prévia é descartada.

Limites por arquivo: 5 MiB, 200 áreas, 1.000 metas, 1.000 blocos e 10.000 marcos no total. A verificação de tamanho e quantidade antecede as verificações de colisão. `validateLifePlanning` continua validando esquema, campos, versão, datas reais, IDs únicos, referências e horários. Arquivos inválidos recebem erro genérico sem reproduzir seu conteúdo. Blocos do próprio arquivo com colisões, horários parciais ou intervalos que atravessam a meia-noite precisam ser corrigidos antes da seleção. `focus-full` não é um plano pessoal; ele continua sendo restaurado em **Configurações → Backup completo**.

### Prévia e decisões

A prévia mostra as quantidades de áreas, metas, marcos e blocos; separa novos registros, duplicatas idênticas, conflitos pendentes, atualizações, existentes mantidos e blocos ignorados. Novos registros e duplicatas podem ser inspecionados. Versões com o mesmo ID e conteúdos diferentes exigem uma decisão individual:

- **Manter existente:** preserva o registro atual. Referências importadas continuam apontando para esse registro.
- **Atualizar com o arquivo:** troca o conteúdo desse registro somente após a confirmação final. Os demais registros permanecem intactos.
- **Duplicar:** mantém o original e cria outra identidade. Áreas, metas, marcos e referências de blocos são remapeados em conjunto. A prévia é recalculada conforme as escolhas; duplicar uma área pode exigir decidir também sobre uma meta que usava esse ID.
- **Ignorar este bloco:** não adiciona nem altera o bloco correspondente. Um bloco existente nunca é apagado por essa escolha.

Os IDs de cópia são determinísticos e procuram cópias equivalentes já existentes, evitando multiplicá-las ao repetir a mesma importação com as mesmas decisões. Duplicatas idênticas não geram gravação. Uma nova seleção após ajustes manuais pode exigir uma decisão novamente, pois o arquivo original difere do que foi salvo. Não há deduplicação por título: IDs distintos representam registros distintos.

Colisões entre blocos do arquivo e os dados atuais bloqueiam a aplicação. Na prévia, ajuste data, início/fim e tipo do bloco importado ou ignore-o. Blocos flexíveis podem ficar sem horário quando início e fim forem ambos limpos. Blocos cancelados não reservam horário. As tarefas e a rotina existentes não são movidas ou alteradas para resolver conflitos.

Se o fuso do arquivo for diferente, escolha manter o atual ou usar o importado. Nenhuma data ou hora é convertida silenciosamente. Vínculos de tarefas são preservados como IDs, sem criar ou editar tarefas; vínculos indisponíveis permanecem identificados na tela de Metas.

### Backup e aplicação

Depois de resolver as pendências, **Gerar backup pré-importação** inicia automaticamente o download de `focus-antes-importacao.json`, com o snapshot completo das chaves permitidas pelo backup do PR #2. Credenciais do cofre nativo e dados de outros aplicativos ficam de fora. O arquivo pode conter dados locais sensíveis e deve ser guardado pelo usuário. O navegador precisa permitir o download; a interface pede que o usuário confirme que o salvou, pois o app não consegue verificar o disco do dispositivo.

As decisões ficam bloqueadas após gerar o backup. Para mudá-las, use **Voltar à revisão**; será necessário gerar o backup novamente. Só então marque a confirmação e use **Aplicar importação**. Antes da gravação, a mesclagem é recalculada e validada; mudanças no planejamento desde a prévia exigem selecionar o arquivo novamente.

A aplicação grava **uma única vez** em `focus.life-planning.v1`, aproveitando a escrita atômica de um item de `localStorage`. Só após a gravação bem-sucedida atualiza o store. Uma falha de quota, acesso ou concorrência preserva os bytes anteriores e o estado em memória; a prévia permanece disponível. Não há estágio parcialmente aplicado em várias chaves. O arquivo pré-importação permite restaurar o estado anterior pelo fluxo confirmado de backup completo do PR #2.

O backup pré-importação preserva também registros antigos eventualmente ilegíveis de outras funções. Nesse caso, essa cópia bruta precisa de correção antes que o importador estrito de backup completo a aceite; não se tenta corrigir ou sobrescrever esses dados durante a importação pessoal. Feche outras abas ao importar/restaurar: a checagem de snapshots evita sobrescritas desatualizadas, mas `localStorage` não oferece transações distribuídas entre abas.

## Linha do tempo em Meu Dia

A linha do tempo usa apenas os blocos ativos do dia no planejamento. Ordena os que têm horário, exibe início/fim, título, descrição opcional e marcação visual; os sem horário ficam em **Flexíveis sem horário**. Textos explícitos acompanham as cores: `fixed` é **Compromisso confirmado** e `flexible` é **Sugestão flexível**, inclusive quando tem um horário proposto. Cancelados não aparecem na linha do tempo. Não se inventam horários ou atividades.

O dia inicial acompanha o fuso configurado em Metas/Semana; o seletor permite consultar outro dia e **Hoje** retorna ao dia atual naquele fuso. A zona horária fica visível. Os horários permanecem civis, sem conversão UTC. Um intervalo que cruza a meia-noite precisa ser dividido em blocos de dias diferentes.

**Editar / replanejar** reutiliza o editor de Semana: mudança manual de data, horário, tipo, descrição, meta ou status; a validação de colisão continua valendo. Para confirmar uma sugestão, escolha o tipo fixo e salve. O foco de teclado entra no editor e retorna ao bloco ou ao seletor de data ao fechá-lo. A visualização é reativa: importações e edições aparecem sem recarregar a página.

`WeeklyBlock.description` é um campo opcional adicional validado na versão 1. Todos os registros anteriores, sem descrição, continuam válidos; não há migração nem regravação ao abrir a linha do tempo. Tarefas, hábitos, integrações, rotina, recomendações e demais recursos existentes continuam funcionando. A linha do tempo não espelha automaticamente essas outras fontes. Recomendações inteligentes e revisão semanal permanecem fora deste escopo.

## Validação

- `npm test`, `npm run lint`, `npm run build`.
- Testes cobrem entrada inválida/oversize, limite de quantidade, descrição opcional, IDs/referências, conflitos e escolha de manter/atualizar/duplicar, remapeamento e repetição idempotente, ajustes/ignorados, fusos, backup anterior à confirmação, cancelamento, ausência de chamadas de rede e preservação dos dados antigos.
- Falhas de quota, snapshots desatualizados e conflito com outra aba preservam o original. Os testes do backup completo e da recuperação do PR #2 continuam na suíte.
- A linha do tempo tem cobertura de ordenação, flexíveis, cancelados, limite de dia por fuso, atualização reativa após importação e replanejamento com recusa de colisões.
- Conferência local em Edge a 1440 px e 360 px, temas claro/escuro, com planos inteiramente fictícios: linha do tempo e prévia de conflitos sem overflow horizontal. Prints e scripts de conferência ficam fora do commit. Nenhum plano pessoal real foi usado.
