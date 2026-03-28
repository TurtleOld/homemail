import { NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { processNewMessage } from '@/lib/process-new-message';
import { sendPushNotification } from '@/lib/onesignal';
import { logger } from '@/lib/logger';

// ─── Connection limits ────────────────────────────────────────────────────────

/** Maximum concurrent SSE connections per accountId (within a single worker). */
const MAX_CONNECTIONS_PER_ACCOUNT = 5;

/** Maximum lifetime of a single SSE connection (30 minutes). */
const MAX_CONNECTION_AGE_MS = 30 * 60 * 1000;

/** Heartbeat interval. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * In-process connection counter.  In a multi-worker Next.js deployment each
 * worker keeps its own counter, so the effective limit is
 * MAX_CONNECTIONS_PER_ACCOUNT × num-workers — acceptable as a DoS guard.
 */
const connectionCounts = new Map<string, number>();

function incrementConnections(accountId: string): boolean {
  const current = connectionCounts.get(accountId) ?? 0;
  if (current >= MAX_CONNECTIONS_PER_ACCOUNT) {
    return false;
  }
  connectionCounts.set(accountId, current + 1);
  return true;
}

function decrementConnections(accountId: string): void {
  const current = connectionCounts.get(accountId) ?? 0;
  if (current <= 1) {
    connectionCounts.delete(accountId);
  } else {
    connectionCounts.set(accountId, current - 1);
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!incrementConnections(session.accountId)) {
    logger.warn('[SSE] Connection limit reached', { accountId: session.accountId });
    return new Response('Too Many Connections', { status: 429 });
  }

  const provider =
    process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let isClosed = false;

      const sendEvent = (event: string, data: unknown) => {
        if (isClosed) return;
        try {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch {
          isClosed = true;
          try { controller.close(); } catch { /* ignore */ }
        }
      };

      let unsubscribe: (() => void) | null = null;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let maxAgeTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (isClosed) return;
        isClosed = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (maxAgeTimer) clearTimeout(maxAgeTimer);
        if (unsubscribe) {
          try { unsubscribe(); } catch { /* ignore */ }
        }
        decrementConnections(session.accountId);
        try { controller.close(); } catch { /* ignore */ }
      };

      try {
        sendEvent('connected', { accountId: session.accountId });

        unsubscribe = provider.subscribeToUpdates(session.accountId, async (event) => {
          if (isClosed) return;
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
                  await sendPushNotification({
                    recipientEmail: session.email,
                    subject: message.subject,
                    fromName: message.from.name || message.from.email,
                  });
                }
              } catch (error) {
                logger.error('[SSE] Error processing new message', {
                  error: error instanceof Error ? error.message : String(error),
                });
              }
            }, 500);
          }
        });

        // Single shared heartbeat timer.
        heartbeatTimer = setInterval(() => {
          if (!isClosed) sendEvent('ping', { timestamp: Date.now() });
        }, HEARTBEAT_INTERVAL_MS);

        // Force-close after max age; EventSource will reconnect automatically.
        maxAgeTimer = setTimeout(() => {
          logger.info('[SSE] Max connection age reached, closing', { accountId: session.accountId });
          cleanup();
        }, MAX_CONNECTION_AGE_MS);

        request.signal.addEventListener('abort', cleanup);
      } catch (error) {
        logger.error('[SSE] Error in stream start', { error: String(error) });
        cleanup();
      }
    },
    cancel() {
      // Disconnect is already handled via the abort signal.
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
