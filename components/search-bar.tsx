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

export function SearchBar({ value, onChange, onFilterChange, placeholder = 'Поиск...', className }: SearchBarProps) {
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
    mutationFn: () => saveSearchQuery(saveName || `Поиск ${new Date().toLocaleDateString()}`, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      setShowSaveDialog(false);
      setSaveName('');
    },
  });

  const matchedFilter = savedFilters.find((f) => f.query === value);

  useEffect(() => {
    if (value) {
      const parsed = FilterQueryParser.parse(value);
      if (onFilterChange) {
        onFilterChange(parsed.quickFilter, parsed.filterGroup);
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
    <div className={`relative ${className}`}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 max-md:h-3 max-md:w-3 max-md:left-2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="pl-10 pr-20 max-md:pl-8 max-md:pr-16 max-md:text-sm"
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
                className="absolute right-20 max-md:right-16 h-6 w-6 max-md:h-5 max-md:w-5 p-0"
                title="Сохранить поиск"
              >
                <Bookmark className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="absolute right-10 max-md:right-8 h-6 w-6 max-md:h-5 max-md:w-5 p-0"
            >
              <X className="h-4 w-4 max-md:h-3 max-md:w-3" />
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 max-md:right-1 h-6 w-6 max-md:h-5 max-md:w-5 p-0"
              title="Сохраненные поиски и справка"
            >
              <HelpCircle className="h-4 w-4 max-md:h-3 max-md:w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {savedFilters.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Сохраненные поиски
                </div>
                {savedFilters.map((filter) => (
                  <DropdownMenuItem
                    key={filter.id}
                    onClick={() => {
                      onChange(filter.query);
                      setShowHelp(false);
                    }}
                    className="cursor-pointer"
                  >
                    <BookmarkCheck className="h-4 w-4 mr-2" />
                    <span className="truncate">{filter.name}</span>
                  </DropdownMenuItem>
                ))}
                <div className="border-t my-1" />
              </>
            )}
            <DropdownMenuItem onClick={() => setShowHelp(!showHelp)}>
              <HelpCircle className="h-4 w-4 mr-2" />
              Справка по поиску
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showHelp && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-background border rounded-lg shadow-lg p-4 max-md:p-2 max-md:text-xs">
          <h3 className="font-semibold mb-2 max-md:text-sm">Справка по поиску</h3>
          <div className="text-sm max-md:text-xs space-y-2">
            <div>
              <strong>Быстрые фильтры:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li><code>is:unread</code> - непрочитанные</li>
                <li><code>is:read</code> - прочитанные</li>
                <li><code>has:attachment</code> - с вложениями</li>
                <li><code>is:starred</code> - помеченные</li>
                <li><code>is:draft</code> - черновики</li>
              </ul>
            </div>
            <div>
              <strong>Поля:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li><code>from:email@example.com</code> - от кого</li>
                <li><code>subject:"текст"</code> - тема</li>
                <li><code>after:2026-01-01</code> - после даты</li>
                <li><code>before:2026-12-31</code> - до даты</li>
                <li><code>filename:"document.pdf"</code> - поиск по имени файла вложения</li>
                <li><code>attachment:"текст"</code> - поиск по содержимому вложений</li>
              </ul>
            </div>
            <div>
              <strong>Примеры:</strong>
              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                <li><code>from:amazon subject:"order"</code></li>
                <li><code>has:attachment after:2026-01-01</code></li>
                <li><code>filename:"invoice"</code> - письма с файлами, содержащими "invoice"</li>
                <li><code>-folder:spam</code> - исключить папку</li>
              </ul>
            </div>
          </div>
        </div>
      )}
      {showSaveDialog && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-background border rounded-lg shadow-lg p-4">
          <h3 className="font-semibold mb-2">Сохранить поисковый запрос</h3>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Название поиска"
            className="mb-2"
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
            >
              Сохранить
            </Button>
            <Button
              variant="outline"
              size="sm"
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