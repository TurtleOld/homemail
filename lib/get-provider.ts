import { StalwartJMAPProvider, setUserCredentials } from '@/providers/stalwart-jmap/stalwart-provider';
import type { MailProvider } from '@/providers/mail-provider';

const USE_STALWART = process.env.MAIL_PROVIDER === 'stalwart';
const USE_IMAP = process.env.MAIL_PROVIDER === 'imap';

const stalwartProviders = new Map<string, StalwartJMAPProvider>();

export function getMailProvider(): MailProvider {
  if (USE_STALWART) {
    throw new Error('Stalwart provider requires account context. Use getMailProviderForAccount() instead.');
  }
  if (USE_IMAP) {
    throw new Error('IMAP provider not yet implemented');
  }
  throw new Error('MAIL_PROVIDER must be set to "stalwart" or "imap"');
}

export function getMailProviderForAccount(accountId: string): MailProvider {
  if (USE_STALWART) {
    if (!stalwartProviders.has(accountId)) {
      stalwartProviders.set(accountId, new StalwartJMAPProvider());
    }
    return stalwartProviders.get(accountId)!;
  }
  return getMailProvider();
}

export async function ensureAccount(accountId: string, email: string, password?: string): Promise<void> {
  if (USE_STALWART && password) {
    await setUserCredentials(accountId, email, password);
    return;
  }
  if (!USE_IMAP) {
    throw new Error('MAIL_PROVIDER must be set to "stalwart" or "imap"');
  }
}
