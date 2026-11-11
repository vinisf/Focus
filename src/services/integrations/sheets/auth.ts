import { Capacitor, registerPlugin } from '@capacitor/core';
import { SheetsError } from './GoogleSheetsClient';
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export interface GoogleSession {
  accountId: string;
  accessToken: string;
}
export interface GoogleAuth {
  authorize(): Promise<GoogleSession>;
  disconnect(): Promise<void>;
}
const native = registerPlugin<GoogleAuth>('SheetsAuth');
export const googleAuth: GoogleAuth = {
  async authorize() {
    throw new SheetsError(
      'setup',
      'Sincronização Google Sheets desativada. Utilize importação Excel ou cadastro manual.',
    );
  },
  async disconnect() {
    if (Capacitor.getPlatform() === 'android') await native.disconnect();
  },
};
export async function openSheetLink(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new SheetsError('url', 'Link HTTPS inválido.');
  if (Capacitor.getPlatform() === 'android') {
    const browser = registerPlugin<{ open(options: { url: string }): Promise<void> }>('SheetsAuth');
    await browser.open({ url: url.href });
  } else window.open(url.href, '_blank', 'noopener,noreferrer');
}
