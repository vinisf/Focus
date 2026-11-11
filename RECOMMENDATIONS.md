# Motor de planejamento e recomendações do Focus

## Arquitetura

`src/services/RecommendationEngine.ts` é o ponto de entrada puro, determinístico e offline. Recebe um snapshot tipado dos stores por `useRecommendationContext.ts`, consulta as regras em `utils/recommendations.ts` e normaliza cada candidato com `activityTiming.ts`. Não escreve em stores ou APIs. Identidades mantêm a origem: `task:<id>`, `habit:<id>`, a chave institucional `iema:<conexão>:<id>` e a chave original de plataformas.

Todas as fontes participam de Meu Dia: tarefas, hábitos previstos, cache de chamados e plataformas locais elegíveis. Se uma plataforma já estiver representada por uma tarefa importada, a identidade normalizada do nome evita recomendar outra cópia. A sincronização IEMA continua somente leitura; abrir um chamado não altera seus dados institucionais. Fontes, categorias, estilo e orçamento profissional permanecem configuráveis em Configurações.

## Prioridade e tempo

1. Crítica: vencimento hoje ou no passado, e compromisso obrigatório dentro da antecedência configurada. Entre críticos, ordenar pelo horário limite/início iminente, vencimento, prioridade manual, importância e pontuação existente. Urgência manual explícita mantém precedência sobre atividades normais.
2. Alta: importância/prioridade alta, hábitos próximos do horário preferencial, pressão de meta semanal e urgência profissional textual conhecida. Códigos numéricos institucionais desconhecidos não ganham significado inventado.
3. Normal: planejamento de hoje, atividades em andamento e chamados já assumidos; hábitos previstos conforme sua frequência.
4. Flexível: tarefas sem prazo e demandas disponíveis sem urgência conhecida. Alta importância pode elevar uma tarefa mesmo sem vencimento.

`plannedDate` determina a intenção de execução; `dueDate` é o vencimento. `scheduledTime` indica início e `mandatory` declara um compromisso obrigatório. `deadlineTime` indica limite; o campo legado `time` continua sendo lido como horário do vencimento. Um vencimento de hoje não fica escondido por uma data planejada futura. Reagendar nunca altera vencimentos, recorrência ou histórico.

O limite efetivo é o menor entre minutos informados, **Livre até**, o próximo compromisso obrigatório e o início de indisponibilidade/descanso. Não iniciar uma estimativa que atravessaria esse limite. O próprio compromisso não bloqueia a si mesmo. Atividades sem estimativa são identificadas como desconhecidas e ficam fora de intervalos estreitados por compromissos; com orçamento de trabalho explícito, não se promete que caibam nele. Não há estimativa de tempo restante nem divisão artificial em subtarefas inexistentes.

Antecedência obrigatória (padrão 15 min), janela de hábitos (padrão 60 min para cada lado) e horários de descanso são ajustáveis em **Configurações → Assistente e revisão noturna**. Sessões de uma hora sugerem uma pausa; após encerrá-las há uma ação opcional de pausa de dez minutos. Descanso não reduz pontuações nem indicadores.

## Rodadas e Agora não

**Agora não** registra somente a chave e a assinatura de urgência na rodada. Não muda datas, horários, importância, status ou orçamento diário. A próxima atividade elegível aparece e, ao esgotar a rodada, o motor retorna automaticamente à maior prioridade atual. Uma mensagem discreta informa o reinício. Uma única atividade também reinicia de forma limitada, sem disparar um loop reativo.

A assinatura considera vencimento e entrada na faixa iminente do compromisso. Quando surge uma urgência relevante, uma atividade pulada pode reaparecer. Pular de novo registra a nova assinatura e evita insistência sem outra mudança. A fila é recalculada a partir dos stores, do relógio, do tempo escolhido e dos filtros; não há cópia estática de objetos antigos. Conclusões, edições, novas importações e atualizações do cache são refletidas. Ao mudar o dia, começa uma rodada nova.

`focus.assistant.v1` guarda a rodada e preferências. Adiamentos antigos de uma hora em `focus.recommendations.v1` são respeitados até expirar, sem migração destrutiva. O botão explícito **Adiar para amanhã** nas linhas de integração continua sendo um reagendamento diferente de **Agora não**.

## Hábitos e integrações

Hábitos respeitam dias, planos históricos, metas quantitativas, sessões, conclusões, distribuição semanal e intervalos configurados. Dias distintos continuam sendo a unidade da consistência semanal. Uma meta satisfeita não volta a ser sugerida; permitir várias sessões não multiplica a produtividade de tarefas. Não se presume recuperação fisiológica sem configuração explícita.

Importar Excel continua criando somente integrações pendentes, com o padrão local de 30 min que o projeto já utilizava, sem prazo fictício. Essa estimativa pode ser editada; ela não garante conclusão em meia hora. Registros antigos sem estimativa permanecem desconhecidos no motor. O limite de uma ou duas integrações/dia permanece; pular abre espaço para outra sugestão sem consumir a cota. Conclusões e reagendamentos explícitos consomem a cota existente. Prazos urgentes cadastrados manualmente não ficam escondidos pela cota opcional.

Tarefas aceitam `blocked` e integrações podem informar `nextAction` no editor. Bloqueadas, concluídas, canceladas e plataformas arquivadas ficam fora das recomendações. Nenhum chamado ou plataforma é convertido automaticamente em outra tarefa ao recomendar ou planejar. Reimportação continua preservando edições locais e deduplicação.

