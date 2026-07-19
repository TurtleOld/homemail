import { notFound } from 'next/navigation';
import { MonitoringDashboard } from '@/components/monitoring-dashboard';
import { StatisticsDashboard } from '@/components/statistics-dashboard';
import SettingsPage from '@/app/[locale]/settings/page';
import { isSettingsSectionId } from '@/lib/settings-routes';

export default async function SettingsCapabilityFixture({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  const { screen } = await params;
  if (!isSettingsSectionId(screen)) notFound();

  if (screen !== 'monitoring' && screen !== 'statistics') return <SettingsPage />;

  return (
    <main className="mail-app-shell min-h-dvh px-4 py-8 sm:px-6" data-testid={`settings-${screen}-fixture`}>
      <div className="mail-panel-surface mx-auto max-w-4xl rounded-xl border border-border p-5 sm:p-7">
        {screen === 'monitoring' ? <MonitoringDashboard /> : <StatisticsDashboard />}
      </div>
    </main>
  );
}
