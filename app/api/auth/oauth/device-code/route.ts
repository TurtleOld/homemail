import { NextRequest, NextResponse } from 'next/server';
import { DeviceFlowClient } from '@/lib/oauth-device-flow';
import { validateOrigin } from '@/lib/csrf';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    let discoveryUrl = process.env.OAUTH_DISCOVERY_URL;
    if (!discoveryUrl || discoveryUrl.includes('example.com')) {
      discoveryUrl = (process.env.STALWART_BASE_URL?.replace(/\/$/, '') || 'http://stalwart:8080') + '/.well-known/oauth-authorization-server';
      logger.info(`OAuth discovery URL not set or contains example.com, using auto-detected: ${discoveryUrl}`);
    }
    const clientId = process.env.OAUTH_CLIENT_ID || '';

    if (!discoveryUrl || !clientId) {
      return NextResponse.json(
        { error: 'OAuth configuration missing: OAUTH_DISCOVERY_URL and OAUTH_CLIENT_ID are required' },
        { status: 500 }
      );
    }

    const deviceFlow = new DeviceFlowClient(
      discoveryUrl,
      clientId,
      ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'offline_access']
    );

    const deviceCodeResponse = await deviceFlow.requestDeviceCode();

    return NextResponse.json({
      deviceCode: deviceCodeResponse.device_code,
      userCode: deviceCodeResponse.user_code,
      verificationUri: deviceCodeResponse.verification_uri,
      verificationUriComplete: deviceCodeResponse.verification_uri_complete,
      expiresIn: deviceCodeResponse.expires_in,
      interval: deviceCodeResponse.interval || 5,
    });
  } catch (error) {
    logger.error('Error requesting device code:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to request device code: ${errorMessage}` },
      { status: 500 }
    );
  }
}
