'use client';

import { useState, useEffect, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { MessageListItem } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Star, StarOff, Mail, MailOpen, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: MessageListItem[];
  selectedIds: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onSelectAll: () => void;
  onMessageClick: (message: MessageListItem) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export function MessageList({
  messages,
  selectedIds,
  onSelect,
  onSelectAll,
  onMessageClick,
  onLoadMore,
  hasMore,
}: MessageListProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'j' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? 0 : Math.min(prev + 1, messages.length - 1);
          if (next < messages.length) {
            onMessageClick(messages[next]);
          }
          return next;
        });
      } else if (e.key === 'k' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev === null ? messages.length - 1 : Math.max(prev - 1, 0);
          if (next >= 0) {
            onMessageClick(messages[next]);
          }
          return next;
        });
      } else if (e.key === 'Enter' || e.key === 'o') {
        if (focusedIndex !== null && messages[focusedIndex]) {
          e.preventDefault();
          onMessageClick(messages[focusedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [messages, focusedIndex, onMessageClick]);

  const renderMessage = useCallback(
    (index: number) => {
      const message = messages[index];
      if (!message) return null;

      const isSelected = selectedIds.has(message.id);
      const isFocused = focusedIndex === index;

      return (
        <div
          key={message.id}
          data-testid="message-item"
          className={cn(
            'flex cursor-pointer items-start gap-3 border-b p-3 transition-colors hover:bg-muted/50',
            isSelected && 'bg-muted',
            isFocused && 'ring-2 ring-primary'
          )}
          onClick={(e) => {
            if (e.shiftKey || e.metaKey || e.ctrlKey) {
              onSelect(message.id, true);
            } else {
              onSelect(message.id, false);
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
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {message.flags.starred ? (
                <Star className="h-4 w-4 flex-shrink-0 fill-yellow-500 text-yellow-500" />
              ) : (
                <StarOff className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn('truncate', message.flags.unread ? 'font-bold' : 'font-normal')}>
                    {message.from.name || message.from.email}
                  </span>
                  {message.flags.hasAttachments && (
                    <Paperclip className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className={cn('truncate', message.flags.unread ? 'font-semibold' : 'text-muted-foreground')}>
                    {message.subject || '(без темы)'}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(message.date)}</span>
                </div>
                {message.snippet && (
                  <div className="mt-1 truncate text-xs text-muted-foreground">{message.snippet}</div>
                )}
              </div>
              <div className="flex-shrink-0">
                {message.flags.unread ? (
                  <Mail className="h-4 w-4 text-primary" />
                ) : (
                  <MailOpen className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>
          </div>
        </div>
      );
    },
    [messages, selectedIds, focusedIndex, onSelect, onMessageClick]
  );

  return (
    <div className="flex h-full w-full flex-col border-r bg-background">
      <div className="border-b bg-muted/50 p-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={messages.length > 0 && messages.every((m) => selectedIds.has(m.id))}
            onChange={onSelectAll}
            className="ml-1"
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.size > 0 ? `Выбрано: ${selectedIds.size}` : `Всего: ${messages.length}`}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Нет писем</p>
            </div>
          </div>
        ) : (
          <Virtuoso
            data={messages}
            totalCount={messages.length}
            itemContent={renderMessage}
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
