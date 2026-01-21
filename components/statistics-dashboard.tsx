'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, Mail, MailOpen, Send, FileText, TrendingUp, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface StatisticsData {
  totalMessages: number;
  totalUnread: number;
  totalSent: number;
  totalDrafts: number;
  messagesByDay: Array<{ date: string; incoming: number; outgoing: number }>;
  topSenders: Array<{ email: string; count: number }>;
  labelStats: Record<string, number>;
  folderStats: Array<{ id: string; name: string; role: string; unreadCount: number }>;
}

async function fetchStatistics(): Promise<StatisticsData> {
  const res = await fetch('/api/mail/statistics');
  if (!res.ok) {
    throw new Error('Failed to fetch statistics');
  }
  return res.json();
}

export function StatisticsDashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['statistics'],
    queryFn: fetchStatistics,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <Skeleton className="h-6 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-destructive">Ошибка загрузки статистики</p>
      </div>
    );
  }

  const maxMessages = Math.max(
    ...data.messagesByDay.map((d) => Math.max(d.incoming, d.outgoing)),
    1
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Статистика использования</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Аналитика вашей почтовой активности за последние 30 дней
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Всего писем</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{data.totalMessages}</p>
          <p className="text-xs text-muted-foreground mt-1">За все время</p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <MailOpen className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Непрочитанных</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-primary">{data.totalUnread}</p>
          <p className="text-xs text-muted-foreground mt-1">Требуют внимания</p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Отправлено</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{data.totalSent}</p>
          <p className="text-xs text-muted-foreground mt-1">За последние 30 дней</p>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Черновиков</span>
          </div>
          <p className="mt-2 text-2xl font-bold">{data.totalDrafts}</p>
          <p className="text-xs text-muted-foreground mt-1">Неотправленные</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Активность за 30 дней</span>
          </div>
          <div className="space-y-2">
            {data.messagesByDay.slice(-7).map((day) => (
              <div key={day.date} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20">
                  {new Date(day.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 bg-muted rounded-full h-4 relative overflow-hidden">
                    <div
                      className="absolute left-0 top-0 h-full bg-blue-500"
                      style={{ width: `${(day.incoming / maxMessages) * 100}%` }}
                    />
                    <div
                      className="absolute right-0 top-0 h-full bg-green-500"
                      style={{ width: `${(day.outgoing / maxMessages) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground w-16 text-right">
                    {day.incoming + day.outgoing}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500" />
              <span>Входящие</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Исходящие</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Топ отправителей</span>
          </div>
          <div className="space-y-2">
            {data.topSenders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет данных</p>
            ) : (
              data.topSenders.map((sender, index) => (
                <div key={sender.email} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium w-6">{index + 1}.</span>
                    <span className="text-sm truncate">{sender.email}</span>
                  </div>
                  <span className="text-sm font-medium">{sender.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <span className="font-medium">Статистика по папкам</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.folderStats.map((folder) => (
            <div key={folder.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
              <span className="text-sm font-medium">{folder.name}</span>
              <span className="text-sm text-muted-foreground">{folder.unreadCount} непрочитанных</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
