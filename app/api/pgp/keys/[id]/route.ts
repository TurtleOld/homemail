import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';
import type { PGPKey } from '@/lib/types';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const keys = await readStorage<PGPKey[]>(`pgpKeys:${session.accountId}`, []);
    const keyIndex = keys.findIndex((k) => k.id === id);

    if (keyIndex === -1) {
      return NextResponse.json({ error: 'Ключ не найден' }, { status: 404 });
    }

    const filteredKeys = keys.filter((k) => k.id !== id);
    await writeStorage(`pgpKeys:${session.accountId}`, filteredKeys);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting PGP key:', error);
    return NextResponse.json({ error: 'Ошибка удаления ключа' }, { status: 500 });
  }
}
