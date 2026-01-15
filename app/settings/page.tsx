'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, FolderPlus, Trash2, Sun, Moon, Filter, Plus, Edit2 } from 'lucide-react';
import type { Folder, SavedFilter, AutoSortRule } from '@/lib/types';
import { AutoSortRuleEditor } from '@/components/auto-sort-rule-editor';

interface UserSettings {
  signature: string;
  theme: 'light' | 'dark';
  autoReply: {
    enabled: boolean;
    subject: string;
    message: string;
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

type TabId = 'signature' | 'theme' | 'autoReply' | 'folders' | 'filters';

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
    { id: 'folders', label: 'Папки', icon: <FolderPlus className="h-4 w-4" /> },
    { id: 'filters', label: 'Фильтры', icon: <Filter className="h-4 w-4" /> },
  ];
}

function SignatureTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [signature, setSignature] = useState(() => initialSettings.signature || '');

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({ ...initialSettings, signature }),
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
        <h2 className="text-xl font-semibold mb-4">Подпись письма</h2>
          <div className="space-y-2">
            <label htmlFor="signature-text" className="text-sm font-medium">Текст подписи</label>
            <textarea
              id="signature-text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Введите текст подписи, которая будет добавляться к каждому отправляемому письму..."
              className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={5}
            />
          <p className="text-xs text-muted-foreground">
            Подпись будет автоматически добавляться в конец каждого отправляемого письма
          </p>
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

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({
      ...initialSettings,
      autoReply: {
        enabled: autoReplyEnabled,
        subject: autoReplySubject,
        message: autoReplyMessage,
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
            {activeTab === 'folders' && <FoldersTab />}
            {activeTab === 'filters' && <FiltersTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
