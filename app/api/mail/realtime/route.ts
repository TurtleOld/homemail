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
      let isClosed = false;

      const sendEvent = (event: string, data: any) => {
        if (isClosed) return;
        try {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch (error) {
          console.error('Error sending SSE event:', error);
          isClosed = true;
          try {
            controller.close();
          } catch {
          }
        }
      };

      let unsubscribe: (() => void) | null = null;
      let keepAlive: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (keepAlive) {
          clearInterval(keepAlive);
        }
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch (error) {
            console.error('Error unsubscribing:', error);
          }
        }
        try {
          controller.close();
        } catch (error) {
          console.error('Error closing controller:', error);
        }
      };

      try {
        sendEvent('connected', { accountId: session.accountId });

        unsubscribe = provider.subscribeToUpdates(session.accountId, (event) => {
          if (!isClosed) {
            sendEvent(event.type, event.data);
          }
        });

        keepAlive = setInterval(() => {
          if (!isClosed) {
            sendEvent('ping', { timestamp: Date.now() });
          }
        }, 30000);

        request.signal.addEventListener('abort', cleanup);
      } catch (error) {
        console.error('Error in SSE stream start:', error);
        cleanup();
      }
    },
    cancel() {
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
