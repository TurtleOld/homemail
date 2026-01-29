import { NextResponse } from 'next/server';

/**
 * OAuth-only mode: login via password/TOTP is disabled.
 * All authentication is handled through OAuth flow.
 *
 * Users should use /api/auth/oauth/authorize instead.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'Password login is disabled. Please use OAuth authentication.',
      requiresOAuth: true
    },
    { status: 400 }
  );
}
