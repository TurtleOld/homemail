'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Clock, HardDrive, Mail, RefreshCw, Server, Shield, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SettingsSectionError,
  SettingsSectionHeader,
  SettingsSectionLoading,
} from '@/components/settings/settings-section-state';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  system: { uptime: number; memory: { used: number; total: number; percentage: number } };
  security: {
    recentEvents: { total: number; byType: Record<string, number>; bySeverity: Record<string, number> };
    last24Hours: { failedLogins: number; blockedIps: number; csrfViolations: number; suspiciousActivity: number };
  };
  storage: { available: boolean; writable: boolean };
  mailProvider?: { available: boolean; responseTime?: number; error?: string };
  stalwart?: {
    reachable: boolean;
    queue: { total: number; hasEntries: boolean } | null;
    reports: { total: number; hasEntries: boolean } | null;
  };
  checks: { storage: boolean; mailProvider: boolean; security: boolean };
}

async function fetchMonitoringData(): Promise<HealthStatus> {
  const response = await fetch('/api/monitoring?detailed=true');
  if (!response.ok) throw new Error('monitoring_unavailable');
  const body = await response.json();
  if (!body || !body.system || !body.security || !body.checks) throw new Error('monitoring_invalid');
  return body as HealthStatus;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}

function CheckRow({ label, ok }: { readonly label: string; readonly ok: boolean }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      {ok ? <CheckCircle2 className="h-5 w-5 text-[hsl(var(--status-success))]" aria-hidden="true" /> : <XCircle className="h-5 w-5 text-destructive" aria-hidden="true" />}
    </div>
  );
}

