import { SecurityLogger } from './security-logger';
import { logger } from './logger';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));

export interface SystemMetrics {
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  timestamp: string;
}

export interface SecurityMetrics {
  recentEvents: {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
  last24Hours: {
    failedLogins: number;
    blockedIps: number;
    csrfViolations: number;
    suspiciousActivity: number;
  };
}

export interface StorageStatus {
  available: boolean;
  writable: boolean;
  size?: {
    total: number;
    used: number;
    free: number;
  };
}

export interface MailProviderStatus {
  available: boolean;
  responseTime?: number;
  error?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  system: SystemMetrics;
  security: SecurityMetrics;
  storage: StorageStatus;
  mailProvider?: MailProviderStatus;
  checks: {
    storage: boolean;
    mailProvider: boolean;
    security: boolean;
  };
}

async function checkStorageStatus(): Promise<StorageStatus> {
  try {
    await fs.access(DATA_DIR);
    const testFile = path.join(DATA_DIR, '.health-check');
    try {
      await fs.writeFile(testFile, 'test', 'utf-8');
      await fs.unlink(testFile);
    } catch {
      return {
        available: true,
        writable: false,
      };
    }

    try {
      const stats = await fs.stat(DATA_DIR);
      return {
        available: true,
        writable: true,
      };
    } catch {
    }

    return {
      available: true,
      writable: true,
    };
  } catch {
    return {
      available: false,
      writable: false,
    };
  }
}

async function checkMailProviderStatus(): Promise<MailProviderStatus> {
  const baseUrl = process.env.STALWART_BASE_URL || process.env.IMAP_HOST;
  if (!baseUrl) {
    return {
      available: false,
      error: 'Mail provider not configured',
    };
  }

  try {
    const startTime = Date.now();
    const url = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
    const healthUrl = `${url.replace(/\/$/, '')}/.well-known/jmap`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });

      clearTimeout(timeout);
      const responseTime = Date.now() - startTime;

      if (response.ok || response.status === 401) {
        return {
          available: true,
          responseTime,
        };
      }

      return {
        available: false,
        responseTime,
        error: `HTTP ${response.status}`,
      };
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          available: false,
          error: 'Timeout',
        };
      }
      throw fetchError;
    }
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function getSecurityMetrics(): Promise<SecurityMetrics> {
  try {
    const recentEvents = await SecurityLogger.getRecentEvents(1000);

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let failedLogins = 0;
    let blockedIps = 0;
    let csrfViolations = 0;
    let suspiciousActivity = 0;

    const now = Date.now();
    const last24Hours = now - 24 * 60 * 60 * 1000;

    for (const event of recentEvents) {
      byType[event.type] = (byType[event.type] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;

      const eventTime = new Date(event.timestamp).getTime();
      if (eventTime >= last24Hours) {
        if (event.type === 'login_failed') {
          failedLogins++;
        } else if (event.type === 'ip_blocked') {
          blockedIps++;
        } else if (event.type === 'csrf_violation') {
          csrfViolations++;
        } else if (event.type === 'suspicious_activity') {
          suspiciousActivity++;
        }
      }
    }

    return {
      recentEvents: {
        total: recentEvents.length,
        byType,
        bySeverity,
      },
      last24Hours: {
        failedLogins,
        blockedIps,
        csrfViolations,
        suspiciousActivity,
      },
    };
  } catch (error) {
    logger.error('[Monitoring] Failed to get security metrics:', error);
    return {
      recentEvents: {
        total: 0,
        byType: {},
        bySeverity: {},
      },
      last24Hours: {
        failedLogins: 0,
        blockedIps: 0,
        csrfViolations: 0,
        suspiciousActivity: 0,
      },
    };
  }
}

function getSystemMetrics(): SystemMetrics {
  const usage = process.memoryUsage();
  const total = usage.heapTotal;
  const used = usage.heapUsed;
  const percentage = total > 0 ? (used / total) * 100 : 0;

  return {
    uptime: process.uptime(),
    memory: {
      used,
      total,
      percentage: Math.round(percentage * 100) / 100,
    },
    timestamp: new Date().toISOString(),
  };
}

export async function getHealthStatus(includeMailProvider: boolean = true): Promise<HealthStatus> {
  const [storage, security, mailProvider] = await Promise.all([
    checkStorageStatus(),
    getSecurityMetrics(),
    includeMailProvider ? checkMailProviderStatus() : Promise.resolve(undefined),
  ]);

  const system = getSystemMetrics();

  const checks = {
    storage: storage.available && storage.writable,
    mailProvider: mailProvider ? mailProvider.available : true,
    security: true,
  };

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (!checks.storage) {
    status = 'unhealthy';
  } else if (!checks.mailProvider && includeMailProvider) {
    status = 'degraded';
  } else if (security.last24Hours.failedLogins > 100 || security.last24Hours.csrfViolations > 50) {
    status = 'degraded';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    system,
    security,
    storage,
    mailProvider,
    checks,
  };
}

export async function checkAlerts(): Promise<string[]> {
  const alerts: string[] = [];
  const health = await getHealthStatus(true);

  if (!health.checks.storage) {
    alerts.push('Storage is not available or not writable');
  }

  if (!health.checks.mailProvider) {
    alerts.push(`Mail provider is not available: ${health.mailProvider?.error || 'Unknown error'}`);
  }

  if (health.security.last24Hours.failedLogins > 50) {
    alerts.push(`High number of failed login attempts: ${health.security.last24Hours.failedLogins}`);
  }

  if (health.security.last24Hours.csrfViolations > 20) {
    alerts.push(`High number of CSRF violations: ${health.security.last24Hours.csrfViolations}`);
  }

  if (health.security.last24Hours.suspiciousActivity > 10) {
    alerts.push(`Suspicious activity detected: ${health.security.last24Hours.suspiciousActivity} events`);
  }

  if (health.system.memory.percentage > 90) {
    alerts.push(`High memory usage: ${health.system.memory.percentage.toFixed(2)}%`);
  }

  return alerts;
}
