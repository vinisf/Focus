<script setup lang="ts">
import { computed } from 'vue';
import { usePlanning } from '../stores/planning';
import { workedMinutes } from '../utils/planning';
const props = defineProps<{ now: Date }>();
const planning = usePlanning();
const worked = computed(() => workedMinutes(planning.data.sessions, props.now));
const elapsed = computed(() =>
  planning.running
    ? Math.max(0, (props.now.getTime() - Date.parse(planning.running.startedAt)) / 60000)
    : 0,
);
</script>
<template>
  <div class="work-session">
    <p>
      Trabalho registrado hoje: {{ Math.floor(worked) }} min<span
        v-if="planning.data.preferences.maxWorkMinutes !== null"
      >
        · Limite desejado: {{ planning.data.preferences.maxWorkMinutes }} min</span
      >
    </p>
    <template v-if="planning.running">
      <p aria-live="polite">
        Sessão profissional em andamento: {{ Math.floor(elapsed) }} min. Encerre ao parar de
        trabalhar; o cronômetro continua após fechar o Focus.
      </p>
      <button @click="planning.stop()">Encerrar sessão e registrar duração</button>
      <p v-if="elapsed >= 60">
        Você está nesta sessão há um tempo. Uma pausa pode ajudar; retome quando fizer sentido.
      </p>
    </template>
    <p v-else>
      O tempo contabiliza sessões iniciadas e encerradas no Focus, não estimativas nem trabalho
      feito fora dele.
    </p>
    <p v-if="planning.error" role="alert">{{ planning.error }}</p>
  </div>
</template>
<style scoped>
.work-session {
  margin: 14px 0;
  font-size: 12px;
}
p {
  margin: 8px 0;
}
button {
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 8px;
}
</style>
