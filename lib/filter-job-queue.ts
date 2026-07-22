import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { FilterGroup } from '@/lib/types';

const jobsFilePath = join(process.cwd(), 'data', 'filter-jobs.json');

export type FilterJob = {
  id: string;
  accountId: string;
  // Real apply jobs reference a saved rule by id. Preview jobs ("Check matches"
  // for a draft that may not be saved yet) carry the conditions inline instead,
  // and ruleId is left undefined.
  ruleId?: string;
  mode: 'apply' | 'preview';
  previewConditions?: FilterGroup;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  progress?: {
    processed: number;
    total: number;
  };
  // Preview-only: count of messages that matched. Never a list of message IDs.
  matchedCount?: number;
};

async function ensureDataDir(): Promise<void> {
  const dataDir = join(process.cwd(), 'data');
  if (!existsSync(dataDir)) {
    await mkdir(dataDir, { recursive: true });
  }
}

async function loadJobs(): Promise<FilterJob[]> {
  try {
    await ensureDataDir();
    if (!existsSync(jobsFilePath)) {
      return [];
    }
    const data = await readFile(jobsFilePath, 'utf-8');
    const jobs = JSON.parse(data) as FilterJob[];
    // Parse dates from strings
    return jobs.map((job) => ({
      ...job,
      createdAt: new Date(job.createdAt),
      startedAt: job.startedAt ? new Date(job.startedAt) : undefined,
      completedAt: job.completedAt ? new Date(job.completedAt) : undefined,
    }));
  } catch {
    return [];
  }
}

async function saveJobs(jobs: FilterJob[]): Promise<void> {
  await ensureDataDir();
  await writeFile(jobsFilePath, JSON.stringify(jobs, null, 2), 'utf-8');
}

export async function addJob(accountId: string, ruleId: string): Promise<FilterJob> {
  const jobs = await loadJobs();

  const job: FilterJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    accountId,
    ruleId,
    mode: 'apply',
    status: 'pending',
    createdAt: new Date(),
  };

  jobs.push(job);
  await saveJobs(jobs);

  console.log('[filter-job-queue] Added job:', { jobId: job.id, accountId, ruleId });
  return job;
}

export async function addPreviewJob(accountId: string, conditions: FilterGroup): Promise<FilterJob> {
  const jobs = await loadJobs();

  const job: FilterJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    accountId,
    mode: 'preview',
    previewConditions: conditions,
    status: 'pending',
    createdAt: new Date(),
  };

  jobs.push(job);
  await saveJobs(jobs);

  console.log('[filter-job-queue] Added preview job:', { jobId: job.id, accountId });
  return job;
}

export async function getJob(jobId: string): Promise<FilterJob | undefined> {
  const jobs = await loadJobs();
  return jobs.find((job) => job.id === jobId);
}

export async function getLatestJobForRule(accountId: string, ruleId: string): Promise<FilterJob | undefined> {
  const jobs = await loadJobs();
  const matching = jobs.filter((job) => job.accountId === accountId && job.ruleId === ruleId && job.mode === 'apply');
  matching.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return matching[0];
}

export async function getPendingJobs(): Promise<FilterJob[]> {
  const jobs = await loadJobs();
  return jobs.filter((job) => job.status === 'pending');
}

export async function getActiveJobs(): Promise<FilterJob[]> {
  const jobs = await loadJobs();
  return jobs.filter((job) => job.status === 'pending' || job.status === 'processing');
}

export async function updateJob(jobId: string, updates: Partial<FilterJob>): Promise<void> {
  const jobs = await loadJobs();
  const index = jobs.findIndex((job) => job.id === jobId);

  if (index === -1) {
    console.error('[filter-job-queue] Job not found:', jobId);
    return;
  }

  jobs[index] = {
    ...jobs[index],
    ...updates,
  };

  await saveJobs(jobs);
  console.log('[filter-job-queue] Updated job:', { jobId, updates });
}

export async function markJobProcessing(jobId: string): Promise<void> {
  await updateJob(jobId, {
    status: 'processing',
    startedAt: new Date(),
  });
}

export async function markJobCompleted(
  jobId: string,
  progress?: { processed: number; total: number },
  matchedCount?: number
): Promise<void> {
  await updateJob(jobId, {
    status: 'completed',
    completedAt: new Date(),
    progress,
    ...(matchedCount !== undefined ? { matchedCount } : {}),
  });
}

export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await updateJob(jobId, {
    status: 'failed',
    completedAt: new Date(),
    error,
  });
}

export async function cleanupOldJobs(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const jobs = await loadJobs();
  const now = Date.now();

  const filtered = jobs.filter((job) => {
    if (job.status === 'pending' || job.status === 'processing') {
      return true; // Keep pending/processing jobs
    }

    const completedAt = job.completedAt ? new Date(job.completedAt).getTime() : 0;
    return now - completedAt < maxAgeMs;
  });

  if (filtered.length < jobs.length) {
    await saveJobs(filtered);
    console.log(`[filter-job-queue] Cleaned up ${jobs.length - filtered.length} old jobs`);
  }
}
