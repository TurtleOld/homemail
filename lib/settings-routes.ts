export const SETTINGS_SECTION_IDS = [
  'signature',
  'autoReply',
  'advanced',
  'templates',
  'folders',
  'labels',
  'filters',
  'subscriptions',
  'archive',
  'theme',
  'interface',
  'language',
  'notifications',
  'accessibility',
  'hotkeys',
  'contacts',
  'import',
  'pgp',
  'sieve',
  'monitoring',
  'statistics',
  'stalwart',
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

const SETTINGS_SECTION_SET = new Set<string>(SETTINGS_SECTION_IDS);

export function isSettingsSectionId(value: string | undefined): value is SettingsSectionId {
  return Boolean(value && SETTINGS_SECTION_SET.has(value));
}

export function getSettingsSectionFromPathname(pathname: string): SettingsSectionId | null {
  const segments = pathname.split('/').filter(Boolean);
  const settingsIndex = segments.indexOf('settings');
  const candidate = settingsIndex >= 0 ? segments[settingsIndex + 1] : undefined;
  return isSettingsSectionId(candidate) ? candidate : null;
}

export function getSettingsSectionHref(locale: string, section: SettingsSectionId): string {
  return `/${locale}/settings/${section}`;
}
