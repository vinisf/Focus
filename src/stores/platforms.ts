import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { Platform, SheetConfig } from '../types/platforms';
import { PlatformRepository } from '../services/platformRepository';
import { emptyPlatform, mergeImport, normalizedName } from '../services/integrations/excel/import';
import type { ImportRow } from '../services/integrations/excel/import';
import { safeLink } from '../services/integrations/sheets/normalization';
import { openSheetLink } from '../services/integrations/sheets/auth';
import { usePlanning } from './planning';
export function defaultSheetConfig(): SheetConfig {
  return {
    spreadsheetId: '1zy1lQq0qW9xUpupnxfdNeih9hQ4XTVX272Q7eVHEQlw',
    gid: 0,
    mapping: {
      headerRow: 1,
      columns: {
        id: '',
        name: '',
        status: '',
        documentation: '',
        link: '',
        notes: '',
        owner: '',
        priority: '',
        due: '',
      },
      statuses: {},
      priorities: {},
    },
  };
}
export const usePlatforms = defineStore('platforms', () => {
  let repository: PlatformRepository;
  const data = ref({ enabled: true, platforms: [] as Platform[] });
  const blocked = ref(false);
  const busy = ref(false);
  const error = ref('');
  try {
    repository = new PlatformRepository();
    data.value.platforms = repository.load();
  } catch {
    blocked.value = true;
    error.value =
      'Não foi possível ler as plataformas. O armazenamento original foi preservado e as gravações foram bloqueadas.';
  }
  function commit(platforms: Platform[]) {
    if (blocked.value) throw new Error();
    repository.save(platforms);
    data.value = { enabled: true, platforms };
  }
  function update(key: string, fields: Partial<Platform>) {
    try {
      const old = data.value.platforms.find((p) => p.key === key);
      if (!old) throw new Error();
      if (
        fields.name !== undefined &&
        data.value.platforms.some(
          (p) => p.key !== key && normalizedName(p.name) === normalizedName(fields.name!),
        )
      )
        throw new Error();
      if (fields.documentation && !safeLink(fields.documentation)) throw new Error();
      commit(
        data.value.platforms.map((p) =>
          p.key === key ? { ...p, ...fields, key: p.key, source: p.source } : p,
        ),
      );
      error.value = '';
      return true;
    } catch {
      error.value =
        'Não foi possível salvar. Confira nome único, link HTTPS, data e estimativa de 1 a 10080 minutos, além do armazenamento.';
      return false;
    }
  }
  function create(name: string) {
    try {
      const p = emptyPlatform(name);
      if (data.value.platforms.some((old) => normalizedName(old.name) === normalizedName(p.name)))
        throw new Error();
      commit([...data.value.platforms, p]);
      error.value = '';
      return true;
    } catch {
      error.value = 'Informe um nome único e verifique o armazenamento.';
      return false;
    }
  }
  function importRows(rows: ImportRow[]) {
    try {
      commit(mergeImport(data.value.platforms, rows));
      error.value = '';
      return true;
    } catch {
      error.value =
        'Importação não realizada. Revise status, duplicatas, conflitos e armazenamento.';
      return false;
    }
  }
  function clearAll() {
    if (usePlanning().running?.source === 'platform') {
      error.value = 'Encerre a sessão de integração em andamento antes de apagar as plataformas.';
      return false;
    }
    try {
      // Persist an empty collection so legacy Sheets data is not imported again on restart.
      commit([]);
      error.value = '';
      return true;
    } catch {
      error.value =
        'Não foi possível apagar as integrações. Os dados foram preservados. Verifique o armazenamento ou recarregue a página.';
      return false;
    }
  }
  async function open(value: string) {
    try {
      if (!safeLink(value)) throw new Error();
      await openSheetLink(value);
    } catch {
      error.value = 'Não foi possível abrir o link HTTPS.';
    }
  }
  const recommendations = computed(() =>
    blocked.value ? [] : data.value.platforms.filter((p) => !p.archived),
  );
  return {
    data,
    blocked,
    busy,
    error,
    update,
    create,
    importRows,
    clearAll,
    open,
    recommendations,
  };
});
