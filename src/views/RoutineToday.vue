<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import RoutineSettings from '../components/RoutineSettings.vue';

defineProps<{ date: string }>();
defineEmits<{ back: [] }>();
</script>

<template>
  <section class="routine-day-page" aria-label="Ajustes da rotina do dia">
    <button class="text-button" @click="$emit('back')">
      <ArrowLeft :size="16" aria-hidden="true" />Voltar
    </button>
    <div class="routine-day-content">
      <p class="routine-day-note">
        Ajuste os horários, deixe um hábito para outro dia ou reserve um tempo livre. As alterações
        valem somente para a data escolhida, a menos que você escolha atualizar a rotina padrão.
      </p>
      <RoutineSettings today-only :date="date" />
    </div>
  </section>
</template>

<style scoped>
.routine-day-page {
  max-width: 760px;
}
.routine-day-content {
  margin-top: 16px;
  padding: clamp(16px, 4vw, 28px);
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--panel);
}
.routine-day-note {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}
</style>
