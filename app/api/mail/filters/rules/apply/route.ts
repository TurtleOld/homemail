import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule, MessageListItem, MessageDetail } from '@/lib/types';
import { checkMessageMatchesRule, applyRuleActions } from '@/lib/apply-auto-sort-rules';

const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

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
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ruleId, folderId, limit = 1000 } = body;

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

    const folders = await provider.getFolders(session.accountId);
    
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
      if (f.role === 'trash') {
        return false;
      }
      if (destinationFolderId && f.id === destinationFolderId) {
        return false;
      }
      return true;
    });
    
    console.error('[filter-rules/apply] Starting rule application:', {
      ruleId,
      ruleName: rule.name,
      destinationFolderId,
      foldersToSearch: foldersToSearch.map((f) => ({ id: f.id, name: f.name, role: f.role })),
      limit,
      filterGroup: JSON.stringify(rule.conditions),
    });
    
    const allMessages: MessageListItem[] = [];
    const messagesPerFolder = Math.ceil(limit / Math.max(foldersToSearch.length, 1));
    
    for (let i = 0; i < foldersToSearch.length; i++) {
      const folder = foldersToSearch[i];
      if (allMessages.length >= limit) {
        break;
      }
      
      try {
        const remainingLimit = limit - allMessages.length;
        const folderLimit = Math.min(messagesPerFolder, remainingLimit, 500);
        
        const result = await provider.getMessages(session.accountId, folder.id, {
          limit: folderLimit,
        });
        
        if (result && result.messages && result.messages.length > 0) {
          allMessages.push(...result.messages);
        }
        
        if (i < foldersToSearch.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`[filter-rules/apply] Error getting messages from folder ${folder.id}:`, error);
        if (error instanceof Error && error.message.includes('Too Many Requests')) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
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
      console.error(`[filter-rules/apply] Loading ${messagesNeedingBody.length} full messages for body check...`);
      const BATCH_SIZE = 20;
      for (let i = 0; i < messagesNeedingBody.length; i += BATCH_SIZE) {
        const batch = messagesNeedingBody.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (msg, idx) => {
            try {
              if (idx > 0) {
                await new Promise((resolve) => setTimeout(resolve, 50));
              }
              const fullMessage = await provider.getMessage(session.accountId, msg.id);
              if (fullMessage) {
                const item = messagesToCheck.find((m) => m.message.id === msg.id);
                if (item) {
                  item.message = fullMessage;
                  item.needsBody = false;
                }
              }
            } catch (error) {
              console.error(`[filter-rules/apply] Error loading message ${msg.id}:`, error);
              if (error instanceof Error && error.message.includes('Too Many Requests')) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            }
          })
        );
        
        if (i + BATCH_SIZE < messagesNeedingBody.length) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    let appliedCount = 0;
    for (let i = 0; i < messagesToCheck.length; i++) {
      const { message } = messagesToCheck[i];
      try {
        if (i > 0 && i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        
        const matches = await checkMessageMatchesRule(
          message,
          rule,
          provider,
          session.accountId,
          'inbox'
        );

        if (matches) {
          console.error(`[filter-rules/apply] Message ${message.id} matches rule ${rule.name}, applying actions...`);
          await applyRuleActions(message.id, rule, provider, session.accountId);
          appliedCount++;
          
          if (appliedCount % 5 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      } catch (error) {
        console.error(`[filter-rules/apply] Error processing message ${message.id}:`, error);
        if (error instanceof Error && error.message.includes('Too Many Requests')) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
    
    console.error('[filter-rules/apply] Applied rule:', {
      ruleId,
      ruleName: rule.name,
      destinationFolderId,
      foldersSearched: foldersToSearch.length,
      total: messagesToProcess.length,
      applied: appliedCount,
    });

    return NextResponse.json({
      applied: appliedCount,
      total: messagesToProcess.length,
    });
  } catch (error) {
    console.error('[filter-rules/apply] Error applying rule:', error);
    return NextResponse.json(
      { error: 'Failed to apply rule', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}