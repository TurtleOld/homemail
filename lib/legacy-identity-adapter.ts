import type { SessionData } from './session';
import type { UserAccount } from './storage';
import type { AuthorizationSubject } from './authorization-policy';

/**
 * Read-only bridge for existing sessions and user_accounts.json records.
 * It creates no HomeMail identity or mailbox-assignment records.
 */
export function legacyAuthorizationSubject(
  session: Pick<SessionData, 'accountId' | 'email'>,
  accounts: readonly UserAccount[],
): AuthorizationSubject {
  const assignedMailboxIds = new Set(accounts.map((account) => account.id));

  // Old installations may have a valid session before user_accounts.json was
  // populated. Preserve that exact active mailbox as the compatibility floor.
  assignedMailboxIds.add(session.accountId);

  return {
    mode: 'legacy-compatibility',
    memberId: `legacy:${session.email}`,
    activeMailboxId: session.accountId,
    assignedMailboxIds,
  };
}

export type LegacyAccountsReader = (userId: string) => Promise<readonly UserAccount[]>;

/**
 * Resolves compatibility assignments through a server-owned reader. The
 * lookup key comes from the authenticated legacy session, never a request
 * parameter.
 */
export async function readLegacyAuthorizationSubject(
  session: Pick<SessionData, 'accountId' | 'email'>,
  readAccounts: LegacyAccountsReader,
): Promise<AuthorizationSubject> {
  return legacyAuthorizationSubject(session, await readAccounts(session.email));
}

/**
 * Existing .settings.json entries are mailbox-account keyed. Until the later
 * scoped-settings migration, all compatibility reads and writes retain the
 * authenticated session's active account key.
 */
export function legacySettingsAccountId(
  session: Pick<SessionData, 'accountId'>,
): string {
  return session.accountId;
}
