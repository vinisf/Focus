// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { IemaApiClient, baseUrl, normalize } from '../src/services/integrations/iema/IemaApiClient';
import { synchronize } from '../src/services/integrations/iema/IemaSyncService';
import { credentials } from '../src/services/integrations/iema/credentials';
import { useIema } from '../src/stores/iema';
import { recommendActivities } from '../src/utils/recommendations';
import IemaPanel from '../src/components/IemaPanel.vue';
import FocusView from '../src/views/FocusView.vue';
const base = 'https://example.test/support/api/v1';
const raw = (id = 1, title = 'Synthetic ticket', code = 6) => ({
  id,
  title,
  status: { code, name: 'Assigned', label: 'Designado' },
  priority: null,
  due_at: null,
  updated_at: '2026-10-21T15:30:00Z',
  url: `https://example.test/support/ticket/${id}`,
});
const page = (data: unknown[], next: string | null = null) => ({ data, links: { next } });
const reply = (data: unknown, status = 200) => ({ status, data });
beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  setActivePinia(createPinia());
  await credentials.remove();
});
describe('IEMA API boundaries', () => {
  it('sends Bearer only in headers and uses read-only requests', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ status: 200, text: async () => JSON.stringify(page([])) } as Response);
    await new IemaApiClient(base, 'synthetic-secret').list('mine', 'account');
    expect(fetcher).toHaveBeenCalledWith(
      `${base}/tickets/mine`,
      expect.objectContaining({
        headers: { Authorization: 'Bearer synthetic-secret', Accept: 'application/json' },
        redirect: 'error',
        credentials: 'omit',
      }),
    );
  });
  it('rejects missing token before a request', async () => {
    const send = vi.fn();
    await expect(new IemaApiClient(base, '', send).get('tickets/mine')).rejects.toMatchObject({
      code: 'missing',
    });
    expect(send).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 429, 500])(
    'distinguishes HTTP %s without exposing response secrets',
    async (status) => {
      await expect(
        new IemaApiClient(base, 'fake', async () => reply('sensitive internal detail', status)).get(
          'tickets/mine',
        ),
      ).rejects.toMatchObject({ code: String(status) });
      await expect(
        new IemaApiClient(base, 'fake', async () => reply('sensitive internal detail', status)).get(
          'tickets/mine',
        ),
      ).rejects.not.toThrow('sensitive internal detail');
    },
  );
  it('reports expired/revoked/invalid tokens honestly on 401', async () => {
    await expect(
      new IemaApiClient(base, 'expired', async () => reply({}, 401)).get('tickets/mine'),
    ).rejects.toThrow(/expirado/);
  });
  it('follows all pages and prevents credentials leaking through pagination', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(reply(page([raw(1)], `${base}/tickets/mine?page=2`)))
      .mockResolvedValueOnce(reply(page([raw(2)])));
    expect(await new IemaApiClient(base, 'fake', send).list('mine', 'a')).toHaveLength(2);
    expect(send.mock.calls[1]?.[0]).toBe(`${base}/tickets/mine?page=2`);
    for (const next of [
      'https://evil.test/tickets/mine',
      `${base}/tickets/available?page=2`,
      'http://example.test/support/api/v1/tickets/mine?page=2',
    ]) {
      await expect(
        new IemaApiClient(base, 'fake', async () => reply(page([], next))).list('mine', 'a'),
      ).rejects.toMatchObject({ code: 'pagination' });
    }
  });
  it('rejects loops, incomplete pagination, HTML and malformed records', async () => {
    for (const payload of [
      page([], `${base}/tickets/mine`),
      { data: [] },
      { data: [], links: { next: null }, meta: { current_page: 1, last_page: 3 } },
      '<html>login</html>',
      page([{ id: 1 }]),
    ]) {
      await expect(
        new IemaApiClient(base, 'fake', async () => reply(payload)).list('mine', 'a'),
      ).rejects.toThrow();
    }
  });
  it('rejects insecure URLs and token-bearing ticket links', () => {
    for (const url of ['http://example.test', 'https://user:pass@example.test', base + '?token=x'])
      expect(() => baseUrl(url)).toThrow();
    expect(() => normalize({ ...raw(), url: raw().url + '?token=x' }, 'a', base)).toThrow();
    expect(normalize(raw(), 'a', base).key).not.toBe(normalize(raw(), 'b', base).key);
  });
});
describe('atomic reconciliation and persistence', () => {
  it('merges queues, updates records, preserves local estimates and removes unavailable records', async () => {
    const old = [{ ...normalize(raw(), 'a', base), estimate: 20 }, normalize(raw(99), 'a', base)];
    const send = vi
      .fn()
      .mockResolvedValueOnce(reply(page([raw(1, 'updated')])))
      .mockResolvedValueOnce(reply(page([raw(1, 'updated'), raw(2)])));
    const tickets = await synchronize(new IemaApiClient(base, 'fake', send), 'a', old);
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toMatchObject({
      title: 'updated',
      available: true,
      mine: true,
      estimate: 20,
    });
    expect(tickets.some((t) => t.id === 99)).toBe(false);
  });
  it('keeps cache and last sync on partial failure and prevents concurrent sync', async () => {
    const store = useIema();
    await store.configure(base, 'fake');
    store.data.tickets = [{ ...normalize(raw(), store.data.connectionId, base), mine: true }];
    store.data.lastSync = '2026-10-20T12:00:00Z';
    const original = JSON.stringify(store.data);
    let release!: (value: Response) => void;
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce({ status: 500, text: async () => '{}' } as Response);
    const pending = store.sync();
    await flushPromises();
    await store.sync();
    expect(fetcher).toHaveBeenCalledTimes(1);
    release({ status: 200, text: async () => JSON.stringify(page([])) } as Response);
    await pending;
    expect(JSON.stringify(store.data)).toBe(original);
    expect(store.error).toBeTruthy();
  });
  it('loads offline cache without network and excludes credentials from storage', async () => {
    const store = useIema();
    await store.configure(base, 'synthetic-secret');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify(page([raw()])),
    } as Response);
    await store.sync();
    expect(localStorage.getItem('focus.integrations.iema.v1')).not.toContain('synthetic-secret');
    setActivePinia(createPinia());
    const reloaded = useIema();
    expect(reloaded.data.tickets).toHaveLength(1);
    expect(reloaded.data.lastSync).toBeTruthy();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await reloaded.sync();
    expect(reloaded.data.tickets).toHaveLength(1);
  });
  it('disables recommendations on access loss while preserving last valid snapshot', async () => {
    const store = useIema();
    await store.configure(base, 'fake');
    store.data.tickets = [{ ...normalize(raw(), store.data.connectionId, base), mine: true }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 403,
      text: async () => '{}',
    } as Response);
    await store.sync();
    expect(store.data.tickets).toHaveLength(1);
    expect(store.recommendations).toHaveLength(0);
    expect(store.error).toMatch(/Acesso/);
  });
  it('isolates accounts and removes credentials and institutional cache on disconnect', async () => {
    localStorage.setItem('focus.v1', 'personal');
    localStorage.setItem('focus.habits.v1', 'habits');
    const store = useIema();
    await store.configure(base, 'first');
    const first = store.data.connectionId;
    store.data.tickets = [normalize(raw(), first, base)];
    await store.configure(base, 'second');
    expect(store.data.connectionId).not.toBe(first);
    expect(store.data.tickets).toHaveLength(0);
    await store.disconnect();
    expect(await credentials.get()).toBeNull();
    expect(localStorage.getItem('focus.integrations.iema.v1')).toBeNull();
    expect(localStorage.getItem('focus.v1')).toBe('personal');
    expect(localStorage.getItem('focus.habits.v1')).toBe('habits');
  });
  it('blocks writes on corrupt cache', async () => {
    localStorage.setItem('focus.integrations.iema.v1', '{bad');
    const store = useIema();
    await store.configure(base, 'fake');
    expect(store.blocked).toBe(true);
    expect(localStorage.getItem('focus.integrations.iema.v1')).toBe('{bad');
  });
});
describe('recommendations and interface', () => {
  it('only recommends my in-service tickets and respects local effort', () => {
    const ticket = normalize(raw(), 'a', base);
    const context = {
      tasks: [],
      habits: [],
      completions: [],
      minutes: 30,
      now: new Date('2026-10-21'),
      tickets: [
        { ...ticket, key: 'available', available: true },
        { ...ticket, key: 'mine', mine: true },
        { ...ticket, key: 'new', mine: true, status: { ...ticket.status, code: 1 } },
        { ...ticket, key: 'finished', mine: true, status: { ...ticket.status, code: 3 } },
        { ...ticket, key: 'long', mine: true, estimate: 60 },
      ],
    };
    const result = recommendActivities(context);
    expect(result.activities.map((a) => a.key)).toEqual(['mine']);
    expect(result.activities[0]?.duration).toBeNull();
    expect(result.activities[0]?.reason).toContain('Duração desconhecida');
    expect(recommendActivities({ ...context, filter: 'task' }).activities).toHaveLength(0);
  });
  it('filters the list, counter and recommendations without deleting the synchronized cache', async () => {
    const store = useIema();
    store.data.enabled = true;
    store.data.tickets = [
      { ...normalize(raw(1, 'Meu atendimento', 2), 'a', base), mine: true },
      { ...normalize(raw(2, 'Meu atribuído', 5), 'a', base), mine: true },
      { ...normalize(raw(3, 'Meu designado', 6), 'a', base), mine: true },
      { ...normalize(raw(4, 'Disponível de outra pessoa', 2), 'a', base), available: true },
      { ...normalize(raw(5, 'Meu concluído', 3), 'a', base), mine: true },
      { ...normalize(raw(6, 'Meu novo', 1), 'a', base), mine: true },
      { ...normalize(raw(7, 'Meu cancelado', 4), 'a', base), mine: true },
    ];
    const wrapper = mount(IemaPanel, { props: { mode: 'tickets' } });
    expect(wrapper.findAll('.iema-ticket')).toHaveLength(3);
    expect(wrapper.text()).toContain('3 dos meus chamados em atendimento');
    expect(wrapper.text()).not.toContain('Disponível de outra pessoa');
    expect(wrapper.text()).not.toContain('Meu concluído');
    expect(wrapper.text()).not.toContain('Meu novo');
    expect(wrapper.text()).not.toContain('Meu cancelado');
    expect(wrapper.find('select').exists()).toBe(false);
    expect(store.recommendations.map((t) => t.id)).toEqual([1, 2, 3]);
    await wrapper.get('input[type=search]').setValue('Meu atendimento');
    expect(wrapper.findAll('.iema-ticket')).toHaveLength(1);
    expect(store.data.tickets).toHaveLength(7);
    store.data.tickets[0]!.status.code = 3;
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.iema-ticket')).toHaveLength(0);
    expect(store.recommendations.map((t) => t.id)).toEqual([2, 3]);
    wrapper.unmount();
  });
  it('renders settings, masks credential and clears field after saving', async () => {
    const wrapper = mount(IemaPanel, { props: { mode: 'settings' } });
    await wrapper.get('input[type=url]').setValue(base);
    await wrapper.get('input[type=password]').setValue('synthetic-secret');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect((wrapper.get('input[type=password]').element as HTMLInputElement).value).toBe('');
    expect(wrapper.text()).not.toContain('synthetic-secret');
    wrapper.unmount();
  });
  it('navigates to integrations and tickets without showing personal task lists', async () => {
    const wrapper = mount(FocusView);
    const integrations = wrapper.findAll('button').find((b) => b.text().includes('Configurações'))!;
    await integrations.trigger('click');
    expect(wrapper.find('input[type=password]').exists()).toBe(true);
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Chamados IEMA'))!
      .trigger('click');
    expect(wrapper.text()).toContain('Meus chamados');
    expect(wrapper.find('input[type=password]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('exports only personal tasks and habits, excluding institutional data and tokens', async () => {
    const store = useIema();
    await store.configure(base, 'synthetic-secret');
    store.data.tickets = [
      normalize(raw(1, 'Institutional confidential title'), store.data.connectionId, base),
    ];
    let exported: Blob | undefined;
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          exported = blob;
          return 'blob:test';
        }),
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const wrapper = mount(FocusView);
    await wrapper.get('button.profile').trigger('click');
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsText(exported!);
    });
    expect(Object.keys(JSON.parse(text)).sort()).toEqual([
      'habits',
      'performanceHistory',
      'routine',
      'tasks',
      'version',
    ]);
    expect(text).not.toContain('synthetic-secret');
    expect(text).not.toContain('Institutional confidential title');
    wrapper.unmount();
  });
});
