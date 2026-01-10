import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getUserCredentials } from '@/providers/stalwart-jmap/stalwart-provider';
import { logger } from '@/lib/logger';

const STALWART_BASE_URL = process.env.STALWART_MANAGEMENT_URL || process.env.STALWART_BASE_URL || 'http://stalwart:8080';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const creds = getUserCredentials(session.accountId);
    if (!creds) {
      return NextResponse.json({ error: 'Credentials not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace('/api/settings/stalwart', '') || '/';
    const fullUrl = `${STALWART_BASE_URL}${path}${url.search}`;

    const credentials = Buffer.from(`${creds.email}:${creds.password}`).toString('base64');
    
    const proxyResponse = await fetch(fullUrl, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': request.headers.get('Accept') || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0',
      },
      redirect: 'follow',
    });

    if (!proxyResponse.ok) {
      return NextResponse.json(
        { error: `Stalwart returned ${proxyResponse.status}` },
        { status: proxyResponse.status }
      );
    }

    const contentType = proxyResponse.headers.get('Content-Type') || 'text/html';
    let body = await proxyResponse.text();

    if (contentType.includes('text/html')) {
      body = body.replace(
        /(href|src|action)=["']([^"']+)["']/g,
        (match, attr, path) => {
          if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//') || path.startsWith('data:') || path.startsWith('javascript:')) {
            return match;
          }
          if (path.startsWith('/')) {
            return `${attr}="/api/settings/stalwart${path}"`;
          }
          return `${attr}="/api/settings/stalwart/${path}"`;
        }
      );
      
      body = body.replace(
        /url\(["']?([^"')]+)["']?\)/g,
        (match, path) => {
          if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//') || path.startsWith('data:')) {
            return match;
          }
          if (path.startsWith('/')) {
            return `url("/api/settings/stalwart${path}")`;
          }
          return `url("/api/settings/stalwart/${path}")`;
        }
      );
      
      body = body.replace(
        /from\s+['"]([^'"]+)['"]/g,
        (match, path) => {
          if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
            return match;
          }
          if (path.startsWith('/')) {
            return `from '/api/settings/stalwart${path}'`;
          }
          return `from '/api/settings/stalwart/${path}'`;
        }
      );
    }
    
    if (contentType.includes('application/javascript') || contentType.includes('text/javascript') || contentType.includes('application/wasm')) {
      body = body.replace(
        /['"]([^'"]*\.(js|wasm|json))['"]/g,
        (match, path) => {
          if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//')) {
            return match;
          }
          if (path.startsWith('/')) {
            return `'/api/settings/stalwart${path}'`;
          }
          return `'/api/settings/stalwart/${path}'`;
        }
      );
    }

    return new NextResponse(body, {
      status: proxyResponse.status,
      headers: {
        'Content-Type': contentType,
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch (error) {
    logger.error('Failed to proxy Stalwart Management:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
