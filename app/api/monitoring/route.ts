import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getHealthStatus, checkAlerts, type HealthStatus } from '@/lib/monitoring';

export async function GET(request: NextRequest) {
  const session = await getSession(request);

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const includeAlerts = searchParams.get('alerts') === 'true';
  const detailed = searchParams.get('detailed') === 'true';

  try {
    const health = await getHealthStatus(true);
    const response: HealthStatus & { alerts?: string[] } = health;

    if (includeAlerts) {
      response.alerts = await checkAlerts();
    }

    if (!detailed) {
      return NextResponse.json(
        {
          status: health.status,
          timestamp: health.timestamp,
          checks: health.checks,
          ...(includeAlerts && response.alerts ? { alerts: response.alerts } : {}),
        },
        { status: 200 }
      );
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
