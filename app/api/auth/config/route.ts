import { NextResponse } from 'next/server';
import { getAuthMode, isPasswordLoginEnabled } from '@/lib/auth-config';

export async function GET() {
  // Safe to expose: does not leak secrets, only informs UI.
  return NextResponse.json({
    authMode: getAuthMode(),
    passwordLoginEnabled: isPasswordLoginEnabled(),
  });
}
