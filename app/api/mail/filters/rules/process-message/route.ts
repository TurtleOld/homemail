import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProviderForAccount } from '@/lib/get-provider';
import { checkMessageMatchesRule, applyRuleActions } from '@/lib/apply-auto-sort-rules';
import { loadRules } from '@/lib/filter-rules-store';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { messageId, folderId } = body;

    if (!messageId) {
      return NextResponse.json({ error: 'Message ID required' }, { status: 400 });
    }

    const provider = getMailProviderForAccount(session.accountId);

    await new Promise((resolve) => setTimeout(resolve, 100));
    
    const message = await provider.getMessage(session.accountId, messageId);
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const rules = (await loadRules(session.accountId)).filter((r) => r.enabled);
    const targetFolderId = folderId || 'inbox';

    let appliedCount = 0;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      try {
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        
        const matches = await checkMessageMatchesRule(
          message,
          rule,
          provider,
          session.accountId,
          targetFolderId
        );

        if (matches) {
          console.error(`[process-message] Message ${messageId} matches rule ${rule.name}, applying actions...`);
          await applyRuleActions(messageId, rule, provider, session.accountId);
          appliedCount++;
          break;
        }
      } catch (error) {
        console.error(`[process-message] Error processing rule ${rule.name} for message ${messageId}:`, error);
        if (error instanceof Error && error.message.includes('Too Many Requests')) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
    
    console.error('[process-message] Processed message:', {
      messageId,
      folderId: targetFolderId,
      rulesCount: rules.length,
      appliedCount,
      from: message.from.email,
    });

    return NextResponse.json({ applied: appliedCount });
  } catch (error) {
    console.error('[process-message] Error processing message:', error);
    return NextResponse.json(
      { error: 'Failed to process message', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}