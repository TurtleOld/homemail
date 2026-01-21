import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import { z } from 'zod';
import type { PGPKey } from '@/lib/types';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const keys = await readStorage<PGPKey[]>(`pgpKeys:${session.accountId}`, []);

    return NextResponse.json(keys);
  } catch (error) {
    console.error('Error fetching PGP keys:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const importKeySchema = z.object({
  keyData: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
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
    const data = importKeySchema.parse(body);

    const openpgp = await import('openpgp');
    const publicKey = await openpgp.readKey({ armoredKey: data.keyData });

    const key: PGPKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      email: data.email,
      name: data.name,
      publicKey: data.keyData,
      fingerprint: publicKey.getFingerprint(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const keys = await readStorage<PGPKey[]>(`pgpKeys:${session.accountId}`, []);
    keys.push(key);
    await writeStorage(`pgpKeys:${session.accountId}`, keys);

    return NextResponse.json(key);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error importing PGP key:', error);
    return NextResponse.json({ error: 'Failed to import key' }, { status: 500 });
  }
}
