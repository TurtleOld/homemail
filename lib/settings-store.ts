import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';
import { withMigrationDefaults } from '@/lib/settings-defaults';

const DATA_DIR =
  process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : process.cwd());
const SETTINGS_FILE = path.join(DATA_DIR, '.settings.json');

const settingsStore = new Map<string, any>();
let loaded = false;
let loadPromise: Promise<void> | null = null;

async function loadSettings(): Promise<void> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const trimmed = data.trim();
    if (!trimmed) return;
    const parsed = JSON.parse(trimmed) as Record<string, any>;
    for (const [accountId, settings] of Object.entries(parsed)) {
      settingsStore.set(accountId, withMigrationDefaults(settings));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to load settings:', error);
    }
  }
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loadPromise ??= loadSettings().then(() => {
    loaded = true;
  });
  await loadPromise;
}

export async function saveSettingsStore(): Promise<void> {
  try {
    const data = Object.fromEntries(settingsStore);
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    logger.error('Failed to save settings:', error);
  }
}

export async function getAccountSettings(accountId: string) {
  await ensureLoaded();
  return withMigrationDefaults(settingsStore.get(accountId));
}

export async function setAccountSettings(accountId: string, settings: Record<string, any>) {
  await ensureLoaded();
  settingsStore.set(accountId, settings);
  await saveSettingsStore();
}

/**
 * Reads only the active accent color a member picked in Appearance settings
 * (customTheme.colors.primary), falling back to DEFAULT_ACCENT_HEX when the
 * member never customized their theme. Used to seed new label/contact-group
 * colors so they match the member's chosen accent instead of a fixed value.
 */
export async function getAccountAccentColor(accountId: string): Promise<string> {
  const { DEFAULT_ACCENT_HEX } = await import('@/lib/theme-colors');
  const settings = await getAccountSettings(accountId);
  return settings.customTheme?.colors?.primary || DEFAULT_ACCENT_HEX;
}
