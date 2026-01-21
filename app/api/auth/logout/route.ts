import { NextResponse } from 'next/server';
import { deleteSession, getSession } from '@/lib/session';
import { OAuthTokenStore } from '@/lib/oauth-token-store';

export async function POST() {
  const session = await getSession();
  
  if (session) {
    const tokenStore = new OAuthTokenStore();
    await tokenStore.deleteToken(session.accountId);
  }
  
  await deleteSession();
  return NextResponse.json({ success: true });
}