## Planejar amanhã

Abra pelo link de Meu Dia ou pelas configurações do assistente. `utils/dayPlanner.ts` monta uma proposta com fontes existentes, vencimentos, atrasos, hábitos e compromissos. Reserva horários obrigatórios e indisponibilidades; respeita o horário preferencial de hábitos. Seleciona atividades que cabem no orçamento acumulado de trabalho, reserva cerca de 30% da janela para imprevistos e intercala dez minutos entre atividades flexíveis. Duração desconhecida não recebe um bloco de tempo fictício. Compromissos fora da janela ou em conflito geram aviso, sem mudança silenciosa.

É possível selecionar atividades opcionais, mudar dia/horário, reorganizar a lista, editar a tarefa e reservar indisponibilidades. A proposta é opcional: ignorá-la não impede as recomendações. Aceitar atualiza somente `plannedDate`/`scheduledTime` de tarefas selecionadas e salva escolhas locais das outras fontes. Vencimentos, histórico e dados institucionais não são alterados. Conflitos de horários e remarcações para depois de um vencimento ainda futuro são recusados. Compromissos cujo horário já passou precisam de revisão explícita.

## Lembrete Android

Plugin oficial `@capacitor/local-notifications` da linha 7, compatível com Capacitor 7. Padrão: desligado, horário sugerido **20h**. A permissão é solicitada quando o usuário ativa o recurso, nunca na abertura silenciosa do app. O lembrete usa um ID estável, canal próprio e calendário local diário. Alterar horário substitui o agendamento; reconciliações concorrentes são serializadas e não duplicam notificações. Desativar cancela somente esse ID.

Título e texto são genéricos, sem dados de tarefas ou IEMA. O toque direciona para Planejar amanhã, inclusive na abertura do app. O plugin fornece o receptor de boot para restaurar agendamentos persistidos; abrir ou retornar ao app também reconcilia as preferências. Não há servidor. Não solicitamos alarmes exatos: o fallback nativo pode atrasar sob economia de bateria, Doze, encerramento forçado ou restrições do fabricante. Confirmar entrega, permissão, reinício e toque em aparelho Android real antes de distribuição.

Referência oficial: [Capacitor 7 — Local Notifications](https://capacitorjs.com/docs/v7/apis/local-notifications).

## Compatibilidade e verificação

Stores existentes e suas chaves não são resetados. Campos de tarefa novos são opcionais; `focus.v1` e versões antigas continuam legíveis. Preferências do assistente usam uma chave independente e validada. Dados ilegíveis são preservados e bloqueiam novas gravações correspondentes. Não há migração de credenciais nem upload de planilhas.

Testes em `assistant-engine.test.ts` e `review-notifications.test.ts`, além das suítes existentes, cobrem prioridades, datas, limites, rodadas, urgência nova, conclusões, metas, recuperação, IEMA, bloqueios, estimativas desconhecidas, planejamento, persistência, permissões, navegação por notificação e deduplicação. Executar `npm run test`, `npm run lint`, `npm run build` e `npm run android:apk`. Build Android não equivale a um teste de entrega de notificação em aparelho físico.


## Contexto opcional de rotina

`types/routine.ts`, `stores/routine.ts` e `utils/routine.ts` separam rotina de tarefas/hábitos. `useRecommendationContext` aplica os dias configurados, exceções diárias, sono, descanso e indisponibilidades; as exceções explícitas de hábitos e reservas também funcionam sem rotina padrão ativada. O motor original recebe `routine` e acrescenta candidatos `routine:<id>` desde 15 minutos antes da janela e os mantém pelo restante do dia enquanto não houver resposta **Já fiz**, sem inventar duração. A janela atual tem preferência; entre as passadas, prioriza a mais recente, sem transformar atraso em urgência. A justificativa distingue horário próximo de horário passado e fala apenas da falta de marcação, sem presumir que a pessoa deixou de comer. Prazos e compromissos críticos preservam precedência. Trabalho só é elegível dentro dos períodos configurados e quando a estimativa cabe até o fim deles. Idade de chamado continua contribuindo apenas marginalmente à pontuação, sem criar urgência.

A rotina usa a mesma filtragem de tempo e fontes, sem alimentar métricas. “Já fiz” guarda uma resposta por data/janela. “Agora não” guarda um silêncio de 30 minutos independente das rodadas; uma rodada reiniciada não o remove. A assinatura crítica também inclui prioridade manual urgente.

A revisão noturna mostra janelas como contexto separado, sem convertê-las em entradas de tarefas ou excluir sugestões de refeição no dia seguinte. Na proposta de horários, atividades flexíveis evitam janelas de refeições e respeitam os períodos de trabalho; atividades críticas não são deslocadas por uma refeição habitual. Indisponibilidades e sono continuam sendo restrições explícitas. A revisão continua opcional.

`stores/focusExecution.ts` persiste o foco, tempo acumulado e instante da retomada. `ActivitySuggestions` mantém a execução em destaque e utiliza as conclusões originais de tarefas e hábitos. As sessões profissionais continuam em `focus.planning.v1`; pausar encerra o trecho profissional, e continuar inicia outro, sujeito ao orçamento. Encerrar um foco IEMA/plataforma não atualiza a fonte institucional. Nenhum bloqueio de outros aplicativos ou notificação adicional é criado.
