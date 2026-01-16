'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, FolderPlus, Trash2, Sun, Moon, Filter, Plus, Edit2, Users, Layout, Globe, Clock, Forward, AtSign, Star } from 'lucide-react';
import type { Folder, SavedFilter, AutoSortRule } from '@/lib/types';
import { AutoSortRuleEditor } from '@/components/auto-sort-rule-editor';
import { ContactsManager } from '@/components/contacts-manager';

interface Signature {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
  context?: 'work' | 'personal' | 'autoReply' | 'general';
}

interface UserSettings {
  signature: string;
  signatures?: Signature[];
  theme: 'light' | 'dark';
  autoReply: {
    enabled: boolean;
    subject: string;
    message: string;
    schedule?: {
      enabled: boolean;
      startDate?: string;
      endDate?: string;
      startTime?: string;
      endTime?: string;
    };
  };
  forwarding?: {
    enabled: boolean;
    email: string;
    keepCopy: boolean;
  };
  aliases?: Array<{
    id: string;
    email: string;
    name?: string;
  }>;
  locale?: {
    language: 'ru' | 'en';
    dateFormat: 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    timeFormat: '24h' | '12h';
    timezone: string;
  };
  ui?: {
    density: 'compact' | 'comfortable' | 'spacious';
    messagesPerPage: number;
    sortBy: 'date' | 'from' | 'subject' | 'size';
    sortOrder: 'asc' | 'desc';
    groupBy: 'none' | 'date' | 'sender';
  };
}

async function getSettings(): Promise<UserSettings> {
  const res = await fetch('/api/settings');
  if (!res.ok) {
    throw new Error('Failed to load settings');
  }
  return res.json();
}

async function saveSettings(settings: UserSettings): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error('Failed to save settings');
  }
}

async function getFolders(): Promise<Folder[]> {
  const res = await fetch('/api/mail/folders');
  if (!res.ok) {
    throw new Error('Failed to load folders');
  }
  return res.json();
}

async function createFolder(name: string): Promise<Folder> {
  const res = await fetch('/api/mail/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create folder');
  }
  return res.json();
}

