import { NextRequest, NextResponse } from 'next/server';
import { getHealthStatus, checkAlerts, type HealthStatus } from '@/lib/monitoring';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const includeMailProvider = searchParams.get('mail') !== 'false';
  const includeAlerts = searchParams.get('alerts') === 'true';
  const detailed = searchParams.get('detailed') === 'true';

  try {
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
