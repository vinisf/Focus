// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import App from '../src/App.vue';
import TaskEditor from '../src/components/TaskEditor.vue';
import { useTasks } from '../src/stores/tasks';
import { dateKey } from '../src/utils/dates';
let wrapper: VueWrapper;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
});
describe('fluxos do Focus', () => {
  it('cria, edita uma tarefa reativa e persiste sem exigir vencimento', async () => {
    wrapper = mount(App, { attachTo: document.body });
    await wrapper.find('.page-heading .primary').trigger('click');
    let editor = wrapper.findComponent(TaskEditor);
    expect(editor.find('.advanced').exists()).toBe(false);
    await editor
      .find('input[placeholder="O que você quer realizar?"]')
      .setValue('Planejar a semana');
    await editor.find('form').trigger('submit');
    const store = useTasks();
    expect(store.data.tasks).toHaveLength(1);
    expect(store.data.tasks[0]!.dueDate).toBe('');
    expect(wrapper.find('.suggestion-actions .primary').text()).toBe('Começar tarefa');
    await wrapper.find('.suggestion-actions .primary').trigger('click');
    expect(store.data.tasks[0]!.status).toBe('active');
    expect(wrapper.find('.suggestion-actions .primary').text()).toBe('Finalizar tarefa');
    await wrapper.findAll('nav button')[1]!.trigger('click');
    expect(wrapper.find('.task-content').text()).toContain('Planejar a semana');
    await wrapper.find('.task-content').trigger('click');
    editor = wrapper.findComponent(TaskEditor);
    expect(editor.exists()).toBe(true);
    await editor
      .find('input[placeholder="O que você quer realizar?"]')
      .setValue('Planejar com calma');
    await editor.findAll('input[type="date"]')[1]!.setValue(dateKey());
    await editor.find('form').trigger('submit');
    expect(store.data.tasks[0]!.title).toBe('Planejar com calma');
    expect(JSON.parse(localStorage.getItem('focus.v1')!).tasks[0].plannedDate).toBe(dateKey());
    await wrapper.findAll('nav button')[0]!.trigger('click');
    expect(wrapper.find('.task-content').text()).toContain('Planejar com calma');
    await wrapper.find('.suggestion-actions .primary').trigger('click');
    expect(store.data.tasks[0]!.status).toBe('done');
    expect(wrapper.find('[role="status"]').text()).toContain('Tarefa concluída');
    await wrapper.findAll('nav button')[4]!.trigger('click');
    expect(wrapper.find('.completed').exists()).toBe(true);
  });
  it('gera próxima ocorrência uma vez, inclusive após recarregar a store', async () => {
    wrapper = mount(TaskEditor, { props: { task: null }, attachTo: document.body });
    await wrapper.find('input[placeholder="O que você quer realizar?"]').setValue('Treino');
    await wrapper.find('.text-button').trigger('click');
    await wrapper.findAll('select').at(-1)!.setValue('daily');
    await wrapper.find('form').trigger('submit');
    const store = useTasks();
    store.status(store.data.tasks[0]!, 'done');
    expect(store.data.tasks).toHaveLength(2);
    expect(store.data.tasks[0]!.completedAt).toBeTruthy();
    expect(store.data.tasks[1]!.status).toBe('pending');
    setActivePinia(createPinia());
    const loaded = useTasks();
    loaded.status(loaded.data.tasks[0]!, 'pending');
    loaded.status(loaded.data.tasks[0]!, 'done');
    expect(loaded.data.tasks).toHaveLength(2);
  });
  it('permite criar e editar categorias e alternar o tema', async () => {
    wrapper = mount(App);
    await wrapper.findAll('nav button')[5]!.trigger('click');
    await wrapper.find('input[aria-label="Nome da categoria"]').setValue('Família');
    await wrapper.find('.category-form').trigger('submit');
    expect(useTasks().data.categories.at(-1)!.name).toBe('Família');
    await wrapper.findAll('.category-actions').at(-1)!.findAll('button')[1]!.trigger('click');
    await wrapper.find('input[aria-label="Nome da categoria"]').setValue('Casa');
    await wrapper.find('.category-form').trigger('submit');
    expect(useTasks().data.categories.at(-1)!.name).toBe('Casa');
    await wrapper.find('.theme-toggle').trigger('click');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  it('preserva armazenamento corrompido mesmo após alterações locais', async () => {
    localStorage.setItem('focus.v1', 'corrompido');
    wrapper = mount(App);
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    const store = useTasks();
    store.data.categories.push({ id: 'x', name: 'Nova', color: '#998877' });
    await nextTick();
    expect(localStorage.getItem('focus.v1')).toBe('corrompido');
    expect(store.blocked).toBe(true);
  });
});
