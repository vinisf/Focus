// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Habit, HabitGoal } from '../src/types/habits';
import { useHabits } from '../src/stores/habits';
import { HABITS_KEY, LocalHabitRepository, validGoal } from '../src/services/habitRepository';
import { goalForDate } from '../src/utils/habitGoals';
import { habitCompliance, weeklyCount } from '../src/utils/habits';
const now = new Date('2026-10-15T12:00:00');
const today = '2026-10-15';
const quantityGoal = (target = 3): HabitGoal => ({
  kind: 'quantity',
  description: `Ler ${target} capítulos da Bíblia`,
  target,
  unit: 'capítulos',
});
function habit(goal?: HabitGoal): Habit {
  return {
    id: 'devotional',
    name: 'Devocional',
    description: '',
    categoryId: null,
    icon: 'book',
    frequency: { kind: 'daily' },
    preferredTime: '07:00',
    createdAt: new Date('2026-10-12T12:00:00').toISOString(),
    status: 'active',
    ...(goal ? { goal } : {}),
    plans: [
      { from: '2026-10-12', frequency: { kind: 'daily' }, active: true, ...(goal ? { goal } : {}) },
    ],
  };
}
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});
describe('metas e progresso dos hábitos', () => {
  it('mantém nome genérico e meta independentes, com compatibilidade dos dados antigos', () => {
    const legacy = {
      version: 1,
      habits: [habit()],
      completions: [
        { id: 'old', habitId: 'devotional', date: '2026-10-14', completedAt: now.toISOString() },
      ],
    };
    const raw = JSON.stringify(legacy);
    localStorage.setItem(HABITS_KEY, raw);
    const store = useHabits();
    expect(store.blocked).toBe(false);
    expect(store.data.habits[0]!.name).toBe('Devocional');
    expect(goalForDate(store.data.habits[0]!, today, store.data.completions).kind).toBe('check');
    expect(store.data.completions).toHaveLength(1);
    expect(store.data.progress).toEqual([]);
    expect(localStorage.getItem(HABITS_KEY)).toBe(raw);
  });
  it('persiste progresso parcial sem contar como realização ou cumprimento semanal', () => {
    const store = useHabits();
    expect(store.save(habit(quantityGoal()), now)).toBe(true);
    expect(store.setProgress('devotional', today, 2, now)).toBe(true);
    expect(store.data.progress?.[0]?.value).toBe(2);
    expect(store.data.completions).toHaveLength(0);
    expect(weeklyCount(store.data.habits[0]!, store.data.completions, today)).toBe(0);
    setActivePinia(createPinia());
    const loaded = useHabits();
    expect(loaded.data.progress?.[0]?.value).toBe(2);
    expect(loaded.data.completions).toHaveLength(0);
  });
  it('conclui apenas ao atingir a meta e permite corrigir e limpar sem duplicar', () => {
    const store = useHabits();
    store.save(habit(quantityGoal()), now);
    store.setProgress('devotional', today, 3, now);
    store.setProgress('devotional', today, 4, now);
    expect(store.data.progress).toHaveLength(1);
    expect(store.data.completions).toHaveLength(1);
    expect(store.data.completions[0]).toMatchObject({ value: 4, goal: quantityGoal() });
    store.setProgress('devotional', today, 2, now);
    expect(store.data.completions).toHaveLength(0);
    store.setProgress('devotional', today, 3, now);
    expect(store.data.completions).toHaveLength(1);
    store.setCompleted('devotional', today, false, now);
    expect(store.data.progress).toHaveLength(0);
    expect(store.data.completions).toHaveLength(0);
  });
  it('preserva a meta histórica ao mudar de três para quatro capítulos', () => {
    const store = useHabits();
    store.save(habit(quantityGoal()), now);
    store.setProgress('devotional', '2026-10-14', 3, now);
    expect(store.save({ ...store.data.habits[0]!, goal: quantityGoal(4) }, now)).toBe(true);
    const saved = store.data.habits[0]!;
    expect(saved.name).toBe('Devocional');
    expect(store.data.habits).toHaveLength(1);
    expect(goalForDate(saved, '2026-10-14', store.data.completions)).toEqual(quantityGoal(3));
    expect(goalForDate(saved, today, store.data.completions)).toEqual(quantityGoal(4));
    store.setProgress('devotional', today, 3, now);
    expect(store.data.completions).toHaveLength(1);
    store.setProgress('devotional', today, 4, now);
    expect(store.data.completions).toHaveLength(2);
    const loaded = new LocalHabitRepository().load()!;
    expect(goalForDate(loaded.habits[0]!, '2026-10-14', loaded.completions)).toEqual(
      quantityGoal(3),
    );
  });
  it('mantém uma realização já concluída mesmo se a meta mudar no mesmo dia', () => {
    const store = useHabits();
    store.save(habit(quantityGoal()), now);
    store.setProgress('devotional', today, 3, now);
    store.save({ ...store.data.habits[0]!, goal: quantityGoal(4) }, now);
    expect(goalForDate(store.data.habits[0]!, today, store.data.completions)).toEqual(
      quantityGoal(3),
    );
    expect(goalForDate(store.data.habits[0]!, '2026-10-16', store.data.completions)).toEqual(
      quantityGoal(4),
    );
  });
  it('separa meta por realização da frequência semanal ao calcular consistência', () => {
    const store = useHabits();
    const weekly = habit(quantityGoal());
    weekly.frequency = { kind: 'weekly', target: 2 };
    weekly.plans[0]!.frequency = weekly.frequency;
    store.save(weekly, now);
    store.setProgress('devotional', '2026-10-12', 3, now);
    store.save({ ...store.data.habits[0]!, goal: quantityGoal(4) }, now);
    store.setProgress('devotional', today, 4, now);
    expect(
      habitCompliance(
        store.data.habits[0]!,
        store.data.completions,
        '2026-10-12',
        '2026-10-18',
        today,
      ),
    ).toEqual({ done: 2, expected: 2, percent: 100 });
  });
  it('suporta metas decimais e o fluxo genérico de conclusão', () => {
    const store = useHabits();
    store.save(
      habit({ kind: 'quantity', description: 'Beber 2 litros de água', target: 2, unit: 'litros' }),
      now,
    );
    store.setProgress('devotional', today, 0.5, now);
    expect(store.data.completions).toHaveLength(0);
    expect(store.setCompleted('devotional', today, true, now)).toBe(true);
    expect(store.data.progress?.[0]?.value).toBe(2);
    expect(store.data.completions).toHaveLength(1);
  });
  it('valida metas e valores, datas futuras e duplicações persistidas', () => {
    expect(validGoal({ kind: 'quantity', description: '', target: 0, unit: 'capítulos' })).toBe(
      false,
    );
    expect(validGoal({ kind: 'quantity', description: '', target: 3, unit: '  ' })).toBe(false);
    const store = useHabits();
    store.save(habit(quantityGoal()), now);
    for (const value of [-1, NaN, Infinity])
      expect(store.setProgress('devotional', today, value, now)).toBe(false);
    expect(store.setProgress('devotional', '2026-10-16', 1, now)).toBe(false);
    store.setProgress('devotional', today, 2, now);
    const saved = JSON.parse(localStorage.getItem(HABITS_KEY)!);
    saved.progress.push(saved.progress[0]);
    localStorage.setItem(HABITS_KEY, JSON.stringify(saved));
    expect(() => new LocalHabitRepository().load()).toThrow();
  });
});
