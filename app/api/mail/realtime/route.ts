import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const provider = process.env.MAIL_PROVIDER === 'stalwart'
    ? getMailProviderForAccount(session.accountId)
    : getMailProvider();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: any) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      sendEvent('connected', { accountId: session.accountId });

      const unsubscribe = provider.subscribeToUpdates(session.accountId, (event) => {
        sendEvent(event.type, event.data);
      });

      const keepAlive = setInterval(() => {
        sendEvent('ping', { timestamp: Date.now() });
      }, 30000);

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
