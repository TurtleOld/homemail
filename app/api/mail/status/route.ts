import net from 'node:net';
import dns from 'node:dns';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';

const lookup = promisify(dns.lookup);

type ServiceStatus = 'up' | 'down' | 'unknown';

interface ServerStatus {
  smtp: ServiceStatus;
  imapJmap: ServiceStatus;
  queueSize: number | null;
  deliveryErrors: number | null;
  updatedAt: string;
}

const MAIL_PROVIDER = process.env.MAIL_PROVIDER;

const isDockerInternalIp = (ip: string): boolean => {
  if (ip === '127.0.0.1' || ip === 'localhost') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  return (
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 10) ||
    (parts[0] === 192 && parts[1] === 168)
  );
};

const resolveHostname = async (hostname: string): Promise<string | null> => {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }

  try {
    const addresses = await lookup(hostname, { family: 4, all: true });
    if (addresses && addresses.length > 0) {
      for (const addr of addresses) {
        const ip = addr.address;
        if (isDockerInternalIp(ip)) {
          return ip;
        }
      }
      return addresses[0].address;
    }
  } catch (error) {
    console.error(`[mail-status] Failed to resolve ${hostname}:`, error);
  }
  
  return null;
};

const checkTcp = (host: string, port: number, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (result: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));

    socket.connect(port, host);
  });

const resolveSmtpStatus = async (): Promise<ServiceStatus> => {
  if (MAIL_PROVIDER !== 'stalwart') {
    return MAIL_PROVIDER === 'imap' ? 'unknown' : 'up';
  }

  const host = process.env.STALWART_SMTP_HOST;
  const portRaw = process.env.STALWART_SMTP_PORT;
  const port = portRaw ? Number.parseInt(portRaw, 10) : NaN;

  if (!host || Number.isNaN(port)) {
    return 'unknown';
  }

  try {
    const resolvedHost = await resolveHostname(host);
    if (!resolvedHost) {
      return 'unknown';
    }

    const reachable = await checkTcp(resolvedHost, port, 2000);
    return reachable ? 'up' : 'down';
  } catch (error) {
    console.error('[mail-status] Error checking SMTP status:', error);
    return 'down';
  }
};

const resolveImapJmapStatus = async (accountId: string): Promise<ServiceStatus> => {
  if (MAIL_PROVIDER === 'imap') {
    return 'unknown';
  }

  try {
    const provider = MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(accountId)
      : getMailProvider();
    await provider.getAccount(accountId);
    return 'up';
  } catch {
    return 'down';
  }
};

const resolveQueueStats = async (_accountId: string): Promise<{ queueSize: number | null; deliveryErrors: number | null }> => {
  // OAuth-only mode: queue stats require admin credentials which are not available in OAuth mode
  // This feature is disabled when using OAuth authentication
  return { queueSize: null, deliveryErrors: null };
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [smtp, imapJmap, queueStats] = await Promise.all([
    resolveSmtpStatus(),
    resolveImapJmapStatus(session.accountId),
    resolveQueueStats(session.accountId),
  ]);

  const payload: ServerStatus = {
    smtp,
    imapJmap,
    queueSize: queueStats.queueSize,
    deliveryErrors: queueStats.deliveryErrors,
    updatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, { status: 200 });
}
