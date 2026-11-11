// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import FocusView from '../src/views/FocusView.vue';
import TaskEditor from '../src/components/TaskEditor.vue';
import TaskRow from '../src/components/TaskRow.vue';
import { useTasks } from '../src/stores/tasks';
import type { Task } from '../src/types';

let wrapper: VueWrapper;
const task = (id: string, fields: Partial<Task> = {}): Task => ({
  id,
  title: id,
  description: '',
  categoryId: '0',
  dueDate: '',
  plannedDate: '',
  time: '',
  priority: 'medium',
  importance: 'medium',
  duration: 30,
  status: 'pending',
  createdAt: '2026-10-22T10:00:00',
  completedAt: null,
  recurrence: null,
  ...fields,
});
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T12:00:00'));
  const store = useTasks();
  for (const t of [
    task('future-due', { dueDate: '2026-10-23' }),
    task('future-plan', { plannedDate: '2026-10-23' }),
    task('today-due', { dueDate: '2026-10-22' }),
    task('active-undated', { status: 'active' }),
    task('done', { status: 'done', completedAt: '2026-10-22T11:00:00', plannedDate: '2026-10-24' }),
    task('cancelled', { status: 'cancelled', dueDate: '2026-10-24' }),
    task('recurring', {
      plannedDate: '2026-10-24',
      dueDate: '2026-10-24',
      recurrence: { kind: 'weekly', days: [6] },
    }),
    task('mixed', { categoryId: '1', plannedDate: '2026-10-22', dueDate: '2026-10-25' }),
  ])
    store.save(t);
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});
const select = (id: string) => wrapper.get(`#task-tab-${id}`).trigger('click');
const ids = () =>
  wrapper
    .findAllComponents(TaskRow)
    .map((row) => (row.props('task') as Task).id)
    .sort();
async function openTasks() {
  wrapper = mount(FocusView, { attachTo: document.body });
  await wrapper
    .findAll('nav button')
    .find((b) => b.text().startsWith('Tarefas'))!
    .trigger('click');
}

