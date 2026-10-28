import { NextResponse } from 'next/server';
import { deleteSession, getSession } from '@/lib/session';
import { countAccountSessions, deleteSession as deleteStoredSession } from '@/lib/storage';
import { OAuthTokenStore } from '@/lib/oauth-token-store';
import { OAuthJMAPClient } from '@/lib/oauth-jmap-client';

export async function POST() {
  const session = await getSession();

  if (session) {
    // Drop this session before counting: the OAuth token is shared by every
    // session of the account, so it must stay alive while another device is
    // still signed in.
    await deleteStoredSession(session.sessionId);

    if ((await countAccountSessions(session.accountId)) === 0) {
      const discoveryUrl = process.env.STALWART_DISCOVERY_URL || `${process.env.STALWART_BASE_URL}/.well-known/oauth-authorization-server`;
      const clientId = process.env.OAUTH_CLIENT_ID || 'mailclient';

      // Best-effort token revocation at the authorization server
      try {
        const oauthClient = new OAuthJMAPClient({
          discoveryUrl,
          clientId,
          baseUrl: process.env.STALWART_BASE_URL || '',
          accountId: session.accountId,
        });
        await oauthClient.revokeToken();
      } catch {
        // Non-fatal: proceed with local cleanup regardless
      }

      const tokenStore = new OAuthTokenStore();
      await tokenStore.deleteToken(session.accountId);
    }
  }

  await deleteSession();
  return NextResponse.json({ success: true });
}
