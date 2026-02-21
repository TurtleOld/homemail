import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';
import { parseSieveForJMAP, buildJMAPUpdate } from '@/lib/sieve-to-jmap-filter';

const schema = z.object({
  content: z.string().min(1),
});

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('429') || msg.toLowerCase().includes('too many');
}

async function withBackoff<T>(fn: () => Promise<T>, label = 'op'): Promise<T> {
  const maxAttempts = 6;
  const baseDelayMs = 400;
  const maxDelayMs = 10_000;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (!isRateLimitError(e) || attempt >= maxAttempts) throw e;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(`[sieve/apply] ${label} rate limited, backing off ${delay}ms`);
      await sleep(delay);
    }
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const MAX_PROCESSING_TIME = 25_000;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { content } = schema.parse(body);

    // Parse Sieve script into JMAP filter + actions
    const parsed = parseSieveForJMAP(content);
    if (!parsed.parseable) {
      return NextResponse.json(
        { error: 'Script conditions cannot be applied to existing messages', reason: parsed.reason },
        { status: 422 }
      );
    }

    const provider = getMailProviderForAccount(session.accountId);

    // Load all folders
    const folders = await withBackoff(
      () => provider.getFolders(session.accountId),
      'getFolders'
    );

    // Resolve folder names for fileinto actions
    const folderNameToId = (name: string): string | undefined => {
      const lower = name.toLowerCase();
      return folders.find(
        (f) => f.name.toLowerCase() === lower || f.role === lower
      )?.id;
    };

    // Build the JMAP update spec from parsed actions
    const updateSpec = buildJMAPUpdate(parsed.actions, folderNameToId);
    if (!updateSpec) {
      return NextResponse.json(
        { error: 'Script actions cannot be mapped to JMAP operations (unsupported action or folder not found)' },
        { status: 422 }
      );
    }

    // Determine destination folder to exclude from search
    const destinationFolderId =
      updateSpec.kind === 'mailboxIds' ? Object.keys(updateSpec.update)[0] : null;

    const foldersToSearch = folders.filter(
      (f) =>
        f.role !== 'trash' &&
        f.role !== 'sent' &&
        f.role !== 'drafts' &&
        f.id !== destinationFolderId
    );

    console.log('[sieve/apply] Starting apply:', {
      foldersToSearch: foldersToSearch.length,
      updateKind: updateSpec.kind,
    });

    // ── Phase 1: Collect all matching email IDs ────────────────────────────
    // We gather all IDs first to enable all-or-nothing semantics on update.
    const matchingIds: string[] = [];

    for (const folder of foldersToSearch) {
      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        console.warn('[sieve/apply] Timeout while collecting messages');
        break;
      }

      try {
        const result = await withBackoff(
          () => provider.getMessages(session.accountId, folder.id, { limit: 500 }),
          `getMessages:${folder.id}`
        );

        if (result?.messages) {
          for (const msg of result.messages) {
            // Match using available header fields from parsed filter
            const filter = parsed.filter as Record<string, any>;
            let matches = true;

            if (filter.from && typeof filter.from === 'string') {
              const from = msg.from?.email || msg.from?.name || '';
              if (!from.toLowerCase().includes(filter.from.toLowerCase())) matches = false;
            }
            if (filter.to && typeof filter.to === 'string') {
              const to = (msg.to || []).map((a) => a.email || '').join(',');
              if (!to.toLowerCase().includes(filter.to.toLowerCase())) matches = false;
            }
            if (filter.subject && typeof filter.subject === 'string') {
              const subject = msg.subject || '';
              if (!subject.toLowerCase().includes(filter.subject.toLowerCase())) matches = false;
            }
            if (filter.minSize && typeof filter.minSize === 'number') {
              if ((msg.size || 0) < filter.minSize) matches = false;
            }
            if (filter.maxSize && typeof filter.maxSize === 'number') {
              if ((msg.size || 0) > filter.maxSize) matches = false;
            }
            // operator: AND/OR for compound conditions
            if (filter.operator === 'OR' && Array.isArray(filter.conditions)) {
              // For OR: match if any sub-condition matches
              const orMatch = filter.conditions.some((sub: Record<string, any>) => {
                if (sub.from && typeof sub.from === 'string') {
                  const from = msg.from?.email || '';
                  return from.toLowerCase().includes(sub.from.toLowerCase());
                }
                if (sub.subject && typeof sub.subject === 'string') {
                  return (msg.subject || '').toLowerCase().includes(sub.subject.toLowerCase());
                }
                return false;
              });
              if (!orMatch) matches = false;
            }

            if (matches) {
              matchingIds.push(msg.id);
            }
          }
        }

        await sleep(200);
      } catch (error) {
        console.error(`[sieve/apply] Error reading folder ${folder.id}:`, error);
        if (isRateLimitError(error)) await sleep(1500);
      }
    }

    if (matchingIds.length === 0) {
      return NextResponse.json({ applied: 0, total: 0 });
    }

    // ── Phase 2: Apply all-or-nothing ─────────────────────────────────────
    const BATCH_SIZE = 500;
    let applied = 0;

    for (let i = 0; i < matchingIds.length; i += BATCH_SIZE) {
      const batch = matchingIds.slice(i, i + BATCH_SIZE);

      try {
        if (updateSpec.kind === 'mailboxIds') {
          await withBackoff(
            () => provider.bulkUpdateMessages(session.accountId, {
              ids: batch,
              action: 'move',
              payload: { folderId: Object.keys(updateSpec.update)[0] },
            }),
            `bulkMove:batch${i}`
          );
        } else {
          // keywords update — markRead, markImportant, star
          const update = updateSpec.update;
          if (update['$seen']) {
            await withBackoff(
              () => provider.bulkUpdateMessages(session.accountId, { ids: batch, action: 'markRead' }),
              `markRead:batch${i}`
            );
          } else if (update['$flagged']) {
            await withBackoff(
              () => provider.bulkUpdateMessages(session.accountId, { ids: batch, action: 'star' }),
              `star:batch${i}`
            );
          } else if (update['$important']) {
            await withBackoff(
              () => provider.bulkUpdateMessages(session.accountId, { ids: batch, action: 'markImportant' }),
              `markImportant:batch${i}`
            );
          }
        }
        applied += batch.length;
        if (i + BATCH_SIZE < matchingIds.length) await sleep(300);
      } catch (error) {
        // One batch failed — return error; partial state may exist for previous batches
        console.error(`[sieve/apply] Batch ${i} failed:`, error);
        return NextResponse.json(
          {
            error: 'Batch update failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            applied,
            total: matchingIds.length,
          },
          { status: 500 }
        );
      }
    }

    const elapsed = Date.now() - startTime;
    console.log('[sieve/apply] Done:', { applied, total: matchingIds.length, elapsedMs: elapsed });

    return NextResponse.json({ applied, total: matchingIds.length, elapsedMs: elapsed });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 });
    }
    console.error('[sieve/apply] Error:', error);
    return NextResponse.json(
      { error: 'Failed to apply script', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
