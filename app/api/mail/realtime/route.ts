import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { processNewMessage } from '@/lib/process-new-message';

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

        unsubscribe = provider.subscribeToUpdates(session.accountId, async (event) => {
          if (!isClosed) {
            sendEvent(event.type, event.data);
            
            if (event.type === 'message.new' && event.data?.messageId) {
              setTimeout(async () => {
                try {
                  const messageId = event.data.messageId || event.data.id;
                  const folderId = event.data.folderId || event.data.mailboxId || 'inbox';
                  
                  await new Promise((resolve) => setTimeout(resolve, 200));
                  const message = await provider.getMessage(session.accountId, messageId);
                  if (message) {
                    await processNewMessage(message, session.accountId, folderId, provider);
                  }
                } catch (error) {
                  console.error('[realtime] Error processing new message with rules:', error);
                  if (error instanceof Error && error.message.includes('Too Many Requests')) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                  }
                }
              }, 500);
            }
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
