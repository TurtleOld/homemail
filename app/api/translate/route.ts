import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { validateOrigin } from '@/lib/csrf';
import { z } from 'zod';

const translateSchema = z.object({
  text: z.string().min(1),
  targetLang: z.string().length(2),
  sourceLang: z.string().length(2).optional(),
});

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = translateSchema.parse(body);

    const translatedText = await translateText(data.text, data.targetLang, data.sourceLang);

    return NextResponse.json({ translatedText });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error translating:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function translateText(text: string, targetLang: string, sourceLang?: string): Promise<string> {
  try {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', sourceLang || 'auto');
    url.searchParams.set('tl', targetLang);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', text);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const result = await response.json();
    
    if (Array.isArray(result) && result[0] && Array.isArray(result[0])) {
      return result[0].map((item: any[]) => item[0]).join('');
    }

    return text;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
