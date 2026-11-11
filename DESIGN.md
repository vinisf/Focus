# Focus — minimalismo acolhedor

A inicial ajuda a escolher um próximo passo. Desempenho reúne acompanhamento; Configurações reúne integrações, importação e preferências. Essa divisão continua sendo a base do layout.

## Linguagem

- Usar somente a saudação pelo horário local no topo, sem nome pessoal ou frase motivacional.
- Usar fatos disponíveis para justificar sugestões: planejada para hoje, já iniciada, prazo informado ou compatibilidade da estimativa com o tempo escolhido.
- Preferir “Começar agora”, “Ver alternativas” e “Agora não”. Agora não pula a atividade na rodada, preservando seus dados; ao percorrer todas as opções, uma mensagem discreta informa o reinício.
- Não dizer que está tudo concluído quando há tarefas disponíveis impedidas pelo tempo, filtros ou adiamentos. Oferecer um estado neutro e a possibilidade de voltar depois.
- Evitar mensagens de cobrança, dificuldade presumida ou garantias sobre duração real.

`src/utils/uiCopy.ts` centraliza saudação e justificativas de apresentação. As regras de recomendação continuam no motor existente.

## Componentes e hierarquia

- Ícones Lucide com traço de 1,6–1,7 e tamanho de 13–23 px, conforme a função. Ícones decorativos usam `aria-hidden`; os botões mantêm texto ou nome acessível.
- `ActivityBadge.vue` identifica tarefa pessoal, hábito, chamado IEMA e integração com o mesmo padrão de chip.
- Ordem da inicial: saudação simples, links discretos de planejamento e ajuste diário, **Minha Única Coisa**, no máximo duas **Outras possibilidades** e acesso à lista completa. Não repetir indicadores de Desempenho ou listar pendências na inicial. Durante execução, destacar somente o foco atual e seus controles.
- Uma justificativa curta no card, em vez de parágrafos de regras. Critérios detalhados continuam disponíveis fora do modo compacto.
- Alternativas ficam acessíveis diretamente. Cronômetro permanece em Mais opções, sem competir com a ação principal.
- Estados vazios têm ícone pequeno, uma mensagem útil e, quando necessário, uma linha de apoio. Sem ilustrações grandes.

## Estilo

- Usar azul e superfícies neutras. Cor de ação `#356FB0`, hover `#2C5E96`, superfícies `#ECF3FB`/`#F5F9FE`. Usar os tokens semânticos de `src/style.css`; não regravar cores de categorias existentes.
- Azul para navegação e ação; verde discreto para conclusões. Evitar adicionar cores por categoria sem necessidade.
- Cantos de 8–15 px e sombras muito suaves. Espaçamento deve separar seções antes de adicionar divisórias ou decoração.
- Textos auxiliares usam um tom mais legível no tema claro; o tema escuro mantém seus próprios tokens.
- No celular, a saudação usa a largura disponível e Nova tarefa fica na barra superior. Menu lateral pode rolar em telas baixas; os sete itens continuam com ícones.

## Verificação

Conferidos no Edge: desktop de 1440 px, celular de 390 px, navegação mobile aberta, temas claro/escuro e tela vazia. Foram usados somente dados sintéticos em perfil temporário. As verificações web não substituem uma rodada no aparelho Android.

## Arquivos alterados neste refinamento

| Área                                                    | Arquivos                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Saudação, navegação e resumo                            | `src/views/FocusView.vue`                                                                     |
| Card e ações da recomendação                            | `src/components/ActivitySuggestions.vue`                                                      |
| Chip reutilizável de origem (novo)                      | `src/components/ActivityBadge.vue`                                                            |
| Textos de saudação e justificativas (novo)              | `src/utils/uiCopy.ts`                                                                         |
| Paleta, contraste, ícones, espaçamento e responsividade | `src/style.css`                                                                               |
| Estados vazios de chamados e hábitos                    | `src/components/IemaPanel.vue`, `src/views/HabitsView.vue`                                    |
| Testes de saudação, navegação e ações                   | `tests/interface.test.ts`, `tests/integration-tasks.test.ts`, `tests/recommendations.test.ts` |
| Documentação                                            | `README.md`, `RECOMMENDATIONS.md`, `DESIGN.md`                                                |

O refinamento visual inicial foi validado separadamente. A evolução do motor inclui testes adicionais e o plugin nativo de notificações; veja [RECOMMENDATIONS.md](RECOMMENDATIONS.md).

## Paleta e assistente diário

A paleta do assistente diário usa azul nos temas claro e escuro, preservando espaçamentos e estados semânticos. `--accent` e `--accent-ink` controlam destaques; `--action-bg` mantém o botão principal legível nos dois temas. Cores pessoais e históricos permanecem como foram salvos.

A revisão de amanhã reutiliza cards, chips de origem, campos e botões. Indisponibilidades e controles avançados ficam em disclosures. Campos de dia/horário se reorganizam no celular; ícones de subir/descer têm rótulos acessíveis. A notificação usa apenas texto genérico. A página nova não ocupa outra entrada do menu: abre por um link em Meu Dia, pelas configurações ou pelo toque no lembrete.

## Navegação de tarefas

Menu final: Meu Dia, Tarefas (`list-todo`), Categorias, Hábitos, Chamados IEMA, Desempenho e Configurações. As antigas quatro visualizações de tarefas agora são abas da mesma lista. O contador lateral continua indicando pendências, enquanto o número acima da lista indica os resultados da aba e dos filtros atuais. Próximas considera datas futuras de planejamento ou vencimento; Sem data significa ausência de vencimento, sem confundir com ausência de planejamento.

A barra usa os tokens semânticos e superfícies existentes, foco visível e seleção por contraste. As abas têm semântica ARIA e teclado; no celular os rótulos têm prioridade sobre os ícones decorativos. O gerenciamento de tarefas continua em uma página. Detalhes de compatibilidade em README.md.

Validação da centralização: 184 testes em 12 arquivos, lint e build aprovados. Conferidos desktop e 360 px com dados sintéticos; documento e viewport com a mesma largura.


## Rotina opcional

**Minha Rotina** fica nas Configurações, com horários editáveis e grupos simples para dias, refeições, trabalho e descanso. **Minha rotina hoje está diferente** tem página própria, acessível pelo Meu Dia, pelas Configurações e pela revisão de amanhã. O formulário mantém alterações por data e a ação **Voltar** retorna à origem. A página oculta ações de criar tarefa e concentra a atenção nos ajustes da rotina. Sem notificações adicionais.

O selo de origem distingue **Minha rotina** de tarefas, hábitos e fontes externas. A recomendação de refeição mostra a janela, usa linguagem condicional e oferece **Já fiz** / **Agora não**; não sugere ausência de alimentação pelo silêncio do usuário. O estado vazio mantém o tom neutro. O cronômetro é opcional e pausa/retomada permanecem no mesmo painel de foco.
