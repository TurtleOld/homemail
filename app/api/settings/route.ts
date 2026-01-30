import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';
import { getMailProviderForAccount } from '@/lib/get-provider';

const settingsSchema = z.object({
  signature: z.string().optional(),
  signatures: z.array(z.object({
    id: z.string(),
    name: z.string(),
    content: z.string(),
    isDefault: z.boolean().optional(),
    context: z.enum(['work', 'personal', 'autoReply', 'general']).optional(),
  })).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  autoReply: z.object({
    enabled: z.boolean(),
    subject: z.string().optional(),
    message: z.string().optional(),
    schedule: z.object({
      enabled: z.boolean().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }).optional(),
  }).optional(),
  forwarding: z.object({
    enabled: z.boolean().optional(),
    email: z.string().optional().refine((val) => {
      if (val === undefined || val === '') return true;
      return z.string().email().safeParse(val).success;
    }, { message: 'Invalid email' }),
    keepCopy: z.boolean().optional(),
  }).optional(),
  aliases: z.array(z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().optional(),
  })).optional(),
  locale: z.object({
    language: z.enum(['ru', 'en']).optional(),
    dateFormat: z.enum(['DD.MM.YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).optional(),
    timeFormat: z.enum(['24h', '12h']).optional(),
    timezone: z.string().optional(),
  }).optional(),
  ui: z.object({
    density: z.enum(['compact', 'comfortable', 'spacious']).optional(),
    messagesPerPage: z.number().int().min(10).max(100).optional(),
    sortBy: z.enum(['date', 'from', 'subject', 'size']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    groupBy: z.enum(['none', 'date', 'sender']).optional(),
  }).optional(),
  customTheme: z.object({
    name: z.string(),
    colors: z.object({
      primary: z.string().optional(),
      secondary: z.string().optional(),
      accent: z.string().optional(),
    }).optional(),
  }).optional(),
  notifications: z.object({
    enabled: z.boolean().optional(),
    browser: z.boolean().optional(),
    onlyImportant: z.boolean().optional(),
    sound: z.boolean().optional(),
  }).optional(),
});

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : process.cwd());
const SETTINGS_FILE = path.join(DATA_DIR, '.settings.json');
const settingsStore = new Map<string, any>();

async function loadSettings(): Promise<void> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const trimmed = data.trim();
    if (!trimmed) {
      return;
    }
    const loaded = JSON.parse(trimmed) as Record<string, any>;
    for (const [accountId, settings] of Object.entries(loaded)) {
      settingsStore.set(accountId, settings);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to load settings:', error);
    }
  }
}

async function saveSettings(): Promise<void> {
  try {
    const data = Object.fromEntries(settingsStore);
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    logger.error('Failed to save settings:', error);
  }
}

loadSettings().catch((error) => logger.error('Failed to load settings on startup:', error));

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info(`[Settings] GET request from accountId: ${session.accountId}`);
    const settings = settingsStore.get(session.accountId) || {
      signature: '',
      theme: 'light',
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
      forwarding: {
        enabled: false,
        email: '',
        keepCopy: true,
      },
      aliases: [],
      locale: {
        language: 'ru',
        dateFormat: 'DD.MM.YYYY',
        timeFormat: '24h',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      ui: {
        density: 'comfortable',
        messagesPerPage: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        groupBy: 'none',
      },
    };

    logger.info(`[Settings] Returning for accountId ${session.accountId}:`, {
      theme: settings.theme,
      customTheme: settings.customTheme,
    });
    return NextResponse.json(settings);
  } catch (error) {
    logger.error('Failed to get settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.info(`[Settings] POST request from accountId: ${session.accountId}`);
    const body = await request.json();
    const data = settingsSchema.parse(body);
    logger.info(`[Settings] Saving theme: ${data.theme}, customTheme:`, data.customTheme);

    const currentSettings = settingsStore.get(session.accountId) || {
      signature: '',
      signatures: [],
      theme: 'light',
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
      forwarding: {
        enabled: false,
        email: '',
        keepCopy: true,
      },
      aliases: [],
      locale: {
        language: 'ru',
        dateFormat: 'DD.MM.YYYY',
        timeFormat: '24h',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      ui: {
        density: 'comfortable',
        messagesPerPage: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        groupBy: 'none',
      },
    };
    
    const updatedSettings = {
      signature: data.signature !== undefined ? data.signature : currentSettings.signature,
      signatures: data.signatures !== undefined ? data.signatures : currentSettings.signatures,
      theme: data.theme !== undefined ? data.theme : currentSettings.theme,
      customTheme: data.customTheme !== undefined ? data.customTheme : currentSettings.customTheme,
      autoReply: data.autoReply ? { ...currentSettings.autoReply, ...data.autoReply, schedule: data.autoReply.schedule ? { ...currentSettings.autoReply.schedule, ...data.autoReply.schedule } : currentSettings.autoReply.schedule } : currentSettings.autoReply,
      forwarding: data.forwarding ? { ...currentSettings.forwarding, ...data.forwarding } : currentSettings.forwarding,
      aliases: data.aliases !== undefined ? data.aliases : currentSettings.aliases,
      locale: data.locale ? { ...currentSettings.locale, ...data.locale } : currentSettings.locale,
      ui: data.ui ? { ...currentSettings.ui, ...data.ui } : currentSettings.ui,
      notifications: data.notifications ? { ...currentSettings.notifications, ...data.notifications } : currentSettings.notifications,
    };

    settingsStore.set(session.accountId, updatedSettings);
    await saveSettings();
    logger.info(`[Settings] Saved for accountId ${session.accountId}:`, {
      theme: updatedSettings.theme,
      customTheme: updatedSettings.customTheme,
    });

    if (data.aliases !== undefined && process.env.MAIL_PROVIDER === 'stalwart') {
      try {
        const provider = getMailProviderForAccount(session.accountId);
        if (provider && typeof (provider as any).syncAliases === 'function') {
          const identities = data.aliases.map((alias) => ({
            email: alias.email,
            name: alias.name,
          }));
          
          await (provider as any).syncAliases(session.accountId, identities);
          logger.info(`Synchronized ${data.aliases.length} aliases with server`);
        }
      } catch (error) {
        logger.error('Failed to synchronize aliases with server:', error);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Settings validation error:', error.errors);
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
