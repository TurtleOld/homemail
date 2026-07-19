'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Mail, Trash2, Search, CheckSquare, Square } from 'lucide-react';
import type { EmailSubscription } from '@/lib/types';
import { SettingsSectionEmpty, SettingsSectionError, SettingsSectionHeader, SettingsSectionLoading } from '@/components/settings/settings-section-state';

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
  const locale = useLocale();
  const t = useTranslations('settings.subscriptions');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: subscriptions = [], isLoading, error, refetch } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: getSubscriptions,
  });

  const unsubscribeMutation = useMutation({
    mutationFn: unsubscribe,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      setSelectedIds(new Set());
      toast.success(t('unsubscribeSuccess', { count: data.unsubscribed }));
    },
    onError: () => {
      toast.error(t('unsubscribeError'));
    },
  });

  const detectMutation = useMutation({
    mutationFn: detectSubscriptions,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success(t('detectSuccess', { count: data.detected }));
    },
    onError: () => {
      toast.error(t('detectError'));
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
      toast.error(t('selectRequired'));
      return;
    }
    if (confirm(t('confirmUnsubscribe', { count: selectedIds.size }))) {
      unsubscribeMutation.mutate(Array.from(selectedIds));
    }
  };

  const handleDetectFromMessages = async () => {
    const res = await fetch('/api/mail/messages?folderId=inbox&limit=100');
    if (!res.ok) {
      toast.error(t('messagesLoadError'));
      return;
    }
    const data = await res.json();
    const messageIds = data.messages?.map((m: any) => m.id) || [];
    if (messageIds.length === 0) {
      toast.error(t('noMessages'));
      return;
    }
    detectMutation.mutate(messageIds);
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader title={t('heading')} description={t('description')} />

      <div className="flex items-center gap-4 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={handleDetectFromMessages}
          disabled={detectMutation.isPending}
        >
          <Mail className="h-4 w-4 mr-2" />
          {detectMutation.isPending ? t('detecting') : t('detect')}
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-card p-4">
          <span className="text-sm font-medium">
            {t('selected', { count: selectedIds.size })}
          </span>
          <Button
            variant="destructive"
            onClick={handleUnsubscribe}
            disabled={unsubscribeMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {unsubscribeMutation.isPending ? t('unsubscribing') : t('unsubscribe')}
          </Button>
        </div>
      )}

      {isLoading && <SettingsSectionLoading label={t('loading')} />}

      {!isLoading && error && (
        <SettingsSectionError title={t('loadError')} description={t('loadErrorDescription')} retryLabel={t('retry')} onRetry={() => void refetch()} />
      )}

      {!isLoading && !error && (
        <>
          {activeSubscriptions.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('active', { count: activeSubscriptions.length })}</h3>
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
                  {selectedIds.size === activeSubscriptions.length ? t('clearSelection') : t('selectAll')}
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
                        {t('messageSummary', { count: sub.messageCount, date: new Date(sub.lastMessageDate).toLocaleDateString(locale) })}
                      </div>
                    </div>
                    {sub.unsubscribeUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(sub.unsubscribeUrl, '_blank')}
                      >
                        {t('unsubscribe')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {inactiveSubscriptions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{t('inactive', { count: inactiveSubscriptions.length })}</h3>
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
            <SettingsSectionEmpty>{searchQuery ? t('notFound') : t('empty')}</SettingsSectionEmpty>
          )}
        </>
      )}
    </div>
  );
}
