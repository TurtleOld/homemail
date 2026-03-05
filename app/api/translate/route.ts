import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import { z } from 'zod';
import { logger } from '@/lib/logger';

// ── Feature flag ──────────────────────────────────────────────────────────────
//
// TRANSLATE_PROVIDER controls which backend is used:
//   "google"        – Google Translate unofficial endpoint (default)
//   "disabled"      – feature disabled; returns 503
//   "libretranslate" – placeholder for self-hosted LibreTranslate
//
// When "google" is active, note that email text is sent to Google's servers.
// Users should be informed of this in the UI.
const TRANSLATE_PROVIDER = (process.env.TRANSLATE_PROVIDER ?? 'google').toLowerCase();

/** Maximum characters allowed in a single translate request. */
const MAX_TEXT_LENGTH = 5000;

const translateSchema = z.object({
  text: z.string().min(1).max(MAX_TEXT_LENGTH),
  targetLang: z.string().length(2),
  sourceLang: z.string().length(2).optional(),
});

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  if (TRANSLATE_PROVIDER === 'disabled') {
    return NextResponse.json({ error: 'Translation feature is disabled' }, { status: 503 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = translateSchema.parse(body);

    // Do NOT log the text content — it may contain email body PII.
    logger.info('[Translate] Request', {
      provider: TRANSLATE_PROVIDER,
      targetLang: data.targetLang,
      sourceLang: data.sourceLang ?? 'auto',
      textLength: data.text.length,
    });

    const translatedText = await translateText(data.text, data.targetLang, data.sourceLang);

    return NextResponse.json({ translatedText });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('[Translate] Error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}

async function translateText(text: string, targetLang: string, sourceLang?: string): Promise<string> {
  if (TRANSLATE_PROVIDER === 'google') {
    return translateGoogle(text, targetLang, sourceLang);
  }
  // Future: add libretranslate branch here.
  throw new Error(`Unknown translation provider: ${TRANSLATE_PROVIDER}`);
}

/**
 * Google Translate unofficial endpoint.
 * ⚠️  Text is transmitted to Google's servers.
 */
async function translateGoogle(text: string, targetLang: string, sourceLang?: string): Promise<string> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', sourceLang ?? 'auto');
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const response = await fetch(url.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!response.ok) {
    throw new Error(`Translation API returned ${response.status}`);
  }

  const result = await response.json();

  if (Array.isArray(result) && result[0] && Array.isArray(result[0])) {
    return result[0].map((item: unknown[]) => item[0]).join('');
  }

  return text;
}
