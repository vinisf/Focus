import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { IemaTicket } from '../../../types/iema';
export class IemaError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function baseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new IemaError('url', 'Informe uma URL HTTPS sem credenciais, parâmetros ou fragmentos.');
  return url.href.replace(/\/$/, '');
}
export type Transport = (url: string, token: string) => Promise<{ status: number; data: unknown }>;
const transport: Transport = async (url, token) => {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (Capacitor.isNativePlatform())
    return CapacitorHttp.get({
      url,
      headers,
      disableRedirects: true,
      connectTimeout: 15000,
      readTimeout: 30000,
    });
  const response = await fetch(url, {
    headers,
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, data: await response.text() };
};
export function normalize(raw: unknown, connection: string, base: string): IemaTicket {
  if (!raw || typeof raw !== 'object')
    throw new IemaError('json', 'Registro de chamado inesperado.');
  const t = raw as Record<string, unknown>;
  const s = t.status as Record<string, unknown> | null;
  if (
    !Number.isSafeInteger(t.id) ||
    Number(t.id) < 1 ||
    typeof t.title !== 'string' ||
    !t.title.trim() ||
    !s ||
    !Number.isInteger(s.code) ||
    typeof s.name !== 'string' ||
    typeof s.label !== 'string' ||
    typeof t.url !== 'string'
  )
    throw new IemaError('json', 'Campos do chamado incompatéveis com o contrato.');
  const url = new URL(t.url);
  if (
    url.protocol !== 'https:' ||
    url.origin !== new URL(base).origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new IemaError('json', 'Link institucional inesperado.');
  for (const field of ['due_at', 'updated_at'])
    if (
      t[field] != null &&
      (typeof t[field] !== 'string' || !Number.isFinite(Date.parse(t[field] as string)))
    )
      throw new IemaError('json', 'Data institucional inválida.');
  if (t.priority != null && typeof t.priority !== 'number' && typeof t.priority !== 'string')
    throw new IemaError('json', 'Prioridade institucional inesperada.');
  return {
    key: `iema:${connection}:${t.id}`,
    id: Number(t.id),
    title: t.title,
    status: { code: Number(s.code), name: s.name, label: s.label },
    priority: (t.priority as string | number | null) ?? null,
    due_at: (t.due_at as string | null) ?? null,
    updated_at: (t.updated_at as string | null) ?? null,
    url: url.href,
    available: false,
    mine: false,
    estimate: null,
  };
}
export class IemaApiClient {
  constructor(
    private base: string,
    private token: string,
    private send: Transport = transport,
  ) {
    this.base = baseUrl(base);
  }
  async ticket(id: number, connection: string): Promise<IemaTicket> {
    if (!Number.isSafeInteger(id) || id < 1) throw new IemaError('id', 'Identificador inválido.');
    const response = await this.get(`tickets/${id}`);
    const record =
      response && typeof response === 'object' && 'data' in response ? response.data : response;
    return normalize(record, connection, this.base);
  }
  async get(path: string): Promise<unknown> {
    if (!this.token.trim()) throw new IemaError('missing', 'Cadastre seu token pessoal.');
    let response;
    try {
      response = await this.send(`${this.base}/${path}`, this.token);
    } catch {
      throw new IemaError(
        'network',
        'Servidor inacessível. Verifique internet, rede/VPN e certificado HTTPS. O dispositivo não informou uma causa confiável.',
      );
    }
    const messages: Record<number, string> = {
      401: 'Token inválido, expirado ou revogado. Cadastre uma nova credencial.',
      403: 'Acesso negado. Verifique a permissão tickets:read.',
      404: 'API não encontrada. Confira o prefixo público /api/v1 e o subdiretório.',
      429: 'Limite de requisições atingido. Aguarde antes de sincronizar.',
    };
    if (response.status < 200 || response.status >= 300)
      throw new IemaError(
        String(response.status),
        messages[response.status] ??
          (response.status >= 500
            ? 'Servidor indisponível. Tente novamente mais tarde.'
            : 'Resposta HTTP inesperada. Confira a URL da API.'),
      );
    try {
      return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch {
      throw new IemaError('json', 'Resposta JSON inesperada. Confira o prefixo da API.');
    }
  }
  async list(queue: 'available' | 'mine', connection: string): Promise<IemaTicket[]> {
    const result: IemaTicket[] = [];
    const seen = new Set<string>();
    let path: string | null = `tickets/${queue}`;
    while (path) {
      if (seen.has(path) || seen.size >= 10000)
        throw new IemaError('pagination', 'Paginação inválida ou excessiva.');
      seen.add(path);
      const payload = await this.get(path);
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('data' in payload) ||
        !Array.isArray(payload.data)
      )
        throw new IemaError(
          'json',
          'Listagem inesperada: esperado envelope data e paginação Laravel.',
        );
      const page = payload as {
        data: unknown[];
        links?: { next?: unknown };
        next_page_url?: unknown;
        current_page?: number;
        last_page?: number;
        meta?: { current_page?: number; last_page?: number };
      };
      result.push(
        ...page.data.map((t) => ({ ...normalize(t, connection, this.base), [queue]: true })),
      );
      const next = page.links?.next ?? page.next_page_url;
      if (next != null) {
        if (typeof next !== 'string') throw new IemaError('pagination', 'Próxima página inválida.');
        const url = new URL(next, this.base + '/');
        const endpoint = new URL(`${this.base}/tickets/${queue}`);
        if (
          url.origin !== endpoint.origin ||
          url.pathname !== endpoint.pathname ||
          url.username ||
          url.password ||
          url.hash
        )
          throw new IemaError('pagination', 'Paginação aponta para um destino não autorizado.');
        path = `tickets/${queue}${url.search}`;
      } else {
        const current = page.meta?.current_page ?? page.current_page;
        const last = page.meta?.last_page ?? page.last_page;
        if (current !== undefined && last !== undefined && current < last)
          throw new IemaError(
            'pagination',
            'Paginação incompleta: link da próxima página ausente.',
          );
        if (!page.links || !('next' in page.links)) {
          if (!('next_page_url' in page))
            throw new IemaError(
              'pagination',
              'Metadados de paginação ausentes; reconciliação cancelada.',
            );
        }
        path = null;
      }
    }
    return result;
  }
}
