<script setup lang="ts">
import { ref } from 'vue';
import { usePlatforms } from '../stores/platforms';
import { usePlanning } from '../stores/planning';
import { platformStatuses, platformStatusLabels, suggestedActions } from '../types/platforms';
import type { Platform, PlatformStatus } from '../types/platforms';
const props = defineProps<{ platform: Platform }>();
const platforms = usePlatforms();
const planning = usePlanning();
const step = ref('');
function text(event: Event) {
  return (event.target as HTMLInputElement).value;
}
function addStep(title: string) {
  if (!title.trim()) return;
  if (
    platforms.update(props.platform.key, {
      steps: [
        ...(props.platform.steps ?? []),
        { id: crypto.randomUUID(), title: title.trim(), done: false },
      ],
    })
  )
    step.value = '';
}
function editStep(id: string, fields: { title?: string; done?: boolean }) {
  platforms.update(props.platform.key, {
    steps: props.platform.steps?.map((s) => (s.id === id ? { ...s, ...fields } : s)),
  });
}
</script>
<template>
  <article class="platform-card">
    <h3>{{ platform.name }}</h3>
    <p>{{ platformStatusLabels[platform.status] }}{{ platform.archived ? ' · Arquivada' : '' }}</p>
    <fieldset :disabled="platforms.blocked">
      <legend>Cadastro e acompanhamento local</legend>
      <label
        >Nome da plataforma<input
          :value="platform.name"
          @change="platforms.update(platform.key, { name: text($event).trim() })"
      /></label>
      <label
        >Status<select
          :value="platform.status"
          @change="platforms.update(platform.key, { status: text($event) as PlatformStatus })"
        >
          <option v-for="s in platformStatuses" :key="s" :value="s">
            {{ platformStatusLabels[s] }}
          </option>
        </select></label
      >
      <label
        >Importância<select
          :value="platform.priority ?? ''"
          @change="
            platforms.update(platform.key, {
              priority: (text($event) || null) as Platform['priority'],
            })
          "
        >
          <option value="">Não informada</option>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
          <option value="urgent">Urgente</option>
        </select></label
      >
      <label
        >Complexidade estimada<select
          :value="platform.complexity ?? ''"
          @change="
            platforms.update(platform.key, {
              complexity: (text($event) || null) as Platform['complexity'],
            })
          "
        >
          <option value="">Não informada</option>
          <option value="low">Baixa</option>
          <option value="medium">Média</option>
          <option value="high">Alta</option>
        </select></label
      >
      <label
        >Duração estimada em minutos<input
          type="number"
          min="1"
          max="10080"
          :value="platform.estimate ?? ''"
          @change="
            platforms.update(platform.key, {
              estimate: text($event).trim() ? Number(text($event)) : null,
            })
          "
      /></label>
      <label
        >Link da documentação (HTTPS)<input
          type="url"
          :value="platform.documentation ?? ''"
          @change="platforms.update(platform.key, { documentation: text($event).trim() || null })"
      /></label>
      <button v-if="platform.documentation" @click="platforms.open(platform.documentation)">
        Abrir documentação
      </button>
      <p v-if="platform.notes">Observações anteriores: {{ platform.notes }}</p>
      <label
        >Observações<textarea
          :value="platform.localNotes"
          @change="platforms.update(platform.key, { localNotes: text($event) })"
        />
      </label>
      <label
        >Próxima ação<input
          :value="platform.nextAction"
          @change="platforms.update(platform.key, { nextAction: text($event) })"
      /></label>
      <label class="platform-check"
        ><input
          type="checkbox"
          :checked="platform.blocked"
          @change="
            platforms.update(platform.key, { blocked: ($event.target as HTMLInputElement).checked })
          "
        />Bloqueada</label
      >
      <label v-if="platform.status === 'done'"
        >Data de conclusão<input
          type="date"
          :value="platform.completedDate ?? ''"
          @change="platforms.update(platform.key, { completedDate: text($event) || null })"
      /></label>
      <label
        >Registro de progresso<textarea
          :value="platform.progress"
          @change="platforms.update(platform.key, { progress: text($event) })"
        />
      </label>
      <p>
        Etapas opcionais: adicione apenas as que fizerem sentido. Nenhuma é obrigatória ou concluída
        automaticamente.
      </p>
      <div v-for="s in platform.steps ?? []" :key="s.id">
        <label class="platform-check"
          ><input
            type="checkbox"
            :checked="s.done"
            @change="editStep(s.id, { done: ($event.target as HTMLInputElement).checked })"
          />Concluída</label
        >
        <label
          >Etapa<input :value="s.title" @change="editStep(s.id, { title: text($event) })"
        /></label>
        <button
          @click="
            platforms.update(platform.key, {
              steps: platform.steps?.filter((item) => item.id !== s.id),
            })
          "
        >
          Remover etapa
        </button>
      </div>
      <label>Nova etapa<input v-model="step" /></label
      ><button @click="addStep(step)">Adicionar etapa</button>
      <details>
        <summary>Sugestões de etapas</summary>
        <button v-for="action in suggestedActions" :key="action" @click="addStep(action)">
          Adicionar: {{ action }}
        </button>
      </details>
      <button @click="platforms.update(platform.key, { archived: !platform.archived })">
        {{ platform.archived ? 'Reativar plataforma' : 'Arquivar plataforma' }}
      </button>
      <button
        :disabled="
          !platform.nextAction.trim() ||
          platform.archived ||
          platform.blocked ||
          !['pending', 'analysis', 'development', 'review'].includes(platform.status) ||
          !!planning.running
        "
        @click="planning.start(platform.key, 'platform', new Date(), platform.estimate)"
      >
        Iniciar sessão de trabalho
      </button>
    </fieldset>
    <p v-if="planning.running?.key === platform.key">
      Sessão em andamento. Encerre-a no controle de sessões para registrar o tempo.
    </p>
    <p v-if="planning.error || platforms.error" role="alert">
      {{ platforms.error || planning.error }}
    </p>
  </article>
</template>
<style scoped>
.platform-card {
  border: 1px solid var(--line);
  padding: 18px;
  border-radius: 12px;
  margin: 12px 0;
  overflow-wrap: anywhere;
}
h3 {
  font-size: 17px;
}
p {
  margin: 10px 0;
  font-size: 13px;
}
.platform-meta {
  color: var(--muted);
}
fieldset {
  margin-top: 16px;
  border: 1px solid var(--line);
  padding: 12px;
  border-radius: 8px;
  min-width: 0;
}
legend {
  font-size: 12px;
}
label {
  display: grid;
  gap: 6px;
  margin: 12px 0;
  font-size: 13px;
}
input,
textarea,
select {
  width: 100%;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--input);
  color: inherit;
}
textarea {
  min-height: 70px;
  resize: vertical;
}
.platform-check {
  display: flex;
  align-items: center;
}
.platform-check input {
  width: auto;
}
button {
  padding: 10px;
  margin: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
button:disabled {
  opacity: 0.5;
}
</style>
