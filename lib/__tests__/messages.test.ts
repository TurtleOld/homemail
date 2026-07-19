import { describe, expect, it } from 'vitest';
import english from '@/messages/en.json';
import russian from '@/messages/ru.json';
import { SETTINGS_SECTION_IDS } from '@/lib/settings-routes';
import fs from 'node:fs';
import path from 'node:path';

function leafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value)
    .flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe('locale message catalogs', () => {
  it('keeps the English and Russian key trees in sync', () => {
    expect(leafKeys(english)).toEqual(leafKeys(russian));
  });

  it('has a localized navigation label for every Settings route', () => {
    for (const section of SETTINGS_SECTION_IDS) {
      expect(english.settings.tabs).toHaveProperty(section);
      expect(russian.settings.tabs).toHaveProperty(section);
    }
  });

  it('keeps visible Settings implementation strings out of component source', () => {
    const files = [
      'app/[locale]/settings/page.tsx',
      'app/[locale]/settings/stalwart/page.tsx',
      'components/accessibility-settings.tsx',
      'components/auto-archive-settings.tsx',
      'components/contacts-manager.tsx',
      'components/custom-hotkeys-settings.tsx',
      'components/email-import.tsx',
      'components/email-templates-manager.tsx',
      'components/monitoring-dashboard.tsx',
      'components/pgp-manager.tsx',
      'components/sieve-script-editor.tsx',
      'components/statistics-dashboard.tsx',
      'components/subscription-manager.tsx',
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(source, file).not.toMatch(/[А-Яа-яЁё]/);
      expect(source, file).not.toMatch(/[—–]/);
    }
  });

  it('contains no dash separators in Settings catalog copy', () => {
    expect(JSON.stringify(english.settings)).not.toMatch(/[—–]/);
    expect(JSON.stringify(russian.settings)).not.toMatch(/[—–]/);
  });
});
