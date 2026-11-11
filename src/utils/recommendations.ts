import { routineActivities, routineForDay } from './routine';
import { isMyActiveTicket } from './iema';
import type { Habit } from '../types/habits';
import type {
  ActivityRecommendation,
  RecommendationContext,
  RecommendationResult,
} from '../types/recommendations';
import { addDays, dateKey } from './dates';
import { isAvailableToday, rank } from './priority';
import { isHabitScheduled, planOn, weekStart } from './habits';
import { goalForDate, progressForDate } from './habitGoals';
import { integrationTasksForDay } from './integrationTasks';
import { normalizedName } from '../services/integrations/excel/import';
import {
  availableMinutes,
  criticalToken,
  normalizeActivity,
  temporalLimit,
  atTime,
} from './activityTiming';

export function isDeferred(key: string, context: RecommendationContext): boolean {
  return !!context.deferred?.some((d) => d.key === key && d.until > context.now.getTime());
}

/** Explicit user intervals only; no physiological recovery estimates. */
export function recoveryBlocked(habit: Habit, context: RecommendationContext): boolean {
  return [...context.completions, ...(context.sessions ?? [])].some((c) => {
    const previous = context.habits.find((h) => h.id === c.habitId);
    if (!previous) return false;
    const same = previous.id === habit.id;
    const conflict =
      previous.intensity === 'high' &&
      habit.intensity === 'high' &&
      !!habit.effort &&
      habit.effort !== 'other' &&
      previous.effort === habit.effort;
    if (!same && !conflict) return false;
    const hours = same
      ? (habit.minIntervalHours ?? 0)
      : Math.max(habit.minIntervalHours ?? 0, previous.minIntervalHours ?? 0);
    const elapsed = context.now.getTime() - Date.parse(c.completedAt);
    return elapsed >= 0 && elapsed < hours * 3600000;
  });
}

export function eligibleHabit(habit: Habit, context: RecommendationContext): boolean {
  const today = dateKey(context.now);
  if (
    habit.status !== 'active' ||
    !isHabitScheduled(habit, today) ||
    isDeferred(`habit:${habit.id}`, context) ||
    recoveryBlocked(habit, context) ||
    (habit.duration !== undefined && habit.duration > context.minutes)
  )
    return false;
  const records = context.completions.filter((c) => c.habitId === habit.id && c.date <= today);
  const todayDone = records.some((c) => c.date === today);
  if (
    !habit.allowMultipleSessions &&
    context.sessions?.some(
      (s) => s.habitId === habit.id && dateKey(new Date(s.completedAt)) === today,
    )
  )
    return false;
  const frequency = planOn(habit, today)!.frequency;
  if (frequency.kind !== 'weekly') return !todayDone;
  const count = new Set(records.filter((c) => c.date >= weekStart(today)).map((c) => c.date)).size;
  // Existing weekly goals count distinct days, preserving consistency metrics.
  if (todayDone || count >= frequency.target) return false;
  const elapsed = ((context.now.getDay() + 6) % 7) + 1;
  const expectedByToday = Math.ceil((frequency.target * elapsed) / 7);
  return count < expectedByToday;
}

export function isHabitPreferredTime(habit: Habit, now: Date, window = 60): boolean {
  const preferred = habit.preferredTime
    ? Number(habit.preferredTime.slice(0, 2)) * 60 + Number(habit.preferredTime.slice(3))
    : null;
  const clock = now.getHours() * 60 + now.getMinutes();
  return preferred !== null && Math.abs(clock - preferred) <= window;
}

