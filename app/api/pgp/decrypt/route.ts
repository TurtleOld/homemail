import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import { z } from 'zod';
import type { PGPKey } from '@/lib/types';

const decryptSchema = z.object({
  encryptedMessage: z.string().min(1),
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
    const data = decryptSchema.parse(body);

    const keys = await readStorage<PGPKey[]>(`pgpKeys:${session.accountId}`, []);
    const privateKey = keys.find((key) => key.privateKey);

    if (!privateKey || !privateKey.privateKey) {
      return NextResponse.json({ error: 'No private key found' }, { status: 400 });
    }

    const openpgp = await import('openpgp');
    const message = await openpgp.readMessage({
      armoredMessage: data.encryptedMessage,
    });

    const privateKeyObj = await openpgp.readPrivateKey({
      armoredKey: privateKey.privateKey,
    });

    const { data: decrypted } = await openpgp.decrypt({
      message,
      decryptionKeys: privateKeyObj,
      config: {
        allowInsecureDecryptionWithSigningKeys: false,
      },
    });

    return NextResponse.json({ decryptedMessage: decrypted });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error decrypting message:', error);
    return NextResponse.json({ error: 'Failed to decrypt message. Check your passphrase.' }, { status: 500 });
  }
}
