'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { QuickFilterType } from '@/lib/types';
import {
  Mail,
  MailOpen,
  Paperclip,
  Star,
  AlertCircle,
  Filter,
  X,
  Check,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface QuickFilter {
  type: QuickFilterType;
  label: string;
  icon: React.ReactNode;
  category: 'status' | 'attachments' | 'markers';
}

interface QuickFiltersProps {
  activeFilter?: QuickFilterType;
  onFilterChange: (filter?: QuickFilterType) => void;
  className?: string;
}

export function QuickFilters({ activeFilter, onFilterChange, className }: QuickFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('quickFilters');

  const QUICK_FILTERS: QuickFilter[] = [
    { type: 'unread', label: t('unread'), icon: <Mail className="h-4 w-4" />, category: 'status' },
    { type: 'read', label: t('read'), icon: <MailOpen className="h-4 w-4" />, category: 'status' },
    {
      type: 'hasAttachments',
      label: t('withAttachments'),
      icon: <Paperclip className="h-4 w-4" />,
      category: 'attachments',
    },
    {
      type: 'starred',
      label: t('starred'),
      icon: <Star className="h-4 w-4" />,
      category: 'markers',
    },
    {
      type: 'important',
      label: t('important'),
      icon: <AlertCircle className="h-4 w-4" />,
      category: 'markers',
    },
  ];

  const CATEGORIES = {
    status: t('categoryStatus'),
    attachments: t('categoryAttachments'),
    markers: t('categoryMarkers'),
  };

  const activeFilterData = QUICK_FILTERS.find((f) => f.type === activeFilter);

  const filtersByCategory = QUICK_FILTERS.reduce(
    (acc, filter) => {
      acc[filter.category].push(filter);
      return acc;
    },
    { status: [], attachments: [], markers: [] } as Record<QuickFilter['category'], QuickFilter[]>
  );

  return (
    <div className={cn('flex items-center gap-2 max-md:gap-1', className)}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={activeFilter ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'flex h-8 items-center gap-2 rounded-lg px-2.5 shadow-none max-md:px-2 max-md:text-xs',
              activeFilter
                ? 'bg-primary/12 text-primary hover:bg-primary/16'
                : 'text-muted-foreground hover:mail-hover-surface hover:text-foreground'
            )}
            aria-label={
              activeFilterData ? `${t('button')}: ${activeFilterData.label}` : t('button')
            }
          >
            <Filter className="h-4 w-4 max-md:h-3 max-md:w-3" />
            <span className="max-md:text-xs">
              {activeFilterData ? activeFilterData.label : t('button')}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-60 rounded-xl border-border bg-popover p-1 shadow-lg"
        >
          {Object.entries(filtersByCategory).map(([category, filters]) => (
            <div key={category}>
              <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {CATEGORIES[category as keyof typeof CATEGORIES]}
              </DropdownMenuLabel>
              {filters.map((filter) => (
                <DropdownMenuItem
                  key={filter.type}
                  onClick={() => {
                    if (activeFilter === filter.type) {
                      onFilterChange(undefined);
                    } else {
                      onFilterChange(filter.type);
                    }
                    setIsOpen(false);
                  }}
                  className={cn(
                    'flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-foreground/80 focus:bg-[hsl(var(--surface-selected))]',
                    activeFilter === filter.type && 'mail-selected-surface font-medium text-foreground'
                  )}
                >
                  {filter.icon}
                  <span className="flex-1">{filter.label}</span>
                  {activeFilter === filter.type && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
              {category !== 'markers' && <DropdownMenuSeparator className="bg-border/70" />}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {activeFilter && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFilterChange(undefined)}
          className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:mail-hover-surface hover:text-foreground"
          aria-label={t('clear')}
          title={t('clear')}
        >
          <X className="h-4 w-4 max-md:h-3 max-md:w-3" />
        </Button>
      )}
    </div>
  );
}
