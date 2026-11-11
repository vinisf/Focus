// @vitest-environment jsdom
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Habit, HabitCompletion, HabitData, HabitFrequency } from '../src/types/habits';
import type { Task } from '../src/types';
import { LocalHabitRepository, HABITS_KEY, validHabit } from '../src/services/habitRepository';
import { LocalRepository } from '../src/services/repository';
import { useTasks } from '../src/stores/tasks';
import { useHabits } from '../src/stores/habits';
import { dateKey } from '../src/utils/dates';
import { habitCompliance, habitIsDue, habitStreak, isHabitScheduled } from '../src/utils/habits';
import { taskProductivity } from '../src/utils/productivity';
import { recommend } from '../src/utils/priority';

const now = new Date('2026-10-15T12:00:00');
const today = dateKey(now);
const makeHabit = (frequency: HabitFrequency = { kind: 'daily' }, id = 'habit'): Habit => ({
  id,
  name: 'Caminhar',
  description: '',
  icon: 'leaf',
  categoryId: null,
  frequency,
  preferredTime: '',
  status: 'active',
  createdAt: new Date('2026-10-12T12:00:00').toISOString(),
  plans: [{ from: '2026-10-12', frequency, active: true }],
});
const completions = (dates: string[], habitId = 'habit'): HabitCompletion[] =>
  dates.map((date) => ({ id: crypto.randomUUID(), habitId, date, completedAt: now.toISOString() }));
