import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession } from '@/lib/session';
import { checkRateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { getMailProvider, getMailProviderForAccount, ensureAccount } from '@/lib/get-provider';

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const rateLimit = checkRateLimit(ip, 'login');

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', resetAt: rateLimit.resetAt },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const accountId = email;
    ensureAccount(accountId, email, password);
    const provider = process.env.MAIL_PROVIDER === 'stalwart' 
      ? getMailProviderForAccount(accountId)
      : getMailProvider();
    
    try {
      const account = await provider.getAccount(accountId);

      if (!account) {
        console.error('Account not found for:', email);
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      await createSession(accountId, email);

      return NextResponse.json({ success: true, account: { id: account.id, email: account.email, displayName: account.displayName } });
    } catch (providerError) {
      console.error('Provider error during login:', providerError);
      if (providerError instanceof Error) {
        return NextResponse.json({ error: `Authentication failed: ${providerError.message}` }, { status: 401 });
      }
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
