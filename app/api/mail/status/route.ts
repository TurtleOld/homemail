import net from 'node:net';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';

type ServiceStatus = 'up' | 'down' | 'unknown';

interface ServerStatus {
  smtp: ServiceStatus;
  imapJmap: ServiceStatus;
  queueSize: number | null;
  deliveryErrors: number | null;
  updatedAt: string;
}

const MAIL_PROVIDER = process.env.MAIL_PROVIDER;

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

  const reachable = await checkTcp(host, port, 2000);
  return reachable ? 'up' : 'down';
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

const resolveQueueStats = async (): Promise<{ queueSize: number | null; deliveryErrors: number | null }> => {
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
    resolveQueueStats(),
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
