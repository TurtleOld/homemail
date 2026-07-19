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
 * Management API. Never mutates any Stalwart or HomeMail state. Any failure
 * (missing key, network error, unexpected response shape) is reported as
 * `reachable: false` with `queue`/`reports` left null rather than thrown,
 * so the Settings page can show a quiet unavailable state instead of an
 * unhandled error.
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

  try {
    const [queueTotal, reportsTotal] = await Promise.all([
      fetchTotalCount('/api/queue/messages', baseUrl, apiKey),
      fetchTotalCount('/api/queue/reports', baseUrl, apiKey),
    ]);

    return {
      reachable: true,
      queue: { total: queueTotal, hasEntries: queueTotal > 0 },
      reports: { total: reportsTotal, hasEntries: reportsTotal > 0 },
    };
  } catch (error) {
    logger.warn('[StalwartMonitoring] Failed to read Stalwart system status', {
      message: error instanceof Error ? error.message : String(error),
    });
    return { reachable: false, queue: null, reports: null };
  }
}
