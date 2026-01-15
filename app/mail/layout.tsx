'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Sidebar } from '@/components/sidebar';
import { MessageList } from '@/components/message-list';
import { MessageViewer } from '@/components/message-viewer';
import { QuickFilters } from '@/components/quick-filters';
import type { Folder, Account, MessageListItem, MessageDetail, Draft, QuickFilterType, FilterGroup } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Trash2, Star, Mail, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import { useDebounce } from '@/lib/hooks';
import { FilterQueryParser } from '@/lib/filter-parser';

interface MinimizedDraft {
  id: string;
  to: string;
  subject: string;
  html: string;
}

interface UserSettings {
  signature: string;
  theme: 'light' | 'dark';
}

const Compose = dynamic(
  () => import('@/components/compose').then((mod) => mod.Compose),
  { ssr: false, loading: () => null }
);

export default function MailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>('inbox');
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{ subject: string; from: { email: string; name?: string }; body: string } | null>(null);
  const [forwardFrom, setForwardFrom] = useState<{ subject: string; body: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<QuickFilterType | undefined>();
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>();
  const [allowRemoteImages, setAllowRemoteImages] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [minimizedDrafts, setMinimizedDrafts] = useState<MinimizedDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [loadedDraft, setLoadedDraft] = useState<Draft | null>(null);
  const [messageListWidth, setMessageListWidth] = useState(() => {
    if (typeof window === 'undefined') return 400;
    const saved = window.localStorage.getItem('messageListWidth');
    if (!saved) return 400;
    const width = parseInt(saved, 10);
    if (Number.isNaN(width)) return 400;
    if (width < 300 || width > 800) return 400;
    return width;
  });
  const [isResizing, setIsResizing] = useState(false);
  const debouncedSearch = useDebounce(searchQuery, 400);
  const queryClient = useQueryClient();

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 60 * 1000,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 256;
      if (newWidth >= 300 && newWidth <= 800) {
        setMessageListWidth(newWidth);
        localStorage.setItem('messageListWidth', newWidth.toString());
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const { data: account } = useQuery<Account>({
    queryKey: ['account'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch account');
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
  });

  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await fetch('/api/mail/folders');
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch folders');
      return res.json();
    },
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
    refetchInterval: realtimeConnected ? false : 15000,
    refetchOnWindowFocus: !realtimeConnected,
  });

  const {
    data: messagesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isMessagesLoading,
  } = useInfiniteQuery<{
    messages: MessageListItem[];
    nextCursor?: string;
  }>({
    queryKey: ['messages', selectedFolderId, debouncedSearch, quickFilter],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('folderId', selectedFolderId || 'inbox');
      if (pageParam && typeof pageParam === 'string') {
        params.set('cursor', pageParam);
      }
      if (debouncedSearch) {
        params.set('q', debouncedSearch);
      }
      if (quickFilter || filterGroup) {
        const messageFilter = {
          quickFilter,
          filterGroup,
        };
        params.set('messageFilter', JSON.stringify(messageFilter));
      }
      const res = await fetch(`/api/mail/messages?${params}`);
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: !!selectedFolderId,
    initialPageParam: undefined,
    refetchInterval: realtimeConnected ? false : 10000,
    refetchOnWindowFocus: !realtimeConnected,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
  });

  const messages = useMemo(() => {
    let allMessages = messagesData?.pages.flatMap((p) => p.messages) || [];
    
    if (quickFilter === 'attachmentsImages') {
      allMessages = allMessages.filter((msg) => {
        return msg.flags.hasAttachments;
      });
    } else if (quickFilter === 'attachmentsDocuments') {
      allMessages = allMessages.filter((msg) => {
        return msg.flags.hasAttachments;
      });
    } else if (quickFilter === 'attachmentsArchives') {
      allMessages = allMessages.filter((msg) => {
        return msg.flags.hasAttachments;
      });
    }
    
    return allMessages;
  }, [messagesData, quickFilter]);

  const { data: selectedMessage, isLoading: isMessageLoading } = useQuery<MessageDetail>({
    queryKey: ['message', selectedMessageId],
    queryFn: async () => {
      if (!selectedMessageId) return null;
      const res = await fetch(`/api/mail/messages/${selectedMessageId}`);
      if (res.status === 401) {
        router.push('/login?redirect=/mail');
        throw new Error('Unauthorized');
      }
      if (!res.ok) throw new Error('Failed to fetch message');
      return res.json();
    },
    enabled: !!selectedMessageId,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'Unauthorized') {
        return false;
      }
      return failureCount < 2;
    },
  });

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const baseReconnectDelay = 1000;

    const connect = () => {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/api/mail/realtime');

      eventSource.addEventListener('connected', () => {
        reconnectAttempts = 0;
        setRealtimeConnected(true);
      });

      eventSource.addEventListener('message.new', async (event: MessageEvent) => {
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        
        try {
          const data = JSON.parse(event.data);
          if (data.messageId) {
            await fetch('/api/mail/filters/rules/process-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId: data.messageId, folderId: data.folderId }),
            });
          }
        } catch (error) {
          console.error('Error processing new message with rules:', error);
        }
      });

      eventSource.addEventListener('mailbox.counts', () => {
        queryClient.invalidateQueries({ queryKey: ['folders'] });
      });

      eventSource.addEventListener('message.updated', () => {
        queryClient.invalidateQueries({ queryKey: ['messages'] });
      });

      eventSource.addEventListener('ping', () => {
      });

      eventSource.onerror = () => {
        setRealtimeConnected(false);
        if (eventSource?.readyState === EventSource.CLOSED) {
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
            reconnectAttempts++;
            reconnectTimeout = setTimeout(() => {
              connect();
            }, delay);
          }
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (eventSource) {
        eventSource.close();
      }
      setRealtimeConnected(false);
    };
  }, [queryClient]);

  const updateMessageInList = useCallback(
    (messageId: string, updater: (message: MessageListItem) => MessageListItem) => {
      queryClient.setQueriesData({ queryKey: ['messages'] }, (oldData) => {
        if (!oldData || typeof oldData !== 'object') return oldData;
        const data = oldData as { pages: { messages: MessageListItem[]; nextCursor?: string }[]; pageParams: unknown[] };
        const pages = data.pages.map((page) => ({
          ...page,
          messages: page.messages.map((message) => (message.id === messageId ? updater(message) : message)),
        }));
        return { ...data, pages };
      });
    },
    [queryClient]
  );

  const updateMessageDetail = useCallback(
    (messageId: string, updater: (message: MessageDetail) => MessageDetail) => {
      queryClient.setQueryData(['message', messageId], (oldData) => {
        if (!oldData) return oldData;
        return updater(oldData as MessageDetail);
      });
    },
    [queryClient]
  );

  const handleBulkAction = async (action: string) => {
    if (selectedIds.size === 0) {
      toast.error('Выберите письма');
      return;
    }

    try {
      const res = await fetch('/api/mail/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          action,
        }),
      });

      if (!res.ok) {
        toast.error('Ошибка выполнения действия');
        return;
      }

      toast.success('Действие выполнено');
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    } catch (error) {
      toast.error('Ошибка соединения');
    }
  };

  const handleReply = () => {
    if (!selectedMessage) return;
    setReplyTo({
      subject: selectedMessage.subject,
      from: selectedMessage.from,
      body: selectedMessage.body.html || selectedMessage.body.text || '',
    });
    setForwardFrom(null);
    setLoadedDraft(null);
    setActiveDraftId(null);
    setComposeOpen(true);
  };

  const handleReplyAll = () => {
    handleReply();
  };

  const handleForward = () => {
    if (!selectedMessage) return;
    setForwardFrom({
      subject: selectedMessage.subject,
      body: selectedMessage.body.html || selectedMessage.body.text || '',
    });
    setReplyTo(null);
    setLoadedDraft(null);
    setActiveDraftId(null);
    setComposeOpen(true);
  };

  const handleDelete = async () => {
    if (selectedMessage) {
      await handleBulkAction('delete');
      setSelectedMessageId(null);
    }
  };

  const handleMinimizeDraft = useCallback((draft: MinimizedDraft) => {
    setMinimizedDrafts((prev) => {
      const existing = prev.find((d) => d.id === draft.id);
      if (existing) {
        return prev.map((d) => (d.id === draft.id ? draft : d));
      }
      return [...prev, draft];
    });
    setComposeOpen(false);
    setActiveDraftId(null);
  }, []);

  const handleRestoreDraft = useCallback((draftId: string) => {
    const draft = minimizedDrafts.find((d) => d.id === draftId);
    if (draft) {
      setLoadedDraft(null);
      setActiveDraftId(draftId);
      setReplyTo(null);
      setForwardFrom(null);
      setComposeOpen(true);
    }
  }, [minimizedDrafts]);

  const handleCloseDraft = useCallback((draftId: string) => {
    setMinimizedDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }, []);

  const handleComposeClose = useCallback(() => {
    setComposeOpen(false);
    setReplyTo(null);
    setForwardFrom(null);
    setActiveDraftId(null);
    setLoadedDraft(null);
  }, []);

  const handleMessageDoubleClick = useCallback(async (message: MessageListItem) => {
    const selectedFolder = folders.find((f) => f.id === selectedFolderId);
    const isDraft = selectedFolder?.role === 'drafts';
    
    if (isDraft) {
      try {
        const res = await fetch(`/api/mail/messages/${message.id}`);
        if (!res.ok) {
          toast.error('Не удалось загрузить черновик');
          return;
        }
        
        const messageDetail: MessageDetail = await res.json();
        
        const draft: Draft = {
          id: messageDetail.id,
          to: messageDetail.to.map((t) => t.email),
          cc: messageDetail.cc?.map((c) => c.email),
          bcc: messageDetail.bcc?.map((b) => b.email),
          subject: messageDetail.subject,
          html: messageDetail.body.html || messageDetail.body.text?.replace(/\n/g, '<br>') || '',
        };
        
        setLoadedDraft(draft);
        setActiveDraftId(draft.id ?? null);
        setReplyTo(null);
        setForwardFrom(null);
        setComposeOpen(true);
      } catch (error) {
        console.error('Failed to load draft:', error);
        toast.error('Ошибка загрузки черновика');
      }
    } else {
      setSelectedMessageId(message.id);
      setSelectedIds(new Set([message.id]));
    }
  }, [selectedFolderId, folders]);

  const activeDraft = activeDraftId ? minimizedDrafts.find((d) => d.id === activeDraftId) : null;
  const composeDraft = loadedDraft || (activeDraft ? { id: activeDraft.id, to: activeDraft.to ? [activeDraft.to] : [], subject: activeDraft.subject, html: activeDraft.html } : undefined);

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          folders={folders}
          account={account || null}
          selectedFolderId={selectedFolderId}
          onFolderSelect={(id) => {
            setSelectedFolderId(id);
            setSelectedMessageId(null);
            setSelectedIds(new Set());
          }}
          onCompose={() => {
            setReplyTo(null);
            setForwardFrom(null);
            setLoadedDraft(null);
            setActiveDraftId(null);
            setComposeOpen(true);
          }}
          searchQuery={searchQuery}
          onSearchChange={(query) => {
            setSearchQuery(query);
            const parsed = FilterQueryParser.parse(query);
            setQuickFilter(parsed.quickFilter);
            setFilterGroup(parsed.filterGroup);
          }}
          onFilterChange={(quickFilter, filterGroup) => {
            setQuickFilter(quickFilter);
            setFilterGroup(filterGroup);
            queryClient.invalidateQueries({ queryKey: ['messages'] });
          }}
        />
        <div className="relative flex flex-col flex-shrink-0" style={{ width: `${messageListWidth}px` }} suppressHydrationWarning>
          <div className="border-b bg-muted/50 p-2 flex-shrink-0">
            <QuickFilters
              activeFilter={quickFilter}
              onFilterChange={(filter) => {
                setQuickFilter(filter);
                if (filter === 'drafts') {
                  const draftsFolder = folders.find((f) => f.role === 'drafts');
                  if (draftsFolder) {
                    setSelectedFolderId(draftsFolder.id);
                  }
                } else if (filter === 'sent') {
                  const sentFolder = folders.find((f) => f.role === 'sent');
                  if (sentFolder) {
                    setSelectedFolderId(sentFolder.id);
                  }
                }
                queryClient.invalidateQueries({ queryKey: ['messages'] });
              }}
            />
          </div>
          <div className="flex-1 min-h-0">
            <MessageList
            messages={messages}
            selectedIds={selectedIds}
            onSelect={(id, multi) => {
              if (multi) {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) {
                    next.delete(id);
                  } else {
                    next.add(id);
                  }
                  return next;
                });
              } else {
                setSelectedIds(new Set([id]));
              }
            }}
            onSelectAll={() => {
              if (selectedIds.size === messages.length) {
                setSelectedIds(new Set());
              } else {
                setSelectedIds(new Set(messages.map((m) => m.id)));
              }
            }}
            onMessageClick={(message) => {
              setSelectedMessageId(message.id);
              setSelectedIds(new Set([message.id]));
            }}
            onMessageDoubleClick={handleMessageDoubleClick}
            onLoadMore={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            hasMore={hasNextPage}
            isLoading={isMessagesLoading}
            isFetchingMore={isFetchingNextPage}
            isSearching={debouncedSearch.length > 0}
          />
          </div>
        </div>
        <div
          className="group relative w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 transition-colors"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border group-hover:bg-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <MessageViewer
          message={selectedMessage || null}
          onReply={handleReply}
          onReplyAll={handleReplyAll}
          onForward={handleForward}
          onDelete={handleDelete}
          onStar={(starred) => {
            if (!selectedMessageId) return;
            updateMessageInList(selectedMessageId, (message) => ({
              ...message,
              flags: { ...message.flags, starred },
            }));
            updateMessageDetail(selectedMessageId, (message) => ({
              ...message,
              flags: { ...message.flags, starred },
            }));
          }}
          onMarkRead={(read) => {
            if (!selectedMessageId) return;
            updateMessageInList(selectedMessageId, (message) => ({
              ...message,
              flags: { ...message.flags, unread: !read },
            }));
            updateMessageDetail(selectedMessageId, (message) => ({
              ...message,
              flags: { ...message.flags, unread: !read },
            }));
            queryClient.invalidateQueries({ queryKey: ['folders'] });
          }}
          allowRemoteImages={allowRemoteImages}
          isLoading={isMessageLoading}
          hasSelection={!!selectedMessageId}
          />
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="border-t bg-muted/50 p-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">Выбрано: {selectedIds.size}</span>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('markRead')}>
              <Mail className="mr-2 h-4 w-4" />
              Прочитано
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('markUnread')}>
              Непрочитано
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('star')}>
              <Star className="mr-2 h-4 w-4" />
              В избранное
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('delete')}>
              <Trash2 className="mr-2 h-4 w-4" />
              Удалить
            </Button>
          </div>
        </div>
      )}
      <Compose
        open={composeOpen}
        onClose={handleComposeClose}
        onMinimize={handleMinimizeDraft}
        replyTo={replyTo || undefined}
        forwardFrom={forwardFrom || undefined}
        initialDraft={composeDraft}
        signature={settings?.signature}
      />
      {minimizedDrafts.length > 0 && (
        <div className="fixed bottom-0 right-4 flex gap-2 z-50">
          {minimizedDrafts.map((draft) => (
            <div
              key={draft.id}
              className="flex items-center gap-2 bg-background border rounded-t-lg shadow-lg px-3 py-2 cursor-pointer hover:bg-muted transition-colors"
              onClick={() => handleRestoreDraft(draft.id)}
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm max-w-[150px] truncate">
                {draft.subject || draft.to || 'Новое письмо'}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseDraft(draft.id);
                }}
                className="p-1 hover:bg-destructive/20 rounded"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
