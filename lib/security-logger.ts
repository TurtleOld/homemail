import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from './logger';
import { getClientIp } from './client-ip';

export type SecurityEventType =
  | 'login_failed'
  | 'login_success'
  | 'login_blocked'
  | 'session_created'
  | 'session_invalidated'
  | 'session_hijack_attempt'
  | 'rate_limit_exceeded'
  | 'csrf_violation'
  | 'suspicious_activity'
  | 'unauthorized_access'
  | 'password_change'
  | 'account_locked'
  | 'ip_blocked'
  | 'file_access_denied'
  | 'ssrf_attempt'
  | 'path_traversal_attempt';

export interface SecurityEvent {
  timestamp: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip?: string;
  userAgent?: string;
  userId?: string;
  email?: string;
  accountId?: string;
  details: Record<string, unknown>;
  requestId?: string;
}

const LOG_DIR = process.env.SECURITY_LOG_DIR || path.join(process.env.DATA_DIR || 'data', 'security-logs');
const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 10;
const ROTATION_INTERVAL = 24 * 60 * 60 * 1000;

let currentLogFile: string | null = null;
let lastRotationTime = Date.now();

async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (error) {
    logger.error('[SecurityLogger] Failed to create log directory:', error);
  }
}

function getLogFileName(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `security-${date}.jsonl`);
}

async function rotateLogs(): Promise<void> {
  const now = Date.now();
  if (now - lastRotationTime < ROTATION_INTERVAL) {
    return;
  }

  try {
    const files = await fs.readdir(LOG_DIR);
    const logFiles = files
      .filter((f) => f.startsWith('security-') && f.endsWith('.jsonl'))
      .map((f) => ({
        name: f,
        path: path.join(LOG_DIR, f),
      }));

    logFiles.sort((a, b) => {
      const statA = fs.stat(a.path);
      const statB = fs.stat(b.path);
      return statB.then((s) => s.mtime.getTime()).then((tB) =>
        statA.then((s) => s.mtime.getTime()).then((tA) => tB - tA)
      ) as unknown as number;
    });

    if (logFiles.length > MAX_LOG_FILES) {
      const filesToDelete = logFiles.slice(MAX_LOG_FILES);
      for (const file of filesToDelete) {
        try {
          await fs.unlink(file.path);
          logger.info(`[SecurityLogger] Deleted old log file: ${file.name}`);
        } catch (error) {
          logger.error(`[SecurityLogger] Failed to delete log file ${file.name}:`, error);
        }
      }
    }

    for (const file of logFiles) {
      try {
        const stats = await fs.stat(file.path);
        if (stats.size > MAX_LOG_FILE_SIZE) {
          const archiveName = file.name.replace('.jsonl', `-${Date.now()}.jsonl`);
          await fs.rename(file.path, path.join(LOG_DIR, archiveName));
          logger.info(`[SecurityLogger] Rotated large log file: ${file.name} -> ${archiveName}`);
        }
      } catch (error) {
        logger.error(`[SecurityLogger] Failed to check/rotate log file ${file.name}:`, error);
      }
    }

    lastRotationTime = now;
  } catch (error) {
    logger.error('[SecurityLogger] Failed to rotate logs:', error);
  }
}

async function writeLogEntry(event: SecurityEvent): Promise<void> {
  try {
    await ensureLogDir();
    await rotateLogs();

    const logFile = getLogFileName();
    const logLine = JSON.stringify(event) + '\n';

    await fs.appendFile(logFile, logLine, 'utf-8');

    if (event.severity === 'critical' || event.severity === 'high') {
      logger.error(`[SecurityEvent] ${event.type}:`, event);
    } else if (event.severity === 'medium') {
      logger.warn(`[SecurityEvent] ${event.type}:`, event);
    } else {
      logger.info(`[SecurityEvent] ${event.type}:`, event);
    }
  } catch (error) {
    logger.error('[SecurityLogger] Failed to write log entry:', error);
  }
}

function getUserAgent(request: Request): string {
  return request.headers.get('user-agent') || 'unknown';
}

