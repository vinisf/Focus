import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'gradlew.bat' : './gradlew', ['assembleDebug'], {
  cwd: new URL('../android/', import.meta.url),
  stdio: 'inherit',
  shell: windows,
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

mkdirSync(new URL('../apk/', import.meta.url), { recursive: true });
copyFileSync(
  new URL('../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url),
  new URL('../apk/Focus.apk', import.meta.url),
);
console.log('APK pronto: apk/Focus.apk');
