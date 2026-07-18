'use client';

import { useState, memo } from 'react';
import type { MessageListItem } from '@/lib/types';
import type { ThreadGroup } from '@/lib/thread-utils';
import { formatDate } from '@/lib/utils';
import { useLocaleSettings } from '@/lib/hooks';
import { Star, Paperclip, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageItem } from './message-list';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface ThreadItemProps {
  thread: ThreadGroup;
  selectedIds: Set<string>;
  activeMessageId?: string | null;
  onSelect: (id: string, multi: boolean) => void;
  onMessageClick: (message: MessageListItem) => void;
  getMessageHref?: (message: MessageListItem) => string;
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onDragStart?: (messageId: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: (threadId: string) => void;
  density?: 'compact' | 'comfortable' | 'spacious';
  layout?: 'legacy' | 'list-first';
}

export const ThreadItem = memo(function ThreadItem({
  thread,
  selectedIds,
  activeMessageId,
  onSelect,
  onMessageClick,
  getMessageHref,
  onMessageDoubleClick,
  onDragStart,
  isExpanded = false,
  onToggleExpand,
  density = 'comfortable',
  layout = 'legacy',
}: ThreadItemProps) {
  const localeSettings = useLocaleSettings();
  const t = useTranslations('messageList');
  const tCommon = useTranslations('common');
  const [localExpanded, setLocalExpanded] = useState(isExpanded);
  const expanded = onToggleExpand ? isExpanded : localExpanded;
  const toggleExpanded = onToggleExpand
    ? () => onToggleExpand(thread.threadId)
    : () => setLocalExpanded((prev) => !prev);

  const latestMessage = thread.messages[0]!;
  const allSelected = thread.messages.every((m) => selectedIds.has(m.id));
  const someSelected = thread.messages.some((m) => selectedIds.has(m.id));
  const hasActiveMessage = thread.messages.some((message) => message.id === activeMessageId);

  const handleThreadClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      thread.messages.forEach((msg) => onSelect(msg.id, true));
    } else {
      onMessageClick(latestMessage);
    }
  };

  const handleThreadDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMessageDoubleClick) {
      onMessageDoubleClick(latestMessage);
    }
  };

  return (
    <div className="border-b border-border/70">
      <article
        role="article"
        aria-label={t('threadAriaLabel', {
          subject: latestMessage.subject || tCommon('noSubject'),
          count: thread.messages.length,
        })}
        className={cn(
          'group relative flex cursor-pointer items-center gap-2.5 px-3 transition-colors duration-150 hover:mail-hover-surface focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary',
          layout === 'list-first' && 'min-h-message-row py-1.5 max-md:min-h-16 max-md:py-2',
          layout === 'legacy' && density === 'compact' && 'min-h-12 py-1.5',
          layout === 'legacy' && density === 'comfortable' && 'min-h-16 py-2.5',
          layout === 'legacy' && density === 'spacious' && 'min-h-20 py-3.5',
          thread.unreadCount > 0 && 'mail-unread-surface',
          hasActiveMessage && !someSelected && 'bg-[hsl(var(--surface-selected)/0.55)]',
          someSelected && 'mail-selected-surface'
        )}
        aria-current={hasActiveMessage || undefined}
        onClick={handleThreadClick}
        onDoubleClick={handleThreadDoubleClick}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-y-2 left-0 w-0.5 rounded-r',
            thread.unreadCount > 0 ? 'bg-[hsl(var(--unread))]' : 'bg-transparent'
          )}
        />
        <div className="flex flex-shrink-0 items-center gap-1">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) {
                el.indeterminate = someSelected && !allSelected;
              }
            }}
            onChange={(e) => {
              e.stopPropagation();
              thread.messages.forEach((msg) => {
                if (allSelected) {
                  if (selectedIds.has(msg.id)) {
                    const newSet = new Set(selectedIds);
                    newSet.delete(msg.id);
                    onSelect(msg.id, true);
                  }
                } else {
                  if (!selectedIds.has(msg.id)) {
                    onSelect(msg.id, true);
                  }
                }
              });
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-[hsl(var(--border-strong))] accent-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label={t('selectThread', {
              subject: latestMessage.subject || tCommon('noSubject'),
            })}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded();
            }}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={expanded ? t('collapseThread') : t('expandThread')}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
            ) : (
              <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
            )}
          </button>
        </div>
        {layout === 'list-first' ? (
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)_auto] items-center gap-3 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-2 max-md:gap-y-0.5">
            <span className={cn('min-w-0 truncate text-sm', thread.unreadCount > 0 ? 'font-semibold' : 'font-normal')}>
              {latestMessage.from.name || latestMessage.from.email}
            </span>
            <div className="flex min-w-0 items-baseline gap-1.5 max-md:col-span-2 max-md:row-start-2">
              {getMessageHref ? (
                <Link href={getMessageHref(latestMessage)} onClick={(event) => event.stopPropagation()} className={cn('min-w-0 truncate text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary', thread.unreadCount > 0 && 'font-medium')}>
                  {latestMessage.subject || tCommon('noSubject')}
                </Link>
              ) : (
                <span className={cn('min-w-0 truncate text-[13px]', thread.unreadCount > 0 && 'font-medium')}>{latestMessage.subject || tCommon('noSubject')}</span>
              )}
              {!expanded && latestMessage.snippet && (
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                  <span aria-hidden="true">- </span>{latestMessage.snippet}
                </span>
              )}
              <span className="ml-auto flex flex-shrink-0 items-center gap-1.5" aria-hidden="true">
                {thread.messages.some((message) => message.flags.hasAttachments) && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />}
                {thread.hasStarred && <Star className="h-3.5 w-3.5 fill-[hsl(var(--starred))] text-[hsl(var(--starred))]" strokeWidth={1.8} />}
                <span className="rounded-small bg-secondary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">{thread.messages.length}</span>
                {thread.unreadCount > 0 && <span className="rounded-small bg-primary/12 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-primary">{thread.unreadCount}</span>}
              </span>
            </div>
            <time dateTime={new Date(thread.latestDate).toISOString()} className="flex-shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground max-md:col-start-2 max-md:row-start-1">
              {formatDate(thread.latestDate, localeSettings)}
            </time>
          </div>
        ) : (
        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-sm',
                thread.unreadCount > 0
                  ? 'font-semibold text-foreground'
                  : 'font-normal text-foreground'
              )}
            >
              {latestMessage.from.name || latestMessage.from.email}
            </span>
            {thread.messages.some((message) => message.flags.hasAttachments) && (
              <Paperclip
                className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
                strokeWidth={1.8}
              />
            )}
            {thread.hasStarred && (
              <Star
                className="h-3.5 w-3.5 flex-shrink-0 fill-[hsl(var(--starred))] text-[hsl(var(--starred))]"
                strokeWidth={1.8}
              />
            )}
            <time
              dateTime={new Date(thread.latestDate).toISOString()}
              className="flex-shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
            >
              {formatDate(thread.latestDate, localeSettings)}
            </time>
          </div>
          <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-[13px]">
            <span
              className={cn('truncate', thread.unreadCount > 0 ? 'font-medium' : 'font-normal')}
            >
              {latestMessage.subject || tCommon('noSubject')}
            </span>
            {!expanded && density !== 'compact' && latestMessage.snippet && (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                <span aria-hidden="true">- </span>
                {latestMessage.snippet}
              </span>
            )}
            <span className="ml-auto flex flex-shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              <span className="rounded bg-secondary px-1.5 py-0.5">{thread.messages.length}</span>
              {thread.unreadCount > 0 && (
                <span className="rounded bg-primary/12 px-1.5 py-0.5 font-semibold text-primary">
                  {thread.unreadCount}
                </span>
              )}
            </span>
          </div>
        </div>
        )}
      </article>
      {expanded && (
        <div className="border-l-2 border-primary/20 pl-5">
          {thread.messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              index={index}
              isSelected={selectedIds.has(message.id)}
              isActive={activeMessageId === message.id}
              isFocused={false}
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
          ))}
        </div>
      )}
    </div>
  );
});
