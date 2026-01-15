'use client';

import { useState, useMemo } from 'react';
import type { Folder, Account } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Inbox, Send, FileText, Trash2, AlertTriangle, Settings, LogOut, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

interface SidebarProps {
  folders: Folder[];
  account: Account | null;
  selectedFolderId: string | null;
  onFolderSelect: (folderId: string) => void;
  onCompose: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

type ServiceStatus = 'up' | 'down' | 'unknown';

interface ServerStatus {
  smtp: ServiceStatus;
  imapJmap: ServiceStatus;
  queueSize: number | null;
  deliveryErrors: number | null;
  updatedAt: string;
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
}: SidebarProps) {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  const statusItems = useMemo(() => {
    if (!serverStatus) {
      return [];
    }
    return [
      { label: 'SMTP', status: serverStatus.smtp },
      { label: 'IMAP/JMAP', status: serverStatus.imapJmap },
      {
        label: 'Очередь',
        status: serverStatus.queueSize === null ? 'unknown' : serverStatus.queueSize > 0 ? 'down' : 'up',
        value: serverStatus.queueSize === null ? 'н/д' : serverStatus.queueSize.toString(),
      },
      {
        label: 'Ошибки',
        status: serverStatus.deliveryErrors === null ? 'unknown' : serverStatus.deliveryErrors > 0 ? 'down' : 'up',
        value: serverStatus.deliveryErrors === null ? 'н/д' : serverStatus.deliveryErrors.toString(),
      },
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

  if (isCollapsed) {
    return (
      <div className="flex h-full w-16 flex-col border-r bg-muted/30">
        <div className="border-b p-2">
          <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(false)} title="Раскрыть меню">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          <nav className="space-y-2">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => onFolderSelect(folder.id)}
                className={cn(
                  'flex w-full items-center justify-center rounded-md p-2 text-sm transition-colors hover:bg-muted',
                  selectedFolderId === folder.id && 'bg-muted font-medium'
                )}
                title={folder.name}
              >
                {folderIcons[folder.role] || folderIcons.custom}
              </button>
            ))}
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
    <div className="flex h-full w-64 flex-col border-r bg-muted/30">
      <div className="border-b p-4">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold">Почта</h1>
              {isStatusLoading && (
                <span className="text-xs text-muted-foreground">Статус...</span>
              )}
            </div>
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
          <Button variant="ghost" size="icon" onClick={() => setIsCollapsed(true)} title="Скрыть меню">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
        <Button className="w-full" onClick={onCompose}>
          <Plus className="mr-2 h-4 w-4" />
          Написать
        </Button>
        <div className="mt-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <nav className="p-2">
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => onFolderSelect(folder.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                selectedFolderId === folder.id && 'bg-muted font-medium'
              )}
            >
              {folderIcons[folder.role] || folderIcons.custom}
              <span className="flex-1">{folder.name}</span>
              {folder.role === 'drafts' && folder.unreadCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
                  {folder.unreadCount > 99 ? '99+' : folder.unreadCount}
                </span>
              )}
              {folder.role !== 'drafts' && folder.unreadCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-xs font-medium text-white">
                  {folder.unreadCount > 99 ? '99+' : folder.unreadCount}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start">
              <Settings className="mr-2 h-4 w-4" />
              Настройки
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{account?.email || 'Аккаунт'}</DropdownMenuLabel>
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
