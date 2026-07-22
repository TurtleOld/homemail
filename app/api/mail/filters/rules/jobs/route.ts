import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getJob, getLatestJobForRule } from '@/lib/filter-job-queue';

/**
 * GET /api/mail/filters/rules/jobs?jobId=...
 * GET /api/mail/filters/rules/jobs?ruleId=...
 *
 * Surfaces the status of a background filter job — either a "Check matches"
 * preview job (by jobId, right after it was queued) or the latest
 * "apply to existing messages" job for a saved rule (by ruleId, so the rule
 * list can show whether the last apply run succeeded, is still running, or
 * failed).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const ruleId = searchParams.get('ruleId');

    if (jobId) {
      const job = await getJob(jobId);
      if (!job || job.accountId !== session.accountId) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json(job);
    }

    if (ruleId) {
      const job = await getLatestJobForRule(session.accountId, ruleId);
      if (!job) {
        return NextResponse.json({ error: 'No job found for rule' }, { status: 404 });
      }
      return NextResponse.json(job);
    }

    return NextResponse.json({ error: 'jobId or ruleId required' }, { status: 400 });
  } catch (error) {
    console.error('[filter-rules/jobs] Error loading job status:', error);
    return NextResponse.json(
      { error: 'Failed to load job status', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
