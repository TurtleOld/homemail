import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule } from '@/lib/types';
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

    let targetFolderId = folderId || 'inbox';
    
    if (targetFolderId === 'inbox' || targetFolderId === 'sent' || targetFolderId === 'drafts' || targetFolderId === 'trash' || targetFolderId === 'spam') {
      const folders = await provider.getFolders(session.accountId);
      const targetFolder = folders.find((f) => f.role === targetFolderId);
      if (targetFolder) {
        targetFolderId = targetFolder.id;
        console.error('[filter-rules/apply] Resolved folder role to ID:', {
          role: folderId || 'inbox',
          id: targetFolderId,
        });
      } else {
        console.error('[filter-rules/apply] Warning: Could not find folder with role:', targetFolderId);
      }
    }
    
    console.error('[filter-rules/apply] Starting rule application:', {
      ruleId,
      ruleName: rule.name,
      originalFolderId: folderId,
      targetFolderId,
      limit,
      filterGroup: JSON.stringify(rule.filterGroup),
    });
    
    const result = await provider.getMessages(session.accountId, targetFolderId, {
      limit,
    });

    if (!result || !result.messages || result.messages.length === 0) {
      return NextResponse.json({ applied: 0, total: 0 });
    }

    let appliedCount = 0;
    for (const message of result.messages) {
      try {
        const matches = await checkMessageMatchesRule(
          message,
          rule,
          provider,
          session.accountId,
          targetFolderId
        );

        if (matches) {
          console.error(`[filter-rules/apply] Message ${message.id} matches rule ${rule.name}, applying actions...`);
          await applyRuleActions(message.id, rule, provider, session.accountId);
          appliedCount++;
        }
      } catch (error) {
        console.error(`[filter-rules/apply] Error processing message ${message.id}:`, error);
      }
    }
    
    console.error('[filter-rules/apply] Applied rule:', {
      ruleId,
      ruleName: rule.name,
      folderId: targetFolderId,
      total: result.messages.length,
      applied: appliedCount,
    });

    return NextResponse.json({
      applied: appliedCount,
      total: result.messages.length,
    });
  } catch (error) {
    console.error('[filter-rules/apply] Error applying rule:', error);
    return NextResponse.json(
      { error: 'Failed to apply rule', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}