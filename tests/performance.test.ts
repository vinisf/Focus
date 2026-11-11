// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { Task } from '../src/types';
import type { Habit, HabitData, HabitFrequency } from '../src/types/habits';
import type { WorkSession } from '../src/types/planning';
import {
  evolutionRanges,
  completedInPeriod,
  formatDuration,
  performanceRange,
  periodConsistency,
  periodProductivity,
  sessionMinutes,
  type TaskSnapshot,
} from '../src/utils/performance';
import { useTasks } from '../src/stores/tasks';
import { usePerformanceHistory } from '../src/stores/performanceHistory';

const today = '2026-10-15';
const now = new Date(today + 'T12:00:00');
const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task',
  title: 'Entrega',
  description: '',
  categoryId: '0',
  dueDate: '',
  time: '',
  plannedDate: today,
  priority: 'medium',
  importance: 'medium',
  duration: 30,
  status: 'pending',
  createdAt: '2026-10-01T12:00:00',
  completedAt: null,
  recurrence: null,
  ...overrides,
});
const habit = (frequency: HabitFrequency = { kind: 'daily' }): Habit => ({
  id: 'habit',
  name: 'Ler',
  description: '',
  categoryId: null,
  icon: 'book',
  preferredTime: '',
  status: 'active',
  createdAt: '2026-10-12T12:00:00',
  frequency,
  plans: [{ from: '2026-10-12', frequency, active: true }],
});
function habits(value: Habit, dates: string[] = []): HabitData {
  return {
    version: 1,
    habits: [value],
    completions: dates.map((date) => ({
      id: date,
      habitId: value.id,
      date,
      completedAt: date + 'T12:00:00',
    })),
  };
}
const session = (start: string, end: string | null): WorkSession => ({
  id: start,
  key: 'task:task',
  source: 'task',
  startedAt: start,
  endedAt: end,
});

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe('métricas independentes por período', () => {
  it('calcula produtividade sem somar hábitos e prioriza planejamento sobre vencimento', () => {
    const tasks = [
      task({ status: 'done', completedAt: today + 'T09:00:00' }),
      task({ id: 'open' }),
      task({ id: 'deadline', dueDate: today, plannedDate: '2026-10-16' }),
      task({ id: 'cancelled', status: 'cancelled' }),
    ];
    expect(periodProductivity(tasks, [], { start: today, end: today })).toEqual({
      done: 1,
      expected: 2,
      percent: 50,
    });
    expect(
      periodConsistency(habits(habit(), [today]), { start: today, end: today }, today).percent,
    ).toBe(100);
  });
  it('retorna ausência de dados sem transformar em 0% ou 100%', () => {
    const range = { start: today, end: today };
    expect(periodProductivity([], [], range).percent).toBeNull();
    expect(
      periodConsistency({ version: 1, habits: [], completions: [] }, range, today).percent,
    ).toBeNull();
    expect(
      periodConsistency(habits(habit({ kind: 'weekdays', days: [2] })), range, today).percent,
    ).toBeNull();
  });
  it('exclui conclusões fora do período e tarefas sem planejamento do percentual', () => {
    const tasks = [
      task({ status: 'done', completedAt: '2026-10-16T09:00:00' }),
      task({ id: 'early', status: 'done', completedAt: '2026-10-14T09:00:00' }),
      task({ id: 'unplanned', plannedDate: '', status: 'done', completedAt: today + 'T09:00:00' }),
    ];
    expect(periodProductivity(tasks, [], { start: today, end: today })).toEqual({
      done: 0,
      expected: 2,
      percent: 0,
    });
  });
  it('conta uma tarefa uma vez na semana e uma conclusão tardia não corrige o ponto diário', () => {
    const pending = task({ plannedDate: '2026-10-12' });
    const finished = { ...pending, status: 'done' as const, completedAt: today + 'T09:00:00' };
    const snapshots: TaskSnapshot[] = [
      { at: '2026-10-12T12:00:00', tasks: [pending] },
      { at: today + 'T09:00:00', tasks: [finished] },
    ];
    expect(
      periodProductivity([finished], snapshots, { start: '2026-10-12', end: '2026-10-12' }),
    ).toEqual({ done: 0, expected: 1, percent: 0 });
    expect(periodProductivity([finished], snapshots, { start: '2026-10-12', end: today })).toEqual({
      done: 1,
      expected: 1,
      percent: 100,
    });
  });
  it('preserva resultados após replanejamento, reabertura ou exclusão posterior', () => {
    const finished = task({
      plannedDate: '2026-10-14',
      status: 'done',
      completedAt: '2026-10-14T10:00:00',
    });
    const snapshots: TaskSnapshot[] = [
      { at: '2026-10-14T12:00:00', tasks: [finished] },
      { at: today + 'T10:00:00', tasks: [] },
    ];
    expect(completedInPeriod([], snapshots, { start: '2026-10-14', end: today })[0]?.duration).toBe(
      30,
    );
    expect(periodProductivity([], snapshots, { start: '2026-10-14', end: '2026-10-14' })).toEqual({
      done: 1,
      expected: 1,
      percent: 100,
    });
  });
  it('calcula consistência diária e dias fixos sem penalizar descanso', () => {
    expect(
      periodConsistency(
        habits(habit(), ['2026-10-12', '2026-10-14']),
        { start: '2026-10-12', end: today },
        today,
      ),
    ).toEqual({ done: 2, expected: 4, percent: 50 });
    expect(
      periodConsistency(
        habits(habit({ kind: 'weekdays', days: [1, 3] }), ['2026-10-12']),
        { start: '2026-10-12', end: today },
        today,
      ),
    ).toEqual({ done: 1, expected: 2, percent: 50 });
  });
  it('avalia metas flexíveis na semana, inclusive na visão diária sem exigir prática diária', () => {
    const data = habits(habit({ kind: 'weekly', target: 3 }), ['2026-10-12', '2026-10-14']);
    expect(periodConsistency(data, { start: today, end: today }, today)).toEqual({
      done: 2,
      expected: 3,
      percent: 67,
    });
    expect(periodConsistency(data, { start: '2026-10-12', end: today }, today)).toEqual({
      done: 2,
      expected: 3,
      percent: 67,
    });
    // Future completions must not leak into earlier graph points.
    expect(
      periodConsistency(data, { start: '2026-10-12', end: '2026-10-12' }, '2026-10-12').done,
    ).toBe(1);
    expect(
      periodConsistency(data, { start: '2026-10-12', end: '2026-10-12' }, '2026-10-12', false),
    ).toEqual({ done: 1, expected: 1, percent: 100 });
  });
  it('limita metas flexíveis em semana parcial e respeita mudanças de frequência e arquivamento', () => {
    const value = habit({ kind: 'weekdays', days: [4] });
    value.plans = [
      { from: '2026-10-12', frequency: { kind: 'daily' }, active: true },
      { from: today, frequency: value.frequency, active: true },
      { from: '2026-10-16', frequency: value.frequency, active: false },
    ];
    value.status = 'archived';
    const data = habits(value, ['2026-10-12', today]);
    expect(
      periodConsistency(data, { start: '2026-10-12', end: '2026-10-18' }, '2026-10-18'),
    ).toEqual({ done: 2, expected: 4, percent: 50 });
    const weekly = habit({ kind: 'weekly', target: 3 });
    weekly.createdAt = '2026-10-18T12:00:00';
    weekly.plans[0]!.from = '2026-10-18';
    expect(
      periodConsistency(
        habits(weekly, ['2026-10-18']),
        { start: '2026-10-12', end: '2026-10-18' },
        '2026-10-18',
      ),
    ).toEqual({ done: 1, expected: 1, percent: 100 });
  });
});

