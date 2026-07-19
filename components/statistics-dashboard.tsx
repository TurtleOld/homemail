'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileText, Mail, MailOpen, Send, Users } from 'lucide-react';
import {
  SettingsSectionEmpty,
  SettingsSectionError,
  SettingsSectionHeader,
  SettingsSectionLoading,
} from '@/components/settings/settings-section-state';

interface StatisticsData {
  totalMessages: number;
  totalUnread: number;
  totalSent: number;
  totalDrafts: number;
  messagesByDay: Array<{ date: string; incoming: number; outgoing: number }>;
  topSenders: Array<{ email: string; count: number }>;
  folderStats: Array<{ id: string; name: string; unreadCount: number }>;
}

async function fetchStatistics(): Promise<StatisticsData> {
  const response = await fetch('/api/mail/statistics');
  if (!response.ok) throw new Error('statistics_unavailable');
  const body = await response.json();
  if (!body || !Array.isArray(body.messagesByDay) || !Array.isArray(body.folderStats)) {
    throw new Error('statistics_invalid');
  }
  return body as StatisticsData;
}

export function StatisticsDashboard() {
  const locale = useLocale();
  const t = useTranslations('settings.statistics');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['statistics'],
    queryFn: fetchStatistics,
    retry: 1,
  });

  if (isLoading) return <SettingsSectionLoading label={t('loading')} />;
  if (error || !data) {
    return (
      <SettingsSectionError
        title={t('loadError')}
        description={t('loadErrorDescription')}
        retryLabel={t('retry')}
        onRetry={() => void refetch()}
      />
    );
  }

  const metrics = [
    { label: t('totalMessages'), value: data.totalMessages, help: t('allTime'), icon: Mail },
    { label: t('unread'), value: data.totalUnread, help: t('needsAttention'), icon: MailOpen },
    { label: t('sent'), value: data.totalSent, help: t('lastThirtyDays'), icon: Send },
    { label: t('drafts'), value: data.totalDrafts, help: t('notSent'), icon: FileText },
  ];

  return (
    <section className="space-y-7">
      <SettingsSectionHeader title={t('heading')} description={t('description')} />

      <div className="grid grid-cols-2 border-l border-t border-border max-sm:grid-cols-1">
        {metrics.map(({ label, value, help, icon: Icon }) => (
          <div key={label} className="border-b border-r border-border p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{help}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
        <section className="min-w-0" aria-labelledby="statistics-activity-title">
          <h3 id="statistics-activity-title" className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            {t('activity')}
          </h3>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2 font-medium">{t('date')}</th><th className="px-3 py-2 text-right font-medium">{t('incoming')}</th><th className="px-3 py-2 text-right font-medium">{t('outgoing')}</th></tr>
              </thead>
              <tbody>
                {data.messagesByDay.slice(-7).map((day) => (
                  <tr key={day.date} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(day.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{day.incoming}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{day.outgoing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="min-w-0" aria-labelledby="statistics-senders-title">
          <h3 id="statistics-senders-title" className="flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" />
            {t('topSenders')}
          </h3>
          {data.topSenders.length === 0 ? (
            <div className="mt-3"><SettingsSectionEmpty>{t('noData')}</SettingsSectionEmpty></div>
          ) : (
            <ol className="mt-3 space-y-2">
              {data.topSenders.slice(0, 5).map((sender, index) => (
                <li key={sender.email} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                  <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="truncate">{sender.email}</span>
                  <span className="tabular-nums font-medium">{sender.count}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section aria-labelledby="statistics-folders-title">
        <h3 id="statistics-folders-title" className="font-semibold">{t('folders')}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.folderStats.map((folder) => (
            <div key={folder.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-3 text-sm">
              <span className="min-w-0 truncate font-medium">{folder.name}</span>
              <span className="ml-3 shrink-0 tabular-nums text-muted-foreground">{t('unreadCount', { count: folder.unreadCount })}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
