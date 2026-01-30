'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Folder, Account } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Inbox, Send, FileText, Trash2, AlertTriangle, Settings, LogOut, Plus, ChevronLeft, ChevronRight, X, User, UserPlus, Check, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SearchBar } from './search-bar';

interface SidebarProps {
  folders: Folder[];
  account: Account | null;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string) => void;
  onCompose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onFilterChange?: (quickFilter?: import('@/lib/types').QuickFilterType, filterGroup?: import('@/lib/types').FilterGroup) => void;
  isMobile?: boolean;
  onClose?: () => void;
  onDropMessage?: (messageId: string, folderId: string) => void;
  onRefreshFolders?: () => void;
}

type ServiceStatus = 'up' | 'down' | 'unknown';

interface ServerStatus {
  smtp: ServiceStatus;
  imapJmap: ServiceStatus;
  queueSize: number | null;
  deliveryErrors: number | null;
  updatedAt: string;
}

interface StatusItem {
  label: string;
  status: ServiceStatus;
  value?: string;
}

const folderIcons: Record<string, React.ReactNode> = {
  inbox: <Inbox className="h-4 w-4" />,
  sent: <Send className="h-4 w-4" />,
  drafts: <FileText className="h-4 w-4" />,
  trash: <Trash2 className="h-4 w-4" />,
  spam: <AlertTriangle className="h-4 w-4" />,
  custom: <FileText className="h-4 w-4" />,
};