async function deleteFolder(folderId: string): Promise<void> {
  const res = await fetch(`/api/mail/folders?folderId=${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete folder');
  }
}

type TabId = 'signature' | 'theme' | 'autoReply' | 'folders' | 'filters' | 'contacts' | 'interface' | 'advanced';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

function getTabs(theme: 'light' | 'dark'): Tab[] {
  return [
    { id: 'signature', label: 'Подпись письма', icon: <Mail className="h-4 w-4" /> },
    { id: 'theme', label: 'Тема', icon: theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" /> },
    { id: 'autoReply', label: 'Автоответ', icon: <Mail className="h-4 w-4" /> },
    { id: 'interface', label: 'Интерфейс', icon: <Layout className="h-4 w-4" /> },
    { id: 'advanced', label: 'Расширенные', icon: <Globe className="h-4 w-4" /> },
    { id: 'folders', label: 'Папки', icon: <FolderPlus className="h-4 w-4" /> },
    { id: 'filters', label: 'Фильтры', icon: <Filter className="h-4 w-4" /> },
    { id: 'contacts', label: 'Контакты', icon: <Users className="h-4 w-4" /> },
  ];
}

function SignatureTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [signature, setSignature] = useState(() => initialSettings.signature || '');
  const [signatures, setSignatures] = useState<Signature[]>(() => initialSettings.signatures || []);
  const [editingSignature, setEditingSignature] = useState<Signature | null>(null);
  const [newSignatureName, setNewSignatureName] = useState('');
  const [newSignatureContent, setNewSignatureContent] = useState('');
  const [newSignatureContext, setNewSignatureContext] = useState<'work' | 'personal' | 'autoReply' | 'general'>('general');

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({ ...initialSettings, signature, signatures }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Настройки сохранены');
    },
    onError: () => {
      toast.error('Ошибка сохранения настроек');
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleAddSignature = () => {
    if (!newSignatureName.trim() || !newSignatureContent.trim()) {
      toast.error('Заполните название и содержимое подписи');
      return;
    }
    const newSig: Signature = {
      id: Date.now().toString(),
      name: newSignatureName.trim(),
      content: newSignatureContent.trim(),
      context: newSignatureContext,
      isDefault: signatures.length === 0,
    };
    setSignatures([...signatures, newSig]);
    setNewSignatureName('');
    setNewSignatureContent('');
    setNewSignatureContext('general');
  };

  const handleDeleteSignature = (id: string) => {
    setSignatures(signatures.filter((s) => s.id !== id));
  };

  const handleSetDefault = (id: string) => {
    setSignatures(signatures.map((s) => ({ ...s, isDefault: s.id === id })));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Подпись письма</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="signature-text" className="text-sm font-medium">Основная подпись (для обратной совместимости)</label>
            <textarea
              id="signature-text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Введите текст подписи, которая будет добавляться к каждому отправляемому письму..."
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Эта подпись используется по умолчанию, если не выбрана другая
            </p>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Подписи для разных ситуаций</h3>
            </div>

            <div className="space-y-4 p-4 border rounded-md bg-muted/30">
              <div className="space-y-2">
                <label htmlFor="new-sig-name" className="text-sm font-medium">Название подписи</label>
                <Input
                  id="new-sig-name"
                  value={newSignatureName}
                  onChange={(e) => setNewSignatureName(e.target.value)}
                  placeholder="Например: Рабочая подпись"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="new-sig-context" className="text-sm font-medium">Контекст использования</label>
                <select
                  id="new-sig-context"
                  value={newSignatureContext}
                  onChange={(e) => setNewSignatureContext(e.target.value as 'work' | 'personal' | 'autoReply' | 'general')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="general">Общая</option>
                  <option value="work">Рабочая</option>
                  <option value="personal">Личная</option>
                  <option value="autoReply">Для автоответа</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="new-sig-content" className="text-sm font-medium">Содержимое подписи</label>
                <textarea
                  id="new-sig-content"
                  value={newSignatureContent}
                  onChange={(e) => setNewSignatureContent(e.target.value)}
                  placeholder="Введите текст подписи..."
                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  rows={4}
                />
              </div>
              <Button onClick={handleAddSignature} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Добавить подпись
              </Button>
            </div>

            {signatures.length > 0 && (
              <div className="space-y-2">
                {signatures.map((sig) => (
                  <div
                    key={sig.id}
                    className="flex items-start justify-between rounded-md border bg-card p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{sig.name}</span>
                        {sig.isDefault && (
                          <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">По умолчанию</span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {sig.context === 'work' ? 'Рабочая' : sig.context === 'personal' ? 'Личная' : sig.context === 'autoReply' ? 'Автоответ' : 'Общая'}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{sig.content}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      {!sig.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetDefault(sig.id)}
                          title="Установить по умолчанию"
                        >
                          <Star className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSignature(sig.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}

function AutoReplyTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(() => initialSettings.autoReply?.enabled || false);
  const [autoReplySubject, setAutoReplySubject] = useState(() => initialSettings.autoReply?.subject || '');
  const [autoReplyMessage, setAutoReplyMessage] = useState(() => initialSettings.autoReply?.message || '');
  const [scheduleEnabled, setScheduleEnabled] = useState(() => initialSettings.autoReply?.schedule?.enabled || false);
  const [startDate, setStartDate] = useState(() => initialSettings.autoReply?.schedule?.startDate || '');
  const [endDate, setEndDate] = useState(() => initialSettings.autoReply?.schedule?.endDate || '');
  const [startTime, setStartTime] = useState(() => initialSettings.autoReply?.schedule?.startTime || '');
  const [endTime, setEndTime] = useState(() => initialSettings.autoReply?.schedule?.endTime || '');

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({
      ...initialSettings,
      autoReply: {
        enabled: autoReplyEnabled,
        subject: autoReplySubject,
        message: autoReplyMessage,
        schedule: {
          enabled: scheduleEnabled,
          startDate,
          endDate,
          startTime,
          endTime,
        },
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Настройки сохранены');
    },
    onError: () => {
      toast.error('Ошибка сохранения настроек');
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Автоответ</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoReplyEnabled"
              checked={autoReplyEnabled}
              onChange={(e) => setAutoReplyEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="autoReplyEnabled" className="text-sm font-medium">
              Включить автоответ
            </label>
          </div>

          {autoReplyEnabled && (
            <div className="space-y-4 pl-6">
              <div className="space-y-2">
                <label htmlFor="autoReplySubject" className="text-sm font-medium">Тема письма</label>
                <Input
                  id="autoReplySubject"
                  value={autoReplySubject}
                  onChange={(e) => setAutoReplySubject(e.target.value)}
                  placeholder="Re: тема исходного письма"
                />
                <p className="text-xs text-muted-foreground">
                  Если оставить пустым, будет использоваться &quot;Re: тема исходного письма&quot;
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="autoReplyMessage" className="text-sm font-medium">Текст автоответа</label>
                <textarea
                  id="autoReplyMessage"
                  value={autoReplyMessage}
                  onChange={(e) => setAutoReplyMessage(e.target.value)}
                  placeholder="Введите текст автоматического ответа..."
                  className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  Этот текст будет отправляться автоматически на каждое входящее письмо
                </p>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="scheduleEnabled"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="scheduleEnabled" className="text-sm font-medium">
                    Автоответ по расписанию
                  </label>
                </div>

                {scheduleEnabled && (
                  <div className="space-y-4 pl-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="startDate" className="text-sm font-medium">Дата начала</label>
                        <Input
                          id="startDate"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="endDate" className="text-sm font-medium">Дата окончания</label>
                        <Input
                          id="endDate"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="startTime" className="text-sm font-medium">Время начала</label>
                        <Input
                          id="startTime"
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="endTime" className="text-sm font-medium">Время окончания</label>
                        <Input
                          id="endTime"
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Автоответ будет работать только в указанный период времени
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}

function ThemeTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => initialSettings.theme || 'light');

  const saveMutation = useMutation({
    mutationFn: (newTheme: 'light' | 'dark') => saveSettings({ ...initialSettings, theme: newTheme }),
    onSuccess: (_, newTheme) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Тема изменена');
      const root = document.documentElement;
      if (newTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    },
    onError: () => {
      toast.error('Ошибка сохранения темы');
    },
  });

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    const root = document.documentElement;
    if (newTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveMutation.mutate(newTheme);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Тема оформления</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleThemeChange('light')}
              className={`flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-all ${
                theme === 'light'
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Sun className={`h-8 w-8 ${theme === 'light' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`font-medium ${theme === 'light' ? 'text-primary' : 'text-foreground'}`}>
                Светлая
              </span>
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={`flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-all ${
                theme === 'dark'
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <Moon className={`h-8 w-8 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`font-medium ${theme === 'dark' ? 'text-primary' : 'text-foreground'}`}>
                Темная
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Выберите тему оформления интерфейса почты
          </p>
        </div>
      </div>
    </div>
  );
}

async function getSavedFilters(): Promise<SavedFilter[]> {
  const res = await fetch('/api/mail/filters');
  if (!res.ok) {
    throw new Error('Failed to load filters');
  }
  return res.json();
}

async function saveFilter(filter: { id?: string; name: string; query: string; isPinned?: boolean }): Promise<SavedFilter> {
  const res = await fetch('/api/mail/filters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filter),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save filter');
  }
  return res.json();
}

async function deleteFilter(filterId: string): Promise<void> {
  const res = await fetch(`/api/mail/filters?id=${encodeURIComponent(filterId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete filter');
  }
}

async function getFilterRules(): Promise<AutoSortRule[]> {
  const res = await fetch('/api/mail/filters/rules');
  if (!res.ok) {
    throw new Error('Failed to load rules');
  }
  return res.json();
}

async function saveFilterRule(rule: { id?: string; name: string; enabled: boolean; filterGroup: any; actions: any[]; applyToExisting?: boolean }): Promise<AutoSortRule> {
  const res = await fetch('/api/mail/filters/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to save rule');
  }
  return res.json();
}

async function deleteFilterRule(ruleId: string): Promise<void> {
  const res = await fetch(`/api/mail/filters/rules?id=${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete rule');
  }
}

function FiltersTab() {
  const queryClient = useQueryClient();
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterQuery, setNewFilterQuery] = useState('');
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoSortRule | undefined>();
  const { data: filters = [], isLoading: filtersLoading } = useQuery({
    queryKey: ['saved-filters'],
    queryFn: getSavedFilters,
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['filter-rules'],
    queryFn: getFilterRules,
  });

  const { data: folders = [] } = useQuery<Folder[]>({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await fetch('/api/mail/folders');
      if (!res.ok) throw new Error('Failed to load folders');
      return res.json();
    },
  });

  const createFilterMutation = useMutation({
    mutationFn: saveFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      setNewFilterName('');
      setNewFilterQuery('');
      toast.success('Фильтр сохранён');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка сохранения фильтра');
    },
  });

  const deleteFilterMutation = useMutation({
    mutationFn: deleteFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      toast.success('Фильтр удалён');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка удаления фильтра');
    },
  });

  const handleCreateFilter = () => {
    if (!newFilterName.trim() || !newFilterQuery.trim()) {
      toast.error('Введите название и запрос фильтра');
      return;
    }
    createFilterMutation.mutate({
      name: newFilterName.trim(),
      query: newFilterQuery.trim(),
      isPinned: false,
    });
  };

  const handleDeleteFilter = (filterId: string, filterName: string) => {
    if (confirm(`Вы уверены, что хотите удалить фильтр "${filterName}"?`)) {
      deleteFilterMutation.mutate(filterId);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Сохранённые фильтры</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              placeholder="Название фильтра"
            />
            <Input
              value={newFilterQuery}
              onChange={(e) => setNewFilterQuery(e.target.value)}
              placeholder="Запрос фильтра (например: from:amazon has:attachment)"
            />
            <Button onClick={handleCreateFilter} disabled={createFilterMutation.isPending}>
              {createFilterMutation.isPending ? 'Создание...' : 'Создать фильтр'}
            </Button>
          </div>

          {filtersLoading && <p className="text-sm text-muted-foreground">Загрузка фильтров...</p>}
          {!filtersLoading && filters.length === 0 && (
            <p className="text-sm text-muted-foreground">Нет сохранённых фильтров</p>
          )}
          {!filtersLoading && filters.length > 0 && (
            <div className="space-y-2">
              {filters.map((filter) => (
                <div
                  key={filter.id}
                  className="flex items-center justify-between rounded-md border bg-card p-3"
                >
                  <div className="flex-1">
                    <div className="font-medium">{filter.name}</div>
                    <div className="text-sm text-muted-foreground">{filter.query}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteFilter(filter.id, filter.name)}
                    disabled={deleteFilterMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Правила авто-сортировки</h2>
          <Button
            onClick={() => {
              setEditingRule(undefined);
              setRuleEditorOpen(true);
            }}
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Создать правило
          </Button>
        </div>
        <div className="space-y-4">
          {rulesLoading && <p className="text-sm text-muted-foreground">Загрузка правил...</p>}
          {!rulesLoading && rules.length === 0 && (
            <p className="text-sm text-muted-foreground">Нет правил авто-сортировки</p>
          )}
          {!rulesLoading && rules.length > 0 && (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-md border bg-card p-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{rule.name}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          rule.enabled ? 'bg-green-500/20 text-green-600' : 'bg-gray-500/20 text-gray-600'
                        }`}
                      >
                        {rule.enabled ? 'Включено' : 'Выключено'}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Действий: {rule.actions.length}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingRule(rule);
                        setRuleEditorOpen(true);
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Вы уверены, что хотите удалить правило "${rule.name}"?`)) {
                          deleteFilterRule(rule.id).then(() => {
                            queryClient.invalidateQueries({ queryKey: ['filter-rules'] });
                            toast.success('Правило удалено');
                          }).catch((error: Error) => {
                            toast.error(error.message || 'Ошибка удаления правила');
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Правила авто-сортировки позволяют автоматически выполнять действия с письмами на основе условий.
          </p>
        </div>
      </div>
      <AutoSortRuleEditor
        open={ruleEditorOpen}
        onClose={() => {
          setRuleEditorOpen(false);
          setEditingRule(undefined);
        }}
        onSave={async (ruleData) => {
          const rule = editingRule
            ? await saveFilterRule({ ...ruleData, id: editingRule.id })
            : await saveFilterRule(ruleData);
          queryClient.invalidateQueries({ queryKey: ['filter-rules'] });
          if (rule.applyToExisting) {
            toast.info('Применение правила к существующим письмам...');
            try {
              const res = await fetch('/api/mail/filters/rules/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ruleId: rule.id }),
              });
              if (!res.ok) throw new Error('Failed to apply rule');
              toast.success('Правило применено к существующим письмам');
            } catch (error) {
              toast.error('Ошибка применения правила к существующим письмам');
            }
          }
        }}
        folders={folders}
        existingRule={editingRule}
      />
    </div>
  );
}

function InterfaceTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>(() => initialSettings.ui?.density || 'comfortable');
  const [messagesPerPage, setMessagesPerPage] = useState(() => initialSettings.ui?.messagesPerPage || 50);
  const [sortBy, setSortBy] = useState<'date' | 'from' | 'subject' | 'size'>(() => initialSettings.ui?.sortBy || 'date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => initialSettings.ui?.sortOrder || 'desc');
  const [groupBy, setGroupBy] = useState<'none' | 'date' | 'sender'>(() => initialSettings.ui?.groupBy || 'none');

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({
      ...initialSettings,
      ui: {
        density,
        messagesPerPage,
        sortBy,
        sortOrder,
        groupBy,
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Настройки интерфейса сохранены');
    },
    onError: () => {
      toast.error('Ошибка сохранения настроек интерфейса');
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Настройки интерфейса</h2>
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="density" className="text-sm font-medium">Плотность отображения</label>
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => setDensity('compact')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                  density === 'compact'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className={`font-medium ${density === 'compact' ? 'text-primary' : 'text-foreground'}`}>
                  Компактный
                </span>
                <span className="text-xs text-muted-foreground">Больше писем на экране</span>
              </button>
              <button
                onClick={() => setDensity('comfortable')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                  density === 'comfortable'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className={`font-medium ${density === 'comfortable' ? 'text-primary' : 'text-foreground'}`}>
                  Обычный
                </span>
                <span className="text-xs text-muted-foreground">Сбалансированный вид</span>
              </button>
              <button
                onClick={() => setDensity('spacious')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                  density === 'spacious'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className={`font-medium ${density === 'spacious' ? 'text-primary' : 'text-foreground'}`}>
                  Просторный
                </span>
                <span className="text-xs text-muted-foreground">Больше пространства</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="messagesPerPage" className="text-sm font-medium">Количество писем на странице</label>
            <Input
              id="messagesPerPage"
              type="number"
              min="10"
              max="100"
              value={messagesPerPage}
              onChange={(e) => setMessagesPerPage(Math.max(10, Math.min(100, parseInt(e.target.value, 10) || 50)))}
            />
            <p className="text-xs text-muted-foreground">
              От 10 до 100 писем на странице
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="sortBy" className="text-sm font-medium">Сортировка по</label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'from' | 'subject' | 'size')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="date">Дате</option>
              <option value="from">Отправителю</option>
              <option value="subject">Теме</option>
              <option value="size">Размеру</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="sortOrder" className="text-sm font-medium">Порядок сортировки</label>
            <div className="flex gap-4">
              <button
                onClick={() => setSortOrder('desc')}
                className={`flex-1 rounded-lg border-2 p-3 transition-all ${
                  sortOrder === 'desc'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className={`font-medium ${sortOrder === 'desc' ? 'text-primary' : 'text-foreground'}`}>
                  По убыванию
                </span>
              </button>
              <button
                onClick={() => setSortOrder('asc')}
                className={`flex-1 rounded-lg border-2 p-3 transition-all ${
                  sortOrder === 'asc'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <span className={`font-medium ${sortOrder === 'asc' ? 'text-primary' : 'text-foreground'}`}>
                  По возрастанию
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="groupBy" className="text-sm font-medium">Группировка писем</label>
            <select
              id="groupBy"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'none' | 'date' | 'sender')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="none">Без группировки</option>
              <option value="date">По дате</option>
              <option value="sender">По отправителю</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Группировка писем в списке для удобной навигации
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}

function AdvancedTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [forwardingEnabled, setForwardingEnabled] = useState(() => initialSettings.forwarding?.enabled || false);
  const [forwardingEmail, setForwardingEmail] = useState(() => initialSettings.forwarding?.email || '');
  const [keepCopy, setKeepCopy] = useState(() => initialSettings.forwarding?.keepCopy ?? true);
  const [aliases, setAliases] = useState(() => initialSettings.aliases || []);
  const [newAliasEmail, setNewAliasEmail] = useState('');
  const [newAliasName, setNewAliasName] = useState('');
  const [language, setLanguage] = useState<'ru' | 'en'>(() => initialSettings.locale?.language || 'ru');
  const [dateFormat, setDateFormat] = useState<'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'>(() => initialSettings.locale?.dateFormat || 'DD.MM.YYYY');
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>(() => initialSettings.locale?.timeFormat || '24h');
  const [timezone, setTimezone] = useState(() => initialSettings.locale?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);

  const timezones = useMemo(() => {
    return Intl.supportedValuesOf('timeZone');
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({
      ...initialSettings,
      forwarding: {
        enabled: forwardingEnabled,
        email: forwardingEmail,
        keepCopy,
      },
      aliases: aliases.map((alias) => ({
        id: alias.id,
        email: alias.email,
        name: alias.name && alias.name.trim() ? alias.name.trim() : undefined,
      })),
      locale: {
        language,
        dateFormat,
        timeFormat,
        timezone,
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Настройки сохранены');
    },
    onError: (error: Error) => {
      console.error('Settings save error:', error);
      toast.error(error.message || 'Ошибка сохранения настроек');
    },
  });

  const handleSave = () => {
    if (forwardingEnabled && !forwardingEmail) {
      toast.error('Введите email для пересылки');
      return;
    }
    saveMutation.mutate();
  };

  const handleAddAlias = () => {
    if (!newAliasEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newAliasEmail)) {
      toast.error('Введите корректный email');
      return;
    }
    if (aliases.some((a) => a.email === newAliasEmail)) {
      toast.error('Такой алиас уже существует');
      return;
    }
    setAliases([...aliases, { 
      id: Date.now().toString(), 
      email: newAliasEmail.trim(), 
      name: newAliasName.trim() || undefined 
    }]);
    setNewAliasEmail('');
    setNewAliasName('');
  };

  const handleDeleteAlias = (id: string) => {
    setAliases(aliases.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Расширенные настройки</h2>
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Forward className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Пересылка писем</h3>
            </div>
            <div className="space-y-4 pl-7">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="forwardingEnabled"
                  checked={forwardingEnabled}
                  onChange={(e) => setForwardingEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="forwardingEnabled" className="text-sm font-medium">
                  Включить пересылку писем
                </label>
              </div>

              {forwardingEnabled && (
                <div className="space-y-4 pl-6">
                  <div className="space-y-2">
                    <label htmlFor="forwardingEmail" className="text-sm font-medium">Email для пересылки</label>
                    <Input
                      id="forwardingEmail"
                      type="email"
                      value={forwardingEmail}
                      onChange={(e) => setForwardingEmail(e.target.value)}
                      placeholder="example@domain.com"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="keepCopy"
                      checked={keepCopy}
                      onChange={(e) => setKeepCopy(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <label htmlFor="keepCopy" className="text-sm font-medium">
                      Сохранять копию в почтовом ящике
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AtSign className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Алиасы email</h3>
            </div>
            <div className="space-y-4 pl-7">
              <div className="flex gap-2">
                <Input
                  value={newAliasEmail}
                  onChange={(e) => setNewAliasEmail(e.target.value)}
                  placeholder="alias@domain.com"
                  className="flex-1"
                />
                <Input
                  value={newAliasName}
                  onChange={(e) => setNewAliasName(e.target.value)}
                  placeholder="Имя (необязательно)"
                  className="flex-1"
                />
                <Button onClick={handleAddAlias} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить
                </Button>
              </div>
              {aliases.length > 0 && (
                <div className="space-y-2">
                  {aliases.map((alias) => (
                    <div
                      key={alias.id}
                      className="flex items-center justify-between rounded-md border bg-card p-3"
                    >
                      <div>
                        <div className="font-medium">{alias.email}</div>
                        {alias.name && (
                          <div className="text-sm text-muted-foreground">{alias.name}</div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteAlias(alias.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Язык и региональные настройки</h3>
            </div>
            <div className="space-y-4 pl-7">
              <div className="space-y-2">
                <label htmlFor="language" className="text-sm font-medium">Язык интерфейса</label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'ru' | 'en')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="dateFormat" className="text-sm font-medium">Формат даты</label>
                <select
                  id="dateFormat"
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value as 'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="DD.MM.YYYY">DD.MM.YYYY (31.12.2024)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2024)</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD (2024-12-31)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="timeFormat" className="text-sm font-medium">Формат времени</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setTimeFormat('24h')}
                    className={`flex-1 rounded-lg border-2 p-3 transition-all ${
                      timeFormat === '24h'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <span className={`font-medium ${timeFormat === '24h' ? 'text-primary' : 'text-foreground'}`}>
                      24 часа (14:30)
                    </span>
                  </button>
                  <button
                    onClick={() => setTimeFormat('12h')}
                    className={`flex-1 rounded-lg border-2 p-3 transition-all ${
                      timeFormat === '12h'
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <span className={`font-medium ${timeFormat === '12h' ? 'text-primary' : 'text-foreground'}`}>
                      12 часов (2:30 PM)
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="timezone" className="text-sm font-medium">Часовой пояс</label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Текущий часовой пояс: {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
        </Button>
      </div>
    </div>
  );
}

function FoldersTab() {
  const queryClient = useQueryClient();
  const [newFolderName, setNewFolderName] = useState('');
  const { data: folders = [], isLoading } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

  const createMutation = useMutation({
    mutationFn: createFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setNewFolderName('');
      toast.success('Папка создана');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка создания папки');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success('Папка удалена');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка удаления папки');
    },
  });

  const handleCreate = () => {
    if (!newFolderName.trim()) {
      toast.error('Введите название папки');
      return;
    }
    createMutation.mutate(newFolderName.trim());
  };

  const handleDelete = (folderId: string, folderName: string, role: string) => {
    if (role !== 'custom') {
      toast.error('Нельзя удалить системную папку');
      return;
    }
    if (confirm(`Вы уверены, что хотите удалить папку "${folderName}"?`)) {
      deleteMutation.mutate(folderId);
    }
  };

  const customFolders = folders.filter((f) => f.role === 'custom');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Пользовательские папки</h2>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Название новой папки"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
            />
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Создание...' : 'Создать'}
            </Button>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Загрузка папок...</p>}
          {!isLoading && customFolders.length === 0 && (
            <p className="text-sm text-muted-foreground">Нет пользовательских папок</p>
          )}
          {!isLoading && customFolders.length > 0 && (
            <div className="space-y-2">
              {customFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between rounded-md border bg-card p-3"
                >
                  <span className="text-sm font-medium">{folder.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(folder.id, folder.name, folder.role)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('signature');
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });
  
  const currentTheme = settings?.theme || 'light';
  const tabs = getTabs(currentTheme);

  if (isLoading || !settings) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
          <p className="text-muted-foreground">Загрузка настроек...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b bg-card p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/mail')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Настройки</h1>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 border-r bg-muted/30">
          <nav className="p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'bg-background font-medium'
                    : 'hover:bg-muted/50'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-2xl">
            {activeTab === 'signature' && <SignatureTab initialSettings={settings} />}
            {activeTab === 'theme' && <ThemeTab initialSettings={settings} />}
            {activeTab === 'autoReply' && <AutoReplyTab initialSettings={settings} />}
            {activeTab === 'interface' && <InterfaceTab initialSettings={settings} />}
            {activeTab === 'advanced' && <AdvancedTab initialSettings={settings} />}
            {activeTab === 'folders' && <FoldersTab />}
            {activeTab === 'filters' && <FiltersTab />}
            {activeTab === 'contacts' && <ContactsManager />}
          </div>
        </div>
      </div>
    </div>
  );
}
