import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMockProvider } from '@/providers/mock/mock-provider';
import { validateOrigin } from '@/lib/csrf';

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const provider = getMockProvider();
  if ('simulateNewMessage' in provider && typeof provider.simulateNewMessage === 'function') {
    await provider.simulateNewMessage(session.accountId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Not available' }, { status: 400 });
}