export function scoreHabit(habit: Habit, context: RecommendationContext): ActivityRecommendation {
  const today = dateKey(context.now);
  const frequency = planOn(habit, today)!.frequency;
  const count = new Set(
    context.completions
      .filter((c) => c.habitId === habit.id && c.date >= weekStart(today) && c.date <= today)
      .map((c) => c.date),
  ).size;
  const remaining = frequency.kind === 'weekly' ? frequency.target - count : 1;
  const daysLeft = 7 - ((context.now.getDay() + 6) % 7);
  const goal = goalForDate(habit, today, context.completions);
  const progress = progressForDate(habit, today, context.completions, context.progress ?? []);
  const nearTime = isHabitPreferredTime(habit, context.now, context.habitWindowMinutes);
  const reason =
    frequency.kind === 'weekly'
      ? `Faltam ${remaining} realizações de “${habit.name}” para a meta semanal; restam ${daysLeft} dias nesta semana.`
      : progress > 0 && goal.kind === 'quantity'
        ? `Você realizou ${progress} de ${goal.target} ${goal.unit} de “${habit.name}” hoje.`
        : `“${habit.name}” ainda não foi realizado hoje${frequency.kind === 'weekdays' ? ', um dos dias configurados' : ''}.`;
  return {
    type: 'habit',
    habit,
    key: `habit:${habit.id}`,
    title: habit.name,
    duration: habit.duration ?? null,
    reason: reason + (nearTime ? ' Este é seu horário preferencial.' : ''),
    tier: nearTime || (frequency.kind === 'weekly' && remaining >= daysLeft) ? 1 : 2,
    score:
      40 + (nearTime ? 20 : 0) + (frequency.kind === 'weekly' ? (remaining / daysLeft) * 20 : 15),
  };
}

