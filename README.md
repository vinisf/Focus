# Focus

Gerenciador pessoal de tarefas em português. Vue 3, Composition API, TypeScript estrito, Vite, Pinia, Tailwind CSS e Lucide. Aplicação local, sem autenticação, backend ou IA externa. Inicia vazia para que os dados sejam seus.

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

Meu Dia inclui tarefas com vencimento ou planejamento hoje, uma seção separada de atrasadas e recomendações compatíveis com o tempo disponível. Outras visualizações permitem buscar, filtrar categoria e ordenar. Todas as Tarefas também filtra por status e inclui canceladas. Categorias permite criar e editar nomes e cores. Os indicadores mostram conclusões de hoje, semana iniciada na segunda, duração estimada realizada e distribuição por categoria. Contadores da barra lateral representam pendências por área.

As recomendações são individuais: até três alternativas que cabem, cada uma, no intervalo informado, sem prometer que a soma cabe. A pontuação usa prioridade (0/18/36/72), importância (0/22/44), prazo (36 atrasado, 28 hoje, 14 até três dias), idade limitada a oito pontos e seis pontos por compatibilidade de duração. Tarefas sem vencimento não têm penalidade. Pesos configuráveis em `src/utils/priority.ts`. Justificativas descrevem as regras aplicadas; não inferem dependências entre tarefas.

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
