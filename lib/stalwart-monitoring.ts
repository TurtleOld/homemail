import { logger } from '@/lib/logger';

export interface QueueStatus {
  total: number;
  hasEntries: boolean;
}

export interface ReportBacklogStatus {
  total: number;
  hasEntries: boolean;
}

export interface StalwartSystemStatus {
  reachable: boolean;
  queue: QueueStatus | null;
  reports: ReportBacklogStatus | null;
}

export class StalwartMonitoringError extends Error {
  constructor(public readonly code: 'missing_api_key' | 'unreachable' | 'invalid_response') {
    super(code);
    this.name = 'StalwartMonitoringError';
  }
}

interface StalwartCountResponse {
  data?: { total?: unknown };
  error?: unknown;
}

/**
 * Fetches a read-only Stalwart Management API endpoint that returns
 * `{"data": {"total": N, ...}}` and reads only the `total` count.
 *
 * Stalwart 0.15.3 was confirmed (during the ADR 0009 investigation) to
 * return HTTP 200 with an `{"error": ...}` body for some failure conditions
 * rather than a non-2xx status, so the `error` field is checked regardless
 * of HTTP status rather than relying on `response.ok` alone.
 */
async function fetchTotalCount(path: string, baseUrl: string, apiKey: string): Promise<number> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });

  const body = (await response.json().catch(() => null)) as StalwartCountResponse | null;

  if (!body || body.error !== undefined) {
    throw new StalwartMonitoringError('invalid_response');
  }

  const total = body.data?.total;
  if (typeof total !== 'number' || !Number.isFinite(total)) {
    throw new StalwartMonitoringError('invalid_response');
  }

  return total;
}

/**
 * Reads mail queue and report backlog counts from Stalwart's read-only
 * Management API. Never mutates any Stalwart or HomeMail state. Queue and
 * report reads fail independently so one unavailable endpoint does not hide
 * a healthy result from the other endpoint.
 */
export async function getStalwartSystemStatus(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<StalwartSystemStatus> {
  const apiKey = environment.STALWART_ADMIN_API_KEY?.trim();
  if (!apiKey) {
    logger.warn('[StalwartMonitoring] STALWART_ADMIN_API_KEY is not configured');
    return { reachable: false, queue: null, reports: null };
  }

  const baseUrl = environment.STALWART_BASE_URL || 'http://stalwart:8080';

  const [queueResult, reportsResult] = await Promise.allSettled([
    fetchTotalCount('/api/queue/messages', baseUrl, apiKey),
    fetchTotalCount('/api/queue/reports', baseUrl, apiKey),
  ]);
  const queue = queueResult.status === 'fulfilled'
    ? { total: queueResult.value, hasEntries: queueResult.value > 0 }
    : null;
  const reports = reportsResult.status === 'fulfilled'
    ? { total: reportsResult.value, hasEntries: reportsResult.value > 0 }
    : null;

  if (!queue || !reports) {
    const failureCodes = [queueResult, reportsResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason instanceof StalwartMonitoringError ? result.reason.code : 'unreachable');
    logger.warn('[StalwartMonitoring] One or more read-only checks failed', {
      failureCodes,
    });
  }

  return { reachable: Boolean(queue || reports), queue, reports };
}
