import { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';
import type { MailProvider } from '@/providers/mail-provider';

const stalwartProviders = new Map<string, StalwartJMAPProvider>();

export function getMailProvider(): MailProvider {
  throw new Error('Stalwart provider requires account context. Use getMailProviderForAccount() instead.');
}

export function getMailProviderForAccount(accountId: string): MailProvider {
  if (!stalwartProviders.has(accountId)) {
    stalwartProviders.set(accountId, new StalwartJMAPProvider());
  }
  return stalwartProviders.get(accountId)!;
}

/**
 * OAuth-only mode: credentials are not used.
 * Authentication is handled via OAuth tokens.
 */
export async function ensureAccount(_accountId: string, _email: string, _password?: string): Promise<void> {
  // No-op in OAuth-only mode
}
