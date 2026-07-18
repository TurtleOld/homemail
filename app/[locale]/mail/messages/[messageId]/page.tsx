import { notFound } from 'next/navigation';
import { isRedesignFeatureEnabled } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export default function MailMessagePage() {
  if (!isRedesignFeatureEnabled('listFirstMail')) notFound();
  return null;
}
