<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useLifePlanning } from '../stores/lifePlanning';
import { snapshot } from '../services/fullBackup';
import {
  emptyImportOptions,
  importKey,
  parsePersonalPlan,
  PERSONAL_PLAN_LIMIT,
  previewPersonalPlan,
  samePlan,
  type ImportEntry,
} from '../services/personalPlanImport';
import type { LifePlanningData } from '../types/lifePlanning';
const store = useLifePlanning();
const incoming = ref<LifePlanningData | null>(null);
const base = ref<LifePlanningData | null>(null);
const options = ref(emptyImportOptions());
const prepared = ref(false);
const confirmed = ref(false);
const error = ref('');
const success = ref('');
let selection = 0;
const preview = computed(() =>
  incoming.value && base.value
    ? previewPersonalPlan(base.value, incoming.value, options.value)
    : null,
);
const stale = computed(() => !!base.value && !samePlan(base.value, store.data));
const differences = computed(
  () =>
    preview.value?.entries.filter(
      (e) => e.kind !== 'blocks' && e.existing && !samePlan(e.incoming, e.existing),
    ) ?? [],
);
const blocks = computed(() => preview.value?.entries.filter((e) => e.kind === 'blocks') ?? []);
const counts = computed(() => {
  const entries = preview.value?.entries ?? [];
  return {
    added: entries.filter((e) => e.outcome === 'new' || e.outcome === 'duplicated').length,
    identical: entries.filter((e) => e.outcome === 'identical').length,
    unresolved: entries.filter((e) => e.outcome === 'conflict').length,
    updated: entries.filter((e) => e.outcome === 'updated').length,
    kept: entries.filter((e) => e.outcome === 'kept').length,
    skipped: entries.filter((e) => e.outcome === 'skipped').length,
  };
});
const kindName = { areas: 'Área', goals: 'Meta', blocks: 'Bloco' };
const horizonName = { short: 'curto', medium: 'médio', long: 'longo' };
const statusName = {
  active: 'em andamento',
  paused: 'pausada',
  done: 'concluída',
  cancelled: 'cancelado',
  planned: 'planejado',
};
function label(entry: ImportEntry) {
  return 'name' in entry.incoming ? entry.incoming.name : entry.incoming.title;
}
function details(record: ImportEntry['incoming']): string[] {
  if ('name' in record) return [record.name];
  if ('milestones' in record)
    return [
      record.title,
      record.description,
      `Área: ${record.areaId} · Horizonte: ${horizonName[record.horizon]} · Prazo: ${record.dueDate || 'sem prazo'} · Status: ${statusName[record.status]}`,
      ...record.milestones.map((m) => `${m.done ? '✓' : '○'} ${m.title}`),
      `${record.taskIds.length} tarefas vinculadas: ${record.taskIds.join(', ')}`,
    ];
  return [
    record.title,
    record.description ?? '',
    `${record.date} · ${record.start ? `${record.start}–${record.end}` : 'sem horário'} · ${record.kind === 'fixed' ? 'compromisso fixo' : 'sugestão flexível'} · ${statusName[record.status]}`,
    `Meta: ${record.goalId || 'sem meta'}`,
  ];
}
function clear() {
  selection++;
  incoming.value = null;
  base.value = null;
  options.value = emptyImportOptions();
  prepared.value = false;
  confirmed.value = false;
}
watch(
  options,
  () => {
    prepared.value = false;
    confirmed.value = false;
  },
  { deep: true, flush: 'sync' },
);
onBeforeUnmount(clear);
async function select(event: Event) {
  clear();
  error.value = '';
  success.value = '';
  const token = selection;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > PERSONAL_PLAN_LIMIT) throw Error('O plano deve ter no máximo 5 MB.');
    const raw = await file.text();
    if (token !== selection) return;
    const plan = parsePersonalPlan(raw);
    base.value = JSON.parse(JSON.stringify(store.data));
    for (const b of plan.blocks)
      options.value.adjustments[importKey('blocks', b.id)] = {
        date: b.date,
        kind: b.kind,
        start: b.start,
        end: b.end,
      };
    incoming.value = plan;
  } catch (e) {
    if (token !== selection) return;
    error.value =
      e instanceof Error ? e.message : 'Não foi possível ler o plano. Nenhum dado foi alterado.';
  }
  if (token === selection) input.value = '';
}
function prepare() {
  if (stale.value || !preview.value?.changed || preview.value.issues.length || store.blocked)
    return;
  try {
    // Preserve all original bytes, even unrelated legacy data that may be unreadable.
    const before = snapshot();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(before, null, 2)], { type: 'application/json' }),
    );
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'focus-antes-importacao.json';
      a.click();
    } finally {
      URL.revokeObjectURL(url);
    }
    prepared.value = true;
    confirmed.value = false;
    error.value = '';
  } catch {
    error.value =
      'Não foi possível gerar o backup pré-importação. Nada foi aplicado. Confira o armazenamento e tente novamente.';
  }
}
function apply() {
  if (!prepared.value || !confirmed.value || !incoming.value || !base.value || stale.value) return;
  if (store.importPlan(incoming.value, options.value, base.value, confirmed.value)) {
    clear();
    error.value = '';
    success.value =
      'Plano importado. Seus dados anteriores foram preservados e as visualizações foram atualizadas.';
  } else error.value = store.error;
}
</script>
<template>
  <details class="personal-import">
    <summary>Importar plano pessoal</summary>
    <p>
      Selecione um JSON LifePlanningData versão 1 de até 5 MB. O arquivo fica no seu dispositivo,
      sem envio à rede. Esta importação mescla o plano; o backup focus-full é restaurado
      separadamente em Configurações.
    </p>
    <p v-if="error" role="alert" class="error-banner">{{ error }}</p>
    <p v-if="success" role="status">{{ success }}</p>
    <label
      >Arquivo do plano pessoal<input
        type="file"
        accept="application/json,.json"
        :disabled="store.blocked"
        @change="select"
    /></label>
    <section v-if="incoming && preview" aria-label="Prévia do plano pessoal">
      <h3>Prévia da importação</h3>
      <p>
        {{ incoming.areas.length }} áreas · {{ incoming.goals.length }} metas ·
        {{ incoming.goals.reduce((n, g) => n + g.milestones.length, 0) }} marcos ·
        {{ incoming.blocks.length }} blocos
      </p>
      <p aria-live="polite">
        {{ counts.added }} novos · {{ counts.identical }} duplicatas idênticas ·
        {{ counts.unresolved }} conflitos de ID pendentes · {{ counts.updated }} atualizações
        escolhidas · {{ counts.kept }} existentes mantidos · {{ counts.skipped }} ignorados
      </p>
      <details v-if="counts.added">
        <summary>Novos registros ({{ counts.added }})</summary>
        <ul>
          <li
            v-for="entry in preview.entries.filter(
              (e) => e.outcome === 'new' || e.outcome === 'duplicated',
            )"
            :key="entry.key"
          >
            <strong>{{ kindName[entry.kind] }}: {{ label(entry) }}</strong>
            <p v-for="(line, index) in details(entry.incoming)" :key="index">{{ line }}</p>
          </li>
        </ul>
      </details>
      <details v-if="counts.identical">
        <summary>Duplicatas idênticas ({{ counts.identical }})</summary>
        <ul>
          <li
            v-for="entry in preview.entries.filter((e) => e.outcome === 'identical')"
            :key="entry.key"
          >
            {{ kindName[entry.kind] }}: {{ label(entry) }} · sem alteração
          </li>
        </ul>
      </details>
      <p v-if="stale" role="alert">
        O planejamento mudou após selecionar o arquivo. Selecione novamente para revisar os dados
        atuais.
      </p>
      <fieldset :disabled="prepared || stale || store.blocked">
        <legend>Revisar mesclagem</legend>
        <label v-if="incoming.timezone !== base?.timezone"
          >Fuso após importar<select v-model="options.timezone">
            <option value="">Escolha o fuso</option>
            <option value="keep">Manter {{ base?.timezone }}</option>
            <option value="incoming">Usar {{ incoming.timezone }}</option>
          </select></label
        >
        <p>
          Fuso do arquivo: {{ incoming.timezone }}. Datas e horários permanecem como escritos, sem
          conversão. Nenhuma tarefa ou rotina será modificada.
        </p>
        <article v-for="entry in differences" :key="entry.key" class="import-conflict">
          <h4>{{ kindName[entry.kind] }}: {{ label(entry) }}</h4>
          <div class="import-comparison">
            <div>
              <strong>Existente</strong>
              <p v-for="(line, index) in details(entry.existing!)" :key="index">{{ line }}</p>
            </div>
            <div>
              <strong>Arquivo</strong>
              <p v-for="(line, index) in details(entry.incoming)" :key="index">{{ line }}</p>
            </div>
          </div>
          <label
            >Decisão para {{ label(entry)
            }}<select v-model="options.choices[entry.key]">
              <option :value="undefined">Escolha uma opção</option>
              <option value="keep">Manter existente</option>
              <option value="update">Atualizar com o arquivo</option>
              <option value="duplicate">Duplicar e remapear vínculos</option>
            </select></label
          >
        </article>
        <details v-if="blocks.length" open>
          <summary>Revisar blocos importados ({{ blocks.length }})</summary>
          <article v-for="entry in blocks" :key="entry.key" class="import-conflict">
            <h4>{{ label(entry) }}</h4>
            <p v-if="entry.existing && !samePlan(entry.incoming, entry.existing)">
              Este ID já existe com conteúdo diferente.
            </p>
            <details v-if="entry.existing">
              <summary>Comparar com o existente</summary>
              <p v-for="(line, index) in details(entry.existing)" :key="index">{{ line }}</p>
            </details>
            <p v-for="(line, index) in details(entry.incoming)" :key="index">{{ line }}</p>
            <label
              >Ação para {{ label(entry)
              }}<select v-model="options.choices[entry.key]">
                <option :value="undefined">
                  {{
                    entry.existing && !samePlan(entry.incoming, entry.existing)
                      ? 'Escolha uma opção'
                      : entry.existing
                        ? 'Já existe · manter'
                        : 'Adicionar novo bloco'
                  }}
                </option>
                <option v-if="entry.existing" value="keep">Manter existente</option>
                <option v-if="entry.existing" value="update">Atualizar com o arquivo</option>
                <option v-if="entry.existing" value="duplicate">Duplicar</option>
                <option value="skip">Ignorar este bloco</option>
              </select></label
            >
            <div v-if="options.choices[entry.key] !== 'skip'" class="life-inline">
              <label
                >Data de {{ label(entry)
                }}<input v-model="options.adjustments[entry.key]!.date" type="date"
              /></label>
              <label
                >Tipo de {{ label(entry)
                }}<select v-model="options.adjustments[entry.key]!.kind">
                  <option value="fixed">Fixo</option>
                  <option value="flexible">Flexível</option>
                </select></label
              >
              <label
                >Início de {{ label(entry)
                }}<input v-model="options.adjustments[entry.key]!.start" type="time"
              /></label>
              <label
                >Fim de {{ label(entry)
                }}<input v-model="options.adjustments[entry.key]!.end" type="time"
              /></label>
            </div>
          </article>
        </details>
      </fieldset>
      <ul v-if="preview.collisions.length" class="error-banner" aria-label="Colisões de horário">
        <li v-for="(collision, index) in preview.collisions" :key="index">
          {{ collision.first.date }}: {{ collision.first.title }} ({{ collision.first.start }}–{{
            collision.first.end
          }}) conflita com {{ collision.second.title }} ({{ collision.second.start }}–{{
            collision.second.end
          }}). Ajuste ou ignore o bloco do arquivo.
        </li>
      </ul>
      <ul v-if="preview.issues.length" aria-label="Pendências da importação">
        <li v-for="issue in preview.issues" :key="issue">{{ issue }}</li>
      </ul>
      <p v-if="!preview.changed && !preview.issues.length">
        Este plano já está presente. Nenhuma gravação é necessária.
      </p>
      <button
        v-if="!prepared"
        class="primary"
        :disabled="!preview.changed || !!preview.issues.length || stale || store.blocked"
        @click="prepare"
      >
        Gerar backup pré-importação
      </button>
      <div v-else>
        <p>
          O download do backup foi iniciado. Guarde-o antes de aplicar. Serão aplicadas somente as
          decisões revisadas acima.
        </p>
        <label
          ><input v-model="confirmed" type="checkbox" />Salvei o backup e confirmo a mesclagem
          revisada, incluindo as atualizações que escolhi.</label
        ><button class="primary" :disabled="!confirmed || stale || store.blocked" @click="apply">
          Aplicar importação</button
        ><button
          @click="
            prepared = false;
            confirmed = false;
          "
        >
          Voltar à revisão
        </button>
      </div>
      <button @click="clear">Cancelar importação</button>
    </section>
  </details>
</template>
