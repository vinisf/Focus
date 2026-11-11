import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { SheetTable } from '../../../types/platforms';
export class SheetsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type SheetsTransport = (
  url: string,
  token: string,
) => Promise<{ status: number; data: unknown }>;
const send: SheetsTransport = async (url, token) => {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (Capacitor.getPlatform() === 'android')
    return CapacitorHttp.get({
      url,
      headers,
      disableRedirects: true,
      connectTimeout: 15000,
      readTimeout: 30000,
    });
  const response = await fetch(url, {
    headers,
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, data: await response.text() };
};
export function validateSheet(id: string, gid: number) {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(id) || !Number.isSafeInteger(gid) || gid < 0)
    throw new SheetsError('config', 'Informe um ID de planilha e um gid válidos.');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SheetsError('format', 'Resposta inesperada do Google Sheets.');
  return value as Record<string, unknown>;
}
export class GoogleSheetsClient {
  constructor(
    private token: string,
    private transport: SheetsTransport = send,
  ) {}
  private async get(id: string, params: URLSearchParams): Promise<Record<string, unknown>> {
    if (!this.token)
      throw new SheetsError('auth', 'Autorize sua conta Google antes de sincronizar.');
    let response;
    try {
      response = await this.transport(
        `https://sheets.googleapis.com/v4/spreadsheets/${id}?${params}`,
        this.token,
      );
    } catch {
      throw new SheetsError(
        'network',
        'Não foi possível acessar o Google Sheets. Verifique a conexão.',
      );
    }
    if (response.status !== 200) {
      const messages: Record<number, string> = {
        401: 'Autorização Google expirada ou revogada. Conecte novamente.',
        403: 'Sem permissão para ler a planilha. Confira a conta, a API habilitada e o consentimento.',
        404: 'Planilha não encontrada ou não compartilhada com esta conta.',
        429: 'Limite do Google Sheets atingido. Aguarde antes de tentar novamente.',
      };
      throw new SheetsError(
        String(response.status),
        messages[response.status] ?? 'Google Sheets indisponível. Tente novamente mais tarde.',
      );
    }
    try {
      return object(typeof response.data === 'string' ? JSON.parse(response.data) : response.data);
    } catch {
      throw new SheetsError(
        'format',
        'Resposta inesperada do Google Sheets. O cache anterior foi preservado.',
      );
    }
  }
  async read(id: string, gid: number): Promise<SheetTable> {
    validateSheet(id, gid);
    const mask = 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))';
    const metadata = await this.get(id, new URLSearchParams({ fields: mask }));
    if (!Array.isArray(metadata.sheets))
      throw new SheetsError('format', 'Abas não informadas pela API.');
    const sheet = metadata.sheets.map(object).find((s) => object(s.properties).sheetId === gid);
    if (!sheet)
      throw new SheetsError('gid', 'A aba configurada não existe nesta planilha. Confira o gid.');
    const properties = object(sheet.properties);
    const grid = object(properties.gridProperties);
    if (
      typeof properties.title !== 'string' ||
      !Number.isSafeInteger(grid.rowCount) ||
      !Number.isSafeInteger(grid.columnCount) ||
      Number(grid.rowCount) < 1 ||
      Number(grid.columnCount) < 1
    )
      throw new SheetsError('format', 'Dimensões da aba inválidas.');
    if (Number(grid.rowCount) * Number(grid.columnCount) > 2000000)
      throw new SheetsError(
        'size',
        'Esta aba excede o limite de leitura segura de 2 milhões de células. Use uma aba menor. Nenhum dado foi substituído.',
      );
    // One complete tab response avoids a local snapshot composed of partial pages.
    const range = `'${properties.title.replace(/'/g, "''")}'`;
    const response = await this.get(
      id,
      new URLSearchParams({
        ranges: range,
        fields:
          'sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(formattedValue,hyperlink))))',
      }),
    );
    if (!Array.isArray(response.sheets) || response.sheets.length !== 1)
      throw new SheetsError('format', 'Leitura incompleta da aba.');
    const returned = object(response.sheets[0]);
    if (
      object(returned.properties).sheetId !== gid ||
      object(returned.properties).title !== properties.title ||
      !Array.isArray(returned.data)
    )
      throw new SheetsError('format', 'A aba mudou durante a leitura. Tente novamente.');
    const rows: string[][] = [];
    const links: Record<string, string> = {};
    for (const rawBlock of returned.data) {
      const block = object(rawBlock);
      if ((block.startRow ?? 0) !== 0 || (block.startColumn ?? 0) !== 0)
        throw new SheetsError('format', 'Intervalo de leitura inesperado.');
      if (block.rowData === undefined) continue;
      if (!Array.isArray(block.rowData) || rows.length)
        throw new SheetsError('format', 'Blocos de leitura inesperados.');
      for (const [r, rawRow] of block.rowData.entries()) {
        const values = object(rawRow).values ?? [];
        if (!Array.isArray(values)) throw new SheetsError('format', 'Linha inválida na resposta.');
        rows.push(
          values.map((v, c) => {
            const cell = object(v);
            if (cell.formattedValue !== undefined && typeof cell.formattedValue !== 'string')
              throw new SheetsError('format', 'Célula inválida.');
            if (cell.hyperlink !== undefined) {
              if (typeof cell.hyperlink !== 'string')
                throw new SheetsError('format', 'Link inválido.');
              links[`${r}:${c}`] = cell.hyperlink;
            }
            return (cell.formattedValue as string | undefined) ?? '';
          }),
        );
      }
    }
    return { title: properties.title, rows, links };
  }
}
