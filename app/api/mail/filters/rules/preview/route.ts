import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { validateCsrf } from '@/lib/csrf';
import { addPreviewJob } from '@/lib/filter-job-queue';
import type { FilterGroup } from '@/lib/types';

const filterFieldSchema = z.enum([
  'from', 'to', 'cc', 'bcc', 'subject', 'body', 'date', 'folder', 'tags',
  'size', 'messageId', 'status', 'attachment', 'filename',
]);

const filterOperatorSchema = z.enum([
  'equals', 'contains', 'startsWith', 'endsWith', 'matches',
  'gt', 'gte', 'lt', 'lte', 'between', 'in', 'notIn',
]);

const filterConditionSchema = z.object({
  field: filterFieldSchema,
  operator: filterOperatorSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.string()),
    z.object({ from: z.union([z.string(), z.date()]), to: z.union([z.string(), z.date()]) }),
  ]),
  caseSensitive: z.boolean().optional(),
});

const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    logic: z.enum(['AND', 'OR']),
    conditions: z.array(filterConditionSchema),
    groups: z.array(filterGroupSchema).optional(),
  })
);

/**
 * POST /api/mail/filters/rules/preview
 *
 * Runs a read-only "how many messages would this match" scan for a rule's
 * conditions — including a not-yet-saved draft, since conditions are passed
 * inline rather than looked up by rule id. Queues a background job (the same
 * folder scan and matcher an "apply to existing" job runs) and returns its id
 * so the client can poll /api/mail/filters/rules/jobs for the result.
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
    const { conditions } = z.object({ conditions: filterGroupSchema }).parse(body);

    const job = await addPreviewJob(session.accountId, conditions);

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid conditions', details: error.errors }, { status: 400 });
    }
    console.error('[filter-rules/preview] Error queueing preview job:', error);
    return NextResponse.json(
      { error: 'Failed to queue preview job', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
