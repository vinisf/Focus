import { describe, it, expect } from 'vitest';
import type { Data, Task } from '../src/types';
import { rank, recommend } from '../src/utils/priority';
import { nextOccurrence } from '../src/utils/recurrence';
import { LocalRepository } from '../src/services/repository';
const now = new Date('2026-10-15T12:00:00');
const task = (overrides: Partial<Task> = {}): Task => ({
  id: '1',
  title: 'Uma tarefa',
  description: '',
  categoryId: 'work',
  dueDate: '',
  plannedDate: '',
  time: '',
  priority: 'medium',
  importance: 'medium',
  duration: 30,
  status: 'pending',
  createdAt: now.toISOString(),
  completedAt: null,
  recurrence: null,
  ...overrides,
});
describe('priorização explicável', () => {
  it('mantém tarefas importantes sem prazo no topo', () => {
    expect(rank(task({ importance: 'high', priority: 'high' }), 30, now).score).toBeGreaterThan(
      rank(task({ dueDate: '2026-10-15', importance: 'low', priority: 'low' }), 30, now).score,
    );
  });
  it('limita o peso da idade e protege obrigações críticas', () => {
    expect(
      rank(task({ createdAt: '2020-01-01T12:00:00Z', priority: 'low', importance: 'low' }), 30, now)
        .score,
    ).toBeLessThan(
      rank(task({ priority: 'urgent', importance: 'high', dueDate: '2026-10-15' }), 30, now).score,
    );
  });
  it('retorna até três tarefas compatíveis e exclui concluídas/canceladas', () => {
    const tasks = [
      task(),
      task({ id: '2', duration: 15 }),
      task({ id: '3', duration: 10, status: 'done' }),
      task({ id: '4', duration: 5, status: 'cancelled' }),
      task({ id: '5', duration: 5 }),
      task({ id: '6', duration: 2 }),
    ];
    const result = recommend(tasks, 15, now);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.task.duration <= 15 && r.task.status === 'pending')).toBe(true);
    expect(result[0]!.reason).toContain('15 minutos');
  });
  it('usa desempate estável e permite pesos configuráveis', () => {
    const a = task({ id: 'a' }),
      b = task({ id: 'b' });
    expect(recommend([b, a], 30, now).map((x) => x.task.id)).toEqual(['a', 'b']);
    expect(
      rank(a, 30, now, {
        priority: 0,
        importance: 0,
        overdue: 0,
        today: 0,
        soon: 0,
        ageCap: 0,
        fits: 0,
      }).score,
    ).toBe(0);
  });
  it('considera proximidade do prazo', () => {
    expect(rank(task({ dueDate: '2026-10-15' }), 30, now).score).toBeGreaterThan(
      rank(task({ dueDate: '2026-10-25' }), 30, now).score,
    );
  });
});
describe('recorrência e histórico', () => {
  it('mantém a ocorrência original e gera a próxima diária', () => {
    const original = task({ dueDate: '2026-10-15', recurrence: { kind: 'daily', days: [] } });
    const next = nextOccurrence(original, now)!;
    expect(next.id).not.toBe(original.id);
    expect(next.dueDate).toBe('2026-10-16');
    expect(original.dueDate).toBe('2026-10-15');
    expect(original.completedAt).toBe(null);
  });
  it('suporta semanal, dias úteis e tarefas sem vencimento', () => {
    expect(
      nextOccurrence(task({ recurrence: { kind: 'weekly', days: [] } }), now)?.plannedDate,
    ).toBe('2026-10-22');
    const friday = new Date('2026-10-16T12:00:00');
    const next = nextOccurrence(
      task({ recurrence: { kind: 'custom', days: [1, 2, 3, 4, 5] } }),
      friday,
    );
    expect(next?.plannedDate).toBe('2026-10-19');
    expect(next?.dueDate).toBe('');
  });
  it('não duplica após persistir nextId e avança datas atrasadas', () => {
    expect(
      nextOccurrence(task({ nextId: 'next', recurrence: { kind: 'daily', days: [] } }), now),
    ).toBe(null);
    expect(
      nextOccurrence(task({ dueDate: '2026-01-01', recurrence: { kind: 'daily', days: [] } }), now)
        ?.dueDate,
    ).toBe('2026-10-16');
  });
});
describe('repositório', () => {
  const data: Data = {
    version: 1,
    tasks: [task()],
    categories: [{ id: 'work', name: 'Trabalho', color: '#7766cc' }],
  };
  function storage(initial: string | null = null) {
    let value = initial;
    return {
      getItem: () => value,
      setItem: (_key: string, v: string) => {
        value = v;
      },
    };
  }
  it('persiste e recupera tarefas e categorias', () => {
    const repo = new LocalRepository(storage());
    expect(repo.load()).toBe(null);
    repo.save(data);
    expect(repo.load()).toEqual(data);
  });
  it('rejeita JSON corrompido sem sobrescrever', () => {
    const s = storage('{invalid');
    expect(() => new LocalRepository(s).load()).toThrow();
    expect(s.getItem()).toBe('{invalid');
  });
  it.each([
    { ...data, version: 2 },
    { ...data, tasks: [task({ duration: -1 })] },
    { ...data, tasks: [task({ status: 'invalid' as Task['status'] })] },
    { ...data, tasks: [task(), task()] },
    { ...data, categories: [] },
    { ...data, tasks: [task({ recurrence: { kind: 'custom', days: [] } })] },
  ])('rejeita estrutura inválida', (invalid) => {
    expect(() => new LocalRepository(storage(JSON.stringify(invalid))).load()).toThrow();
  });
  it('propaga indisponibilidade do armazenamento', () => {
    expect(() =>
      new LocalRepository({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('full');
        },
      }).load(),
    ).toThrow('blocked');
    const repo = new LocalRepository({
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(() => repo.save(data)).toThrow('full');
  });
});
