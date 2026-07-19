'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Database } from 'lucide-react';
import { SettingsSectionHeader } from '@/components/settings/settings-section-state';

/**
 * Phase 6 intentionally keeps backup and restore outside HomeMail.
 * The legacy /api/backup contract is retained for rollback compatibility, but
 * this Settings surface is presentation-only per ADR 0008/0009.
 */
export function BackupRestore() {
  const t = useTranslations('settings.backup');

  return (
    <section className="space-y-6">
      <SettingsSectionHeader title={t('heading')} description={t('description')} />

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(16rem,0.75fr)]">
        <div className="space-y-4">
          <h3 className="text-base font-semibold">{t('operatorHeading')}</h3>
          <ol className="space-y-3 text-sm leading-6 text-muted-foreground">
            <li className="flex gap-3"><span className="font-mono text-foreground">1</span><span>{t('stepInventory')}</span></li>
            <li className="flex gap-3"><span className="font-mono text-foreground">2</span><span>{t('stepBackup')}</span></li>
            <li className="flex gap-3"><span className="font-mono text-foreground">3</span><span>{t('stepRestore')}</span></li>
            <li className="flex gap-3"><span className="font-mono text-foreground">4</span><span>{t('stepVerify')}</span></li>
          </ol>
        </div>

        <aside className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-medium">{t('runbookHeading')}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('runbookDescription')}</p>
              <code className="mt-3 block break-all rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground">docs/MAIL-REDESIGN-PHASE0-RUNBOOK.md</code>
            </div>
          </div>
        </aside>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-[hsl(var(--status-warning)/0.45)] bg-[hsl(var(--status-warning)/0.08)] p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--status-warning))]" />
        <p className="leading-6 text-muted-foreground">{t('boundary')}</p>
      </div>
    </section>
  );
}
