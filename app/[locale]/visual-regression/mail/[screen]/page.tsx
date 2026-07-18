import { notFound } from 'next/navigation';
import { MailWorkspaceFixture } from '@/components/visual-regression/mail-workspace-fixture';

export default async function MailVisualFixturePage({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (screen !== 'list' && screen !== 'reader') notFound();
  return <MailWorkspaceFixture screen={screen} />;
}