export class SecurityLogger {
  static logEvent(
    type: SecurityEventType,
    severity: SecurityEvent['severity'],
    request: Request,
    details: Record<string, unknown> = {},
    userId?: string,
    email?: string,
    accountId?: string
  ): void {
    // We propagate a stable request/flow id from the client where possible.
    // This allows correlating multiple /api/auth/* calls within one login flow.
    const requestId = request.headers.get('x-auth-flow-id') || crypto.randomUUID();

    const event: SecurityEvent = {
      timestamp: new Date().toISOString(),
      type,
      severity,
      ip: getClientIp(request),
      userAgent: getUserAgent(request),
      userId,
      email,
      accountId,
      details,
      requestId,
    };

    writeLogEntry(event).catch((error) => {
      logger.error('[SecurityLogger] Failed to log event:', error);
    });
  }

  static logLoginFailed(request: Request, email: string, reason: string): void {
    this.logEvent('login_failed', 'medium', request, { reason }, undefined, email);
  }

  static logLoginSuccess(request: Request, email: string, accountId: string): void {
    this.logEvent('login_success', 'low', request, {}, undefined, email, accountId);
  }

  static logLoginBlocked(request: Request, email: string, reason: string): void {
    this.logEvent('login_blocked', 'high', request, { reason }, undefined, email);
  }

  static logRateLimitExceeded(request: Request, identifier: string, type: string): void {
    this.logEvent('rate_limit_exceeded', 'medium', request, { identifier, type });
  }

  /**
   * Use when we reject a request with 429 to have actionable telemetry.
   */
  static logRateLimitRejected(
    request: Request,
    identifier: string,
    type: string,
    reason: string,
    details: Record<string, unknown> = {}
  ): void {
    this.logEvent('rate_limit_exceeded', 'medium', request, {
      identifier,
      type,
      reason,
      ...details,
    });
  }

  static logCsrfViolation(request: Request, details: Record<string, unknown> = {}): void {
    this.logEvent('csrf_violation', 'high', request, details);
  }

  static logSuspiciousActivity(request: Request, activity: string, details: Record<string, unknown> = {}): void {
    this.logEvent('suspicious_activity', 'high', request, { activity, ...details });
  }

  static logUnauthorizedAccess(request: Request, resource: string, details: Record<string, unknown> = {}): void {
    this.logEvent('unauthorized_access', 'high', request, { resource, ...details });
  }

  static logSessionCreated(request: Request, userId: string, accountId: string): void {
    this.logEvent('session_created', 'low', request, {}, userId, undefined, accountId);
  }

  static logSessionInvalidated(request: Request, userId: string, reason: string): void {
    this.logEvent('session_invalidated', 'medium', request, { reason }, userId);
  }

  static logSessionHijackAttempt(request: Request, userId: string, details: Record<string, unknown> = {}): void {
    this.logEvent('session_hijack_attempt', 'critical', request, details, userId);
  }

  static logIpBlocked(request: Request, reason: string, duration?: number): void {
    this.logEvent('ip_blocked', 'high', request, { reason, duration });
  }

  static logFileAccessDenied(request: Request, filePath: string, reason: string): void {
    this.logEvent('file_access_denied', 'medium', request, { filePath, reason });
  }

  static logSsrfAttempt(request: Request, url: string, details: Record<string, unknown> = {}): void {
    this.logEvent('ssrf_attempt', 'critical', request, { url, ...details });
  }

  static logPathTraversalAttempt(request: Request, path: string, details: Record<string, unknown> = {}): void {
    this.logEvent('path_traversal_attempt', 'high', request, { path, ...details });
  }

  static async getRecentEvents(
    limit: number = 100,
    type?: SecurityEventType,
    severity?: SecurityEvent['severity']
  ): Promise<SecurityEvent[]> {
    try {
      await ensureLogDir();
      const logFile = getLogFileName();
      
      try {
        const content = await fs.readFile(logFile, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);
        const events: SecurityEvent[] = lines
          .map((line) => {
            try {
              return JSON.parse(line) as SecurityEvent;
            } catch {
              return null;
            }
          })
          .filter((e): e is SecurityEvent => e !== null)
          .filter((e) => !type || e.type === type)
          .filter((e) => !severity || e.severity === severity)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit);

        return events;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.error('[SecurityLogger] Failed to read log file:', error);
        }
        return [];
      }
    } catch (error) {
      logger.error('[SecurityLogger] Failed to get recent events:', error);
      return [];
    }
  }
}
