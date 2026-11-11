import { Capacitor, registerPlugin } from '@capacitor/core';
interface Vault {
  get(): Promise<{ value: string | null }>;
  set(options: { value: string }): Promise<void>;
  remove(): Promise<void>;
  open(options: { url: string }): Promise<void>;
}
const native = registerPlugin<Vault>('IemaVault');
let temporary: string | null = null;
export const credentials = {
  async get() {
    return Capacitor.isNativePlatform() ? (await native.get()).value : temporary;
  },
  async set(value: string) {
    if (Capacitor.isNativePlatform()) await native.set({ value });
    else temporary = value;
  },
  async remove() {
    if (Capacitor.isNativePlatform()) await native.remove();
    temporary = null;
  },
};
export async function openIema(url: string, base: string) {
  const target = new URL(url);
  if (
    target.protocol !== 'https:' ||
    target.origin !== new URL(base).origin ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  )
    throw new Error('Link institucional inválido.');
  if (Capacitor.isNativePlatform()) await native.open({ url: target.href });
  else window.open(target.href, '_blank', 'noopener,noreferrer');
}
