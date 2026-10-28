import { StalwartJMAPProvider } from '@/providers/stalwart-jmap/stalwart-provider';
import type { MailProvider } from '@/providers/mail-provider';

const stalwartProviders = new Map<string, StalwartJMAPProvider>();

export function getMailProviderForAccount(accountId: string): MailProvider {
  if (!stalwartProviders.has(accountId)) {
    stalwartProviders.set(accountId, new StalwartJMAPProvider());
  }
  return stalwartProviders.get(accountId)!;
}
