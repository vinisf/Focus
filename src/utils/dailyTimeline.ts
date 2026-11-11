import type { DeepReadonly } from 'vue';
import type { LifePlanningData } from '../types/lifePlanning';
export function dailyTimeline(data: DeepReadonly<LifePlanningData>, date: string) {
  const active = data.blocks.filter((b) => b.date === date && b.status === 'planned');
  const byTitle = (a: (typeof active)[number], b: (typeof active)[number]) =>
    a.title.localeCompare(b.title, 'pt-BR') || a.id.localeCompare(b.id);
  return {
    timed: active
      .filter((b) => b.start)
      .sort((a, b) => a.start.localeCompare(b.start) || byTitle(a, b)),
    flexible: active.filter((b) => !b.start).sort(byTitle),
  };
}
