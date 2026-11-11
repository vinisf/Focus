<script setup lang="ts">
import { computed } from 'vue';
import { Layers, Leaf } from 'lucide-vue-next';
import { useTasks } from '../stores/tasks';
import { useHabits } from '../stores/habits';
import { taskProductivity } from '../utils/productivity';
import { habitIsDue } from '../utils/habits';
import { compliance } from '../utils/metrics';
const props = defineProps<{ today: string }>();
const tasks = useTasks(),
  habits = useHabits();
const productivity = computed(() => taskProductivity(tasks.data.tasks, props.today));
const consistency = computed(() => {
  const due = habits.data.habits.filter((h) => habitIsDue(h, habits.data.completions, props.today));
  return compliance(
    due.filter((h) =>
      habits.data.completions.some((c) => c.habitId === h.id && c.date === props.today),
    ).length,
    due.length,
  );
});
</script>
<template>
  <section class="day-summary" aria-labelledby="day-summary-title">
    <div class="section-heading">
      <h2 id="day-summary-title">Resumo do dia</h2>
      <span>Duas dimensões, cada uma no seu espaço</span>
    </div>
    <div class="day-summary-grid">
      <article class="productivity-summary">
        <span class="summary-icon"><Layers :size="19" /></span>
        <div>
          <h3>Produtividade</h3>
          <template v-if="productivity.expected"
            ><strong
              >{{ productivity.done }} de {{ productivity.expected }} tarefas concluídas</strong
            >
            <p>{{ productivity.percent }}% das tarefas de hoje realizadas.</p>
            <div class="progress-track">
              <i :style="{ width: productivity.percent + '%' }" /></div></template
          ><template v-else
            ><strong>Sem tarefas planejadas hoje</strong>
            <p>Um dia com espaço. Seu valor vai além das entregas.</p></template
          >
        </div>
      </article>
      <article class="consistency-summary">
        <span class="summary-icon"><Leaf :size="19" /></span>
        <div>
          <h3>Consistência</h3>
          <template v-if="consistency.expected"
            ><strong
              >{{ consistency.done }} de {{ consistency.expected }} hábitos realizados</strong
            >
            <p>{{ consistency.percent }}% dos hábitos previstos cumpridos.</p>
            <div class="progress-track">
              <i :style="{ width: consistency.percent + '%' }" /></div></template
          ><template v-else
            ><strong>Nenhum hábito previsto hoje</strong>
            <p>Descanso também faz parte da sua rotina.</p></template
          >
        </div>
      </article>
    </div>
  </section>
</template>
