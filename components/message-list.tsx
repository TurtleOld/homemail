'use client';

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { MessageListItem, Label } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useLocaleSettings } from '@/lib/hooks';
import { Star, Paperclip, AlertCircle, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { groupMessagesByThread } from '@/lib/thread-utils';
import { ThreadItem } from './thread-item';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

interface MessageListProps {
  messages: MessageListItem[];
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onSelectAll: () => void;
  onSelectAllInFolder?: () => void;
  isSelectingAllInFolder?: boolean;
  allMessagesSelected?: boolean;
  onMessageClick: (message: MessageListItem) => void;
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  isFetchingMore?: boolean;
  isSearching?: boolean;
  onDragStart?: (messageId: string) => void;
  conversationView?: boolean;
  density?: 'compact' | 'comfortable' | 'spacious';
  groupBy?: 'none' | 'date' | 'sender';
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-emerald-500',
  'bg-orange-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-teal-500',
];

function getAvatarColor(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name?: string, email?: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return (email || '?')[0].toUpperCase();
}

async function getLabels(): Promise<Label[]> {
  const res = await fetch('/api/mail/labels');
  if (!res.ok) {
    throw new Error('Failed to load labels');
  }
  return res.json();
}

export const MessageItem = memo(function MessageItem({
  message,
  index,
  isSelected,
  isFocused,
  selectedIds,
  isSelectionMode,
  onSelect,
  onMessageClick,
  onMessageDoubleClick,
  onDragStart,
  density = 'comfortable',
}: {
  message: MessageListItem;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onMessageClick: (message: MessageListItem) => void;
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onDragStart?: (messageId: string) => void;
  density?: 'compact' | 'comfortable' | 'spacious';
}) {
  const localeSettings = useLocaleSettings();
  const t = useTranslations('messageList');
  const tCommon = useTranslations('common');
  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: getLabels,
  });

  const messageLabels = useMemo(() => {
    if (!message.labels || message.labels.length === 0) return [];
    return labels.filter((label) => message.labels?.includes(label.id));
  }, [message.labels, labels]);
  const densityClasses = {
    compact: 'p-2 gap-2',
    comfortable: 'p-3 gap-3',
    spacious: 'p-4 gap-4',
  };

  const textSizeClasses = {
    compact: 'text-xs',
    comfortable: 'text-sm',
    spacious: 'text-base',
  };
  const avatarColor = getAvatarColor(message.from.email);
  const initials = getInitials(message.from.name, message.from.email);

  return (
    <article
      key={message.id}
      data-testid="message-item"
      draggable={!!onDragStart}
      role="article"
      aria-label={t('messageAriaLabel', {
        sender: message.from.name || message.from.email,
        subject: message.subject || tCommon('noSubject'),
      })}
      tabIndex={0}
      onDragStart={(e) => {
        if (onDragStart) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', message.id);
          e.dataTransfer.setData(
            'application/json',
            JSON.stringify({ type: 'message', id: message.id })
          );
          onDragStart(message.id);
          e.currentTarget.style.opacity = '0.5';
        }
      }}
      onDragEnd={(e) => {
        if (onDragStart) {
          document.body.style.cursor = '';
          e.currentTarget.style.opacity = '1';
        }
      }}
      className={cn(
        'group relative mx-2 my-1 flex cursor-pointer items-start rounded-2xl border border-transparent transition-all duration-150 hover:mail-hover-surface hover:border-border/80 hover:shadow-[0_10px_22px_-20px_hsl(var(--shadow-soft)/0.45)] active:scale-[0.998] touch-manipulation',
        densityClasses[density],
        'max-md:p-4 max-md:gap-3',
        message.flags.unread && 'mail-unread-surface',
        isSelected && 'mail-selected-surface mail-border-strong shadow-sm',
        isFocused && 'ring-2 ring-primary/35 ring-inset',
        onDragStart && 'cursor-grab active:cursor-grabbing'
      )}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          onSelect(message.id, true);
        } else {
          onSelect(message.id, false);
          onMessageClick(message);
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onMessageDoubleClick) {
          onMessageDoubleClick(message);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onMessageClick(message);
        }
      }}
    >
      {/* Unread dot — left edge */}
      <div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full transition-all duration-150',
          message.flags.unread ? 'h-8 bg-[hsl(var(--unread))]' : 'h-0'
        )}
      />

      {/* Checkbox — hover reveal, always visible in selection mode */}
      <div
        className={cn(
          'flex-shrink-0 flex items-center justify-center mt-0.5',
          'transition-opacity duration-150',
          isSelected || isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect(message.id, true);
          }}
          onClick={(e) => e.stopPropagation()}
          className="max-md:scale-110 max-md:min-w-[24px] max-md:min-h-[24px] touch-manipulation focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label={t('selectMessage', { sender: message.from.name || message.from.email })}
        />
      </div>

      {/* Avatar — shown when checkbox hidden */}
      <div
        className={cn(
          'absolute flex-shrink-0 flex items-center justify-center',
          'transition-opacity duration-150',
          isSelected || isSelectionMode ? 'opacity-0' : 'opacity-100 group-hover:opacity-0',
          density === 'compact' ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-xs',
          avatarColor,
          'rounded-full text-white font-semibold select-none',
          density === 'compact' ? 'top-2' : 'top-3'
        )}
        style={{ left: density === 'compact' ? '8px' : '12px' }}
      >
        {initials}
      </div>

      {/* Spacer matching avatar/checkbox width */}
      <div className={cn('flex-shrink-0', density === 'compact' ? 'w-7' : 'w-8')} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 max-md:gap-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'truncate max-md:text-sm',
                  message.flags.unread
                    ? 'font-semibold text-foreground'
                    : 'font-normal text-muted-foreground'
                )}
              >
                {message.from.name || message.from.email}
              </span>
              {message.flags.hasAttachments && (
                <Paperclip className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
              )}
              {message.flags.important && (
                <AlertCircle className="h-3 w-3 flex-shrink-0 fill-orange-500 text-orange-500" />
              )}
              {message.flags.starred && (
                <Star className="h-3 w-3 flex-shrink-0 fill-[hsl(var(--starred))] text-[hsl(var(--starred))]" />
              )}
            </div>
            <div
              className={cn(
                'flex items-center gap-2 max-md:gap-1',
                textSizeClasses[density],
                'max-md:text-xs'
              )}
            >
              <span
                className={cn(
                  'truncate',
                  message.flags.unread ? 'font-medium text-foreground' : 'text-muted-foreground'
                )}
              >
                {message.subject || tCommon('noSubject')}
              </span>
              <span
                className={cn(
                  'flex-shrink-0 tabular-nums text-muted-foreground',
                  density === 'compact' ? 'text-[10px]' : 'text-xs',
                  'max-md:text-[10px]'
                )}
              >
                {formatDate(message.date, localeSettings)}
              </span>
            </div>
            {density !== 'compact' && message.snippet && (
              <div className="truncate text-xs text-muted-foreground max-md:text-[10px]">
                {message.snippet}
              </div>
            )}
            {messageLabels.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {messageLabels.slice(0, 3).map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center rounded-lg px-1.5 py-0.5 text-[10px] font-medium max-md:text-[8px]"
                    style={{
                      backgroundColor: `${label.color || '#3b82f6'}15`,
                      color: label.color || '#3b82f6',
                      border: `1px solid ${label.color || '#3b82f6'}30`,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
                {messageLabels.length > 3 && (
                  <span className="text-[10px] text-muted-foreground max-md:text-[8px]">
                    +{messageLabels.length - 3}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
});

export function MessageList({
  messages,
  selectedIds,
  onSelect,
  onSelectAll,
  onSelectAllInFolder,
  isSelectingAllInFolder = false,
  allMessagesSelected = false,
  onMessageClick,
  onMessageDoubleClick,
  onLoadMore,
  hasMore,
  isLoading = false,
  isFetchingMore = false,
  isSearching = false,
  onDragStart,
  conversationView = false,
  density = 'comfortable',
  groupBy = 'none',
}: MessageListProps) {
  const t = useTranslations('messageList');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const messagesRef = useRef(messages);
  const onMessageClickRef = useRef(onMessageClick);
  const focusedIndexRef = useRef<number | null>(null);

  const tList = useTranslations('messageList');
  const threads = conversationView ? groupMessagesByThread(messages) : null;

  useEffect(() => {
    messagesRef.current = messages;
    onMessageClickRef.current = onMessageClick;
  }, [messages, onMessageClick]);

  useEffect(() => {
    focusedIndexRef.current = focusedIndex;
  }, [focusedIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'j' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, messagesRef.current.length - 1);
          if (next < messagesRef.current.length) {
            onMessageClickRef.current(messagesRef.current[next]);
          }
          return next;
        });
      } else if (e.key === 'k' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? messagesRef.current.length - 1 : Math.max(prev - 1, 0);
          if (next >= 0) {
            onMessageClickRef.current(messagesRef.current[next]);
          }
          return next;
        });
      } else if (e.key === 'Enter' || e.key === 'o') {
        if (focusedIndexRef.current !== null && messagesRef.current[focusedIndexRef.current]) {
          e.preventDefault();
          onMessageClickRef.current(messagesRef.current[focusedIndexRef.current]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const groupedMessages = useMemo(() => {
    if (groupBy === 'none') {
      return messages.map((msg, idx) => ({ message: msg, index: idx, groupHeader: null }));
    }

    if (groupBy === 'date') {
      const groups: Array<{
        date: string;
        messages: Array<{ message: MessageListItem; index: number }>;
      }> = [];
      const dateMap = new Map<string, Array<{ message: MessageListItem; index: number }>>();

      messages.forEach((msg, idx) => {
        const date = new Date(msg.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const thisWeek = new Date(today);
        thisWeek.setDate(thisWeek.getDate() - 7);

        let groupKey: string;
        if (date >= today) {
          groupKey = tList('groupToday');
        } else if (date >= yesterday) {
          groupKey = tList('groupYesterday');
        } else if (date >= thisWeek) {
          groupKey = tList('groupThisWeek');
        } else {
          const month = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
          groupKey = month.charAt(0).toUpperCase() + month.slice(1);
        }

        if (!dateMap.has(groupKey)) {
          dateMap.set(groupKey, []);
        }
        dateMap.get(groupKey)!.push({ message: msg, index: idx });
      });

      return Array.from(dateMap.entries())
        .sort((a, b) => {
          const order = [tList('groupToday'), tList('groupYesterday'), tList('groupThisWeek')];
          const aIdx = order.indexOf(a[0]);
          const bIdx = order.indexOf(b[0]);
          if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
          if (aIdx !== -1) return -1;
          if (bIdx !== -1) return 1;
          return a[0].localeCompare(b[0], 'ru');
        })
        .flatMap(([groupKey, msgs]) => [
          { message: null, index: -1, groupHeader: groupKey },
          ...msgs.map((m) => ({ ...m, groupHeader: null })),
        ]);
    }

    if (groupBy === 'sender') {
      const senderMap = new Map<string, Array<{ message: MessageListItem; index: number }>>();

      messages.forEach((msg, idx) => {
        const senderKey = msg.from.name || msg.from.email;
        if (!senderMap.has(senderKey)) {
          senderMap.set(senderKey, []);
        }
        senderMap.get(senderKey)!.push({ message: msg, index: idx });
      });

      return Array.from(senderMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
        .flatMap(([senderKey, msgs]) => [
          { message: null, index: -1, groupHeader: senderKey },
          ...msgs.map((m) => ({ ...m, groupHeader: null })),
        ]);
    }

    return messages.map((msg, idx) => ({ message: msg, index: idx, groupHeader: null }));
  }, [messages, groupBy, tList]);

  const renderMessage = useCallback(
    (index: number) => {
      const item = groupedMessages[index];
      if (!item) return null;

      if (item.groupHeader) {
        return (
          <div
            key={`group-${item.groupHeader}`}
            className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b px-3 py-2 text-sm font-semibold text-muted-foreground"
          >
            {item.groupHeader}
          </div>
        );
      }

      const message = item.message;
      if (!message) return null;

      const isSelected = selectedIds.has(message.id);
      const isFocused = focusedIndex === item.index;

      return (
        <MessageItem
          key={message.id}
          message={message}
          index={item.index}
          isSelected={isSelected}
          isFocused={isFocused}
          selectedIds={selectedIds}
          isSelectionMode={selectedIds.size > 0}
          onSelect={onSelect}
          onMessageClick={onMessageClick}
          onMessageDoubleClick={onMessageDoubleClick}
          onDragStart={onDragStart}
          density={density}
        />
      );
    },
    [
      groupedMessages,
      selectedIds,
      focusedIndex,
      onSelect,
      onMessageClick,
      onMessageDoubleClick,
      onDragStart,
      density,
    ]
  );

  const toggleThreadExpand = useCallback((threadId: string) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      return next;
    });
  }, []);

  return (
    <div
      className="mail-panel-surface flex h-full w-full flex-col border-r border-white/70 max-md:border-r-0"
      role="region"
      aria-label={t('regionLabel')}
    >
      <div
        className="mail-panel-muted sticky top-0 z-10 border-b border-white/80 p-2.5 max-md:p-1.5"
        role="toolbar"
        aria-label={t('toolbarLabel')}
      >
        <div className="flex items-center gap-2 max-md:gap-1">
          <input
            type="checkbox"
            checked={messages.length > 0 && messages.every((m) => selectedIds.has(m.id))}
            onChange={onSelectAll}
            className="ml-1 max-md:ml-0.5 max-md:scale-110 max-md:min-w-[24px] max-md:min-h-[24px] touch-manipulation focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label={t('selectAll')}
            aria-controls="message-list"
          />
          <span
            className="text-sm text-slate-600 max-md:text-xs"
            aria-live="polite"
            aria-atomic="true"
          >
            {selectedIds.size > 0
              ? t('selectedCount', { count: selectedIds.size })
              : t('totalCount', { count: messages.length })}
          </span>
          {isFetchingMore && (
            <span className="ml-auto text-xs text-slate-500 max-md:text-[10px]">
              {t('loadingMore')}
            </span>
          )}
        </div>
        {onSelectAllInFolder && selectedIds.size > 0 && !allMessagesSelected && hasMore && (
          <div className="mt-2 flex items-center gap-2 px-1 text-xs text-muted-foreground max-md:flex-wrap">
            <span>{t('selectedLoadedHint', { count: selectedIds.size })}</span>
            <button
              type="button"
              onClick={onSelectAllInFolder}
              disabled={isSelectingAllInFolder}
              className="font-medium text-primary hover:underline disabled:opacity-60"
            >
              {isSelectingAllInFolder ? t('selectingAll') : t('selectAllInFolder')}
            </button>
          </div>
        )}
        {allMessagesSelected && (
          <div className="mt-2 px-1 text-xs font-medium text-primary">
            {t('allMessagesSelected', { count: selectedIds.size })}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col h-full p-3 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/70 p-3"
              >
                <Skeleton className="h-5 w-5 rounded mt-1" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500">
            <div className="text-center">
              <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{isSearching ? t('noResults') : t('empty')}</p>
            </div>
          </div>
        ) : conversationView && threads ? (
          <div className="overflow-auto h-full">
            {threads.map((thread) => (
              <ThreadItem
                key={thread.threadId}
                thread={thread}
                selectedIds={selectedIds}
                onSelect={onSelect}
                onMessageClick={onMessageClick}
                onMessageDoubleClick={onMessageDoubleClick}
                onDragStart={onDragStart}
                isExpanded={expandedThreads.has(thread.threadId)}
                onToggleExpand={toggleThreadExpand}
              />
            ))}
            {hasMore && onLoadMore && (
              <div className="p-4 text-center">
                <button
                  onClick={onLoadMore}
                  disabled={isFetchingMore}
                  className="text-sm text-primary hover:underline"
                >
                  {isFetchingMore ? t('loadingMore') : t('loadMore')}
                </button>
              </div>
            )}
          </div>
        ) : process.env.NODE_ENV === 'test' ? (
          <div>{groupedMessages.map((_, index) => renderMessage(index))}</div>
        ) : (
          <Virtuoso
            data={groupedMessages}
            totalCount={groupedMessages.length}
            itemContent={(index) => {
              const item = groupedMessages[index];
              if (!item) return null;
              if (item.groupHeader) {
                return (
                  <div
                    key={`group-${item.groupHeader}-${index}`}
                    className="sticky top-0 z-10 border-b border-white/80 bg-[hsl(var(--surface-panel-muted)/0.92)] px-4 py-2 text-sm font-semibold text-slate-500 backdrop-blur-sm"
                  >
                    {item.groupHeader}
                  </div>
                );
              }
              const message = item.message;
              if (!message) return null;
              const isSelected = selectedIds.has(message.id);
              const isFocused = focusedIndex === item.index;
              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  index={item.index}
                  isSelected={isSelected}
                  isFocused={isFocused}
                  selectedIds={selectedIds}
                  isSelectionMode={selectedIds.size > 0}
                  onSelect={onSelect}
                  onMessageClick={onMessageClick}
                  onMessageDoubleClick={onMessageDoubleClick}
                  onDragStart={onDragStart}
                  density={density}
                />
              );
            }}
            endReached={() => {
              if (hasMore && onLoadMore) {
                onLoadMore();
              }
            }}
            style={{ height: '100%' }}
          />
        )}
      </div>
    </div>
  );
}
