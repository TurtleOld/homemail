import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import { z } from 'zod';
import type { PGPKey } from '@/lib/types';

const encryptSchema = z.object({
  message: z.string().min(1),
  recipientEmails: z.array(z.string().email()),
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
    const data = encryptSchema.parse(body);

    const keys = await readStorage<PGPKey[]>(`pgpKeys:${session.accountId}`, []);
    const recipientKeys = keys.filter((key) => data.recipientEmails.includes(key.email));

    if (recipientKeys.length === 0) {
      return NextResponse.json({ error: 'No PGP keys found for recipients' }, { status: 400 });
    }

    const openpgp = await import('openpgp');
    const publicKeys = await Promise.all(
      recipientKeys.map((key) => openpgp.readKey({ armoredKey: key.publicKey }))
    );

    const encrypted = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: data.message }),
      encryptionKeys: publicKeys,
    });

    const encryptedMessage = await encrypted.getArmored();

    return NextResponse.json({ encryptedMessage });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error encrypting message:', error);
    return NextResponse.json({ error: 'Failed to encrypt message' }, { status: 500 });
  }
}
