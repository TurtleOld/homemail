'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  onMessageDoubleClick?: (message: MessageListItem) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  isFetchingMore?: boolean;
  isSearching?: boolean;
}

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
}: MessageListProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const messagesRef = useRef(messages);
  const onMessageClickRef = useRef(onMessageClick);
  const focusedIndexRef = useRef<number | null>(null);

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
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onMessageDoubleClick) {
              onMessageDoubleClick(message);
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
      <div className="border-b bg-muted/50 p-2 sticky top-0 z-10">
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
          {isFetchingMore && (
            <span className="ml-auto text-xs text-muted-foreground">Загрузка...</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p>Загрузка писем...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{isSearching ? 'Ничего не найдено' : 'Нет писем'}</p>
            </div>
          </div>
        ) : (
          (process.env.NODE_ENV === 'test' ? (
            <div>
              {messages.map((_, index) => renderMessage(index))}
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
          ))
        )}
      </div>
    </div>
  );
}
