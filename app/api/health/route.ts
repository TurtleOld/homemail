import { NextRequest, NextResponse } from 'next/server';
import { getHealthStatus, checkAlerts, type HealthStatus } from '@/lib/monitoring';

// Ensure long-running background tasks (like auto-sort) are started in Node runtime.
// Health endpoint is regularly polled by Docker/K8s/systemd, so this is a reliable bootstrap.
import { startAutoSortDaemon } from '@/lib/auto-sort-daemon';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const includeMailProvider = searchParams.get('mail') !== 'false';
  const includeAlerts = searchParams.get('alerts') === 'true';
  const detailed = searchParams.get('detailed') === 'true';

  try {
    // Fire-and-forget, but only after the handler is invoked (prevents starting daemon at build time).
    startAutoSortDaemon().catch((e) => {
      console.error('[health] Failed to start auto-sort daemon:', e);
    });

    const health = await getHealthStatus(includeMailProvider);

    const response: HealthStatus & { alerts?: string[] } = health;

    if (includeAlerts) {
      response.alerts = await checkAlerts();
    }

    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

    if (!detailed) {
      return NextResponse.json(
        {
          status: health.status,
          timestamp: health.timestamp,
          checks: health.checks,
          ...(includeAlerts && response.alerts ? { alerts: response.alerts } : {}),
        },
        { status: statusCode }
      );
    }

    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
