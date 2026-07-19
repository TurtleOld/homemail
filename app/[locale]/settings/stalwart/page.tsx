'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, ServerCog } from 'lucide-react';
import {
  SettingsSectionError,
  SettingsSectionHeader,
  SettingsSectionLoading,
} from '@/components/settings/settings-section-state';

interface StalwartEntryResponse {
  code?: string;
  message?: string;
  adminUrl?: string | null;
  error?: string;
}

export default function StalwartSettingsPage() {
  const locale = useLocale();
  const t = useTranslations('settings.stalwart');
  const [data, setData] = useState<StalwartEntryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/stalwart');
      const body = (await response.json().catch(() => null)) as StalwartEntryResponse | null;
      if (!response.ok || !body) throw new Error('stalwart_entry_unavailable');
      setData(body);
    } catch {
      setError(t('unknownError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // The locale-owned load error changes only when the route locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  return (
    <main className="mail-app-shell min-h-dvh px-4 py-8 sm:px-6">
      <div className="mail-panel-surface mx-auto max-w-3xl space-y-6 rounded-xl border border-border p-5 sm:p-7">
        <Link
          href={`/${locale}/settings`}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToSettings')}
        </Link>
        <SettingsSectionHeader title={t('heading')} description={t('description')} />

        {loading && <SettingsSectionLoading label={t('loading')} />}
        {!loading && error && (
          <SettingsSectionError
            title={t('loadError')}
            description={error}
            retryLabel={t('retry')}
            onRetry={() => void load()}
          />
        )}
        {!loading && !error && data && (
          <div className="space-y-5">
            <div className="flex items-start gap-4 rounded-lg border border-border bg-muted/30 p-4">
              <ServerCog className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h2 className="font-medium">{t('separateLoginHeading')}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('separateLoginDescription')}</p>
              </div>
            </div>

            {!data.adminUrl && <p className="text-sm text-muted-foreground">{t('urlMissing')}</p>}

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/${locale}/settings/monitoring`}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('monitoringLink')}
              </Link>
              {data.adminUrl && (
                <a
                  href={data.adminUrl}
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('openAdmin')}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
