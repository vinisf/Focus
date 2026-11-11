import type { RoutineData } from '../types/routine';
import type { ActivityRecommendation, RecommendationContext } from '../types/recommendations';
import { dateKey } from './dates';
export function routineForDay(data: RoutineData | undefined, now: Date) {
  if (!data?.preferences.enabled || !data.preferences.days.includes(now.getDay())) return null;
  const exception = data.exceptions.find((e) => e.date === dateKey(now));
  return {
    ...data.preferences,
    wake: exception?.wake ?? data.preferences.wake,
    windows: exception?.windows ?? data.preferences.windows,
    exception,
  };
}
export function routineActivities(c: RecommendationContext): ActivityRecommendation[] {
  const routine = routineForDay(c.routine, c.now);
  if (!routine || (c.filter && c.filter !== 'all')) return [];
  const clock = c.now.toTimeString().slice(0, 5);
  const minute = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return routine.windows
    .filter((w) => {
      const state = c.routine?.states.find((s) => s.date === dateKey(c.now) && s.id === w.id);
      return (
        (c.ignoreTimeConstraints || minute(clock) >= minute(w.start) - 15) &&
        !state?.done &&
        !(state && state.until > c.now.getTime()) &&
        !c.deferred?.some((d) => d.key === `routine:${w.id}` && d.until > c.now.getTime())
      );
    })
    .map((w) => ({
      type: 'routine',
      routine: w,
      key: `routine:${w.id}`,
      title: w.title,
      duration: null,
      tier: 1,
      // Favor the current window, then the most recent past window, without inventing urgency.
      score: (clock < w.end ? 65 : 60) + minute(w.start) / 1440,
      reason:
        clock >= w.end
          ? `Sua janela habitual de ${w.title.toLocaleLowerCase()} (${w.start}–${w.end}) já passou e este item ainda não está marcado como feito hoje. Se ainda fizer sentido, quer reservar esse momento?`
          : `Está próximo da sua janela habitual de ${w.title.toLocaleLowerCase()} (${w.start}–${w.end}). Se ainda fizer sentido, quer reservar esse momento?`,
    }));
}