export function recommendActivities(context: RecommendationContext): RecommendationResult {
  const activities: ActivityRecommendation[] = [];
  const today = dateKey(context.now);
  const preferences = context.preferences;
  if (preferences?.restUntil && preferences.restUntil > context.now.getTime())
    return {
      activities: [],
      rest: {
        type: 'rest',
        title: 'Tempo para uma pausa.',
        reason: 'Você escolheu descansar. As sugestões voltam ao encerrar a pausa.',
      },
    };
  if (Number.isFinite(context.minutes) && context.minutes > 0) {
    const dailyIntegrations = new Set(
      integrationTasksForDay(
        context.tasks.filter(
          (task) => task.status === 'done' || !isDeferred(`task:${task.id}`, context),
        ),
        context.now,
        context.integrationDailyLimit,
      ).map((t) => t.id),
    );
    for (const t of context.tasks) {
      if (t.integrationName && t.dueDate && t.dueDate <= today) dailyIntegrations.add(t.id);
    }
    if (!context.filter || ['all', 'task', 'platform'].includes(context.filter))
      for (const task of context.tasks) {
        const source = task.integrationName ? 'platform' : 'task';
        if (
          (context.filter && context.filter !== 'all' && context.filter !== source) ||
          (task.integrationName && !dailyIntegrations.has(task.id)) ||
          preferences?.excludedSources.includes(source) ||
          !['pending', 'active'].includes(task.status) ||
          task.blocked ||
          (!isAvailableToday(task, context.now) && !(task.dueDate && task.dueDate <= today)) ||
          task.duration > context.minutes ||
          isDeferred(`task:${task.id}`, context)
        )
          continue;
        const ranked = rank(task, context.minutes, context.now);
        const urgent =
          task.priority === 'urgent' ||
          (task.importance === 'high' && !!task.dueDate && task.dueDate <= addDays(today, 3));
        activities.push({
          type: 'task',
          task,
          key: `task:${task.id}`,
          title: task.title,
          duration: task.duration,
          reason: ranked.reason,
          tier:
            (task.dueDate && task.dueDate <= today) || urgent
              ? 0
              : task.importance === 'high' || task.priority === 'high' || task.status === 'active'
                ? 1
                : task.importance === 'low'
                  ? 3
                  : task.plannedDate && task.plannedDate <= today
                    ? 2
                    : 3,
          score: ranked.score,
        });
      }
    const pendingToday = context.tasks.some(
      (task) =>
        ['pending', 'active'].includes(task.status) &&
        isAvailableToday(task, context.now) &&
        (!task.integrationName || dailyIntegrations.has(task.id)) &&
        (!task.dueDate ||
          task.dueDate <= today ||
          (!!task.plannedDate && task.plannedDate <= today)),
    );
    if (!context.filter || context.filter === 'all' || context.filter === 'habit')
      for (const habit of context.habits) {
        if (
          eligibleHabit(habit, context) &&
          (!context.habitsWhenTimelyOrTasksDone ||
            !pendingToday ||
            isHabitPreferredTime(habit, context.now))
        )
          activities.push(scoreHabit(habit, context));
      }
  }
  if (
    Number.isFinite(context.minutes) &&
    context.minutes > 0 &&
    (!context.filter || context.filter === 'all' || context.filter === 'iema')
  ) {
    for (const ticket of context.tickets ?? []) {
      if (
        !isMyActiveTicket(ticket) ||
        isDeferred(ticket.key, context) ||
        (ticket.estimate !== null && ticket.estimate > context.minutes)
      )
        continue;
      const age = ticket.updated_at
        ? Math.max(0, context.now.getTime() - Date.parse(ticket.updated_at)) / 86400000
        : 0;
      const knownUrgency =
        typeof ticket.priority === 'string' &&
        ['urgent', 'urgente', 'critical', 'crítica', 'high', 'alta'].includes(
          ticket.priority.toLocaleLowerCase(),
        );
      activities.push({
        type: 'iema',
        ticket,
        key: ticket.key,
        title: ticket.title,
        duration: ticket.estimate,
        tier: knownUrgency ? 1 : ticket.mine ? 2 : 3,
        score: (ticket.mine ? 35 : 10) + Math.min(age, 30) / 100,
        reason:
          (ticket.mine
            ? 'Este chamado está vinculado a você. Considere avançar nele antes de assumir uma nova demanda.'
            : 'Há uma demanda disponível para avaliação no IEMA.') +
          (ticket.estimate === null
            ? ' Duração desconhecida; confirme se cabe no tempo disponível.'
            : ' A estimativa local cabe no intervalo informado.') +
          ' Dados da última sincronização.',
      });
    }
  }
  if (
    Number.isFinite(context.minutes) &&
    context.minutes > 0 &&
    (!context.filter || context.filter === 'all' || context.filter === 'platform')
  ) {
    for (const platform of context.platforms ?? []) {
      if (
        context.tasks.some(
          (t) =>
            t.integrationName &&
            normalizedName(t.integrationName) === normalizedName(platform.name),
        ) ||
        !['pending', 'analysis', 'development', 'review'].includes(platform.status) ||
        platform.archived ||
        !platform.nextAction.trim() ||
        platform.blocked ||
        isDeferred(platform.key, context) ||
        (platform.estimate !== null && platform.estimate > context.minutes)
      )
        continue;
      const urgent =
        platform.priority === 'urgent' || (!!platform.dueDate && platform.dueDate <= today);
      activities.push({
        type: 'platform',
        platform,
        key: platform.key,
        title: `${platform.name}: ${platform.nextAction}`,
        duration: platform.estimate,
        tier: urgent ? 0 : platform.priority === 'high' ? 1 : platform.priority === 'low' ? 3 : 2,
        score:
          (platform.status === 'development' ? 35 : platform.status === 'analysis' ? 25 : 10) +
          (platform.complexity === 'low' ? 3 : platform.complexity === 'medium' ? 1 : 0),
        reason:
          `Próxima ação: ${platform.nextAction}. ` +
          (platform.priority ? 'Importância informada no Focus. ' : 'Importância não informada. ') +
          (platform.complexity
            ? `Complexidade estimada: ${{ low: 'baixa', medium: 'média', high: 'alta' }[platform.complexity]}. `
            : 'Complexidade não informada. ') +
          (platform.estimate === null
            ? 'Duração desconhecida; confirme se cabe no tempo disponível.'
            : 'A duração estimada cabe no intervalo disponível.'),
      });
    }
  }
  activities.push(...routineActivities(context));
  const routine = routineForDay(context.routine, context.now);
  const isWork = (a: ActivityRecommendation) =>
    a.type === 'iema' ||
    a.type === 'platform' ||
    (a.type === 'task' &&
      (!!a.task.integrationName || !!preferences?.workCategoryIds.includes(a.task.categoryId)));
  const remaining =
    preferences?.maxWorkMinutes === null || preferences?.maxWorkMinutes === undefined
      ? null
      : Math.max(0, preferences.maxWorkMinutes - Math.max(0, context.workMinutes ?? 0));
  const eligible = activities.filter((a) => {
    const planned = context.plannedActivities?.find(
      (e) => e.key === a.key && e.included && e.date === today && e.time,
    );
    if (planned) a.plannedAt = atTime(planned.date, planned.time);
    const normalized = normalizeActivity(a);
    const clock = context.now.toTimeString().slice(0, 5);
    if (
      !context.ignoreTimeConstraints &&
      routine &&
      isWork(a) &&
      routine.work.length &&
      !routine.work.some(
        (w) =>
          clock >= w.start &&
          clock < w.end &&
          a.duration !== null &&
          context.now.getTime() + a.duration * 60000 <= atTime(today, w.end),
      )
    )
      return false;
    const time = availableMinutes(context, a.key);
    if (
      !context.ignoreTimeConstraints &&
      (time <= 0 ||
        (a.duration !== null && a.duration > time) ||
        (a.type !== 'routine' && a.duration === null && time < context.minutes) ||
        (normalized.mandatory &&
          normalized.scheduledAt !== null &&
          normalized.scheduledAt > context.now.getTime() + (context.imminentMinutes ?? 15) * 60000))
    )
      return false;
    if (criticalToken(a, context)) {
      a.tier = 0;
      if (a.type === 'task')
        a.reason =
          normalized.mandatory &&
          normalized.scheduledAt !== null &&
          normalized.scheduledAt <= context.now.getTime() + (context.imminentMinutes ?? 15) * 60000
            ? 'Seu compromisso está próximo. Este horário merece atenção agora.'
            : !a.task.dueDate && a.task.priority === 'urgent'
              ? 'Você marcou esta tarefa como urgente.'
              : a.task.dueDate < today
                ? 'O prazo desta tarefa já passou. Considere retomá-la com calma.'
                : 'Esta tarefa vence hoje, por isso merece atenção.';
    }
    if (
      !criticalToken(a, context) &&
      normalized.scheduledAt !== null &&
      Math.abs(normalized.scheduledAt - context.now.getTime()) <=
        (context.habitWindowMinutes ?? 60) * 60000
    )
      a.tier = Math.min(a.tier, 1);
    if (
      preferences?.excludedSources.includes(
        a.type === 'task' && a.task.integrationName ? 'platform' : a.type,
      )
    )
      return false;
    if (
      preferences?.categoryIds.length &&
      (a.type === 'task' || a.type === 'habit') &&
      !preferences.categoryIds.includes(
        a.type === 'task' ? a.task.categoryId : (a.habit.categoryId ?? ''),
      )
    )
      return false;
    // Unknown effort cannot be promised to fit an explicit daily work budget.
    if (
      remaining !== null &&
      isWork(a) &&
      (remaining <= 0 || a.duration === null || a.duration > remaining)
    )
      return false;
    return true;
  });
  const preferred = (a: ActivityRecommendation) =>
    a.duration !== null &&
    ((preferences?.style === 'quick' && a.duration <= 30) ||
      (preferences?.style === 'deep' && a.duration >= 45))
      ? 1
      : 0;
  eligible.sort(
    (a, b) =>
      a.tier - b.tier ||
      (a.tier === 0
        ? temporalLimit(a, context) - temporalLimit(b, context) ||
          normalizeActivity(b).priority - normalizeActivity(a).priority ||
          normalizeActivity(b).importance - normalizeActivity(a).importance
        : 0) ||
      preferred(b) - preferred(a) ||
      b.score - a.score ||
      (context.plannedActivities?.findIndex((e) => e.key === a.key && e.included) ?? -1) -
        (context.plannedActivities?.findIndex((e) => e.key === b.key && e.included) ?? -1) ||
      a.key.localeCompare(b.key),
  );
  return {
    activities: [...new Map(eligible.map((a) => [a.key, a])).values()].slice(
      0,
      context.maxRecommendations ?? 4,
    ),
    rest: {
      type: 'rest',
      title:
        context.tasks.some(
          (t) => ['pending', 'active'].includes(t.status) && isAvailableToday(t, context.now),
        ) ||
        context.habits.some(
          (h) =>
            h.status === 'active' &&
            isHabitScheduled(h, today) &&
            !context.completions.some((c) => c.habitId === h.id && c.date === today),
        ) ||
        (context.tickets?.length ?? 0) > 0 ||
        (context.platforms?.length ?? 0) > 0
          ? 'Tempo para uma pausa.'
          : 'Por hoje, tudo em dia.',
      reason:
        'Nenhuma atividade está adequada aos filtros, ao tempo e às restrições atuais. Pode descansar ou aproveitar seu tempo livre.',
    },
  };
}
