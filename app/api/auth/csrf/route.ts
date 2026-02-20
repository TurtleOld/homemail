import { NextResponse } from 'next/server';
import { getCsrfToken } from '@/lib/csrf-tokens';

export async function GET() {
  const token = await getCsrfToken();
  return NextResponse.json({ csrfToken: token });
}

