'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, HelpCircle, Bookmark, BookmarkCheck } from 'lucide-react';
import { FilterQueryParser } from '@/lib/filter-parser';
import type { QuickFilterType, FilterGroup, SavedFilter } from '@/lib/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

async function getSavedFilters(): Promise<SavedFilter[]> {
  const res = await fetch('/api/mail/filters');
  if (!res.ok) {
    return [];
  }
  return res.json();
}

async function saveSearchQuery(name: string, query: string): Promise<SavedFilter> {
  const res = await fetch('/api/mail/filters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, query }),
  });
  if (!res.ok) {
    throw new Error('Failed to save search');
  }
  return res.json();
}

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onFilterChange?: (quickFilter?: QuickFilterType, filterGroup?: FilterGroup) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  onFilterChange,
  placeholder = 'Поиск...',
  className,
}: SearchBarProps) {
  const [showHelp, setShowHelp] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['saved-filters'],
    queryFn: getSavedFilters,
    staleTime: 60000,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSearchQuery(saveName || `Поиск ${new Date().toLocaleDateString()}`, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      setShowSaveDialog(false);
      setSaveName('');
    },
  });

  const matchedFilter = savedFilters.find((f) => f.query === value);

  useEffect(() => {
    if (value && onFilterChange) {
      const hasStructuredSyntax =
        /(?:^|\s)(?:from|to|cc|bcc|subject|body|date|folder|tag|tags|size|attachment|attachments|filename|after|before|is|has|message-id|messageid|id):/i.test(
          value
        );
      if (hasStructuredSyntax) {
        const parsed = FilterQueryParser.parse(value);
        onFilterChange(parsed.quickFilter, parsed.filterGroup);
      } else {
        onFilterChange(undefined, undefined);
      }
    }
  }, [value, onFilterChange]);

  const handleChange = (newValue: string) => {
    onChange(newValue);
  };

  const handleClear = () => {
    onChange('');
    if (onFilterChange) {
      onFilterChange(undefined, undefined);
    }
  };

  return (
    <div className={`relative ${className || ''}`} role="search">
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 rounded-lg border-border bg-background pl-10 pr-24 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-primary/30 focus-visible:ring-offset-0 max-md:text-sm"
          data-mail-search
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              handleClear();
            }
          }}
        />
        {value && (
          <>
            {!matchedFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSaveDialog(true)}
                className="absolute right-20 h-7 w-7 rounded-lg p-0 text-muted-foreground hover:mail-hover-surface hover:text-foreground"
                title="Сохранить поиск"
              >
                <Bookmark className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="absolute right-10 h-7 w-7 rounded-lg p-0 text-muted-foreground hover:mail-hover-surface hover:text-foreground"
            >
              <X className="h-4 w-4 max-md:h-3 max-md:w-3" />
            </Button>
          </>
        )}
        {!value && (
          <kbd
            className="pointer-events-none absolute right-10 hidden min-w-6 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-center font-mono text-[11px] text-muted-foreground sm:inline-block"
            aria-label="Нажмите слэш, чтобы перейти к поиску"
          >
            /
          </kbd>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 h-7 w-7 rounded-lg p-0 text-muted-foreground hover:mail-hover-surface hover:text-foreground"
              title="Сохраненные поиски и справка"
            >
              <HelpCircle className="h-4 w-4 max-md:h-3 max-md:w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 rounded-xl border-border bg-popover p-1 shadow-lg"
          >
            {savedFilters.length > 0 && (
              <>
                <div className="px-3 py-2 text-xs font-medium text-muted-foreground">
                  Сохраненные поиски
                </div>
                {savedFilters.map((filter) => (
                  <DropdownMenuItem
                    key={filter.id}
                    onClick={() => {
                      onChange(filter.query);
                      setShowHelp(false);
                    }}
                    className="cursor-pointer rounded-lg px-3 py-2 text-foreground focus:bg-[hsl(var(--surface-selected))]"
                  >
                    <BookmarkCheck className="h-4 w-4 mr-2" />
                    <span className="truncate">{filter.name}</span>
                  </DropdownMenuItem>
                ))}
                <div className="my-1 border-t border-border/70" />
              </>
            )}
            <DropdownMenuItem
              onClick={() => setShowHelp(!showHelp)}
              className="rounded-lg px-3 py-2 text-foreground focus:bg-[hsl(var(--surface-selected))]"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Справка по поиску
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showHelp && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-border bg-popover p-4 shadow-lg max-md:p-2 max-md:text-xs">
          <h3 className="font-semibold mb-2 max-md:text-sm">Справка по поиску</h3>
          <div className="space-y-3 text-sm text-muted-foreground max-md:text-xs">
            <div>
              <strong>Быстрые фильтры:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li>
                  <code>is:unread</code> - непрочитанные
                </li>
                <li>
                  <code>is:read</code> - прочитанные
                </li>
                <li>
                  <code>has:attachment</code> - с вложениями
                </li>
                <li>
                  <code>is:starred</code> - помеченные
                </li>
                <li>
                  <code>is:draft</code> - черновики
                </li>
              </ul>
            </div>
            <div>
              <strong>Поля:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li>
                  <code>from:email@example.com</code> - от кого
                </li>
                <li>
                  <code>subject:&quot;текст&quot;</code> - тема
                </li>
                <li>
                  <code>after:2026-01-01</code> - после даты
                </li>
                <li>
                  <code>before:2026-12-31</code> - до даты
                </li>
                <li>
                  <code>filename:&quot;document.pdf&quot;</code> - поиск по имени файла вложения
                </li>
                <li>
                  <code>attachment:&quot;текст&quot;</code> - поиск по содержимому вложений
                </li>
              </ul>
            </div>
            <div>
              <strong>Примеры:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li>
                  <code>from:amazon subject:&quot;order&quot;</code>
                </li>
                <li>
                  <code>has:attachment after:2026-01-01</code>
                </li>
                <li>
                  <code>filename:&quot;invoice&quot;</code> - письма с файлами, содержащими
                  &quot;invoice&quot;
                </li>
                <li>
                  <code>-folder:spam</code> - исключить папку
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
      {showSaveDialog && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-xl border border-border bg-popover p-4 shadow-lg">
          <h3 className="font-semibold mb-2">Сохранить поисковый запрос</h3>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Название поиска"
            className="mb-2 rounded-lg border-border bg-background"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && saveName.trim()) {
                saveMutation.mutate();
              } else if (e.key === 'Escape') {
                setShowSaveDialog(false);
              }
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!saveName.trim() || saveMutation.isPending}
              className="rounded-xl"
            >
              Сохранить
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                setShowSaveDialog(false);
                setSaveName('');
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
