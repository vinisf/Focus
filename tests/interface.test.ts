// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import App from '../src/App.vue';
import TaskEditor from '../src/components/TaskEditor.vue';
import { useTasks } from '../src/stores/tasks';
import { defaultRoutine, useRoutine } from '../src/stores/routine';
import { addDays, dateKey } from '../src/utils/dates';
let wrapper: VueWrapper;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('fluxos do Focus', () => {
  it('abre ajustes da rotina em página própria e preserva os dados ao voltar', async () => {
    wrapper = mount(App);
    expect(wrapper.find('.routine-settings').exists()).toBe(false);
    await wrapper.get('button.routine-today').trigger('click');
    expect(wrapper.get('h1').text()).toBe('Minha rotina hoje está diferente');
    expect(wrapper.find('.suggested-task').exists()).toBe(false);
    expect(wrapper.find('.top-add').exists()).toBe(false);
    expect(wrapper.find('.page-heading .primary').exists()).toBe(false);
    await wrapper.get('.routine-day-page input[type=time]').setValue('09:30');
    await wrapper.get('.routine-day-page form').trigger('submit');
    expect(useRoutine().data.exceptions.find((e) => e.date === dateKey())?.wake).toBe('09:30');
    expect(useRoutine().data.preferences.wake).toBe('07:00');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Voltar')!
      .trigger('click');
    expect(wrapper.find('.greeting-title').exists()).toBe(true);
    await wrapper.get('button.routine-today').trigger('click');
    expect(
      (wrapper.get('.routine-day-page input[type=time]').element as HTMLInputElement).value,
    ).toBe('09:30');
  });
  it('abre ajustes de amanhã na mesma página e retorna à revisão', async () => {
    useRoutine().save({ preferences: { ...defaultRoutine(), enabled: true } });
    wrapper = mount(App);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Planejar amanhã')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Ajustar rotina de amanhã')!
      .trigger('click');
    expect(
      (wrapper.get('.routine-day-page input[type=date]').element as HTMLInputElement).value,
    ).toBe(addDays(dateKey(), 1));
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Voltar')!
      .trigger('click');
    expect(wrapper.get('h1').text()).toBe('Planejar amanhã');
  });
  it.each([
    [8, 'Bom dia'],
    [15, 'Boa tarde'],
    [21, 'Boa noite'],
  ] as const)('acolhe pelo horário local às %s horas', (hour, greeting) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 22, hour));
    wrapper = mount(App);
    expect(wrapper.find('h1').text()).toBe(greeting);
    expect(wrapper.find('.greeting-message').exists()).toBe(false);
    expect(wrapper.find('main input[type="file"]').exists()).toBe(false);
  });
  it('mantém ícones e identificação da página em toda a navegação, inclusive mobile', async () => {
    wrapper = mount(App);
    const buttons = wrapper.findAll('nav button');
    expect(buttons).toHaveLength(7);
    for (const button of buttons) expect(button.find('.nav-icon svg').exists()).toBe(true);
    expect(buttons[0]!.attributes('aria-current')).toBe('page');
    await wrapper.find('[aria-label="Abrir menu"]').trigger('click');
    expect(wrapper.find('[aria-label="Abrir menu"]').attributes('aria-expanded')).toBe('true');
    await buttons.find((b) => b.text().startsWith('Configurações'))!.trigger('click');
    expect(wrapper.find('nav button[aria-current="page"]').text()).toBe('Configurações');
    expect(wrapper.find('.sidebar').classes()).not.toContain('open');
  });
  it('explica o próximo passo com origem e ações claras sem inventar um prazo', () => {
    const store = useTasks();
    store.save({
      id: 'warm',
      title: 'Revisar documentação',
      description: '',
      categoryId: '0',
      dueDate: '',
      plannedDate: dateKey(),
      time: '',
      duration: 30,
      priority: 'medium',
      importance: 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
      completedAt: null,
      recurrence: null,
    });
    wrapper = mount(App);
    const card = wrapper.find('.suggested-task');
    expect(card.find('.activity-badge').text()).toBe('Tarefa pessoal');
    expect(card.find('.suggestion-reason').text()).toContain('Você planejou essa tarefa para hoje');
    expect(card.text()).not.toContain('vence hoje');
    expect(card.find('.primary').text()).toBe('Começar agora');
    expect(card.find('.postpone-action').text()).toBe('Agora não');
  });
  it('pula integrações sem adiar datas ou consumir o limite diário', async () => {
    const store = useTasks();
    store.integrationLimit(1);
    for (let i = 0; i < 3; i++)
      store.save({
        id: `skip-${i}`,
        title: `Integrar plataforma ${i}`,
        integrationName: `platform-${i}`,
        description: '',
        categoryId: '0',
        dueDate: '',
        plannedDate: '',
        time: '',
        duration: 30,
        priority: 'medium',
        importance: 'medium',
        status: 'pending',
        createdAt: new Date(2026, 0, i + 1).toISOString(),
        completedAt: null,
        recurrence: null,
      });
    wrapper = mount(App);
    const before = JSON.stringify(store.data);
    const titles = new Set<string>();
    for (let i = 0; i < 3; i++) {
      titles.add(wrapper.find('.suggested-task h3').text());
      await wrapper.find('.postpone-action').trigger('click');
    }
    expect(titles.size).toBe(3);
    expect(JSON.stringify(store.data)).toBe(before);
    expect(wrapper.find('.round-notice').text()).toContain('Você já percorreu');
    expect(wrapper.find('.postpone-action').exists()).toBe(true);
  });
  it('mantém uma única recomendação na inicial e permite abrir todas as tarefas', async () => {
    const store = useTasks();
    for (let i = 0; i < 8; i++)
      store.save({
        id: `home-${i}`,
        title: `Tarefa ${i}`,
        description: '',
        categoryId: '0',
        dueDate: '',
        time: '',
        plannedDate: dateKey(),
        priority: 'medium',
        importance: 'medium',
        duration: 30,
        status: i === 7 ? 'done' : 'pending',
        createdAt: new Date().toISOString(),
        completedAt: i === 7 ? new Date().toISOString() : null,
        recurrence: null,
      });
    wrapper = mount(App);
    expect(wrapper.find('.home-counts').exists()).toBe(false);
    expect(wrapper.findAll('.task-row')).toHaveLength(0);
    expect(wrapper.find('main .stats').exists()).toBe(false);
    expect(wrapper.findAll('.alternatives button')).toHaveLength(2);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Ver minhas tarefas')!
      .trigger('click');
    expect(wrapper.findAll('.task-row')).toHaveLength(8);
  });
  it('separa desempenho e configurações sem exibir controles de integração na inicial', async () => {
    wrapper = mount(App);
    const go = async (name: string) =>
      wrapper
        .findAll('nav button')
        .find((b) => b.text().startsWith(name))!
        .trigger('click');
    expect(wrapper.find('main .planning-options').exists()).toBe(false);
    expect(wrapper.find('main .day-summary').exists()).toBe(false);
    await go('Desempenho');
    expect(wrapper.find('.performance-main').exists()).toBe(true);
    expect(wrapper.find('.performance-evolution').exists()).toBe(true);
    expect(wrapper.find('.habits-today').exists()).toBe(false);
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    await go('Configurações');
    expect(wrapper.find('input[type="file"]').exists()).toBe(true);
    expect(wrapper.find('input[type="password"]').exists()).toBe(true);
    expect(wrapper.find('.planning-options').exists()).toBe(true);
    expect(wrapper.find('.suggested-task').exists()).toBe(false);
    await go('Meu Dia');
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
    expect(wrapper.find('main .day-summary').exists()).toBe(false);
  });
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
    expect(wrapper.find('.suggestion-actions .primary').text()).toBe('Começar agora');
    await wrapper.find('.suggestion-actions .primary').trigger('click');
    expect(store.data.tasks[0]!.status).toBe('active');
    expect(wrapper.find('.suggestion-actions .primary').text()).toBe('Concluir');
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
    expect(wrapper.find('.focus-current').text()).toContain('Planejar com calma');
    await wrapper.find('.suggestion-actions .primary').trigger('click');
    expect(store.data.tasks[0]!.status).toBe('done');
    expect(wrapper.find('[role="status"]').text()).toContain('Tarefa concluída');
    await wrapper
      .findAll('nav button')
      .find((b) => b.text().startsWith('Tarefas'))!
      .trigger('click');
    await wrapper.find('#task-tab-done').trigger('click');
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
    wrapper.unmount();
    wrapper = mount(App);
    expect(wrapper.find('.suggestion-actions .primary').exists()).toBe(false);
    expect(wrapper.find('.empty-recommend').text()).toContain('Você está em dia por aqui.');
    expect(wrapper.find('.empty-recommend').text()).not.toContain('Ajuste o tempo');
  });
  it('permite criar e editar categorias e alternar o tema', async () => {
    wrapper = mount(App);
    await wrapper
      .findAll('nav button')
      .find((b) => b.text().startsWith('Categorias'))!
      .trigger('click');
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
