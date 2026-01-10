import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

const settingsSchema = z.object({
  signature: z.string().optional(),
  autoReply: z.object({
    enabled: z.boolean(),
    subject: z.string().optional(),
    message: z.string().optional(),
  }).optional(),
});

const SETTINGS_FILE = path.join(process.cwd(), '.settings.json');
const settingsStore = new Map<string, any>();

async function loadSettings(): Promise<void> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const loaded = JSON.parse(data) as Record<string, any>;
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

    const settings = settingsStore.get(session.accountId) || {
      signature: '',
      autoReply: {
        enabled: false,
        subject: '',
        message: '',
      },
    };

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

    const body = await request.json();
    const data = settingsSchema.parse(body);

    settingsStore.set(session.accountId, {
      signature: data.signature || '',
      autoReply: data.autoReply || {
        enabled: false,
        subject: '',
        message: '',
      },
    });

    await saveSettings();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('Failed to save settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