describe('gerenciamento centralizado de tarefas', () => {
  it('preserva as entradas existentes e adiciona Semana e Metas, ícone list-todo e abas que distinguem vencimento de planejamento', async () => {
    await openTasks();
    const nav = wrapper.findAll('nav button');
    expect(nav.map((b) => b.text().replace(/\d+$/, '').trim())).toEqual([
      'Meu Dia',
      'Semana',
      'Metas',
      'Tarefas',
      'Categorias',
      'Hábitos',
      'Chamados IEMA',
      'Desempenho',
      'Configurações',
    ]);
    expect(
      nav
        .find((b) => b.text().startsWith('Tarefas'))!
        .find('svg')
        .attributes('class'),
    ).toContain('list-todo');
    expect(wrapper.findAll('[role="tab"]').map((b) => b.text())).toEqual([
      'Todas',
      'Próximas',
      'Sem data',
      'Concluídas',
    ]);
    expect(ids()).toHaveLength(8);
    await select('upcoming');
    expect(ids()).toEqual(['future-due', 'future-plan', 'mixed', 'recurring']);
    await select('undated');
    expect(ids()).toEqual(['active-undated', 'future-plan']);
    expect(wrapper.get('.task-tab-description').text()).toContain('Sem vencimento');
    await select('done');
    expect(ids()).toEqual(['done']);
  });
  it('aplica status somente em Todas e restaura a escolha ao voltar', async () => {
    await openTasks();
    await wrapper.get('[aria-label="Filtrar status"]').setValue('cancelled');
    expect(ids()).toEqual(['cancelled']);
    await select('upcoming');
    expect(ids()).toHaveLength(4);
    expect(wrapper.find('[aria-label="Filtrar status"]').exists()).toBe(false);
    await select('done');
    expect(ids()).toEqual(['done']);
    await select('all');
    expect(ids()).toEqual(['cancelled']);
    expect((wrapper.get('[aria-label="Filtrar status"]').element as HTMLSelectElement).value).toBe(
      'cancelled',
    );
  });
  it('mantém busca, categoria e ordenação entre abas sem gravar ou duplicar dados', async () => {
    await openTasks();
    const snapshot = localStorage.getItem('focus.v1');
    await wrapper.get('[aria-label="Buscar tarefas"]').setValue('mixed');
    await wrapper.get('[aria-label="Filtrar categoria"]').setValue('1');
    await wrapper.get('[aria-label="Ordenar tarefas"]').setValue('title');
    expect(ids()).toEqual(['mixed']);
    await select('upcoming');
    expect(ids()).toEqual(['mixed']);
    await select('undated');
    expect(ids()).toEqual([]);
    await select('all');
    expect(ids()).toEqual(['mixed']);
    expect((wrapper.get('[aria-label="Buscar tarefas"]').element as HTMLInputElement).value).toBe(
      'mixed',
    );
    expect(
      (wrapper.get('[aria-label="Filtrar categoria"]').element as HTMLSelectElement).value,
    ).toBe('1');
    expect((wrapper.get('[aria-label="Ordenar tarefas"]').element as HTMLSelectElement).value).toBe(
      'title',
    );
    expect(localStorage.getItem('focus.v1')).toBe(snapshot);
    expect(useTasks().data.tasks).toHaveLength(8);
  });
  it('atualiza o contador de pendentes e o histórico ao concluir uma tarefa', async () => {
    await openTasks();
    expect(wrapper.get('nav .subtle-count').text()).toBe('6');
    await select('upcoming');
    await wrapper.get('[aria-label="Concluir future-due"]').trigger('click');
    expect(ids()).not.toContain('future-due');
    expect(wrapper.get('nav .subtle-count').text()).toBe('5');
    await select('done');
    expect(ids()).toEqual(['done', 'future-due']);
    expect(useTasks().data.tasks).toHaveLength(8);
  });
  it('permite trocar abas pelo teclado com foco e painel identificados', async () => {
    await openTasks();
    await wrapper.get('#task-tab-all').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.get('#task-tab-upcoming').attributes('aria-selected')).toBe('true');
    expect(document.activeElement?.id).toBe('task-tab-upcoming');
    expect(wrapper.get('[role="tabpanel"]').attributes('aria-labelledby')).toBe(
      'task-tab-upcoming',
    );
    await wrapper.get('#task-tab-upcoming').trigger('keydown', { key: 'End' });
    expect(ids()).toEqual(['done']);
    await wrapper.get('#task-tab-done').trigger('keydown', { key: 'Home' });
    expect(wrapper.get('#task-tab-all').attributes('tabindex')).toBe('0');
  });
  it('reutiliza o editor e preserva recorrência e ambas as datas ao editar', async () => {
    await openTasks();
    await select('upcoming');
    const recurring = wrapper
      .findAllComponents(TaskRow)
      .find((row) => row.props('task').id === 'recurring')!;
    await recurring.get('.task-content').trigger('click');
    const editor = wrapper.findComponent(TaskEditor);
    await editor
      .get('input[placeholder="O que você quer realizar?"]')
      .setValue('Recorrência revisada');
    await editor.get('form').trigger('submit');
    expect(useTasks().data.tasks.find((t) => t.id === 'recurring')).toMatchObject({
      title: 'Recorrência revisada',
      plannedDate: '2026-10-24',
      dueDate: '2026-10-24',
      recurrence: { kind: 'weekly', days: [6] },
    });
    expect(wrapper.get('#task-tab-upcoming').attributes('aria-selected')).toBe('true');
  });
  it('mantém cadastro rápido sem exigir prazo ou planejamento', async () => {
    await openTasks();
    await select('upcoming');
    await wrapper.get('.page-heading .primary').trigger('click');
    const editor = wrapper.findComponent(TaskEditor);
    await editor.get('input[placeholder="O que você quer realizar?"]').setValue('Uma tarefa nova');
    await editor.get('form').trigger('submit');
    expect(useTasks().data.tasks.find((t) => t.title === 'Uma tarefa nova')).toMatchObject({
      dueDate: '',
      plannedDate: '',
      status: 'pending',
    });
    await select('undated');
    expect(wrapper.text()).toContain('Uma tarefa nova');
    expect(wrapper.get('nav .subtle-count').text()).toBe('7');
  });
});
