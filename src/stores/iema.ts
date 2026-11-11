import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { IemaData, IemaTicket } from '../types/iema';
import { isMyActiveTicket } from '../utils/iema';
import {
  baseUrl,
  IemaApiClient,
  IemaError,
  normalize,
} from '../services/integrations/iema/IemaApiClient';
import { credentials, openIema } from '../services/integrations/iema/credentials';
import { synchronize } from '../services/integrations/iema/IemaSyncService';
const KEY = 'focus.integrations.iema.v1';
export function validateIema(data: IemaData) {
  if (
    data.version !== 1 ||
    typeof data.connectionId !== 'string' ||
    typeof data.enabled !== 'boolean' ||
    baseUrl(data.baseUrl) !== data.baseUrl ||
    (data.lastSync !== null && !Number.isFinite(Date.parse(data.lastSync))) ||
    !Array.isArray(data.tickets)
  )
    throw new Error();
  const keys = new Set<string>();
  for (const t of data.tickets) {
    if (
      normalize(t, data.connectionId, data.baseUrl).key !== t.key ||
      keys.has(t.key) ||
      typeof t.mine !== 'boolean' ||
      typeof t.available !== 'boolean' ||
      (t.estimate !== null && (!Number.isFinite(t.estimate) || t.estimate <= 0))
    )
      throw new Error();
    keys.add(t.key);
  }
}
export const useIema = defineStore('iema', () => {
  const data = ref<IemaData>({
    version: 1,
    connectionId: '',
    baseUrl: 'https://web.iema.ma.gov.br/iema-suporte-cti/api/v1',
    enabled: false,
    lastSync: null,
    tickets: [],
  });
  const error = ref('');
  const busy = ref(false);
  const blocked = ref(false);
  const status = ref('Não verificada nesta sessão');
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as IemaData;
      validateIema(parsed);
      data.value = parsed;
    }
  } catch {
    blocked.value = true;
    error.value =
      'Cache IEMA ilegível. O original foi preservado; os dados pessoais continuam disponíveis.';
  }
  function commit(next: IemaData) {
    if (blocked.value)
      throw new IemaError('storage', 'Cache bloqueado para preservar os dados originais.');
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      throw new IemaError('storage', 'Não foi possível salvar o cache IEMA.');
    }
    data.value = next;
  }
  async function run(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    try {
      await action();
    } catch (e) {
      error.value =
        e instanceof IemaError
          ? e.message
          : 'Não foi possível concluir a operação com segurança. Tente novamente.';
      status.value = 'Operação não concluída';
      if (e instanceof IemaError && ['401', '403'].includes(e.code)) {
        data.value.enabled = false;
        try {
          commit({ ...data.value });
        } catch {
          /* Disabled in memory even on storage failure. */
        }
      }
    } finally {
      busy.value = false;
    }
  }
  async function configure(url: string, token: string) {
    await run(async () => {
      const base = baseUrl(url);
      if (!token.trim() || /[\r\n]/.test(token))
        throw new IemaError('missing', 'Informe um token válido sem quebras de linha.');
      if (blocked.value)
        throw new IemaError(
          'storage',
          'Cache bloqueado. Preserve o original antes de recuperar o armazenamento.',
        );
      // Each credential replacement is a new security boundary, even at the same server.
      await credentials.remove();
      commit({
        version: 1,
        baseUrl: base,
        connectionId: crypto.randomUUID(),
        enabled: false,
        lastSync: null,
        tickets: [],
      });
      await credentials.set(token.trim());
      commit({ ...data.value, enabled: true });
      status.value = 'Credencial salva; teste a conexão';
    });
  }
  async function client() {
    if (!data.value.enabled) throw new IemaError('disabled', 'Ative e configure a integração.');
    const token = await credentials.get();
    if (!token)
      throw new IemaError(
        'missing',
        'Token ausente. No navegador, a credencial vale apenas nesta sessão.',
      );
    return new IemaApiClient(data.value.baseUrl, token);
  }
  async function sync() {
    await run(async () => {
      const api = await client();
      const tickets = await synchronize(api, data.value.connectionId, data.value.tickets);
      commit({ ...data.value, tickets, lastSync: new Date().toISOString() });
      status.value = 'Sincronização concluída';
    });
  }
  async function test() {
    await run(async () => {
      const api = await client();
      await api.list('available', data.value.connectionId);
      await api.list('mine', data.value.connectionId);
      status.value = 'Conexão e listagens validadas';
    });
  }
  async function disconnect() {
    await run(async () => {
      await credentials.remove();
      localStorage.removeItem(KEY);
      data.value = { ...data.value, enabled: false, tickets: [], lastSync: null, connectionId: '' };
      blocked.value = false;
      status.value = 'Desconectado; credencial e cache removidos';
    });
  }
  function toggle() {
    if (!busy.value) {
      try {
        commit({ ...data.value, enabled: !data.value.enabled });
      } catch {
        error.value = 'Não foi possível salvar a preferência.';
      }
    }
  }
  function estimate(ticket: IemaTicket, value: string) {
    const minutes = value.trim() === '' ? null : Number(value);
    if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10080)) {
      error.value = 'Informe uma estimativa entre 1 e 10080 minutos.';
      return;
    }
    try {
      commit({
        ...data.value,
        tickets: data.value.tickets.map((t) =>
          t.key === ticket.key ? { ...t, estimate: minutes } : t,
        ),
      });
    } catch {
      error.value = 'Não foi possível salvar a estimativa.';
    }
  }
  async function open(ticket: IemaTicket) {
    try {
      await openIema(ticket.url, data.value.baseUrl);
    } catch {
      error.value = 'Não foi possível abrir o link institucional.';
    }
  }
  const myActiveTickets = computed(() => data.value.tickets.filter(isMyActiveTicket));
  const recommendations = computed(() =>
    data.value.enabled && !blocked.value ? myActiveTickets.value : [],
  );
  return {
    data,
    error,
    busy,
    blocked,
    status,
    recommendations,
    myActiveTickets,
    configure,
    sync,
    test,
    disconnect,
    toggle,
    estimate,
    open,
  };
});
