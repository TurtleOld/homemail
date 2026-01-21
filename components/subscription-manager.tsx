'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Mail, Trash2, Search, CheckSquare, Square } from 'lucide-react';
import type { EmailSubscription } from '@/lib/types';

async function getSubscriptions(): Promise<EmailSubscription[]> {
  const res = await fetch('/api/subscriptions');
  if (!res.ok) {
    throw new Error('Failed to load subscriptions');
  }
  return res.json();
}

async function unsubscribe(subscriptionIds: string[]): Promise<{ success: boolean; unsubscribed: number }> {
  const res = await fetch('/api/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriptionIds }),
  });
  if (!res.ok) {
    throw new Error('Failed to unsubscribe');
  }
  return res.json();
}

async function detectSubscriptions(messageIds: string[]): Promise<{ success: boolean; detected: number; total: number }> {
  const res = await fetch('/api/subscriptions/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageIds }),
  });
  if (!res.ok) {
    throw new Error('Failed to detect subscriptions');
  }
  return res.json();
}

export function SubscriptionManager() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: subscriptions = [], isLoading } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: getSubscriptions,
  });

  const unsubscribeMutation = useMutation({
    mutationFn: unsubscribe,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      setSelectedIds(new Set());
      toast.success(`Отписано от ${data.unsubscribed} рассылок`);
    },
    onError: () => {
      toast.error('Ошибка отписки');
    },
  });

  const detectMutation = useMutation({
    mutationFn: detectSubscriptions,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success(`Обнаружено ${data.detected} новых подписок`);
    },
    onError: () => {
      toast.error('Ошибка обнаружения подписок');
    },
  });

  const filteredSubscriptions = subscriptions.filter((sub) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      sub.senderEmail.toLowerCase().includes(query) ||
      sub.senderName?.toLowerCase().includes(query) ||
      sub.category?.toLowerCase().includes(query)
    );
  });

  const activeSubscriptions = filteredSubscriptions.filter((sub) => sub.isActive);
  const inactiveSubscriptions = filteredSubscriptions.filter((sub) => !sub.isActive);

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === activeSubscriptions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeSubscriptions.map((sub) => sub.id)));
    }
  };

  const handleUnsubscribe = () => {
    if (selectedIds.size === 0) {
      toast.error('Выберите подписки для отписки');
      return;
    }
    if (confirm(`Отписаться от ${selectedIds.size} рассылок?`)) {
      unsubscribeMutation.mutate(Array.from(selectedIds));
    }
  };

  const handleDetectFromMessages = async () => {
    const res = await fetch('/api/mail/messages?folderId=inbox&limit=100');
    if (!res.ok) {
      toast.error('Не удалось загрузить письма');
      return;
    }
    const data = await res.json();
    const messageIds = data.messages?.map((m: any) => m.id) || [];
    if (messageIds.length === 0) {
      toast.error('Нет писем для анализа');
      return;
    }
    detectMutation.mutate(messageIds);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Управление подписками</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Управляйте email-подписками и массово отписывайтесь от нежелательных рассылок.
        </p>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по отправителю или категории..."
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={handleDetectFromMessages}
          disabled={detectMutation.isPending}
        >
          <Mail className="h-4 w-4 mr-2" />
          {detectMutation.isPending ? 'Обнаружение...' : 'Обнаружить подписки'}
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-card p-4">
          <span className="text-sm font-medium">
            Выбрано: {selectedIds.size}
          </span>
          <Button
            variant="destructive"
            onClick={handleUnsubscribe}
            disabled={unsubscribeMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {unsubscribeMutation.isPending ? 'Отписка...' : 'Отписаться'}
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-sm text-muted-foreground">Загрузка подписок...</p>
        </div>
      )}

      {!isLoading && (
        <>
          {activeSubscriptions.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Активные подписки ({activeSubscriptions.length})</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                >
                  {selectedIds.size === activeSubscriptions.length ? (
                    <CheckSquare className="h-4 w-4 mr-2" />
                  ) : (
                    <Square className="h-4 w-4 mr-2" />
                  )}
                  {selectedIds.size === activeSubscriptions.length ? 'Снять выбор' : 'Выбрать все'}
                </Button>
              </div>
              <div className="space-y-2">
                {activeSubscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-4"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(sub.id)}
                      onChange={() => handleToggleSelect(sub.id)}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {sub.senderName || sub.senderEmail}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {sub.senderEmail}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Писем: {sub.messageCount} • Последнее: {new Date(sub.lastMessageDate).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                    {sub.unsubscribeUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(sub.unsubscribeUrl, '_blank')}
                      >
                        Отписаться
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {inactiveSubscriptions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Отписанные ({inactiveSubscriptions.length})</h3>
              <div className="space-y-2">
                {inactiveSubscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {sub.senderName || sub.senderEmail}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {sub.senderEmail}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredSubscriptions.length === 0 && (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'Подписки не найдены' : 'Нет подписок. Используйте кнопку "Обнаружить подписки" для анализа ваших писем.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
