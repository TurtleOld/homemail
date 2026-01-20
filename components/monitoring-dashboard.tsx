'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Shield, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Server, HardDrive, Mail as MailIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  system: {
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
  };
  security: {
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
  };
  storage: {
    available: boolean;
    writable: boolean;
  };
  mailProvider?: {
    available: boolean;
    responseTime?: number;
    error?: string;
  };
  checks: {
    storage: boolean;
    mailProvider: boolean;
    security: boolean;
  };
  alerts?: string[];
}

async function fetchMonitoringData(): Promise<HealthStatus> {
  const res = await fetch('/api/monitoring?alerts=true&detailed=true');
  if (!res.ok) {
    throw new Error('Failed to fetch monitoring data');
  }
  return res.json();
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}д ${hours}ч ${minutes}м`;
  }
  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes}м`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function MonitoringDashboard() {
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['monitoring'],
    queryFn: fetchMonitoringData,
    refetchInterval: autoRefresh ? 30000 : false,
  });

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        refetch();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Загрузка данных мониторинга...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="h-5 w-5" />
          <span className="font-medium">Ошибка загрузки данных мониторинга</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'Неизвестная ошибка'}
        </p>
        <Button onClick={() => refetch()} variant="outline" size="sm" className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Повторить
        </Button>
      </div>
    );
  }

  const statusColors = {
    healthy: 'text-green-600',
    degraded: 'text-yellow-600',
    unhealthy: 'text-red-600',
  };

  const statusIcons = {
    healthy: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    degraded: <AlertTriangle className="h-5 w-5 text-yellow-600" />,
    unhealthy: <XCircle className="h-5 w-5 text-red-600" />,
  };

  const statusLabels = {
    healthy: 'Работает нормально',
    degraded: 'Работает с ограничениями',
    unhealthy: 'Не работает',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Мониторинг системы</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Статус системы, метрики безопасности и производительности
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-primary/10' : ''}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            Автообновление
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Обновить
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {statusIcons[data.status]}
              <span className="font-medium">Общий статус</span>
            </div>
          </div>
          <p className={`mt-2 text-2xl font-bold ${statusColors[data.status]}`}>
            {statusLabels[data.status]}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Обновлено: {new Date(data.timestamp).toLocaleString('ru-RU')}
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Время работы</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{formatUptime(data.system.uptime)}</p>
          <p className="text-xs text-muted-foreground mt-1">С момента запуска</p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Память</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{data.system.memory.percentage.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatBytes(data.system.memory.used)} / {formatBytes(data.system.memory.total)}
          </p>
          {data.system.memory.percentage > 90 && (
            <p className="text-xs text-yellow-600 mt-1 font-medium">Высокое использование памяти</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Безопасность (24 часа)</span>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Неудачные входы</span>
              <span className="font-medium">{data.security.last24Hours.failedLogins}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Заблокированные IP</span>
              <span className="font-medium">{data.security.last24Hours.blockedIps}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">CSRF нарушения</span>
              <span className="font-medium">{data.security.last24Hours.csrfViolations}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Подозрительная активность</span>
              <span className="font-medium">{data.security.last24Hours.suspiciousActivity}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Всего событий</span>
              <span className="font-bold">{data.security.recentEvents.total}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Проверки системы</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Хранилище</span>
              </div>
              {data.checks.storage ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MailIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Почтовый сервер</span>
              </div>
              {data.checks.mailProvider ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
            {data.mailProvider && (
              <div className="text-xs text-muted-foreground pl-6">
                {data.mailProvider.available
                  ? `Время отклика: ${data.mailProvider.responseTime || 0}мс`
                  : `Ошибка: ${data.mailProvider.error || 'Неизвестная'}`}
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Безопасность</span>
              </div>
              {data.checks.security ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
          </div>
        </div>
      </div>

      {data.alerts && data.alerts.length > 0 && (
        <div className="rounded-lg border border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <span className="font-medium text-yellow-900 dark:text-yellow-100">Предупреждения</span>
          </div>
          <ul className="space-y-1">
            {data.alerts.map((alert, index) => (
              <li key={index} className="text-sm text-yellow-800 dark:text-yellow-200">
                • {alert}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Статистика событий</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium mb-2">По типу</p>
            <div className="space-y-1">
              {Object.entries(data.security.recentEvents.byType)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{type}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">По серьезности</p>
            <div className="space-y-1">
              {Object.entries(data.security.recentEvents.bySeverity)
                .sort(([, a], [, b]) => b - a)
                .map(([severity, count]) => (
                  <div key={severity} className="flex justify-between text-sm">
                    <span className="text-muted-foreground capitalize">{severity}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
