import { useRoutine } from '../stores/routine';
import { routineForDay } from '../utils/routine';
import { computed } from 'vue';
import { useTasks } from '../stores/tasks';
import { useHabits } from '../stores/habits';
import { useIema } from '../stores/iema';
import { usePlatforms } from '../stores/platforms';
import { usePlanning } from '../stores/planning';
import { useAssistant } from '../stores/assistant';
import { workedMinutes } from '../utils/planning';
import { addDays, dateKey } from '../utils/dates';
import { atTime } from '../utils/activityTiming';
import type { RecommendationContext } from '../types/recommendations';

/** A reactive snapshot of original stores; no activities are copied into other stores. */
export function useRecommendationContext(
  now: () => Date,
  minutes: () => number,
  freeUntil: () => string = () => '',
) {
  const tasks = useTasks(),
    habits = useHabits(),
    iema = useIema(),
    platforms = usePlatforms();
  const routineStore = useRoutine();
  const planning = usePlanning(),
    assistant = useAssistant();
  return computed<RecommendationContext>(() => {
    const clock = now(),
      today = dateKey(clock),
      settings = assistant.data;
    const routine = routineStore.blocked ? null : routineForDay(routineStore.data, clock);
    const dailyException = routineStore.blocked
      ? undefined
      : routineStore.data.exceptions.find((e) => e.date === today);
    const plan = settings.plans.find((p) => p.date === today);
    const entries = settings.plans.flatMap((p) =>
      p.entries.filter((e) => p.date === today || e.date === today),
    );
    let restUntil = planning.data.preferences.restUntil;
    const time = clock.toTimeString().slice(0, 5);
    const restIntervals: { start: string; end: string }[] = [];
    if (settings.restStart && settings.restEnd) {
      const overnight = settings.restStart > settings.restEnd;
      if (overnight)
        restIntervals.push(
          { start: '00:00', end: settings.restEnd },
          { start: settings.restStart, end: '23:59' },
        );
      else if (settings.restStart < settings.restEnd)
        restIntervals.push({ start: settings.restStart, end: settings.restEnd });
      const resting = overnight
        ? time >= settings.restStart || time < settings.restEnd
        : time >= settings.restStart && time < settings.restEnd;
      if (resting)
        restUntil = Math.max(
          restUntil ?? 0,
          atTime(
            overnight && time >= settings.restStart ? addDays(today, 1) : today,
            settings.restEnd,
          ),
        );
    }
    if (routine) {
      restIntervals.push(...routine.rest);
      if (routine.sleep > routine.wake)
        restIntervals.push(
          { start: '00:00', end: routine.wake },
          { start: routine.sleep, end: '23:59' },
        );
      else restIntervals.push({ start: routine.sleep, end: routine.wake });
    }
    return {
      routine: routineStore.blocked ? undefined : routineStore.data,
      tasks: tasks.blocked ? [] : tasks.data.tasks,
      habits: habits.blocked
        ? []
        : habits.data.habits
            .filter((h) => !dailyException?.skipHabitIds?.includes(h.id))
            .map((h) => {
              const entry = entries.find(
                (e) => e.key === `habit:${h.id}` && e.included && e.date === today && e.time,
              );
              return entry ? { ...h, preferredTime: entry.time } : h;
            }),
      tickets: iema.blocked ? [] : iema.recommendations,
      platforms: platforms.blocked ? [] : platforms.data.platforms,
      completions: habits.data.completions,
      progress: habits.data.progress,
      sessions: habits.data.sessions,
      preferences: { ...planning.data.preferences, restUntil },
      workMinutes: workedMinutes(planning.data.sessions, clock),
      plannedActivities: entries,
      integrationDailyLimit: tasks.data.integrationDailyLimit,
      imminentMinutes: settings.imminentMinutes,
      habitWindowMinutes: settings.habitWindowMinutes,
      now: clock,
      minutes: minutes(),
      freeUntil: freeUntil(),
      unavailable: [
        ...(plan?.unavailable ?? []),
        ...(dailyException?.unavailable ?? []),
        ...restIntervals,
      ],
      restWindows: restIntervals,
      deferred: entries
        .filter(
          (e) =>
            (!e.included || e.date > today) &&
            !tasks.data.tasks.some(
              (t) => `task:${t.id}` === e.key && t.dueDate && t.dueDate <= today,
            ),
        )
        .map((e) => ({ key: e.key, until: atTime(today, '23:59') })),
    };
  });
}
