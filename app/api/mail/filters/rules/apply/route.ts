import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule, MessageListItem, MessageDetail } from '@/lib/types';
import { checkMessageMatchesRule, applyRuleActions } from '@/lib/apply-auto-sort-rules';

const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('429') || msg.toLowerCase().includes('too many');
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBackoff<T>(
  fn: () => Promise<T>,
  opts?: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; label?: string }
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 6;
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  const maxDelayMs = opts?.maxDelayMs ?? 10_000;
  const label = opts?.label ?? 'operation';

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt += 1;
      if (!isRateLimitError(e) || attempt >= maxAttempts) {
        throw e;
      }
      const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * 250);
      const delay = exp + jitter;
      console.warn(`[filter-rules/apply] ${label} hit rate limit, backing off`, { attempt, delay });
      await sleep(delay);
    }
  }
}

async function loadRules(accountId: string): Promise<AutoSortRule[]> {
  try {
    const data = await readFile(rulesFilePath, 'utf-8');
    const allRules = JSON.parse(data) as Record<string, AutoSortRule[]>;
    return allRules[accountId] || [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const MAX_PROCESSING_TIME = 25000; // 25 seconds, leave 5s buffer for nginx 30s timeout

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ruleId, folderId, limit = 2000 } = body;

    if (!ruleId) {
      return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });
    }

    const rules = await loadRules(session.accountId);
    const rule = rules.find((r) => r.id === ruleId);

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    if (!rule.enabled) {
      return NextResponse.json({ error: 'Rule is disabled' }, { status: 400 });
    }

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

    const folders = await withBackoff(
      () => provider.getFolders(session.accountId),
      { label: 'getFolders' }
    );
    
    const moveToFolderAction = rule.actions.find((a) => a.type === 'moveToFolder');
    let destinationFolderId: string | null = null;
    
    if (moveToFolderAction && moveToFolderAction.type === 'moveToFolder' && moveToFolderAction.folderId) {
      destinationFolderId = moveToFolderAction.folderId;
      
      if (destinationFolderId === 'inbox' || destinationFolderId === 'sent' || destinationFolderId === 'drafts' || destinationFolderId === 'trash' || destinationFolderId === 'spam') {
        const destinationFolder = folders.find((f) => f.role === destinationFolderId);
        if (destinationFolder) {
          destinationFolderId = destinationFolder.id;
        }
      }
    }
    
    const foldersToSearch = folders.filter((f) => {
      // Exclude system folders from mass-processing.
      if (f.role === 'trash' || f.role === 'sent' || f.role === 'drafts') {
        return false;
      }
      // Note: do NOT exclude the destination folder — messages may already be
      // there (e.g. moved by a Sieve script) and need other actions applied.
      // Optional: allow user to restrict to a specific folder.
      if (folderId) {
        return f.id === folderId || f.role === folderId;
      }
      return true;
    });
    
    console.log('[filter-rules/apply] Starting rule application:', {
      ruleId,
      ruleName: rule.name,
      destinationFolderId,
      foldersCount: foldersToSearch.length,
      limit,
    });
    
    const allMessages: MessageListItem[] = [];
    const PER_FOLDER_LIMIT = 2000;

    for (let i = 0; i < foldersToSearch.length; i++) {
      const folder = foldersToSearch[i];
      if (allMessages.length >= limit) {
        break;
      }

      try {
        const folderLimit = Math.min(PER_FOLDER_LIMIT, 500);
        
        const result = await withBackoff(
          () => provider.getMessages(session.accountId, folder.id, { limit: folderLimit }),
          { label: `getMessages:${folder.id}` }
        );
        
        if (result && result.messages && result.messages.length > 0) {
          allMessages.push(...result.messages);
        }
        
        if (i < foldersToSearch.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`[filter-rules/apply] Error getting messages from folder ${folder.id}:`, error instanceof Error ? error.message : error);
        if (isRateLimitError(error)) {
          await sleep(1500);
        }
      }
    }
    
    if (allMessages.length === 0) {
      return NextResponse.json({ applied: 0, total: 0 });
    }
    
    const messagesToProcess = allMessages.slice(0, limit);

    const needsBodyCheck = rule.conditions.conditions.some((c) => c.field === 'body') ||
      (rule.conditions.groups && rule.conditions.groups.some((g) => 
        g.conditions.some((c) => c.field === 'body') ||
        (g.groups && g.groups.some((sg) => sg.conditions.some((c) => c.field === 'body')))
      ));

    const messagesToCheck: Array<{ message: MessageListItem | MessageDetail; needsBody: boolean }> = [];
    
    for (const message of messagesToProcess) {
      const needsBody = !!(needsBodyCheck && !('body' in message));
      messagesToCheck.push({ message, needsBody });
    }

    const messagesNeedingBody = messagesToCheck.filter((m) => m.needsBody).map((m) => m.message);
    
    if (messagesNeedingBody.length > 0) {
      console.log(`[filter-rules/apply] Loading ${messagesNeedingBody.length} full messages for body check...`);
      // Keep this low to avoid 429 from reverse proxy / server.
      const BATCH_SIZE = 10;
      for (let i = 0; i < messagesNeedingBody.length; i += BATCH_SIZE) {
        // Check timeout before processing next batch
        if (Date.now() - startTime > MAX_PROCESSING_TIME) {
          console.warn(`[filter-rules/apply] Timeout reached while loading message bodies, loaded ${i}/${messagesNeedingBody.length}`);
          break;
        }

        const batch = messagesNeedingBody.slice(i, i + BATCH_SIZE);
        // Sequential inside a small batch to reduce concurrency spikes.
        for (const msg of batch) {
          try {
            const fullMessage = await withBackoff(
              () => provider.getMessage(session.accountId, msg.id),
              { label: `getMessage:${msg.id}`, baseDelayMs: 300 }
            );
            if (fullMessage) {
              const item = messagesToCheck.find((m) => m.message.id === msg.id);
              if (item) {
                item.message = fullMessage;
                item.needsBody = false;
              }
            }
          } catch (error) {
            console.error(`[filter-rules/apply] Error loading message ${msg.id}:`, error);
          }
          await sleep(30);
        }

        if (i + BATCH_SIZE < messagesNeedingBody.length) {
          await sleep(150);
        }
      }
    }

    let appliedCount = 0;
    let processedCount = 0;
    for (let i = 0; i < messagesToCheck.length; i++) {
      // Check timeout before processing next message
      if (Date.now() - startTime > MAX_PROCESSING_TIME) {
        console.warn(`[filter-rules/apply] Timeout reached, processed ${processedCount}/${messagesToCheck.length} messages`);
        break;
      }

      const { message } = messagesToCheck[i];
      try {
        const matches = await withBackoff(
          () => checkMessageMatchesRule(message, rule, provider, session.accountId, 'inbox'),
          { label: `checkMatch:${message.id}`, baseDelayMs: 300 }
        );

        if (i < 3) {
          console.log(`[filter-rules/apply] debug message[${i}]:`, {
            id: message.id,
            from: message.from,
            subject: message.subject,
            conditions: JSON.stringify(rule.conditions),
            matches,
          });
        }

        if (matches) {
          console.log(`[filter-rules/apply] Message ${message.id} matches rule ${rule.name}, applying actions...`);
          await withBackoff(
            () => applyRuleActions(message.id, rule, provider, session.accountId),
            { label: `applyActions:${message.id}`, baseDelayMs: 600 }
          );
          appliedCount++;

          if (appliedCount % 5 === 0) {
            await sleep(500);
          }
        }
        processedCount++;
      } catch (error) {
        console.error(`[filter-rules/apply] Error processing message ${message.id}:`, error);
        if (isRateLimitError(error)) {
          await sleep(2000);
        }
      }
    }
    
    const elapsedTime = Date.now() - startTime;
    const timedOut = elapsedTime > MAX_PROCESSING_TIME;

    console.log('[filter-rules/apply] Applied rule:', {
      ruleId,
      ruleName: rule.name,
      destinationFolderId,
      foldersSearched: foldersToSearch.length,
      total: messagesToProcess.length,
      processed: processedCount,
      applied: appliedCount,
      elapsedMs: elapsedTime,
      timedOut,
    });

    return NextResponse.json({
      applied: appliedCount,
      total: messagesToProcess.length,
      processed: processedCount,
      timedOut,
      elapsedMs: elapsedTime,
    });
  } catch (error) {
    console.error('[filter-rules/apply] Error applying rule:', error);
    return NextResponse.json(
      { error: 'Failed to apply rule', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}