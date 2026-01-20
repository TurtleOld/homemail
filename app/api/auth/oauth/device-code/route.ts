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
      const baseUrl = process.env.STALWART_BASE_URL || 'http://stalwart:8080';
      const isInternalUrl = baseUrl.includes('stalwart') || baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || /^http:\/\/\d+\.\d+\.\d+\.\d+/.test(baseUrl);
      
      if (isInternalUrl) {
        discoveryUrl = baseUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server';
        logger.info(`[OAuth] Using internal discovery URL from STALWART_BASE_URL: ${discoveryUrl}`);
      } else {
        const publicUrl = process.env.STALWART_PUBLIC_URL;
        if (publicUrl) {
          discoveryUrl = publicUrl.replace(/\/$/, '') + '/.well-known/oauth-authorization-server';
          logger.info(`[OAuth] Discovery URL determined from STALWART_PUBLIC_URL: ${discoveryUrl}`);
        } else {
          logger.error(`[OAuth] Discovery URL not configured. OAUTH_DISCOVERY_URL: ${process.env.OAUTH_DISCOVERY_URL || 'not set'}, STALWART_PUBLIC_URL: ${process.env.STALWART_PUBLIC_URL || 'not set'}, STALWART_BASE_URL: ${baseUrl}`);
        }
      }
    } else {
      logger.info(`[OAuth] Using explicit OAUTH_DISCOVERY_URL: ${discoveryUrl}`);
    }
    const clientId = process.env.OAUTH_CLIENT_ID || '';

    if (!discoveryUrl || !clientId) {
      logger.error(`[OAuth] Configuration missing. discoveryUrl: ${discoveryUrl || 'not set'}, clientId: ${clientId || 'not set'}`);
      return NextResponse.json(
        { 
          error: 'OAuth configuration missing', 
          details: {
            discoveryUrl: discoveryUrl ? 'set' : 'not set',
            clientId: clientId ? 'set' : 'not set',
            stalwartPublicUrl: process.env.STALWART_PUBLIC_URL ? 'set' : 'not set',
            oauthDiscoveryUrl: process.env.OAUTH_DISCOVERY_URL ? 'set' : 'not set',
          },
          hint: 'Please set STALWART_PUBLIC_URL (e.g., https://mail.pavlovteam.ru) or OAUTH_DISCOVERY_URL, and OAUTH_CLIENT_ID'
        },
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
