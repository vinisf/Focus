import { recommendationEngine } from '../services/RecommendationEngine';
import type { RecommendationContext } from '../types/recommendations';
import type { DayPlan } from '../stores/assistant';
import { atTime, normalizeActivity } from './activityTiming';
import { dateKey } from './dates';
import { routineForDay } from './routine';

export function planDay(context: RecommendationContext, options: Omit<DayPlan, 'entries'>) {
  const routine = routineForDay(context.routine, new Date(options.date + 'T12:00:00'));
  const start = atTime(options.date, options.start),
    end = atTime(options.date, options.end);
  const snapshot = {
    ...context,
    now: new Date(start),
    minutes: 1440,
    freeUntil: '',
    unavailable: [],
    ignoreTimeConstraints: true,
    deferred: [],
    preferences: context.preferences
      ? { ...context.preferences, restUntil: null, maxWorkMinutes: null }
      : undefined,
  };
  const activities = recommendationEngine
    .recommend(snapshot)
    .activities.filter((a) => a.type !== 'routine');
  for (const task of context.tasks) {
    if (
      task.mandatory &&
      task.scheduledTime &&
      (task.plannedDate || task.dueDate) === options.date &&
      ['pending', 'active'].includes(task.status) &&
      !activities.some((a) => a.key === `task:${task.id}`)
    ) {
      activities.push({
        type: 'task',
        task,
        key: `task:${task.id}`,
        title: task.title,
        duration: task.duration,
        tier: 0,
        score: 0,
        reason: 'Compromisso com horário obrigatório.',
      });
    }
  }
  const unavailable = [
    ...new Map(
      [...options.unavailable, ...(context.unavailable ?? []), ...(context.restWindows ?? [])].map(
        (i) => [`${i.start}:${i.end}`, i],
      ),
    ).values(),
  ];
  const occupied = unavailable.map((i) => ({
    start: atTime(options.date, i.start),
    end: atTime(options.date, i.end),
  }));
  const mealWindows = (routine?.windows ?? []).map((w) => ({
    start: atTime(options.date, w.start),
    end: atTime(options.date, w.end),
  }));
  const warnings: string[] = [];
  const mandatory = activities.filter(
    (a) =>
      normalizeActivity(a).mandatory &&
      normalizeActivity(a).scheduledAt !== null &&
      dateKey(new Date(normalizeActivity(a).scheduledAt!)) === options.date,
  );
  for (const a of mandatory) {
    const n = normalizeActivity(a),
      from = n.scheduledAt!,
      to = from + (a.duration ?? 0) * 60000;
    if (from < start || to > end || occupied.some((i) => from < i.end && to > i.start))
      warnings.push(`Confira o horário de “${a.title}”: há um conflito ou indisponibilidade.`);
    occupied.push({ start: from, end: to });
  }
  const minutes = Math.max(
    0,
    (end - start) / 60000 -
      unavailable.reduce(
        (s, i) => s + (atTime(options.date, i.end) - atTime(options.date, i.start)) / 60000,
        0,
      ),
  );
  let capacity = minutes * 0.7 - mandatory.reduce((s, a) => s + (a.duration ?? 0), 0);
  let work = mandatory.reduce((s, a) => {
    const source = normalizeActivity(a).source;
    return (
      s +
      (source === 'iema' ||
      source === 'platform' ||
      (a.type === 'task' && context.preferences?.workCategoryIds.includes(a.task.categoryId))
        ? (a.duration ?? 0)
        : 0)
    );
  }, 0);
  const entries = activities.map((a) => {
    const n = normalizeActivity(a);
    if (mandatory.includes(a)) {
      return {
        key: a.key,
        date: options.date,
        time: new Date(n.scheduledAt!).toTimeString().slice(0, 5),
        included: true,
      };
    }
    const isWork =
      n.source === 'platform' ||
      n.source === 'iema' ||
      (a.type === 'task' && context.preferences?.workCategoryIds.includes(a.task.categoryId));
    const limit = context.preferences?.maxWorkMinutes;
    const duration = a.duration;
    const entry = { key: a.key, date: options.date, time: '', included: false };
    if (n.mandatory) {
      warnings.push(
        `O horário de “${a.title}” ficou no passado. Revise a tarefa antes de planejar.`,
      );
      return entry;
    }
    if (
      duration === null ||
      duration > capacity ||
      (isWork && limit != null && work + duration > limit)
    )
      return entry;
    const preferred =
      a.type === 'habit' && a.habit.preferredTime
        ? atTime(options.date, a.habit.preferredTime)
        : n.scheduledAt;
    let cursor = preferred !== null && preferred >= start ? preferred : start;
    const workWindows =
      isWork && routine?.work.length
        ? routine.work.map((w) => ({
            start: atTime(options.date, w.start),
            end: atTime(options.date, w.end),
          }))
        : [];
    const fitWork = () => {
      if (!workWindows.length) return true;
      const window = workWindows
        .filter((w) => w.end >= Math.max(cursor, w.start) + duration * 60000)
        .sort((a, b) => a.start - b.start)[0];
      if (!window) return false;
      cursor = Math.max(cursor, window.start);
      return true;
    };
    if (!fitWork()) return entry;
    const conflicts = a.tier === 0 ? occupied : [...occupied, ...mealWindows];
    // Each failed position advances beyond an occupied interval, so this is bounded.
    for (let attempts = 0; attempts <= conflicts.length; attempts++) {
      const conflict = conflicts
        .filter((i) => cursor < i.end && cursor + duration * 60000 > i.start)
        .sort((a, b) => a.start - b.start)[0];
      if (!conflict) break;
      cursor = conflict.end;
      if (!fitWork()) return entry;
    }
    const finish = cursor + duration * 60000;
    if (finish > end || (n.deadlineAt !== null && n.deadlineAt >= start && finish > n.deadlineAt))
      return entry;
    occupied.push({ start: cursor, end: finish + 10 * 60000 });
    capacity -= duration + 10;
    if (isWork) work += duration;
    return { ...entry, time: new Date(cursor).toTimeString().slice(0, 5), included: true };
  });
  return { activities, warnings, plan: { ...options, unavailable, entries } satisfies DayPlan };
}
