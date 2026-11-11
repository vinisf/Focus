import { defineStore } from 'pinia';
import { readonly, ref } from 'vue';
import { emptyLifePlanning, LifePlanningRepository } from '../services/lifePlanningRepository';
import type { Goal, LifeArea, LifePlanningData, WeeklyBlock } from '../types/lifePlanning';

export const useLifePlanning = defineStore('lifePlanning', () => {
  const data = ref(emptyLifePlanning());
  const error = ref('');
  const blocked = ref(false);
  let repository: LifePlanningRepository;
  try {
    repository = new LifePlanningRepository();
    data.value = repository.load();
  } catch {
    blocked.value = true;
    error.value =
      'Metas e semana indisponíveis. Os dados originais foram preservados; recarregue após corrigir o armazenamento.';
  }
  function commit(next: LifePlanningData): boolean {
    if (blocked.value) return false;
    try {
      const detached = JSON.parse(JSON.stringify(next)) as LifePlanningData;
      repository.save(detached);
      data.value = detached;
      error.value = '';
      return true;
    } catch (e) {
      error.value =
        'Não foi possível salvar metas e semana. ' +
        (e instanceof Error ? e.message : 'Confira o armazenamento.');
      return false;
    }
  }
  function saveArea(area: LifeArea) {
    return commit({
      ...data.value,
      areas: [...data.value.areas.filter((a) => a.id !== area.id), area],
    });
  }
  function removeArea(id: string) {
    if (data.value.goals.some((g) => g.areaId === id)) {
      error.value = 'Mova ou exclua as metas desta área antes de excluir.';
      return false;
    }
    return commit({ ...data.value, areas: data.value.areas.filter((a) => a.id !== id) });
  }
  function saveGoal(goal: Goal) {
    return commit({
      ...data.value,
      goals: [...data.value.goals.filter((g) => g.id !== goal.id), goal],
    });
  }
  function removeGoal(id: string) {
    return commit({
      ...data.value,
      goals: data.value.goals.filter((g) => g.id !== id),
      blocks: data.value.blocks.map((b) => (b.goalId === id ? { ...b, goalId: '' } : b)),
    });
  }
  function saveBlock(block: WeeklyBlock) {
    return commit({
      ...data.value,
      blocks: [...data.value.blocks.filter((b) => b.id !== block.id), block],
    });
  }
  return {
    data: readonly(data),
    error,
    blocked,
    saveArea,
    removeArea,
    saveGoal,
    removeGoal,
    saveBlock,
    setTimezone: (timezone: string) => commit({ ...data.value, timezone }),
    removeBlock: (id: string) =>
      commit({ ...data.value, blocks: data.value.blocks.filter((b) => b.id !== id) }),
  };
});
