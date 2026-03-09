import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { validateCsrf } from '@/lib/csrf';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { AutoSortRule } from '@/lib/types';
import { addJob, getActiveJobs } from '@/lib/filter-job-queue';

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

/**
 * POST /api/mail/filters/rules/apply
 *
 * Instead of processing messages synchronously (which times out after 25s),
 * this endpoint now queues a background job and returns immediately.
 * The auto-sort daemon processes the job queue every 30 seconds.
 */
export async function POST(request: NextRequest) {
  const csrfValid = await validateCsrf(request);
  if (!csrfValid) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { ruleId } = body;

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

    // Check if there's already a pending/processing job for this rule
    const pending = await getActiveJobs();
    const existingJob = pending.find(
      (j) => j.ruleId === ruleId && j.accountId === session.accountId
    );
    if (existingJob) {
      return NextResponse.json({
        queued: true,
        jobId: existingJob.id,
        message: 'A job for this rule is already queued',
      });
    }

    // Queue a background job — the daemon will process it
    const job = await addJob(session.accountId, rule.id);
    console.log(`[filter-rules/apply] Queued background job ${job.id} for rule ${rule.id} (${rule.name})`);

    return NextResponse.json({
      queued: true,
      jobId: job.id,
      message: 'Rule application queued. Processing will happen in the background.',
    });
  } catch (error) {
    console.error('[filter-rules/apply] Error queueing rule application:', error);
    return NextResponse.json(
      { error: 'Failed to queue rule application', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
