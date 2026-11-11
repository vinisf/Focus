import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Habit, HabitData } from '../types/habits';
import { LocalHabitRepository, validHabit, validLocalDate } from '../services/habitRepository';
import { dateKey } from '../utils/dates';
import { isHabitScheduled } from '../utils/habits';
import { goalForDate } from '../utils/habitGoals';
import { eligibleHabit } from '../utils/recommendations';

export const useHabits = defineStore('habits', () => {
  const repository = new LocalHabitRepository();
  const data = ref<HabitData>({ version: 1, habits: [], completions: [], progress: [] });
  const error = ref('');
  const blocked = ref(false);
  try {
    const saved = repository.load();
    if (saved) data.value = saved;
  } catch {
    blocked.value = true;
    error.value =
      'Não foi possível ler os hábitos salvos. O histórico original foi preservado. Exporte uma cópia antes de recuperar o armazenamento.';
  }
  watch(
    data,
    () => {
      if (blocked.value) return;
      try {
        repository.save(data.value);
        error.value = '';
      } catch {
        error.value =
          'Não foi possível salvar os hábitos. Exporte uma cópia para preservar as alterações.';
      }
    },
    { deep: true, flush: 'sync' },
  );

  function save(habit: Habit, now = new Date()): boolean {
    if (blocked.value) return false;
    const original = data.value.habits.find((h) => h.id === habit.id);
    const value = JSON.parse(JSON.stringify(habit)) as Habit;
    value.name = value.name.trim();
    if (original) {
      value.createdAt = original.createdAt;
      value.status = original.status;
      value.plans = JSON.parse(JSON.stringify(original.plans));
      if (
        JSON.stringify(value.frequency) !== JSON.stringify(original.frequency) ||
        JSON.stringify(value.goal) !== JSON.stringify(original.goal)
      ) {
        const today = dateKey(now);
        value.plans = value.plans.filter((p) => p.from < today);
        value.plans.push({
          from: today,
          frequency: value.frequency,
          active: value.status === 'active',
          ...(value.goal ? { goal: value.goal } : {}),
        });
      }
    }
    if (!validHabit(value)) return false;
    if (original) data.value.habits[data.value.habits.indexOf(original)] = value;
    else data.value.habits.push(value);
    return true;
  }

  function archive(id: string, now = new Date()) {
    if (blocked.value) return;
    const habit = data.value.habits.find((h) => h.id === id);
    if (!habit) return;
    const today = dateKey(now);
    const active = habit.status === 'archived';
    const plans = habit.plans.filter((p) => p.from < today);
    plans.push({
      from: today,
      frequency: JSON.parse(JSON.stringify(habit.frequency)),
      active,
      ...(habit.goal ? { goal: JSON.parse(JSON.stringify(habit.goal)) } : {}),
    });
    const updated: Habit = { ...habit, status: active ? 'active' : 'archived', plans };
    data.value.habits[data.value.habits.indexOf(habit)] = updated;
  }

  function setCompleted(
    habitId: string,
    date: string,
    completed: boolean,
    now = new Date(),
  ): boolean {
    if (blocked.value || !validLocalDate(date) || date > dateKey(now)) return false;
    const habit = data.value.habits.find((h) => h.id === habitId);
    if (!habit || date < dateKey(new Date(habit.createdAt))) return false;
    const index = data.value.completions.findIndex((c) => c.habitId === habitId && c.date === date);
    if (!completed) {
      if (index >= 0) data.value.completions.splice(index, 1);
      data.value.progress = (data.value.progress ?? []).filter(
        (p) => p.habitId !== habitId || p.date !== date,
      );
      return true;
    }
    if (index >= 0) return true;
    if (!isHabitScheduled(habit, date)) return false;
    const goal = goalForDate(habit, date, data.value.completions);
    if (goal.kind === 'quantity') return setProgress(habitId, date, goal.target, now);
    data.value.completions.push({
      id: crypto.randomUUID(),
      habitId,
      date,
      completedAt: now.toISOString(),
      goal: JSON.parse(JSON.stringify(goal)),
    });
    return true;
  }
  function setProgress(habitId: string, date: string, value: number, now = new Date()): boolean {
    if (
      blocked.value ||
      !validLocalDate(date) ||
      date > dateKey(now) ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1e9
    )
      return false;
    const habit = data.value.habits.find((h) => h.id === habitId);
    if (!habit || date < dateKey(new Date(habit.createdAt))) return false;
    const completion = data.value.completions.find((c) => c.habitId === habitId && c.date === date);
    const previousProgress = data.value.progress?.some(
      (p) => p.habitId === habitId && p.date === date,
    );
    const goal = goalForDate(habit, date, data.value.completions);
    if (
      goal.kind !== 'quantity' ||
      (!completion && !previousProgress && !isHabitScheduled(habit, date))
    )
      return false;
    const progress = (data.value.progress ?? []).filter(
      (p) => p.habitId !== habitId || p.date !== date,
    );
    if (value > 0) progress.push({ habitId, date, value, updatedAt: now.toISOString() });
    const completions = data.value.completions.filter(
      (c) => c.habitId !== habitId || c.date !== date,
    );
    if (value >= goal.target)
      completions.push({
        id: completion?.id ?? crypto.randomUUID(),
        habitId,
        date,
        completedAt: completion?.completedAt ?? now.toISOString(),
        goal: JSON.parse(JSON.stringify(goal)),
        value,
      });
    // Persist progress and completion together so a partial amount is never counted as done.
    data.value = { ...data.value, progress, completions };
    return true;
  }
  function recordSession(habitId: string, amount: number, now = new Date()): boolean {
    const habit = data.value.habits.find((h) => h.id === habitId);
    const today = dateKey(now);
    if (!habit || blocked.value || !Number.isFinite(amount) || amount <= 0) return false;
    if (
      !eligibleHabit(habit, {
        tasks: [],
        habits: data.value.habits,
        completions: data.value.completions,
        sessions: data.value.sessions,
        now,
        minutes: Infinity,
      })
    )
      return false;
    if (
      !habit.allowMultipleSessions &&
      data.value.sessions?.some(
        (s) => s.habitId === habitId && dateKey(new Date(s.completedAt)) === today,
      )
    )
      return false;
    const goal = goalForDate(habit, today, data.value.completions);
    const previous =
      data.value.progress?.find((p) => p.habitId === habitId && p.date === today)?.value ?? 0;
    const saved =
      goal.kind === 'quantity'
        ? setProgress(habitId, today, previous + amount, now)
        : setCompleted(habitId, today, true, now);
    if (saved)
      data.value.sessions = [
        ...(data.value.sessions ?? []),
        { habitId, completedAt: now.toISOString() },
      ];
    return saved;
  }
  function remove(id: string): boolean {
    if (blocked.value || !data.value.habits.some((h) => h.id === id)) return false;
    const updated: HabitData = {
      ...data.value,
      habits: data.value.habits.filter((h) => h.id !== id),
      completions: data.value.completions.filter((c) => c.habitId !== id),
      progress: (data.value.progress ?? []).filter((p) => p.habitId !== id),
      sessions: (data.value.sessions ?? []).filter((s) => s.habitId !== id),
    };
    try {
      repository.save(updated);
      data.value = updated;
      return true;
    } catch {
      error.value = 'Não foi possível excluir o hábito no armazenamento. Tente novamente.';
      return false;
    }
  }
  return { data, error, blocked, save, archive, setCompleted, setProgress, recordSession, remove };
});
