'use client';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, Copy, Download, RotateCw, WrapText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildMailMessageHref } from '@/lib/mail-url-state';
import { cn } from '@/lib/utils';
import type { MessageSourceDiagnostics, SourceAuthResult, SourceAuthStatus } from '@/lib/types';

class SourceFetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type SourceQueryResult =
  | { kind: 'ready'; text: string }
  | { kind: 'oversized'; size: number; limit: number };

async function fetchDiagnostics(id: string): Promise<{ size: number; diagnostics: MessageSourceDiagnostics }> {
  const res = await fetch(`/api/mail/messages/${id}/source/diagnostics`, { cache: 'no-store' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new SourceFetchError(data.error || 'Failed to load diagnostics', res.status);
  }
  return res.json();
}

async function fetchSource(id: string): Promise<SourceQueryResult> {
  const res = await fetch(`/api/mail/messages/${id}/source`, { cache: 'no-store' });
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.oversized) {
      return { kind: 'oversized', size: data.size, limit: data.limit };
    }
    throw new SourceFetchError(data.error || 'Failed to load message source', res.status);
  }

  if (!res.ok) {
    throw new SourceFetchError('Failed to load message source', res.status);
  }

  const text = await res.text();
  return { kind: 'ready', text };
}

function formatAddress(addr: { email: string; name?: string }): string {
  return addr.name ? `${addr.name} <${addr.email}>` : addr.email;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function authBadgeClass(status: SourceAuthStatus): string {
  if (status === 'pass') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600';
  }
  if (status === 'unavailable' || status === 'none' || status === 'neutral') {
    return 'border-border bg-muted text-muted-foreground';
  }
  return 'border-destructive/30 bg-destructive/10 text-destructive';
}

function DiagnosticsSummary({
  diagnostics,
  t,
}: {
  diagnostics: MessageSourceDiagnostics;
  t: ReturnType<typeof useTranslations<'messageSource'>>;
}) {
  const authRows: Array<{ key: 'spf' | 'dkim' | 'dmarc'; result: SourceAuthResult }> = [
    { key: 'spf', result: diagnostics.spf },
    { key: 'dkim', result: diagnostics.dkim },
    { key: 'dmarc', result: diagnostics.dmarc },
  ];

  return (
    <div className="mb-4 rounded-md border border-border bg-card p-4 text-sm" aria-label={t('diagnosticsLabel')}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{t('from')}</dt>
        <dd>{formatAddress(diagnostics.from)}</dd>
        <dt className="text-muted-foreground">{t('to')}</dt>
        <dd>{diagnostics.to.length > 0 ? diagnostics.to.map(formatAddress).join(', ') : t('unavailableValue')}</dd>
        {diagnostics.cc && diagnostics.cc.length > 0 && (
          <>
            <dt className="text-muted-foreground">{t('cc')}</dt>
            <dd>{diagnostics.cc.map(formatAddress).join(', ')}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t('subject')}</dt>
        <dd>{diagnostics.subject || t('noSubject')}</dd>
        <dt className="text-muted-foreground">{t('messageId')}</dt>
        <dd className="break-all font-mono text-xs">{diagnostics.messageId || t('unavailableValue')}</dd>
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {authRows.map(({ key, result }) => (
          <span
            key={key}
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-mono font-semibold',
              authBadgeClass(result.status)
            )}
            title={
              result.domain
                ? `${key.toUpperCase()}: ${t(`authStatus.${result.status}`)} (${result.domain})`
                : `${key.toUpperCase()}: ${t(`authStatus.${result.status}`)}`
            }
          >
            {key.toUpperCase()}: {t(`authStatus.${result.status}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MessageSourcePage() {
  const params = useParams() as { locale: string; messageId: string };
  const router = useRouter();
  const t = useTranslations('messageSource');
  const { locale, messageId: id } = params;

  const [wrap, setWrap] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const diagnosticsQuery = useQuery({
    queryKey: ['message-source-diagnostics', id, reloadToken],
    queryFn: () => fetchDiagnostics(id),
    retry: false,
  });

  const sourceQuery = useQuery({
    queryKey: ['message-source', id, reloadToken],
    queryFn: () => fetchSource(id),
    retry: false,
  });

  const handleReturn = useCallback(() => {
    if (window.opener) {
      window.close();
      return;
    }
    const href = buildMailMessageHref(locale, id, { search: '', presentation: 'conversation' });
    router.push(href);
  }, [locale, id, router]);

  const handleRetry = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  const handleCopy = useCallback(async () => {
    if (sourceQuery.data?.kind !== 'ready') return;
    try {
      await navigator.clipboard.writeText(sourceQuery.data.text);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }, [sourceQuery.data, t]);

  const downloadHref = `/api/mail/messages/${id}/source?download=1`;
  const isLoading = diagnosticsQuery.isLoading || sourceQuery.isLoading;
  const hasError = sourceQuery.isError;
  const canDownload = sourceQuery.data?.kind === 'ready' || sourceQuery.data?.kind === 'oversized';

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={handleReturn}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('returnToMessage')}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {sourceQuery.data?.kind === 'ready' && (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={wrap}
                onClick={() => setWrap((value) => !value)}
              >
                <WrapText className="mr-2 h-4 w-4" />
                {wrap ? t('disableWrap') : t('enableWrap')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                {t('copy')}
              </Button>
            </>
          )}
          {canDownload && (
            <a href={downloadHref} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" />
                {t('download')}
              </Button>
            </a>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {diagnosticsQuery.data && (
          <DiagnosticsSummary diagnostics={diagnosticsQuery.data.diagnostics} t={t} />
        )}
        {diagnosticsQuery.isError && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t('diagnosticsUnavailable')}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            {t('loading')}
          </div>
        )}

        {hasError && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('loadError')}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                <RotateCw className="mr-2 h-4 w-4" />
                {t('retry')}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleReturn}>
                {t('returnToMessage')}
              </Button>
            </div>
          </div>
        )}

        {sourceQuery.data?.kind === 'oversized' && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {t('oversized', {
                size: formatBytes(sourceQuery.data.size),
                limit: formatBytes(sourceQuery.data.limit),
              })}
            </p>
            <a href={downloadHref} target="_blank" rel="noopener noreferrer">
              <Button variant="default" size="sm">
                <Download className="mr-2 h-4 w-4" />
                {t('download')}
              </Button>
            </a>
          </div>
        )}

        {sourceQuery.data?.kind === 'ready' && (
          <pre
            className={cn(
              'rounded-md border border-border bg-muted/30 p-4 font-mono text-xs leading-relaxed',
              wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-auto'
            )}
          >
            {sourceQuery.data.text}
          </pre>
        )}
      </div>
    </div>
  );
}
