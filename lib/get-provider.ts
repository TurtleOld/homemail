import { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';
import type { MailProvider } from '@/providers/mail-provider';
import { setCredentials } from '@/lib/storage';
import { getAuthMode } from '@/lib/auth-config';

const stalwartProviders = new Map<string, StalwartJMAPProvider>();

export function getMailProvider(): MailProvider {
  throw new Error(
    'Stalwart provider requires account context. Use getMailProviderForAccount() instead.'
  );
}

export function getMailProviderForAccount(accountId: string): MailProvider {
  if (!stalwartProviders.has(accountId)) {
    stalwartProviders.set(accountId, new StalwartJMAPProvider());
  }
  return stalwartProviders.get(accountId)!;
}

export async function ensureAccount(
  accountId: string,
  email: string,
  password?: string
): Promise<void> {
  if (getAuthMode() !== 'basic') {
    return;
  }

  if (!password) {
    throw new Error('Password is required for basic authentication');
  }

  await setCredentials(accountId, email, password);
}
