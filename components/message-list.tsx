'use client';

import { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { MessageListItem, Label } from '@/lib/types';
import { formatDate, formatExactDateTime } from '@/lib/utils';
import { useLocaleSettings } from '@/lib/hooks';
import { Star, Paperclip, AlertCircle, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { groupMessagesByThread } from '@/lib/thread-utils';
import { ThreadItem } from './thread-item';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface MessageListProps {
  messages: MessageListItem[];
  activeMessageId?: string | null;
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onSelectAll: () => void;
  onClearSelection?: () => void;
  onSelectAllInFolder?: () => void;
  isSelectingAllInFolder?: boolean;
  allMessagesSelected?: boolean;
  onMessageClick: (message: MessageListItem) => void;
  getMessageHref?: (message: MessageListItem) => string;
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  isFetchingMore?: boolean;
  isSearching?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  initialTopMostItemIndex?: number;
  onTopMostItemChange?: (index: number) => void;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  onDragStart?: (messageId: string) => void;
  conversationView?: boolean;
  density?: 'compact' | 'comfortable' | 'spacious';
  groupBy?: 'none' | 'date' | 'sender';
  layout?: 'legacy' | 'list-first';
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
  isActive = false,
  isFocused,
  selectedIds,
  isSelectionMode,
  onSelect,
  onMessageClick,
  messageHref,
  onMessageDoubleClick,
  onDragStart,
  density = 'comfortable',
  layout = 'legacy',
}: {
  message: MessageListItem;
  index: number;
  isSelected: boolean;
  isActive?: boolean;
  isFocused: boolean;
  selectedIds: Set<string>;
  isSelectionMode: boolean;
  onSelect: (id: string, multi: boolean) => void;
  onMessageClick: (message: MessageListItem) => void;
  messageHref?: string;
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onDragStart?: (messageId: string) => void;
  density?: 'compact' | 'comfortable' | 'spacious';
  layout?: 'legacy' | 'list-first';
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
    compact: 'min-h-12 px-3 py-1.5 gap-2',
    comfortable: 'min-h-16 px-3 py-2.5 gap-2.5',
    spacious: 'min-h-20 px-4 py-3.5 gap-3',
  };

  const subjectSizeClasses = {
    compact: 'text-xs',
    comfortable: 'text-[13px]',
    spacious: 'text-sm',
  };

  return (
    <article
      key={message.id}
      data-testid="message-item"
      draggable={!!onDragStart}
      role="article"
      aria-current={isActive || undefined}
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
        'group relative flex cursor-pointer items-center border-b border-border/70 transition-colors duration-150 hover:mail-hover-surface active:bg-[hsl(var(--surface-hover))] touch-manipulation focus-visible:z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
        layout === 'list-first'
          ? 'min-h-message-row gap-2 px-3 py-1.5 max-md:min-h-16 max-md:py-2'
          : densityClasses[density],
        message.flags.unread && 'mail-unread-surface',
        isActive && !isSelected && 'bg-[hsl(var(--surface-selected)/0.55)]',
        isSelected && 'mail-selected-surface',
        isFocused && 'z-[1] ring-2 ring-primary/45 ring-inset',
        onDragStart && 'cursor-grab active:cursor-grabbing'
      )}
      onClick={(e) => {
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          onSelect(message.id, true);
        } else {
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
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-2 left-0 w-0.5 rounded-r transition-transform duration-150',
          isActive
            ? 'scale-y-100 bg-primary'
            : message.flags.unread
              ? 'scale-y-100 bg-[hsl(var(--unread))]'
              : 'scale-y-0 bg-transparent'
        )}
      />

      <div
        className={cn(
          'flex h-5 w-5 flex-shrink-0 items-center justify-center transition-opacity duration-150',
          isSelected || isSelectionMode
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
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
          className="h-4 w-4 rounded border-[hsl(var(--border-strong))] accent-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={t('selectMessage', { sender: message.from.name || message.from.email })}
        />
      </div>

      {layout === 'list-first' ? (
        <>
          <div className="hidden h-5 w-5 flex-shrink-0 items-center justify-center md:flex" aria-hidden="true">
            {message.flags.starred && (
              <Star className="h-4 w-4 fill-[hsl(var(--starred))] text-[hsl(var(--starred))]" strokeWidth={1.8} />
            )}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)_auto] items-center gap-3 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-0.5">
            <span className={cn('min-w-0 truncate text-sm', message.flags.unread ? 'font-semibold' : 'font-normal')}>
              {message.from.name || message.from.email}
            </span>
            <div className="flex min-w-0 items-baseline gap-1.5 max-md:col-span-2 max-md:row-start-2">
              {messageHref ? (
                <Link href={messageHref} onClick={(event) => event.stopPropagation()} className={cn('min-w-0 truncate text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', message.flags.unread && 'font-medium')}>
                  {message.subject || tCommon('noSubject')}
                </Link>
              ) : (
                <span className={cn('min-w-0 truncate text-[13px]', message.flags.unread && 'font-medium')}>{message.subject || tCommon('noSubject')}</span>
              )}
              {message.snippet && (
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                  <span aria-hidden="true">- </span>{message.snippet}
                </span>
              )}
              <span className="ml-auto flex flex-shrink-0 items-center gap-1.5" aria-hidden="true">
                {message.flags.hasAttachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />}
                {message.flags.important && <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--status-warning))]" strokeWidth={1.8} />}
                {messageLabels.slice(0, 2).map((label) => (
                  <span key={label.id} className="h-1.5 w-1.5 rounded-full border border-border" style={{ backgroundColor: label.color || 'hsl(var(--primary))' }} title={label.name} />
                ))}
              </span>
            </div>
            <time
              dateTime={new Date(message.date).toISOString()}
              title={formatExactDateTime(message.date, localeSettings)}
              className="flex-shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground max-md:col-start-2 max-md:row-start-1"
            >
              {formatDate(message.date, localeSettings)}
            </time>
          </div>
        </>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-sm', message.flags.unread ? 'font-semibold text-foreground' : 'font-normal text-foreground')}>
              {message.from.name || message.from.email}
            </span>
            <div className="flex flex-shrink-0 items-center gap-1.5" aria-hidden="true">
              {message.flags.hasAttachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />}
              {message.flags.important && <AlertCircle className="h-3.5 w-3.5 text-[hsl(var(--status-warning))]" strokeWidth={1.8} />}
              {message.flags.starred && <Star className="h-3.5 w-3.5 fill-[hsl(var(--starred))] text-[hsl(var(--starred))]" strokeWidth={1.8} />}
            </div>
            <time
              dateTime={new Date(message.date).toISOString()}
              title={formatExactDateTime(message.date, localeSettings)}
              className="flex-shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
            >
              {formatDate(message.date, localeSettings)}
            </time>
          </div>
          <div className={cn('mt-0.5 flex min-w-0 items-baseline gap-1.5', subjectSizeClasses[density])}>
            <span className={cn('min-w-0 truncate', message.flags.unread ? 'font-medium text-foreground' : 'font-normal text-foreground')}>
              {message.subject || tCommon('noSubject')}
            </span>
            {density !== 'compact' && message.snippet && (
              <span className="min-w-0 flex-1 truncate text-muted-foreground"><span aria-hidden="true">- </span>{message.snippet}</span>
            )}
            {messageLabels.length > 0 && (
              <span className="ml-auto flex flex-shrink-0 items-center gap-1" aria-label={messageLabels.map((label) => label.name).join(', ')}>
                {messageLabels.slice(0, 3).map((label) => (
                  <span key={label.id} className="h-1.5 w-1.5 rounded-full border border-border" style={{ backgroundColor: label.color || 'hsl(var(--primary))' }} title={label.name} />
                ))}
                {messageLabels.length > 3 && <span className="font-mono text-[10px] tabular-nums text-muted-foreground">+{messageLabels.length - 3}</span>}
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
});

export function MessageList({
  messages,
  activeMessageId,
  selectedIds,
  onSelect,
  onSelectAll,
  onClearSelection,
  onSelectAllInFolder,
  isSelectingAllInFolder = false,
  allMessagesSelected = false,
  onMessageClick,
  getMessageHref,
  onMessageDoubleClick,
  onLoadMore,
  hasMore,
  isLoading = false,
  isFetchingMore = false,
  isSearching = false,
  error = null,
  onRetry,
  initialTopMostItemIndex = 0,
  onTopMostItemChange,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  onDragStart,
  conversationView = false,
  density = 'comfortable',
  groupBy = 'none',
  layout = 'legacy',
}: MessageListProps) {
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const t = useTranslations('messageList');
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const messagesRef = useRef(messages);
  const onMessageClickRef = useRef(onMessageClick);
  const focusedIndexRef = useRef<number | null>(null);

  const tList = useTranslations('messageList');
  const threads = useMemo(
    () => conversationView ? groupMessagesByThread(messages) : null,
    [conversationView, messages]
  );

  useEffect(() => {
    if (!conversationView || !conversationScrollRef.current) return;
    conversationScrollRef.current.scrollTop = initialScrollOffset;
  }, [conversationView, initialScrollOffset, threads?.length]);

  useEffect(() => {
    messagesRef.current = messages;
    onMessageClickRef.current = onMessageClick;
  }, [messages, onMessageClick]);

  useEffect(() => {
    focusedIndexRef.current = focusedIndex;
  }, [focusedIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0 && onClearSelection) {
        e.preventDefault();
        onClearSelection();
        return;
      }

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
  }, [onClearSelection, selectedIds.size]);

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
            className="mail-panel-muted sticky top-0 z-10 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm"
          >
            {item.groupHeader}
          </div>
        );
      }

      const message = item.message;
      if (!message) return null;

      const isSelected = selectedIds.has(message.id);
      const isActive = activeMessageId === message.id;
      const isFocused = focusedIndex === item.index;

      return (
        <MessageItem
          key={message.id}
          message={message}
          index={item.index}
          isSelected={isSelected}
          isActive={isActive}
          isFocused={isFocused}
          selectedIds={selectedIds}
          isSelectionMode={selectedIds.size > 0}
          onSelect={onSelect}
          onMessageClick={onMessageClick}
          messageHref={getMessageHref?.(message)}
          onMessageDoubleClick={onMessageDoubleClick}
          onDragStart={onDragStart}
          density={density}
          layout={layout}
        />
      );
    },
    [
      groupedMessages,
      selectedIds,
      activeMessageId,
      focusedIndex,
      onSelect,
      onMessageClick,
      getMessageHref,
      onMessageDoubleClick,
      onDragStart,
      density,
      layout,
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
      id="message-list"
      data-density={density}
      data-layout={layout}
      className={cn(
        'mail-panel-surface flex h-full w-full flex-col max-md:border-r-0',
        layout === 'legacy' && 'border-r border-border'
      )}
      role="region"
      aria-label={t('regionLabel')}
    >
      <div
        className="mail-panel-muted sticky top-0 z-10 border-b border-border px-3 py-2"
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
            className="text-sm text-muted-foreground max-md:text-xs"
            aria-live="polite"
            aria-atomic="true"
          >
            {selectedIds.size > 0
              ? t('selectedCount', { count: selectedIds.size })
              : t('totalCount', { count: messages.length })}
          </span>
          {isFetchingMore && (
            <span className="ml-auto text-xs text-muted-foreground max-md:text-[10px]">
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
          <div className="flex h-full flex-col">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2.5 border-b border-border/70 px-3',
                  density === 'compact' && 'min-h-12 py-1.5',
                  density === 'comfortable' && 'min-h-16 py-2.5',
                  density === 'spacious' && 'min-h-20 py-3.5'
                )}
              >
                <Skeleton className="h-4 w-4 rounded" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex justify-between gap-3">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div
            className="flex h-full items-center justify-center px-6 text-muted-foreground"
            role="alert"
          >
            <div className="max-w-sm text-center">
              <AlertCircle className="mx-auto mb-4 h-10 w-10 text-destructive" />
              <p className="font-medium text-foreground">{t('loadError')}</p>
              <p className="mt-1 text-sm">{t('loadErrorDesc')}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-4 min-h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:mail-hover-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {t('retry')}
                </button>
              )}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{isSearching ? t('noResults') : t('empty')}</p>
            </div>
          </div>
        ) : conversationView && threads ? (
          <div
            ref={conversationScrollRef}
            className="h-full overflow-auto"
            data-message-list-scroll="conversation"
            onScroll={(event) => onScrollOffsetChange?.(event.currentTarget.scrollTop)}
          >
            {threads.map((thread) => (
              <ThreadItem
                key={thread.threadId}
                thread={thread}
                selectedIds={selectedIds}
                activeMessageId={activeMessageId}
                onSelect={onSelect}
                onMessageClick={onMessageClick}
                getMessageHref={getMessageHref}
                onMessageDoubleClick={onMessageDoubleClick}
                onDragStart={onDragStart}
                isExpanded={expandedThreads.has(thread.threadId)}
                onToggleExpand={toggleThreadExpand}
                density={density}
                layout={layout}
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
            initialTopMostItemIndex={Math.min(
              initialTopMostItemIndex,
              Math.max(groupedMessages.length - 1, 0)
            )}
            rangeChanged={(range) => onTopMostItemChange?.(range.startIndex)}
            itemContent={(index) => {
              const item = groupedMessages[index];
              if (!item) return null;
              if (item.groupHeader) {
                return (
                  <div
                    key={`group-${item.groupHeader}-${index}`}
                    className="sticky top-0 z-10 border-b border-border bg-[hsl(var(--surface-panel-muted)/0.92)] px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm"
                  >
                    {item.groupHeader}
                  </div>
                );
              }
              const message = item.message;
              if (!message) return null;
              const isSelected = selectedIds.has(message.id);
              const isActive = activeMessageId === message.id;
              const isFocused = focusedIndex === item.index;
              return (
                <MessageItem
                  key={message.id}
                  message={message}
                  index={item.index}
                  isSelected={isSelected}
                  isActive={isActive}
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
