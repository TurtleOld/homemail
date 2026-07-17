export type ThemePreference = 'light' | 'dark' | 'system';

export function getDefaultSettings() {
  return {
    signature: '',
    signatures: [],
    theme: 'system' as ThemePreference,
    customTheme: undefined as
      | {
          name: string;
          colors?: { primary?: string; secondary?: string; accent?: string };
        }
      | undefined,
    autoReply: {
      enabled: false,
      subject: '',
      message: '',
      schedule: {
        enabled: false,
        startDate: '',
        endDate: '',
        startTime: '',
        endTime: '',
      },
    },
    forwarding: { enabled: false, email: '', keepCopy: true },
    aliases: [],
    locale: {
      language: 'ru' as const,
      dateFormat: 'DD.MM.YYYY' as const,
      timeFormat: '24h' as const,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    ui: {
      density: 'comfortable' as const,
      messagesPerPage: 50,
      sortBy: 'date' as const,
      sortOrder: 'desc' as const,
      groupBy: 'none' as const,
    },
    notifications: {
      enabled: true,
      browser: true,
      sound: false,
      onlyImportant: false,
    },
  };
}

export function withMigrationDefaults(settings: Record<string, any> = {}) {
  const defaults = getDefaultSettings();
  return {
    ...defaults,
    ...settings,
    signatures: settings.signatures ?? defaults.signatures,
    aliases: settings.aliases ?? defaults.aliases,
    autoReply: {
      ...defaults.autoReply,
      ...settings.autoReply,
      schedule: { ...defaults.autoReply.schedule, ...settings.autoReply?.schedule },
    },
    forwarding: { ...defaults.forwarding, ...settings.forwarding },
    locale: { ...defaults.locale, ...settings.locale },
    ui: { ...defaults.ui, ...settings.ui },
    notifications: { ...defaults.notifications, ...settings.notifications },
  };
}
