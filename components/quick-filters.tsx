'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuickFilterType } from '@/lib/types';
import {
  Mail,
  MailOpen,
  Paperclip,
  Image,
  FileText,
  Archive,
  Star,
  AlertCircle,
  Inbox,
  Send,
  Download,
  List,
} from 'lucide-react';

interface QuickFilter {
  type: QuickFilterType;
  label: string;
  icon: React.ReactNode;
}

const QUICK_FILTERS: QuickFilter[] = [
  { type: 'unread', label: 'Непрочитанные', icon: <Mail className="h-4 w-4" /> },
  { type: 'read', label: 'Прочитанные', icon: <MailOpen className="h-4 w-4" /> },
  { type: 'hasAttachments', label: 'С вложениями', icon: <Paperclip className="h-4 w-4" /> },
  { type: 'attachmentsImages', label: 'Только изображения', icon: <Image className="h-4 w-4" /> },
  { type: 'attachmentsDocuments', label: 'Только документы', icon: <FileText className="h-4 w-4" /> },
  { type: 'attachmentsArchives', label: 'Только архивы', icon: <Archive className="h-4 w-4" /> },
  { type: 'starred', label: 'Помеченные', icon: <Star className="h-4 w-4" /> },
  { type: 'important', label: 'Важные', icon: <AlertCircle className="h-4 w-4" /> },
  { type: 'drafts', label: 'Черновики', icon: <FileText className="h-4 w-4" /> },
  { type: 'sent', label: 'Отправленные', icon: <Send className="h-4 w-4" /> },
  { type: 'incoming', label: 'Входящие', icon: <Inbox className="h-4 w-4" /> },
  { type: 'bounce', label: 'Ошибки доставки', icon: <Download className="h-4 w-4" /> },
  { type: 'bulk', label: 'Рассылки', icon: <List className="h-4 w-4" /> },
];

interface QuickFiltersProps {
  activeFilter?: QuickFilterType;
  onFilterChange: (filter?: QuickFilterType) => void;
  className?: string;
}

export function QuickFilters({ activeFilter, onFilterChange, className }: QuickFiltersProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {QUICK_FILTERS.map((filter) => (
        <Button
          key={filter.type}
          variant={activeFilter === filter.type ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            if (activeFilter === filter.type) {
              onFilterChange(undefined);
            } else {
              onFilterChange(filter.type);
            }
          }}
          className={cn(
            'flex items-center gap-2',
            activeFilter === filter.type && 'bg-primary text-primary-foreground'
          )}
        >
          {filter.icon}
          <span>{filter.label}</span>
        </Button>
      ))}
    </div>
  );
}