const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task',
  title: 'Entregar integração',
  description: '',
  categoryId: '0',
  dueDate: '',
  time: '',
  plannedDate: today,
  priority: 'high',
  importance: 'high',
  duration: 30,
  status: 'pending',
  createdAt: now.toISOString(),
  completedAt: null,
  recurrence: null,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe('frequências e métricas de hábitos', () => {
  it('respeita criação e dias específicos sem contar dias de descanso', () => {
    const habit = makeHabit({ kind: 'weekdays', days: [2, 4] });
    expect(isHabitScheduled(habit, '2026-10-06')).toBe(false);
    expect(isHabitScheduled(habit, '2026-10-12')).toBe(false);
    expect(isHabitScheduled(habit, today)).toBe(true);
    expect(
      habitCompliance(habit, completions(['2026-10-13', today]), '2026-10-12', '2026-10-18', today),
    ).toEqual({ done: 2, expected: 2, percent: 100 });
  });
  it('usa dias locais próximos à meia-noite, sem transformar em data UTC', () => {
    const habit = makeHabit();
    expect(dateKey(new Date(2026, 9, 15, 23, 59))).toBe('2026-10-15');
    expect(habitIsDue(habit, [], dateKey(new Date(2026, 9, 16, 0, 1)))).toBe(true);
  });
  it('não inclui os próximos dias no denominador de hábitos diários', () => {
    expect(
      habitCompliance(
        makeHabit(),
        completions(['2026-10-12', '2026-10-13']),
        '2026-10-12',
        '2026-10-18',
        today,
      ),
    ).toEqual({ done: 2, expected: 4, percent: 50 });
  });
  it('retorna percentual ausente para períodos sem previsão', () => {
    const habit = makeHabit({ kind: 'weekdays', days: [1] });
    expect(habitCompliance(habit, [], today, today, today)).toEqual({
      done: 0,
      expected: 0,
      percent: null,
    });
  });
  it('cumpre uma meta semanal com dias livres sem exigir sete realizações', () => {
    const habit = makeHabit({ kind: 'weekly', target: 3 });
    const history = completions(['2026-10-12', '2026-10-14', today]);
    expect(habitCompliance(habit, history, '2026-10-12', '2026-10-18', today)).toEqual({
      done: 3,
      expected: 3,
      percent: 100,
    });
    expect(habitIsDue(habit, history, today)).toBe(true);
    expect(habitIsDue(habit, history, '2026-10-16')).toBe(false);
    expect(habitIsDue(habit, history, '2026-10-19')).toBe(true);
    expect(habitStreak(habit, history, today)).toBe(null);
  });
  it('calcula o mês conforme metas semanais e limita semanas parciais', () => {
    const habit = makeHabit({ kind: 'weekly', target: 3 });
    const history = completions(['2026-10-12', '2026-10-14', today, '2026-10-19']);
    expect(habitCompliance(habit, history, '2026-10-01', '2026-10-31', '2026-10-20')).toEqual({
      done: 4,
      expected: 6,
      percent: 67,
    });
    const late = makeHabit({ kind: 'weekly', target: 3 });
    late.createdAt = new Date('2026-10-31T12:00:00').toISOString();
    late.plans[0]!.from = '2026-10-31';
    expect(
      habitCompliance(late, completions(['2026-10-31']), '2026-10-01', '2026-10-31', '2026-10-31'),
    ).toEqual({ done: 1, expected: 1, percent: 100 });
  });
  it('não interrompe sequência em fins de semana nem antes do fim de hoje', () => {
    const habit = makeHabit({ kind: 'weekdays', days: [1, 2, 3, 4, 5] });
    const history = completions([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    expect(habitStreak(habit, history, '2026-10-18')).toBe(5);
    expect(habitStreak(habit, history, '2026-10-19')).toBe(5);
    expect(habitStreak(habit, history, '2026-10-20')).toBe(0);
  });
  it('ignora duplicações na contagem de datas e limita a meta semanal', () => {
    const habit = makeHabit({ kind: 'weekly', target: 2 });
    expect(
      habitCompliance(
        habit,
        completions(['2026-10-12', '2026-10-12', '2026-10-13', today]),
        '2026-10-12',
        '2026-10-18',
        today,
      ),
    ).toEqual({ done: 2, expected: 2, percent: 100 });
  });
});

describe('armazenamento independente e preservação', () => {
  it('cria hábitos e preserva integralmente o armazenamento antigo das tarefas', () => {
    const repo = new LocalRepository();
    repo.save({
      version: 1,
      tasks: [makeTask({ recurrence: { kind: 'daily', days: [] } })],
      categories: [{ id: '0', name: 'Trabalho', color: '#7766cc' }],
    });
    const original = localStorage.getItem('focus.v1');
    const tasks = useTasks(),
      habits = useHabits();
    habits.save(makeHabit(), now);
    habits.setCompleted('habit', today, true, now);
    expect(localStorage.getItem('focus.v1')).toBe(original);
    expect(tasks.data.tasks).toHaveLength(1);
    expect(tasks.data.tasks[0]!.recurrence?.kind).toBe('daily');
    expect(tasks.data.tasks[0]!.status).toBe('pending');
    expect(recommend(tasks.data.tasks, 30, now).map((r) => r.task.id)).toEqual(['task']);
    expect(taskProductivity(tasks.data.tasks, today).done).toBe(0);
    expectTypeOf<Habit extends Task ? true : false>().toEqualTypeOf<false>();
  });
  it('mantém percentuais de tarefas independentes de realizações de hábitos', () => {
    const tasks = [
      makeTask(),
      makeTask({ id: 'done', status: 'done', completedAt: now.toISOString() }),
    ];
    expect(taskProductivity(tasks, today)).toMatchObject({ done: 1, expected: 2, percent: 50 });
    const store = useHabits();
    store.save(makeHabit(), now);
    store.setCompleted('habit', today, true, now);
    expect(taskProductivity(tasks, today)).toMatchObject({ done: 1, expected: 2, percent: 50 });
    expect(taskProductivity([], today)).toMatchObject({ percent: null });
    expect(taskProductivity([makeTask({ status: 'cancelled' })], today)).toMatchObject({
      percent: null,
    });
  });
  it('marca no máximo uma vez por dia, desmarca e persiste após recarregar', () => {
    const store = useHabits();
    expect(store.save(makeHabit(), now)).toBe(true);
    expect(store.setCompleted('habit', today, true, now)).toBe(true);
    expect(store.setCompleted('habit', today, true, now)).toBe(true);
    expect(store.data.completions).toHaveLength(1);
    setActivePinia(createPinia());
    const loaded = useHabits();
    expect(loaded.data.completions[0]!.date).toBe(today);
    loaded.setCompleted('habit', today, false, now);
    expect(loaded.data.completions).toHaveLength(0);
    expect(new LocalHabitRepository().load()?.completions).toHaveLength(0);
  });
  it('não permite realização futura, anterior à criação ou em dias não previstos', () => {
    const store = useHabits();
    store.save(makeHabit({ kind: 'weekdays', days: [4] }), now);
    expect(store.setCompleted('habit', '2026-10-16', true, now)).toBe(false);
    expect(store.setCompleted('habit', '2026-10-08', true, now)).toBe(false);
    expect(store.setCompleted('habit', '2026-10-14', true, now)).toBe(false);
    expect(store.setCompleted('habit', '2026-02-31', true, now)).toBe(false);
    expect(store.data.completions).toHaveLength(0);
  });
  it('preserva o histórico e as frequências anteriores ao editar e arquivar', () => {
    const store = useHabits();
    store.save(makeHabit(), now);
    store.setCompleted('habit', '2026-10-13', true, now);
    const updated = {
      ...store.data.habits[0]!,
      frequency: { kind: 'weekdays' as const, days: [1] },
    };
    expect(store.save(updated, now)).toBe(true);
    const saved = store.data.habits[0]!;
    expect(isHabitScheduled(saved, '2026-10-13')).toBe(true);
    expect(isHabitScheduled(saved, today)).toBe(false);
    store.archive(saved.id, now);
    expect(store.data.habits[0]!.status).toBe('archived');
    expect(store.data.completions).toHaveLength(1);
    expect(new LocalHabitRepository().load()?.completions).toHaveLength(1);
    store.archive(saved.id, new Date('2026-10-19T12:00:00'));
    expect(isHabitScheduled(store.data.habits[0]!, '2026-10-19')).toBe(true);
    expect(isHabitScheduled(store.data.habits[0]!, '2026-10-16')).toBe(false);
  });
  it('rejeita dados corrompidos e bloqueia gravação sem afetar as tarefas', () => {
    localStorage.setItem(HABITS_KEY, '{invalid');
    const habits = useHabits(),
      tasks = useTasks();
    expect(habits.blocked).toBe(true);
    expect(habits.save(makeHabit(), now)).toBe(false);
    expect(localStorage.getItem(HABITS_KEY)).toBe('{invalid');
    tasks.save(makeTask());
    expect(tasks.data.tasks).toHaveLength(1);
    expect(localStorage.getItem(HABITS_KEY)).toBe('{invalid');
  });
  it('rejeita frequências, IDs e históricos inválidos', () => {
    const habit = makeHabit();
    expect(validHabit({ ...habit, frequency: { kind: 'weekly', target: 8 } })).toBe(false);
    expect(validHabit({ ...habit, frequency: { kind: 'weekdays', days: [] } })).toBe(false);
    const completion = completions([today])[0]!;
    for (const data of [
      { version: 1, habits: [habit, habit], completions: [] },
      { version: 1, habits: [habit], completions: [completion, { ...completion, id: 'other' }] },
      { version: 1, habits: [habit], completions: [{ ...completion, habitId: 'missing' }] },
      { version: 1, habits: [habit], completions: [{ ...completion, date: '2026-02-31' }] },
    ]) {
      localStorage.setItem(HABITS_KEY, JSON.stringify(data));
      expect(() => new LocalHabitRepository().load()).toThrow();
    }
  });
  it('propaga falhas do navegador sem apagar o conteúdo original', () => {
    const data: HabitData = { version: 1, habits: [makeHabit()], completions: [] };
    const repository = new LocalHabitRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => repository.save(data)).toThrow('quota');
  });
});
