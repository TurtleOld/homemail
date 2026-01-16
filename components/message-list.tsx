'use client';

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { MessageListItem } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Star, StarOff, Mail, MailOpen, Paperclip, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

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
}

const MessageItem = memo(function MessageItem({
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
}) {
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
        'flex cursor-pointer items-start gap-3 border-b p-3 max-md:p-4 max-md:gap-3 transition-all duration-200 hover:bg-muted/50 active:bg-muted/70 touch-manipulation hover:shadow-sm',
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
            <div className="mt-1 max-md:mt-0.5 flex items-center gap-2 text-sm max-md:text-xs">
              <span className={cn('truncate', message.flags.unread ? 'font-semibold' : 'text-muted-foreground')}>
                {message.subject || '(без темы)'}
              </span>
              <span className="text-xs max-md:text-[10px] text-muted-foreground flex-shrink-0">{formatDate(message.date)}</span>
            </div>
            {message.snippet && (
              <div className="mt-1 max-md:mt-0.5 truncate text-xs max-md:text-[10px] text-muted-foreground">{message.snippet}</div>
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
        <MessageItem
          key={message.id}
          message={message}
          index={index}
          isSelected={isSelected}
          isFocused={isFocused}
          selectedIds={selectedIds}
          onSelect={onSelect}
          onMessageClick={onMessageClick}
          onMessageDoubleClick={onMessageDoubleClick}
          onDragStart={onDragStart}
          onToggleImportant={onToggleImportant}
        />
      );
    },
    [messages, selectedIds, focusedIndex, onSelect, onMessageClick, onDragStart, onToggleImportant]
  );

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