export function Sidebar({
  folders,
  account,
  selectedFolderId,
  onFolderSelect,
  onCompose,
  searchQuery,
  onSearchChange,
  onFilterChange,
  isMobile = false,
  onClose,
  onDropMessage,
  onRefreshFolders,
}: SidebarProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggedOverFolderId, setDraggedOverFolderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { data: serverStatus, isLoading: isStatusLoading } = useQuery<ServerStatus>({
    queryKey: ['server-status'],
    queryFn: async () => {
      const res = await fetch('/api/mail/status');
      if (!res.ok) {
        throw new Error('Failed to load server status');
      }
      return res.json();
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: accountsData } = useQuery<{ accounts: Array<{ id: string; email: string; displayName?: string; isActive?: boolean }> }>({
    queryKey: ['user-accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) {
        throw new Error('Failed to load accounts');
      }
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const switchAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch('/api/accounts/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to switch account');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account'] });
      queryClient.invalidateQueries({ queryKey: ['user-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success('Аккаунт переключен');
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка переключения аккаунта');
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const res = await fetch(`/api/accounts?accountId=${encodeURIComponent(accountId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete account');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-accounts'] });
      toast.success('Аккаунт удален');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка удаления аккаунта');
    },
  });

  const handleSwitchAccount = (accountId: string) => {
    if (accountId === account?.id) {
      return;
    }
    switchAccountMutation.mutate(accountId);
  };

  const handleDeleteAccount = (accountId: string, accountEmail: string) => {
    if (confirm(`Вы уверены, что хотите удалить аккаунт ${accountEmail}?`)) {
      deleteAccountMutation.mutate(accountId);
    }
  };

  const handleAddAccount = () => {
    router.push('/login?addAccount=true');
  };

  const statusItems = useMemo<StatusItem[]>(() => {
    if (!serverStatus) {
      return [];
    }
    return [
      { label: 'IMAP/JMAP', status: serverStatus.imapJmap },
    ];
  }, [serverStatus]);

  const getStatusStyle = (status: ServiceStatus) => {
    if (status === 'up') return 'bg-emerald-500';
    if (status === 'down') return 'bg-rose-500';
    return 'bg-amber-400';
  };

  const getStatusText = (status: ServiceStatus) => {
    if (status === 'up') return 'доступен';
    if (status === 'down') return 'недоступен';
    return 'н/д';
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleSettings = () => {
    router.push('/settings');
  };

  const organizedFolders = useMemo(() => {
    const folderMap = new Map<string, Folder & { children: Folder[] }>();
    const rootFolders: (Folder & { children: Folder[] })[] = [];

    folders.forEach((folder) => {
      folderMap.set(folder.id, { ...folder, children: [] });
    });

    folders.forEach((folder) => {
      const folderWithChildren = folderMap.get(folder.id)!;
      if (folder.parentId && folderMap.has(folder.parentId)) {
        const parent = folderMap.get(folder.parentId)!;
        parent.children.push(folderWithChildren);
      } else {
        rootFolders.push(folderWithChildren);
      }
    });

    return rootFolders;
  }, [folders]);

  const renderFolderItem = useCallback((folder: Folder & { children?: Folder[] }, level = 0) => {
    return (
      <div key={folder.id}>
        <button
          onClick={() => onFolderSelect(folder.id)}
          onDragOver={(e) => {
            if (onDropMessage) {
              e.preventDefault();
              e.stopPropagation();
              setDraggedOverFolderId(folder.id);
            }
          }}
          onDragLeave={() => {
            if (onDropMessage) {
              setDraggedOverFolderId(null);
            }
          }}
          onDrop={(e) => {
            if (onDropMessage) {
              e.preventDefault();
              e.stopPropagation();
              setDraggedOverFolderId(null);
              try {
                const data = e.dataTransfer.getData('application/json');
                if (data) {
                  const parsed = JSON.parse(data);
                  if (parsed.type === 'message' && parsed.id) {
                    onDropMessage(parsed.id, folder.id);
                  }
                } else {
                  const messageId = e.dataTransfer.getData('text/plain');
                  if (messageId) {
                    onDropMessage(messageId, folder.id);
                  }
                }
              } catch (error) {
                console.error('Error handling drop:', error);
              }
            }
          }}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-all duration-200 hover:bg-muted active:bg-muted/70 max-md:min-h-[44px] touch-manipulation hover:shadow-sm',
            selectedFolderId === folder.id && 'bg-muted font-medium shadow-sm',
            draggedOverFolderId === folder.id && 'bg-primary/20 ring-2 ring-primary ring-offset-1',
            level > 0 && 'ml-4'
          )}
        >
          {folderIcons[folder.role] || folderIcons.custom}
          <span className="flex-1 truncate">{folder.name}</span>
          {folder.role === 'drafts' && folder.unreadCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {folder.unreadCount > 99 ? '99+' : folder.unreadCount}
            </span>
          )}
          {folder.role !== 'drafts' && folder.unreadCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {folder.unreadCount > 99 ? '99+' : folder.unreadCount}
            </span>
          )}
        </button>
        {folder.children && folder.children.length > 0 && (
          <div className="ml-4">
            {folder.children.map((child) => renderFolderItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  }, [selectedFolderId, draggedOverFolderId, onFolderSelect, onDropMessage]);

  if (isCollapsed && !isMobile) {
    return (
      <div className="flex h-full w-16 flex-col border-r bg-muted/30">
        <div className="border-b p-2">
          <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} title="Раскрыть меню">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <nav className="space-y-2">
            {organizedFolders.map((folder) => {
              const renderCollapsedFolder = (f: Folder & { children?: Folder[] }) => (
                <div key={f.id}>
                  <button
                    onClick={() => onFolderSelect(f.id)}
                    className={cn(
                      'flex w-full items-center justify-center rounded-md p-2 text-sm transition-colors hover:bg-muted',
                      selectedFolderId === f.id && 'bg-muted font-medium',
                      draggedOverFolderId === f.id && 'bg-primary/20 ring-2 ring-primary ring-offset-1 scale-105'
                    )}
                    title={f.name}
                  >
                    {folderIcons[f.role] || folderIcons.custom}
                  </button>
                  {f.children && f.children.length > 0 && (
                    <div className="ml-2">
                      {f.children.map((child) => renderCollapsedFolder(child))}
                    </div>
                  )}
                </div>
              );
              return renderCollapsedFolder(folder);
            })}
          </nav>
        </div>
        <div className="border-t p-2">
          <Button variant="ghost" size="icon" className="w-full" onClick={handleSettings} title="Настройки">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`
      flex h-full flex-col border-r bg-muted/30
      ${isMobile ? 'w-full' : 'w-64'}
    `}>
      {isMobile && (
        <div className="border-b p-3 flex items-center justify-between">
          <h1 className="text-lg font-bold">Меню</h1>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] touch-manipulation"
            aria-label="Закрыть меню"
          >
            <X className="h-6 w-6" />
          </Button>
        </div>
      )}
      <div className="border-b p-4">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {!isMobile && (
              <div className="flex items-center gap-2">
                <img src="/icons/mail-icon.png" alt="Почта" className="h-5 w-5 flex-shrink-0" />
                <h1 className="text-lg font-bold">Почта</h1>
                {isStatusLoading && (
                  <span className="text-xs text-muted-foreground">Статус...</span>
                )}
              </div>
            )}
            {statusItems.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {statusItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${getStatusStyle(item.status)}`} />
                    <span className="truncate">
                      {item.label} {item.value ? item.value : getStatusText(item.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!isMobile && (
            <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)} title="Скрыть меню">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
        <Button 
          className="w-full max-md:min-h-[44px] touch-manipulation" 
          onClick={onCompose}
          aria-label="Написать новое письмо"
        >
          <Plus className="mr-2 h-4 w-4" />
          Написать
        </Button>
        <div className="mt-3">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            onFilterChange={onFilterChange}
            placeholder="Поиск..."
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Папки</span>
          {onRefreshFolders && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  await onRefreshFolders();
                  toast.success('Папки обновлены');
                } catch (error) {
                  toast.error('Ошибка обновления');
                } finally {
                  setTimeout(() => setIsRefreshing(false), 500);
                }
              }}
              disabled={isRefreshing}
              title="Обновить папки"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
        <nav className="p-2">
          {organizedFolders.map((folder) => renderFolderItem(folder))}
        </nav>
      </div>
      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-start max-md:min-h-[44px] touch-manipulation"
              aria-label="Настройки"
            >
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{account?.email || 'Аккаунт'}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accountsData && accountsData.accounts.length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-muted-foreground">Аккаунты</DropdownMenuLabel>
                {accountsData.accounts.map((acc) => (
                  <DropdownMenuItem
                    key={acc.id}
                    onClick={() => handleSwitchAccount(acc.id)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <User className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{acc.displayName || acc.email}</span>
                    </div>
                    {acc.id === account?.id && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={handleAddAccount}>
              <UserPlus className="mr-2 h-4 w-4" />
              Добавить аккаунт
            </DropdownMenuItem>
            {accountsData && accountsData.accounts.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Управление</DropdownMenuLabel>
                {accountsData.accounts
                  .filter((acc) => acc.id !== account?.id)
                  .map((acc) => (
                    <DropdownMenuItem
                      key={acc.id}
                      onClick={() => handleDeleteAccount(acc.id, acc.email)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Удалить {acc.email}
                    </DropdownMenuItem>
                  ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSettings}>
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
