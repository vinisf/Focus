// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PersonalPlanImport from '../src/components/PersonalPlanImport.vue';
import { emptyLifePlanning, LIFE_PLANNING_KEY } from '../src/services/lifePlanningRepository';
import { PERSONAL_PLAN_LIMIT } from '../src/services/personalPlanImport';
import { useLifePlanning } from '../src/stores/lifePlanning';
import { parseBackup } from '../src/services/fullBackup';
import type { LifePlanningData } from '../src/types/lifePlanning';
let wrapper: VueWrapper;
const plan = (): LifePlanningData => ({
  ...emptyLifePlanning(),
  areas: [{ id: 'a', name: 'Área de exemplo' }],
  goals: [],
  blocks: [
    {
      id: 'b',
      title: 'Bloco de exemplo',
      date: '2026-11-11',
      kind: 'fixed',
      start: '10:00',
      end: '11:00',
      status: 'planned',
      goalId: '',
    },
  ],
});
const button = (text: string) => wrapper.findAll('button').find((b) => b.text() === text)!;
async function select(raw: string, size = raw.length) {
  const input = wrapper.get('input[type=file]');
  const read = vi.fn(async () => raw);
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [{ size, text: read }],
  });
  await input.trigger('change');
  await flushPromises();
  return read;
}
let create: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  create = vi.fn(() => 'blob:example');
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw Error('network must not be used');
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('previews without writing, downloads a full backup before confirmation and applies once privately', async () => {
  localStorage.setItem('focus.theme', 'dark');
  const store = useLifePlanning();
  store.saveArea({ id: 'old', name: 'Área anterior' });
  const before = localStorage.getItem(LIFE_PLANNING_KEY);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  wrapper = mount(PersonalPlanImport);
  await select(JSON.stringify(plan()));
  expect(wrapper.text()).toContain('1 áreas');
  expect(wrapper.text()).toContain('1 blocos');
  expect(write).not.toHaveBeenCalled();
  expect(wrapper.find('input[type=checkbox]').exists()).toBe(false);
  await button('Gerar backup pré-importação').trigger('click');
  expect(create).toHaveBeenCalledTimes(1);
  expect(write).not.toHaveBeenCalled();
  const blob = create.mock.calls[0]![0] as Blob;
  const backupRaw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
  const backup = parseBackup(backupRaw);
  expect(backup.entries[LIFE_PLANNING_KEY]).toBe(before);
  expect(backup.entries['focus.theme']).toBe('dark');
  expect(button('Aplicar importação').attributes('disabled')).toBeDefined();
  await wrapper.get('input[type=checkbox]').setValue(true);
  await button('Aplicar importação').trigger('click');
  expect(wrapper.get('[role=status]').text()).toContain('Plano importado');
  expect(store.data.areas.map((a) => a.id)).toEqual(['old', 'a']);
  expect(write).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
it('requires ID decisions, shows collisions and lets the user ignore imported blocks', async () => {
  const store = useLifePlanning();
  store.saveArea({ id: 'a', name: 'Área anterior' });
  store.saveBlock({ ...plan().blocks[0]!, id: 'existing' });
  wrapper = mount(PersonalPlanImport);
  await select(JSON.stringify(plan()));
  expect(wrapper.text()).toContain('conflitos de ID pendentes');
  expect(wrapper.get('[aria-label="Colisões de horário"]').text()).toContain('conflita');
  expect(button('Gerar backup pré-importação').attributes('disabled')).toBeDefined();
  const decisions = wrapper.findAll('select');
  await decisions[0]!.setValue('keep');
  await decisions[1]!.setValue('skip');
  expect(wrapper.find('[aria-label="Colisões de horário"]').exists()).toBe(false);
  expect(wrapper.text()).toContain('Este plano já está presente');
  expect(button('Gerar backup pré-importação').attributes('disabled')).toBeDefined();
});
it('rejects invalid, oversize and focus-full input without saving or showing private content in errors', async () => {
  wrapper = mount(PersonalPlanImport);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  await select('{"private-example":"not-a-plan"}');
  expect(wrapper.get('[role=alert]').text()).not.toContain('private-example');
  const read = await select('example', PERSONAL_PLAN_LIMIT + 1);
  expect(read).not.toHaveBeenCalled();
  expect(wrapper.get('[role=alert]').text()).toContain('5 MB');
  await select('{"format":"focus-full","version":1,"entries":{}}');
  expect(wrapper.get('[role=alert]').text()).toContain('Configurações');
  expect(write).not.toHaveBeenCalled();
});
it('does not allow applying when backup download fails or after the plan changes', async () => {
  wrapper = mount(PersonalPlanImport);
  await select(JSON.stringify(plan()));
  create.mockImplementationOnce(() => {
    throw Error('download denied');
  });
  await button('Gerar backup pré-importação').trigger('click');
  expect(wrapper.get('[role=alert]').text()).toContain('Nada foi aplicado');
  expect(useLifePlanning().data.areas).toHaveLength(0);
  await button('Gerar backup pré-importação').trigger('click');
  await wrapper.get('input[type=checkbox]').setValue(true);
  useLifePlanning().saveArea({ id: 'changed', name: 'Área adicionada durante a revisão' });
  await flushPromises();
  expect(button('Aplicar importação').attributes('disabled')).toBeDefined();
});
it('cancels a prepared import and never writes on selection or cancellation', async () => {
  wrapper = mount(PersonalPlanImport);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  await select(JSON.stringify(plan()));
  await button('Gerar backup pré-importação').trigger('click');
  await button('Cancelar importação').trigger('click');
  expect(wrapper.find('[aria-label="Prévia do plano pessoal"]').exists()).toBe(false);
  expect(write).not.toHaveBeenCalled();
});
