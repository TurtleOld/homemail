import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import { z } from 'zod';
import type { PGPKey } from '@/lib/types';

const generateKeySchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  passphrase: z.string().optional(),
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
    const data = generateKeySchema.parse(body);

    const openpgp = await import('openpgp');

    const { privateKey, publicKey } = await openpgp.generateKey({
      type: 'rsa',
      rsaBits: 2048,
      userIDs: [{ email: data.email, name: data.name || data.email }],
      passphrase: data.passphrase || undefined,
    });

    const publicKeyObj = await openpgp.readKey({ armoredKey: publicKey });

    const key: PGPKey = {
      id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      email: data.email,
      name: data.name,
      publicKey: publicKey,
      privateKey: privateKey,
      fingerprint: publicKeyObj.getFingerprint(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const keys = await readStorage<PGPKey[]>(`pgpKeys:${session.accountId}`, []);
    keys.push(key);
    await writeStorage(`pgpKeys:${session.accountId}`, keys);

    return NextResponse.json({ ...key, privateKey: undefined });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error generating PGP key:', error);
    return NextResponse.json({ error: 'Failed to generate key' }, { status: 500 });
  }
}
