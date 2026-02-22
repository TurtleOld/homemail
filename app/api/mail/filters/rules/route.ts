import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule } from '@/lib/types';
import { addJob } from '@/lib/filter-job-queue';

function triggerSieveSync(request: NextRequest): void {
  // Fire-and-forget: sync auto-sort rules to the Sieve script on the server.
  // We build an absolute URL from the incoming request so this works in any
  // environment (dev, prod, behind a proxy, etc.)
  const syncUrl = new URL('/api/mail/filters/rules/sync-sieve', request.url).toString();
  fetch(syncUrl, {
    method: 'POST',
    headers: { cookie: request.headers.get('cookie') || '' },
  }).catch((err) => {
    console.error('[filter-rules] Background Sieve sync failed:', err);
  });
}

const rulesFilePath = join(process.cwd(), 'data', 'filter-rules.json');

const autoSortRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  enabled: z.boolean(),
  conditions: z.any(),
  actions: z.array(z.any()),
  applyToExisting: z.boolean().optional(),
});

async function loadRules(accountId: string): Promise<AutoSortRule[]> {
  try {
    const data = await readFile(rulesFilePath, 'utf-8');
    const allRules = JSON.parse(data) as Record<string, AutoSortRule[]>;
    return allRules[accountId] || [];
  } catch {
    return [];
  }
}

async function saveRules(accountId: string, rules: AutoSortRule[]): Promise<void> {
  try {
    const { mkdir } = await import('fs/promises');
    await mkdir(join(process.cwd(), 'data'), { recursive: true });
  } catch {
  }

  let allRules: Record<string, AutoSortRule[]> = {};
  try {
    const data = await readFile(rulesFilePath, 'utf-8');
    allRules = JSON.parse(data);
  } catch {
  }

  allRules[accountId] = rules;
  await writeFile(rulesFilePath, JSON.stringify(allRules, null, 2), 'utf-8');
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rules = await loadRules(session.accountId);
    return NextResponse.json(rules);
  } catch (error) {
    console.error('[filter-rules] Error loading rules:', error);
    return NextResponse.json(
      { error: 'Failed to load rules', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Clone the request before body is consumed so we can re-read headers later
  const clonedRequest = request.clone() as NextRequest;
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = autoSortRuleSchema.parse(body);

    const rules = await loadRules(session.accountId);
    const now = new Date();

    let rule: AutoSortRule;
    if (data.id) {
      const existing = rules.find((r) => r.id === data.id);
      if (!existing) {
        return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
      }
      rule = {
        ...existing,
        name: data.name,
        enabled: data.enabled,
        conditions: data.conditions,
        actions: data.actions,
        applyToExisting: data.applyToExisting ?? existing.applyToExisting,
        updatedAt: now,
      };
      const index = rules.findIndex((r) => r.id === data.id);
      rules[index] = rule;
    } else {
      rule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        name: data.name,
        enabled: data.enabled,
        conditions: data.conditions,
        actions: data.actions,
        priority: 0,
        applyToExisting: data.applyToExisting ?? false,
        createdAt: now,
        updatedAt: now,
      };
      rules.push(rule);
    }

    await saveRules(session.accountId, rules);

    // If applyToExisting is true, queue a background job to apply this rule to existing emails
    if (rule.applyToExisting && rule.enabled) {
      try {
        const job = await addJob(session.accountId, rule.id);
        console.log(`[filter-rules] Queued background job ${job.id} to apply rule ${rule.id} to existing emails`);
      } catch (error) {
        console.error('[filter-rules] Failed to queue background job:', error);
        // Don't fail the rule save if job queueing fails
      }
    }

    // Sync updated rules to Sieve script on the mail server (fire-and-forget)
    triggerSieveSync(clonedRequest);

    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid rule data', details: error.errors }, { status: 400 });
    }
    console.error('[filter-rules] Error saving rule:', error);
    return NextResponse.json(
      { error: 'Failed to save rule', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const ruleId = searchParams.get('id');

    if (!ruleId) {
      return NextResponse.json({ error: 'Rule ID required' }, { status: 400 });
    }

    const rules = await loadRules(session.accountId);
    const filtered = rules.filter((r) => r.id !== ruleId);

    if (rules.length === filtered.length) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await saveRules(session.accountId, filtered);

    // Sync updated rules to Sieve script on the mail server (fire-and-forget)
    triggerSieveSync(request);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[filter-rules] Error deleting rule:', error);
    return NextResponse.json(
      { error: 'Failed to delete rule', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}