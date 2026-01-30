import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const jobsFilePath = join(process.cwd(), 'data', 'filter-jobs.json');

export type FilterJob = {
  id: string;
  accountId: string;
  ruleId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  progress?: {
    processed: number;
    total: number;
  };
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
    status: 'pending',
    createdAt: new Date(),
  };

  jobs.push(job);
  await saveJobs(jobs);

  console.log('[filter-job-queue] Added job:', { jobId: job.id, accountId, ruleId });
  return job;
}

export async function getPendingJobs(): Promise<FilterJob[]> {
  const jobs = await loadJobs();
  return jobs.filter((job) => job.status === 'pending');
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

export async function markJobCompleted(jobId: string, progress?: { processed: number; total: number }): Promise<void> {
  await updateJob(jobId, {
    status: 'completed',
    completedAt: new Date(),
    progress,
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
