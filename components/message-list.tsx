'use client';

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { MessageListItem, Label } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useLocaleSettings } from '@/lib/hooks';
import { Star, StarOff, Mail, MailOpen, Paperclip, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { groupMessagesByThread } from '@/lib/thread-utils';
import { ThreadItem } from './thread-item';
import { useQuery } from '@tanstack/react-query';

interface MessageListProps {
  messages: MessageListItem[];
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onSelectAll: () => void;
  onMessageClick: (message: MessageListItem) => void;
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  isFetchingMore?: boolean;
  isSearching?: boolean;
  onDragStart?: (messageId: string) => void;
  onToggleImportant?: (messageId: string, important: boolean) => void;
  conversationView?: boolean;
  density?: 'compact' | 'comfortable' | 'spacious';
  groupBy?: 'none' | 'date' | 'sender';
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
  onSelect,
  onMessageClick,
  onMessageDoubleClick,
  onDragStart,
  onToggleImportant,
  density = 'comfortable',
}: {
  message: MessageListItem;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onMessageClick: (message: MessageListItem) => void;
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onDragStart?: (messageId: string) => void;
  onToggleImportant?: (messageId: string, important: boolean) => void;
  density?: 'compact' | 'comfortable' | 'spacious';
}) {
  const localeSettings = useLocaleSettings();
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
  return (
    <article
      key={message.id}
      data-testid="message-item"
      draggable={!!onDragStart}
      role="article"
      aria-label={`Письмо от ${message.from.name || message.from.email}: ${message.subject || 'без темы'}`}
      aria-selected={isSelected}
      tabIndex={0}
      onDragStart={(e) => {
        if (onDragStart) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', message.id);
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'message', id: message.id }));
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
        'flex cursor-pointer items-start border-b transition-all duration-200 hover:bg-muted/50 active:bg-muted/70 touch-manipulation hover:shadow-sm',
        densityClasses[density],
        'max-md:p-4 max-md:gap-3',
        isSelected && 'bg-muted shadow-sm',
        isFocused && 'ring-2 ring-primary ring-offset-2',
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
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => {
          e.stopPropagation();
          onSelect(message.id, true);
        }}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 max-md:mt-0.5 max-md:scale-110 max-md:min-w-[24px] max-md:min-h-[24px] touch-manipulation focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label={`Выбрать письмо от ${message.from.name || message.from.email}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 max-md:gap-1">
          {message.flags.starred ? (
            <Star className="h-4 w-4 max-md:h-3 max-md:w-3 flex-shrink-0 fill-yellow-500 text-yellow-500" />
          ) : (
              <StarOff className="h-4 w-4 max-md:h-3 max-md:w-3 flex-shrink-0 text-muted-foreground" />
          )}
          {onToggleImportant && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleImportant(message.id, !message.flags.important);
              }}
              className="flex-shrink-0 p-0.5 hover:bg-muted rounded transition-colors focus:ring-2 focus:ring-primary focus:ring-offset-2"
              title={message.flags.important ? 'Убрать важность' : 'Отметить как важное'}
              aria-label={message.flags.important ? 'Убрать важность' : 'Отметить как важное'}
            >
              <AlertCircle
                className={cn(
                  'h-4 w-4 max-md:h-3 max-md:w-3 flex-shrink-0',
                  message.flags.important
                    ? 'fill-orange-500 text-orange-500'
                    : 'text-muted-foreground opacity-50'
                )}
              />
            </button>
          )}
          {!onToggleImportant && message.flags.important && (
            <AlertCircle className="h-4 w-4 max-md:h-3 max-md:w-3 flex-shrink-0 fill-orange-500 text-orange-500" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 max-md:gap-1">
              <span className={cn('truncate max-md:text-sm', message.flags.unread ? 'font-bold' : 'font-normal')}>
                {message.from.name || message.from.email}
              </span>
              {message.flags.hasAttachments && (
                <Paperclip className="h-3 w-3 max-md:h-2.5 max-md:w-2.5 flex-shrink-0 text-muted-foreground" />
              )}
            </div>
            <div className={cn('mt-1 max-md:mt-0.5 flex items-center gap-2', textSizeClasses[density], 'max-md:text-xs')}>
              <span className={cn('truncate', message.flags.unread ? 'font-semibold' : 'text-muted-foreground')}>
                {message.subject || '(без темы)'}
              </span>
              <span className={cn('text-muted-foreground flex-shrink-0', density === 'compact' ? 'text-[10px]' : 'text-xs', 'max-md:text-[10px]')}>{formatDate(message.date, localeSettings)}</span>
            </div>
            {message.snippet && (
              <div className={cn('mt-1 max-md:mt-0.5 truncate text-muted-foreground', density === 'compact' ? 'text-[10px]' : 'text-xs', 'max-md:text-[10px]')}>{message.snippet}</div>
            )}
            {messageLabels.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {messageLabels.slice(0, 3).map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium max-md:text-[8px]"
                    style={{
                      backgroundColor: `${label.color || '#3b82f6'}20`,
                      color: label.color || '#3b82f6',
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
          <div className="flex-shrink-0 max-md:hidden">
            {message.flags.unread ? (
              <Mail className="h-4 w-4 text-primary" />
            ) : (
              <MailOpen className="h-4 w-4 text-muted-foreground" />
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
  onMessageClick,
  onMessageDoubleClick,
  onLoadMore,
  hasMore,
  isLoading = false,
  isFetchingMore = false,
  isSearching = false,
  onDragStart,
  onToggleImportant,
  conversationView = false,
  density = 'comfortable',
  groupBy = 'none',
}: MessageListProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const messagesRef = useRef(messages);
  const onMessageClickRef = useRef(onMessageClick);
  const focusedIndexRef = useRef<number | null>(null);

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
      const groups: Array<{ date: string; messages: Array<{ message: MessageListItem; index: number }> }> = [];
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
          groupKey = 'Сегодня';
        } else if (date >= yesterday) {
          groupKey = 'Вчера';
        } else if (date >= thisWeek) {
          groupKey = 'На этой неделе';
        } else {
          const month = date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
          groupKey = month.charAt(0).toUpperCase() + month.slice(1);
        }

        if (!dateMap.has(groupKey)) {
          dateMap.set(groupKey, []);
        }
        dateMap.get(groupKey)!.push({ message: msg, index: idx });
      });

      return Array.from(dateMap.entries())
        .sort((a, b) => {
          const order = ['Сегодня', 'Вчера', 'На этой неделе'];
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
  }, [messages, groupBy]);

  const renderMessage = useCallback(
    (index: number) => {
      const item = groupedMessages[index];
      if (!item) return null;

      if (item.groupHeader) {
        return (
          <div key={`group-${item.groupHeader}`} className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b px-3 py-2 text-sm font-semibold text-muted-foreground">
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
          onSelect={onSelect}
          onMessageClick={onMessageClick}
          onMessageDoubleClick={onMessageDoubleClick}
          onDragStart={onDragStart}
          onToggleImportant={onToggleImportant}
          density={density}
        />
      );
    },
    [groupedMessages, selectedIds, focusedIndex, onSelect, onMessageClick, onDragStart, onToggleImportant, density]
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
    <div className="flex h-full w-full flex-col border-r bg-background max-md:border-r-0" role="region" aria-label="Список писем">
      <div className="border-b bg-muted/50 p-2 max-md:p-1.5 sticky top-0 z-10" role="toolbar" aria-label="Действия со списком писем">
        <div className="flex items-center gap-2 max-md:gap-1">
          <input
            type="checkbox"
            checked={messages.length > 0 && messages.every((m) => selectedIds.has(m.id))}
            onChange={onSelectAll}
            className="ml-1 max-md:ml-0.5 max-md:scale-110 max-md:min-w-[24px] max-md:min-h-[24px] touch-manipulation focus:ring-2 focus:ring-primary focus:ring-offset-2"
            aria-label="Выбрать все письма"
            aria-controls="message-list"
          />
          <span className="text-sm max-md:text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
            {selectedIds.size > 0 ? `Выбрано: ${selectedIds.size}` : `Всего: ${messages.length}`}
          </span>
          {isFetchingMore && (
            <span className="ml-auto text-xs max-md:text-[10px] text-muted-foreground">Загрузка...</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col h-full p-3 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 border-b pb-3">
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
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{isSearching ? 'Ничего не найдено' : 'Нет писем'}</p>
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
                onToggleImportant={onToggleImportant}
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
                  {isFetchingMore ? 'Загрузка...' : 'Загрузить ещё'}
                </button>
              </div>
            )}
          </div>
        ) : (
          (process.env.NODE_ENV === 'test' ? (
            <div>
              {groupedMessages.map((_, index) => renderMessage(index))}
            </div>
          ) : (
            <Virtuoso
              data={groupedMessages}
              totalCount={groupedMessages.length}
              itemContent={(index) => {
                const item = groupedMessages[index];
                if (!item) return null;
                if (item.groupHeader) {
                  return (
                    <div key={`group-${item.groupHeader}-${index}`} className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b px-3 py-2 text-sm font-semibold text-muted-foreground">
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
                    onSelect={onSelect}
                    onMessageClick={onMessageClick}
                    onMessageDoubleClick={onMessageDoubleClick}
                    onDragStart={onDragStart}
                    onToggleImportant={onToggleImportant}
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
          ))
        )}
      </div>
    </div>
  );
}