describe('sessões e durações', () => {
  it('formata sessões longas sem limitar a 24 horas', () => {
    expect(formatDuration(1505.9)).toBe('25 h 5 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(45)).toBe('45 min');
    expect(
      sessionMinutes(
        [session('2026-10-12T08:00:00', '2026-10-14T10:00:00')],
        { start: '2026-10-12', end: today },
        now,
      ),
    ).toBe(3000);
  });
  it('divide sessões atravessando meia-noite pelas fronteiras locais', () => {
    const sessions = [session('2026-10-14T23:00:00', today + 'T02:00:00')];
    expect(sessionMinutes(sessions, { start: '2026-10-14', end: '2026-10-14' }, now)).toBe(60);
    expect(sessionMinutes(sessions, { start: today, end: today }, now)).toBe(120);
  });
  it('exclui abertas, soma sessões separadas por pausa e une intervalos sobrepostos sem alterar dados', () => {
    const sessions = [
      session(today + 'T08:00:00', today + 'T09:00:00'),
      session(today + 'T08:30:00', today + 'T09:30:00'),
      session(today + 'T10:00:00', today + 'T11:00:00'),
      session('2026-10-01T00:00:00', null),
    ];
    const original = JSON.stringify(sessions);
    expect(sessionMinutes(sessions, { start: today, end: today }, now)).toBe(150);
    expect(JSON.stringify(sessions)).toBe(original);
  });
});

describe('períodos e histórico adicional', () => {
  it('gera sete dias, semanas parciais do mês e doze meses sem períodos futuros', () => {
    expect(performanceRange('week', today).start).toBe('2026-10-12');
    expect(performanceRange('month', today).start).toBe('2026-10-01');
    expect(evolutionRanges('days', today)).toHaveLength(7);
    expect(evolutionRanges('weeks', today).map((r) => [r.start, r.end])).toEqual([
      ['2026-10-01', '2026-10-04'],
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', today],
    ]);
    expect(evolutionRanges('months', today)).toHaveLength(12);
    expect(evolutionRanges('months', today).at(-1)?.end).toBe(today);
  });
  it('registra alterações futuras separadamente e preserva os dados locais existentes', async () => {
    const tasks = useTasks();
    tasks.save(task());
    const original = localStorage.getItem('focus.v1');
    const history = usePerformanceHistory();
    expect(localStorage.getItem('focus.v1')).toBe(original);
    expect(history.snapshots).toHaveLength(1);
    tasks.plan(tasks.data.tasks[0]!, '2026-10-16');
    await nextTick();
    expect(history.snapshots).toHaveLength(2);
    expect(history.snapshots[0]!.tasks[0]!.plannedDate).toBe(today);
    expect(history.snapshots[0]!.tasks[0]).not.toHaveProperty('title');
    setActivePinia(createPinia());
    expect(usePerformanceHistory().snapshots).toHaveLength(2);
  });
  it('preserva histórico ilegível e não o sobrescreve', () => {
    localStorage.setItem('focus.performance.v1', '{invalid');
    expect(usePerformanceHistory().error).toContain('preservado');
    expect(localStorage.getItem('focus.performance.v1')).toBe('{invalid');
  });
});
