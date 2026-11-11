# Desempenho

O painel `src/views/PerformanceView.vue` reúne análises, sem lista de execução de hábitos. A página Hábitos mantém os controles de realização, quantidade, calendário e histórico; Meu Dia mantém as sugestões existentes. Hoje, Semana (segunda-feira até hoje) e Mês (primeiro dia até hoje) usam datas locais. O escopo roxo do painel possui variantes clara e escura, sem substituir a paleta azul das outras páginas.

## Regras

- Produtividade: tarefas com um dia planejado dentro do período; na ausência de planejamento, usa o vencimento. Cada ID conta uma vez no período, mesmo que seja replanejado. Canceladas não entram. A conclusão precisa ocorrer dentro do período; uma conclusão tardia na mesma semana pode cumprir o planejamento semanal, mas não reescreve o resultado diário anterior. Tarefas sem planejamento não entram no percentual.
- Consistência: reutiliza `habitCompliance` e as versões em `habit.plans`. Respeita criação, arquivamento, dias fixos e mudanças de frequência. Quantidades parciais não são realizações completas. Metas flexíveis são avaliadas por semana, com limite pelos dias disponíveis em semanas parciais. Em Hoje e nos pontos diários, a meta flexível mostra o acumulado daquela semana até a data, sem exigir prática diária. Nas semanas e meses, só entra a parcela pertencente ao intervalo selecionado.
- Ausência de previsão: percentual `null`, apresentado como travessão; o gráfico omite pontos e interrompe a linha nos intervalos sem previsão. Não há séries ou resultados simulados.
- Pendentes: total atual em aberto, explicitamente identificado; não é uma reconstrução do estoque antigo de pendências.
- Tempo estimado: soma das estimativas das tarefas concluídas no período, incluindo as sem planejamento, uma vez por ID. Não se confunde com o tempo medido.
- Tempo registrado: somente sessões encerradas, recortadas pela interseção com o período local e o instante atual. A união dos intervalos evita contar sobreposições duas vezes. Uma sessão atravessando meia-noite é repartida; durações acima de 24 horas continuam em horas e minutos.

## Limitações do histórico existente

Tarefas antigas guardam o planejamento atual e a última conclusão, sem auditoria de mudanças. Não é possível reconstruir replanejamentos ou reaberturas anteriores à primeira observação desta versão. O painel informa essa limitação e conserva a primeira leitura como base para consultas anteriores, em vez de recalculá-las usando alterações futuras.

`src/stores/performanceHistory.ts` observa alterações completas das tarefas e grava snapshots adicionais em `focus.performance.v1`. Guarda somente ID, datas de planejamento/vencimento/criação/conclusão, status e duração. Títulos, descrições, credenciais, sessões e dados de IEMA/plataformas não entram nesse histórico. Os registros originais de tarefas, hábitos e integrações não são migrados ou corrigidos. Histórico ilegível é preservado e bloqueado para gravação. O backup pessoal inclui os novos snapshots de métricas.

O modelo de sessões não possui estado de pausa. Sessões abertas ficam fora do total confirmado e podem ser encerradas pelo painel. Intervalos entre uma sessão encerrada e a seguinte não contam; uma pausa ocorrida dentro de uma sessão aberta não pode ser identificada. Não há limite arbitrário de duração nem alteração automática de sessões antigas.

## Visualização e validação

Gráfico SVG sem nova dependência, com pontos, linhas distintas, legenda e tabela acessível. Escalas: últimos sete dias, semanas do mês e últimos doze meses. O filtro de período controla os cards; a escala controla o gráfico. Conferência com dados sintéticos no Edge em 1440 px e 390 px, incluindo modo escuro e ausência de rolagem horizontal. Isso não substitui a conferência no aparelho Android.

Testes de domínio e interface em `tests/performance.test.ts` e `tests/performance-interface.test.ts`; testes existentes de hábitos, navegação e backup adaptados à nova localização dos controles e ao histórico adicional.