export function MonitoringDashboard() {
  const locale = useLocale();
  const t = useTranslations('settings.monitoring');
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['monitoring'],
    queryFn: fetchMonitoringData,
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

  const uptimeMinutes = Math.floor(data.system.uptime / 60);
  const uptime = uptimeMinutes >= 1440
    ? t('uptimeDays', { days: Math.floor(uptimeMinutes / 1440), hours: Math.floor((uptimeMinutes % 1440) / 60) })
    : uptimeMinutes >= 60
      ? t('uptimeHours', { hours: Math.floor(uptimeMinutes / 60), minutes: uptimeMinutes % 60 })
      : t('uptimeMinutes', { minutes: uptimeMinutes });

  const statusLabel = t(`status.${data.status}`);
  const eventTypeLabels: Record<string, string> = {
    login_failed: t('eventTypes.login_failed'),
    login_success: t('eventTypes.login_success'),
    login_blocked: t('eventTypes.login_blocked'),
    session_created: t('eventTypes.session_created'),
    session_invalidated: t('eventTypes.session_invalidated'),
    session_hijack_attempt: t('eventTypes.session_hijack_attempt'),
    rate_limit_exceeded: t('eventTypes.rate_limit_exceeded'),
    csrf_violation: t('eventTypes.csrf_violation'),
    suspicious_activity: t('eventTypes.suspicious_activity'),
    unauthorized_access: t('eventTypes.unauthorized_access'),
    password_change: t('eventTypes.password_change'),
    account_locked: t('eventTypes.account_locked'),
    ip_blocked: t('eventTypes.ip_blocked'),
    file_access_denied: t('eventTypes.file_access_denied'),
    ssrf_attempt: t('eventTypes.ssrf_attempt'),
    path_traversal_attempt: t('eventTypes.path_traversal_attempt'),
  };
  const severityLabels: Record<string, string> = {
    low: t('severities.low'),
    medium: t('severities.medium'),
    high: t('severities.high'),
    critical: t('severities.critical'),
  };
  const alerts = [
    !data.checks.storage ? t('alerts.storage') : null,
    !data.checks.mailProvider ? t('alerts.mailProvider') : null,
    data.security.last24Hours.failedLogins > 50 ? t('alerts.failedLogins', { count: data.security.last24Hours.failedLogins }) : null,
    data.security.last24Hours.csrfViolations > 20 ? t('alerts.csrf', { count: data.security.last24Hours.csrfViolations }) : null,
    data.security.last24Hours.suspiciousActivity > 10 ? t('alerts.suspicious', { count: data.security.last24Hours.suspiciousActivity }) : null,
    data.system.memory.percentage > 90 ? t('alerts.memory', { percentage: data.system.memory.percentage.toFixed(1) }) : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <section className="space-y-7">
      <SettingsSectionHeader
        title={t('heading')}
        description={t('description')}
        actions={
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`} />
            {isFetching ? t('refreshing') : t('refresh')}
          </Button>
        }
      />

      <div className="grid border-l border-t border-border sm:grid-cols-3">
        <div className="border-b border-r border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Activity className="h-4 w-4" />{t('overallStatus')}</div>
          <p className="mt-2 font-semibold">{statusLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('updated', { value: new Date(data.timestamp).toLocaleString(locale) })}</p>
        </div>
        <div className="border-b border-r border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Server className="h-4 w-4" />{t('uptime')}</div>
          <p className="mt-2 font-semibold tabular-nums">{uptime}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('sinceStart')}</p>
        </div>
        <div className="border-b border-r border-border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><HardDrive className="h-4 w-4" />{t('memory')}</div>
          <p className="mt-2 font-semibold tabular-nums">{data.system.memory.percentage.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatBytes(data.system.memory.used)} / {formatBytes(data.system.memory.total)}</p>
        </div>
      </div>

      <div className="grid gap-7 md:grid-cols-2">
        <section aria-labelledby="monitoring-security-title">
          <h3 id="monitoring-security-title" className="flex items-center gap-2 font-semibold"><Shield className="h-4 w-4 text-muted-foreground" />{t('security24h')}</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {[
              [t('failedLogins'), data.security.last24Hours.failedLogins],
              [t('blockedIps'), data.security.last24Hours.blockedIps],
              [t('csrfViolations'), data.security.last24Hours.csrfViolations],
              [t('suspiciousActivity'), data.security.last24Hours.suspiciousActivity],
              [t('totalEvents'), data.security.recentEvents.total],
            ].map(([label, value]) => <div key={String(label)} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums font-medium">{value}</dd></div>)}
          </dl>
        </section>

        <section aria-labelledby="monitoring-checks-title">
          <h3 id="monitoring-checks-title" className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4 text-muted-foreground" />{t('checks')}</h3>
          <div className="mt-2 divide-y divide-border">
            <CheckRow label={t('storage')} ok={data.checks.storage} />
            <CheckRow label={t('mailServer')} ok={data.checks.mailProvider} />
            <CheckRow label={t('security')} ok={data.checks.security} />
          </div>
          {data.mailProvider?.available && data.mailProvider.responseTime !== undefined && (
            <p className="mt-2 text-xs text-muted-foreground">{t('responseTime', { milliseconds: data.mailProvider.responseTime })}</p>
          )}
        </section>
      </div>

      {data.stalwart && (
        <section className="rounded-lg border border-border p-4" aria-labelledby="stalwart-monitoring-title">
          <h3 id="stalwart-monitoring-title" className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-muted-foreground" />{t('stalwartHeading')}</h3>
          {!data.stalwart.reachable ? (
            <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--status-warning))]" /><p>{t('stalwartUnavailable')}</p></div>
          ) : (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><dt className="text-sm text-muted-foreground">{t('queue')}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{data.stalwart.queue?.total ?? '-'}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t('reports')}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{data.stalwart.reports?.total ?? '-'}</dd></div>
            </dl>
          )}
          {data.stalwart.reachable && (!data.stalwart.queue || !data.stalwart.reports) && (
            <p className="mt-3 text-sm text-muted-foreground">{t('stalwartPartial')}</p>
          )}
        </section>
      )}

      {alerts.length > 0 && (
        <section className="rounded-lg border border-[hsl(var(--status-warning)/0.45)] bg-[hsl(var(--status-warning)/0.08)] p-4" aria-labelledby="monitoring-alerts-title">
          <h3 id="monitoring-alerts-title" className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-[hsl(var(--status-warning))]" />{t('warnings')}</h3>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{alerts.map((alert) => <li key={alert}>{alert}</li>)}</ul>
        </section>
      )}

      <section aria-labelledby="monitoring-events-title">
        <h3 id="monitoring-events-title" className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4 text-muted-foreground" />{t('eventStatistics')}</h3>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <div><p className="text-sm font-medium">{t('byType')}</p><dl className="mt-2 space-y-1">{Object.entries(data.security.recentEvents.byType).slice(0, 5).map(([key, count]) => <div key={key} className="flex justify-between gap-4 text-sm"><dt className="truncate text-muted-foreground">{eventTypeLabels[key] ?? t('unknownEvent')}</dt><dd className="tabular-nums font-medium">{count}</dd></div>)}</dl></div>
          <div><p className="text-sm font-medium">{t('bySeverity')}</p><dl className="mt-2 space-y-1">{Object.entries(data.security.recentEvents.bySeverity).map(([key, count]) => <div key={key} className="flex justify-between gap-4 text-sm"><dt className="truncate text-muted-foreground">{severityLabels[key] ?? t('unknownSeverity')}</dt><dd className="tabular-nums font-medium">{count}</dd></div>)}</dl></div>
        </div>
      </section>
    </section>
  );
}
