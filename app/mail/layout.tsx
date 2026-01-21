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
import { Trash2, Star, Mail, FileText, X, Menu, ArrowLeft, Folder as FolderIcon, Inbox, Send, AlertTriangle, AlertCircle, Archive, MessageSquare, FileDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useDebounce } from '@/lib/hooks';
import { FilterQueryParser } from '@/lib/filter-parser';
import { useSwipeable } from 'react-swipeable';
import { useHotkeys } from 'react-hotkeys-hook';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';

interface MinimizedDraft {
  id: string;
  to: string;
  subject: string;
  html: string;
}

interface Signature {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
  context?: 'work' | 'personal' | 'autoReply' | 'general';
}

interface UserSettings {
  signature?: string;
  signatures?: Signature[];
  theme: 'light' | 'dark';
  ui?: {
    density: 'compact' | 'comfortable' | 'spacious';
    messagesPerPage: number;
    sortBy: 'date' | 'from' | 'subject' | 'size';
    sortOrder: 'asc' | 'desc';
    groupBy: 'none' | 'date' | 'sender';
  };
  notifications?: {
    enabled?: boolean;
    browser?: boolean;
    onlyImportant?: boolean;
    sound?: boolean;
  };
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [conversationView, setConversationView] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('conversationView');
    return saved === 'true';
  });
  const debouncedSearch = useDebounce(searchQuery, 400);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('conversationView', conversationView.toString());
    }
  }, [conversationView]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default' && settings?.notifications?.browser) {
      Notification.requestPermission();
    }
  }, [settings?.notifications?.browser]);

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
      const uiSettings = settings?.ui;
      if (uiSettings?.messagesPerPage) {
        params.set('limit', uiSettings.messagesPerPage.toString());
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
    
    allMessages = allMessages.map((msg) => ({
      ...msg,
      date: msg.date instanceof Date ? msg.date : new Date(msg.date),
    }));
    
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

    const uiSettings = settings?.ui || {
      sortBy: 'date',
      sortOrder: 'desc',
      groupBy: 'none',
    };

    allMessages.sort((a, b) => {
      let comparison = 0;
      
      switch (uiSettings.sortBy) {
        case 'date':
          const aDate = a.date instanceof Date ? a.date : new Date(a.date);
          const bDate = b.date instanceof Date ? b.date : new Date(b.date);
          comparison = aDate.getTime() - bDate.getTime();
          break;
        case 'from':
          comparison = (a.from.name || a.from.email).localeCompare(b.from.name || b.from.email, 'ru');
          break;
        case 'subject':
          comparison = (a.subject || '').localeCompare(b.subject || '', 'ru');
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
      }
      
      return uiSettings.sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return allMessages;
  }, [messagesData, quickFilter, settings?.ui]);

  const { data: selectedMessage, isLoading: isMessageLoading, error: messageError } = useQuery<MessageDetail>({
    queryKey: ['message', selectedMessageId],
    queryFn: async () => {
      if (!selectedMessageId) return null;
      try {
        const res = await fetch(`/api/mail/messages/${selectedMessageId}`);
        if (res.status === 401) {
          router.push('/login?redirect=/mail');
          throw new Error('Unauthorized');
        }
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: 'Failed to fetch message' }));
          throw new Error(errorData.error || 'Failed to fetch message');
        }
        const data = await res.json();
        if (!data || !data.id) {
          throw new Error('Invalid message data received');
        }
        return data;
      } catch (error) {
        console.error('Error fetching message:', error);
        throw error;
      }
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
    if (messageError) {
      console.error('Message query error:', messageError);
      if (messageError instanceof Error && messageError.message !== 'Unauthorized') {
        toast.error('Ошибка загрузки письма: ' + messageError.message);
      }
    }
  }, [messageError]);

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
        
        const notificationsEnabled = settings?.notifications?.enabled !== false;
        const browserNotifications = settings?.notifications?.browser !== false;
        const onlyImportant = settings?.notifications?.onlyImportant === true;
        
        if (notificationsEnabled && browserNotifications && 'Notification' in window && Notification.permission === 'granted') {
          try {
            const data = JSON.parse(event.data);
            const messageId = data.messageId || data.id;
            
            if (messageId) {
              const res = await fetch(`/api/mail/messages/${messageId}`);
              if (res.ok) {
                const message = await res.json();
                if (message && (!onlyImportant || message.flags?.important)) {
                  const notification = new Notification('Новое письмо', {
                    body: `${message.from.name || message.from.email}: ${message.subject || '(без темы)'}`,
                    icon: '/icons/mail-icon.png',
                    tag: message.id,
                    requireInteraction: false,
                  });
                  
                  notification.onclick = () => {
                    window.focus();
                    notification.close();
                  };
                  
                  if (settings?.notifications?.sound) {
                    const audio = new Audio('/sounds/notification.mp3');
                    audio.play().catch(() => {});
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error showing notification:', error);
          }
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
  }, [queryClient, settings]);

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

  const handleBulkAction = async (action: string, payload?: { folderId?: string }) => {
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
          payload,
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

  const handleMoveMessage = async (messageId: string, folderId: string) => {
    try {
      const res = await fetch('/api/mail/messages/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [messageId],
          action: 'move',
          payload: { folderId },
        }),
      });

      if (!res.ok) {
        toast.error('Ошибка перемещения письма');
        return;
      }

      toast.success('Письмо перемещено');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    } catch (error) {
      toast.error('Ошибка соединения');
    }
  };

  const handleBulkExport = async () => {
    if (selectedIds.size === 0) {
      toast.error('Выберите письма для экспорта');
      return;
    }

    try {
      const res = await fetch('/api/mail/messages/bulk/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageIds: Array.from(selectedIds),
          format: 'zip',
        }),
      });

      if (!res.ok) {
        toast.error('Ошибка экспорта писем');
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `messages_export_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Экспортировано ${selectedIds.size} писем`);
    } catch (error) {
      toast.error('Ошибка экспорта');
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

  const handleFolderSelect = (id: string) => {
    setSelectedFolderId(id);
    setSelectedMessageId(null);
    setSelectedIds(new Set());
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleMessageClick = (message: MessageListItem) => {
    setSelectedMessageId(message.id);
    setSelectedIds(new Set([message.id]));
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const folderIcons: Record<string, React.ReactNode> = {
    inbox: <Inbox className="h-4 w-4" />,
    sent: <Send className="h-4 w-4" />,
    drafts: <FileText className="h-4 w-4" />,
    trash: <Trash2 className="h-4 w-4" />,
    spam: <AlertTriangle className="h-4 w-4" />,
    custom: <FileText className="h-4 w-4" />,
  };

  useHotkeys('ctrl+k, cmd+k', (e) => {
    e.preventDefault();
    if (!composeOpen) {
      setReplyTo(null);
      setForwardFrom(null);
      setLoadedDraft(null);
      setActiveDraftId(null);
      setComposeOpen(true);
    }
  }, { enabled: !isMobile });

  useHotkeys('ctrl+/', (e) => {
    e.preventDefault();
    toast.info('Горячие клавиши: Ctrl+K - новое письмо, Delete - удалить, R - ответить, F - переслать');
  }, { enabled: !isMobile });

  useHotkeys('delete, backspace', (e) => {
    if (selectedIds.size > 0 && !composeOpen) {
      e.preventDefault();
      handleBulkAction('delete');
    }
  }, { enabled: !isMobile && selectedIds.size > 0 });

  useHotkeys('r', (e) => {
    if (selectedMessage && !composeOpen) {
      e.preventDefault();
      handleReply();
    }
  }, { enabled: !isMobile && !!selectedMessage });

  useHotkeys('f', (e) => {
    if (selectedMessage && !composeOpen) {
      e.preventDefault();
      handleForward();
    }
  }, { enabled: !isMobile && !!selectedMessage });

  const swipeHandlers = useSwipeable({
    onSwipedRight: () => {
      if (isMobile && selectedMessageId) {
        setSelectedMessageId(null);
        setSelectedIds(new Set());
      }
    },
    onSwipedLeft: () => {
      if (isMobile && !selectedMessageId && messages.length > 0) {
        const firstMessage = messages[0];
        if (firstMessage) {
          setSelectedMessageId(firstMessage.id);
          setSelectedIds(new Set([firstMessage.id]));
        }
      }
    },
    trackMouse: false,
    trackTouch: true,
    preventScrollOnSwipe: true,
    delta: 50,
  });

  return (
    <div id="main-content" className="flex h-screen flex-col" role="main" aria-label="Почтовый клиент">
      {isMobile && (
        <div className="flex items-center gap-2 border-b bg-muted/50 p-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="min-w-[44px] min-h-[44px] touch-manipulation"
            aria-label="Открыть меню"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <div className="flex-1">
            <img src="/icons/mail-icon.png" alt="Почта" className="h-5 w-5 inline mr-2" />
            <span className="text-lg font-bold">Почта</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setReplyTo(null);
              setForwardFrom(null);
              setLoadedDraft(null);
              setActiveDraftId(null);
              setComposeOpen(true);
            }}
            className="min-w-[44px] min-h-[44px] touch-manipulation"
            aria-label="Написать письмо"
          >
            <FileText className="h-6 w-6" />
          </Button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden relative">
        {(!isMobile || sidebarOpen) && (
          <>
            {isMobile && sidebarOpen && (
              <div
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => setSidebarOpen(false)}
              />
            )}
            <div className={`
              ${isMobile ? 'fixed inset-y-0 left-0 z-50 w-64 bg-background shadow-lg' : 'relative'}
              ${isMobile && !sidebarOpen ? 'hidden' : ''}
            `}>
              <Sidebar
              folders={folders}
              account={account || null}
              selectedFolderId={selectedFolderId}
              onFolderSelect={handleFolderSelect}
              onCompose={() => {
                setReplyTo(null);
                setForwardFrom(null);
                setLoadedDraft(null);
                setActiveDraftId(null);
                setComposeOpen(true);
                if (isMobile) {
                  setSidebarOpen(false);
                }
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
              isMobile={isMobile}
              onClose={() => setSidebarOpen(false)}
              onDropMessage={handleMoveMessage}
            />
            </div>
          </>
        )}
        {isMobile && selectedMessageId ? null : (
          <div 
            className={`
              relative flex flex-col flex-shrink-0
              ${isMobile ? 'w-full' : ''}
            `} 
            style={!isMobile ? { width: `${messageListWidth}px` } : {}} 
            suppressHydrationWarning
            {...(isMobile ? swipeHandlers : {})}
          >
          <div className="border-b bg-muted/50 p-2 max-md:p-1.5 flex-shrink-0 transition-colors duration-200">
            <div className="flex items-center gap-2 max-md:gap-1">
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
              <Button
                variant={conversationView ? 'default' : 'outline'}
                size="sm"
                onClick={() => setConversationView(!conversationView)}
                className="max-md:text-xs max-md:px-2 max-md:h-8"
                title={conversationView ? 'Переключить на обычный вид' : 'Переключить на вид переписки'}
                aria-label={conversationView ? 'Переключить на обычный вид' : 'Переключить на вид переписки'}
              >
                <MessageSquare className="h-4 w-4 max-md:h-3 max-md:w-3 mr-1 max-md:mr-0" />
                <span className="max-md:hidden">Переписки</span>
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <MessageList
            messages={messages}
            selectedIds={selectedIds}
            conversationView={conversationView}
            density={settings?.ui?.density || 'comfortable'}
            groupBy={settings?.ui?.groupBy || 'none'}
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
            onMessageClick={handleMessageClick}
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
            onDragStart={() => {}}
            onToggleImportant={async (messageId, important) => {
              try {
                await fetch(`/api/mail/messages/${messageId}/flags`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ important }),
                });
                updateMessageInList(messageId, (message) => ({
                  ...message,
                  flags: { ...message.flags, important },
                }));
                if (selectedMessageId === messageId) {
                  updateMessageDetail(messageId, (message) => ({
                    ...message,
                    flags: { ...message.flags, important },
                  }));
                }
              } catch (error) {
                console.error('Failed to update important:', error);
                toast.error('Ошибка обновления важности');
              }
            }}
          />
          </div>
        </div>
        )}
        {!isMobile && (
          <div
            className="group relative w-1 flex-shrink-0 cursor-col-resize bg-transparent hover:bg-primary/30 transition-colors"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-border group-hover:bg-primary" />
          </div>
        )}
        {isMobile && !selectedMessageId ? null : (
          <div 
            className={`
              flex-1 min-w-0
              ${isMobile ? 'fixed inset-0 z-40 bg-background' : ''}
              ${isMobile && !selectedMessageId ? 'hidden' : ''}
            `}
            {...(isMobile && selectedMessageId ? swipeHandlers : {})}
          >
            {isMobile && (
              <div className="flex items-center gap-2 border-b bg-muted/50 p-3 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedMessageId(null);
                    setSelectedIds(new Set());
                  }}
                  className="min-w-[44px] min-h-[44px] touch-manipulation"
                  aria-label="Назад к списку"
                >
                  <ArrowLeft className="h-6 w-6" />
                </Button>
                <span className="text-sm font-medium truncate flex-1">{selectedMessage?.subject || 'Письмо'}</span>
              </div>
            )}
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
          onToggleImportant={(important) => {
            if (!selectedMessageId) return;
            updateMessageInList(selectedMessageId, (message) => ({
              ...message,
              flags: { ...message.flags, important },
            }));
            updateMessageDetail(selectedMessageId, (message) => ({
              ...message,
              flags: { ...message.flags, important },
            }));
          }}
          allowRemoteImages={allowRemoteImages}
          isLoading={isMessageLoading}
          hasSelection={!!selectedMessageId}
          error={messageError}
          isMobile={isMobile}
          />
          </div>
        )}
      </div>
      {selectedIds.size > 0 && (
        <div className="border-t bg-muted/50 p-3 max-md:p-3 max-md:sticky max-md:bottom-0 max-md:z-50 max-md:shadow-lg">
          <div className="flex items-center gap-2 max-md:gap-2 max-md:flex-wrap max-md:justify-center">
            <span className="text-sm max-md:text-sm max-md:font-medium">Выбрано: {selectedIds.size}</span>
            {(() => {
              const currentFolder = folders.find((f) => f.id === selectedFolderId);
              const isSpamFolder = currentFolder?.role === 'spam' || selectedFolderId === 'c';
              const inboxFolder = folders.find((f) => f.role === 'inbox');
              
              if (isSpamFolder && inboxFolder) {
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleBulkAction('move', { folderId: inboxFolder.id })}
                    className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
                    aria-label="Это не спам"
                  >
                    <Inbox className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
                    <span className="max-md:hidden">Это не спам</span>
                  </Button>
                );
              }
              return null;
            })()}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleBulkAction('markRead')} 
              className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
              aria-label="Отметить как прочитанное"
            >
              <Mail className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
              <span className="max-md:hidden">Прочитано</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleBulkAction('markUnread')} 
              className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
              aria-label="Отметить как непрочитанное"
            >
              <Mail className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
              <span className="max-md:hidden">Непрочитано</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleBulkAction('star')} 
              className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
              aria-label="Добавить в избранное"
            >
              <Star className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
              <span className="max-md:hidden">В избранное</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const selectedMessages = messages.filter((m) => selectedIds.has(m.id));
                const allImportant = selectedMessages.length > 0 && selectedMessages.every((m) => m.flags.important);
                handleBulkAction(allImportant ? 'unmarkImportant' : 'markImportant');
              }}
              className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
              aria-label="Отметить как важное"
            >
              <AlertCircle className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
              <span className="max-md:hidden">Важное</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkExport}
              className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
              aria-label="Экспортировать письма"
            >
              <FileDown className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
              <span className="max-md:hidden">Экспорт</span>
            </Button>
            {(() => {
              const currentFolder = folders.find((f) => f.id === selectedFolderId);
              const isInbox = currentFolder?.role === 'inbox';
              
              if (isInbox) {
                return (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleBulkAction('archive')} 
                    className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
                    aria-label="Архивировать письма"
                  >
                    <Archive className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
                    <span className="max-md:hidden">Архивировать</span>
                  </Button>
                );
              }
              return null;
            })()}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
                  aria-label="Переместить письма"
                >
                  <FolderIcon className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
                  <span className="max-md:hidden">Переместить</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
                {folders
                  .filter((folder) => folder.id !== selectedFolderId)
                  .map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={() => handleBulkAction('move', { folderId: folder.id })}
                      className="min-h-[44px] touch-manipulation"
                    >
                      <span className="flex items-center">
                        {folderIcons[folder.role] || folderIcons.custom}
                        <span className="ml-2">{folder.name}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleBulkAction('delete')} 
              className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
              aria-label="Удалить письма"
            >
              <Trash2 className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
              <span className="max-md:hidden">Удалить</span>
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
        signatures={settings?.signatures || []}
      />
      {minimizedDrafts.length > 0 && (
        <div className="fixed bottom-0 right-4 flex gap-2 z-50 max-md:right-2 max-md:bottom-16">
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
