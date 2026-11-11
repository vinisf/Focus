# Metas e planejamento semanal — entrega 1

Implementa a primeira entrega de [#1](https://github.com/vinisf/Focus/issues/1). Recomendações de Hoje e revisão semanal permanecem para as próximas fases; a issue não deve ser encerrada por este PR.

## Comportamento

- **Metas:** CRUD de áreas da vida e objetivos com descrição, horizonte curto/médio/longo, prazo opcional, status e marcos editáveis/concluíveis. A criação começa vazia. A área só pode ser excluída quando não tem metas. Excluir uma meta pede confirmação e preserva tarefas e blocos.
- **Progresso:** marcos concluídos / total de marcos. Sem marcos, a interface informa que não foram definidos; o status da meta e a conclusão de tarefas não inventam progresso.
- **Vínculos:** `Goal.taskIds` relaciona tarefas existentes sem alterar o contrato de `Task` ou gravar em `focus.v1`. Uma tarefa excluída aparece como indisponível; o editor permite limpar esse vínculo. Excluir a meta limpa somente os vínculos dos blocos.
- **Semana:** segunda a domingo, navegação entre semanas, criação, edição, mudança manual de data/horário, cancelamento confirmado, restauração pelo editor e exclusão confirmada. Em telas menores, os dias se empilham sem rolagem horizontal da página. Os formulários usam controles nativos com rótulos, foco visível e ações acessíveis pelo teclado.
- **Horários:** compromissos fixos exigem início e fim; flexíveis podem omitir ambos. Horários parciais, invertidos, iguais e sobreposições são rejeitados. Intervalos adjacentes são aceitos. Cancelados e blocos sem horário não reservam um intervalo fechado. O editor permite remanejar sem arrastar e sem alterar nenhuma tarefa automaticamente.
- **Fuso:** preferência inicial `America/Fortaleza`, configurável na tela Semana e validada por `Intl`. Datas civis e horários são armazenados literalmente, sem conversão para UTC. O fuso define o dia inicial da nova tela; alterá-lo não desloca blocos nem muda a interpretação dos dados anteriores do app.

## Persistência

`focus.life-planning.v1` guarda exclusivamente `{ version, timezone, areas, goals, blocks }`. Nenhuma migração automática ou gravação nos dados antigos ocorre ao usar Metas ou Semana. A validação verifica campos, tipos, versões, datas reais, IDs únicos, referências entre os novos registros e conflitos.

Os comandos salvam primeiro e só então atualizam o estado em memória. Um erro de leitura bloqueia gravações e preserva os bytes originais; erros de quota/gravação mantêm o formulário aberto. O repositório compara a última leitura com o valor salvo para detectar edições em outra aba antes de sobrescrever. O navegador pode negar o próprio acesso a `localStorage`; o app continua navegável e exibe os estados de erro.

## Backup completo

Em **Configurações → Backup completo**, exporte `focus-backup-completo.json`. O formato `focus-full`, versão 1, contém uma lista explícita das chaves de tarefas/categorias, hábitos e registros, rotina, assistente, sessões/limites de trabalho, histórico, execução de foco, plataformas, cache legado de Sheets, cache IEMA, metas/semana e tema. Chaves de outros aplicativos e credenciais do cofre nativo não são exportadas. O arquivo pode conter dados locais sensíveis; deve ser guardado pelo usuário.

A importação aceita até 20 MB, valida o envelope e todos os conjuntos presentes com os validadores do aplicativo e exige confirmação antes de substituir dados. A seleção de arquivo não escreve no armazenamento. Conjuntos cujo valor é `null` são removidos na restauração. A importação também compara o estado atual com a prévia; se algo mudou, é necessário selecionar o arquivo novamente.

Antes de alterar qualquer chave, grava `focus.restore-journal.v1` com os bytes anteriores. Se não conseguir gravar essa cópia, nada é substituído. Falhas durante a importação executam rollback; se ele também falhar, o diário é preservado. Na próxima inicialização, a recuperação ocorre **antes** de montar o app ou iniciar notificações. Se não puder terminar, a inicialização para com uma mensagem, preservando a cópia para nova tentativa. Uma importação bem-sucedida recarrega a página para reidratar os stores.

**Recuperar dados ilegíveis** exporta uma cópia bruta das mesmas chaves, mesmo com registros inválidos. Essa cópia precisa de correção antes da importação. A exportação antiga do rodapé mantém seu formato anterior para preservar o fluxo de recuperação existente; ela não equivale ao novo backup completo e não é aceita pelo novo importador.

Feche outras abas do Focus antes de restaurar. `localStorage` não oferece transações entre abas: a checagem de concorrência evita sobrescritas de snapshots desatualizados, mas não é um bloqueio distribuído. Backups com versões futuras ou formato antigo são recusados sem conversão silenciosa.

## Limites desta entrega

- A Semana contém os blocos criados nessa tela. Não espelha automaticamente tarefas, hábitos, rotina ou integrações; a checagem de sobreposição é entre blocos semanais ativos. Não pressupõe disponibilidade no expediente. A rotina profissional e os demais horários continuam configuráveis em suas telas atuais.
- Um bloco fica dentro de um dia; compromissos que cruzam a meia-noite precisam ser divididos. Não há recorrência de blocos nesta entrega.
- Recomendações com vínculo a metas, até três prioridades de Hoje, revisão semanal e proposta de replanejamento confirmado ficam para entregas posteriores. O motor atual é preservado.
- Não há backend, login, sincronização externa, alteração do cofre de credenciais ou novos dados pessoais de exemplo.

## Como validar

1. Rode `npm test`, `npm run lint` e `npm run build`.
2. Com tarefas e hábitos já cadastrados, crie uma área e uma meta, relacione uma tarefa e salve dois marcos. Conclua um: o progresso deve ser 50%. Recarregue e confira os dados anteriores e os novos.
3. Edite prazo, horizonte e status; exclua a meta e confira que as tarefas continuam intactas. Uma área com metas deve recusar exclusão.
4. Na Semana, crie um fixo 10h–11h e tente outro 10h30–11h30: deve recusar. Um bloco 11h–12h e um flexível sem horário devem ser aceitos. Edite a data, cancele, restaure pelo editor e exclua, recarregando para conferir persistência.
5. Exporte o backup completo. Mude um dado, selecione o backup e cancele a importação: nada deve mudar. Selecione novamente, confirme a substituição e confira a restauração após recarregar. Um JSON inválido não deve habilitar a confirmação.
6. Confira Metas e Semana em desktop e a 360 px, com temas claro/escuro e navegação por Tab, Enter e Espaço.

Os testes cobrem CRUD/recarregamento, preservação dos dados antigos, progresso, datas inválidas, virada de mês/ano e ano bissexto, fronteira de dia entre fusos, colisões, cancelamento, corrupção, quota, storage negado, concorrência, validação/round-trip de backup, confirmação e rollback/recuperação interrompida. A conferência visual local em Edge cobre 1440 px e 360 px nos dois temas, com dados fictícios e sem overflow horizontal. Artefatos temporários de conferência ficam fora do commit.
