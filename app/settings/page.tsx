'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, FolderPlus, Trash2, Sun, Moon, Filter, Plus, Edit2, Users, Layout, Globe, Clock, Forward, AtSign, Star, Activity, Shield, AlertTriangle, CheckCircle2, XCircle, Tag, Upload, FileText, Bell, BarChart3, Database, Archive, Accessibility, Keyboard, ChevronRight, Rss, Key, HelpCircle, Code2, RotateCcw } from 'lucide-react';
import type { Folder, SavedFilter, AutoSortRule, SieveScript } from '@/lib/types';
import { AutoSortRuleEditor } from '@/components/auto-sort-rule-editor';
import { SieveScriptEditor } from '@/components/sieve-script-editor';
import { ContactsManager } from '@/components/contacts-manager';
import { MonitoringDashboard } from '@/components/monitoring-dashboard';
import { LabelsManager } from '@/components/labels-manager';
import { EmailImport } from '@/components/email-import';
import { EmailTemplatesManager } from '@/components/email-templates-manager';
import { StatisticsDashboard } from '@/components/statistics-dashboard';
import { BackupRestore } from '@/components/backup-restore';
import { AutoArchiveSettings } from '@/components/auto-archive-settings';
import { AccessibilitySettings } from '@/components/accessibility-settings';
import { CustomHotkeysSettings } from '@/components/custom-hotkeys-settings';
import { SubscriptionManager } from '@/components/subscription-manager';
import { PGPManager } from '@/components/pgp-manager';

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
  notifications?: {
    enabled: boolean;
    browser: boolean;
    sound: boolean;
    onlyImportant?: boolean;
  };
  customTheme?: {
    name: string;
    colors: {
      primary?: string;
      secondary?: string;
      accent?: string;
      background?: string;
      foreground?: string;
    };
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

async function createFolder(name: string, parentId?: string): Promise<Folder> {
  const res = await fetch('/api/mail/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentId }),
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

type TabId = 'signature' | 'theme' | 'autoReply' | 'folders' | 'filters' | 'sieve' | 'contacts' | 'interface' | 'advanced' | 'monitoring' | 'labels' | 'import' | 'templates' | 'notifications' | 'statistics' | 'backup' | 'archive' | 'accessibility' | 'hotkeys' | 'subscriptions' | 'pgp';

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
    { id: 'notifications', label: 'Уведомления', icon: <Bell className="h-4 w-4" /> },
    { id: 'accessibility', label: 'Доступность', icon: <Accessibility className="h-4 w-4" /> },
    { id: 'hotkeys', label: 'Горячие клавиши', icon: <Keyboard className="h-4 w-4" /> },
    { id: 'subscriptions', label: 'Подписки', icon: <Rss className="h-4 w-4" /> },
    { id: 'pgp', label: 'PGP/GPG', icon: <Key className="h-4 w-4" /> },
    { id: 'advanced', label: 'Расширенные', icon: <Globe className="h-4 w-4" /> },
    { id: 'folders', label: 'Папки', icon: <FolderPlus className="h-4 w-4" /> },
    { id: 'labels', label: 'Метки', icon: <Tag className="h-4 w-4" /> },
    { id: 'filters', label: 'Фильтры', icon: <Filter className="h-4 w-4" /> },
    { id: 'sieve', label: 'Sieve-скрипты', icon: <Code2 className="h-4 w-4" /> },
    { id: 'contacts', label: 'Контакты', icon: <Users className="h-4 w-4" /> },
    { id: 'templates', label: 'Шаблоны', icon: <FileText className="h-4 w-4" /> },
    { id: 'import', label: 'Импорт', icon: <Upload className="h-4 w-4" /> },
    { id: 'statistics', label: 'Статистика', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'backup', label: 'Резервное копирование', icon: <Database className="h-4 w-4" /> },
    { id: 'archive', label: 'Архивация', icon: <Archive className="h-4 w-4" /> },
    { id: 'monitoring', label: 'Мониторинг', icon: <Activity className="h-4 w-4" /> },
  ];
}

function SignatureTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [signatures, setSignatures] = useState<Signature[]>(() => initialSettings.signatures || []);
  const [newSignatureName, setNewSignatureName] = useState('');
  const [newSignatureContent, setNewSignatureContent] = useState('');
  const [newSignatureContext, setNewSignatureContext] = useState<'work' | 'personal' | 'autoReply' | 'general'>('general');

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({ ...initialSettings, signatures }),
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Подписи</h3>
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

const PRESET_THEMES = [
  { id: 'blue', name: 'Синяя', icon: '💙' },
  { id: 'green', name: 'Зеленая', icon: '💚' },
  { id: 'purple', name: 'Фиолетовая', icon: '💜' },
  { id: 'orange', name: 'Оранжевая', icon: '🧡' },
];

function ThemeTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => initialSettings.theme || 'light');
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    // If custom theme is saved, use its name, otherwise use the base theme
    if (initialSettings.customTheme?.name) {
      return initialSettings.customTheme.name;
    }
    return initialSettings.theme || 'light';
  });
  const [customColors, setCustomColors] = useState(() => initialSettings.customTheme?.colors || {});
  const [showCustom, setShowCustom] = useState(false);

  // Sync state with initialSettings when they change
  useEffect(() => {
    console.log('[ThemeTab] Loading settings:', {
      theme: initialSettings.theme,
      customTheme: initialSettings.customTheme,
    });
    setTheme(initialSettings.theme || 'light');
    if (initialSettings.customTheme?.name) {
      setSelectedPreset(initialSettings.customTheme.name);
      setCustomColors(initialSettings.customTheme.colors || {});
    } else {
      setSelectedPreset(initialSettings.theme || 'light');
      setCustomColors({});
    }
  }, [initialSettings.theme, initialSettings.customTheme]);

  const hexToHsl = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const applyTheme = (themeId: string, colors?: { primary?: string; secondary?: string; accent?: string }) => {
    const root = document.documentElement;
    
    if (themeId === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    if (colors) {
      if (colors.primary) {
        const hsl = hexToHsl(colors.primary);
        root.style.setProperty('--primary', hsl);
      }
      if (colors.secondary) {
        const hsl = hexToHsl(colors.secondary);
        root.style.setProperty('--secondary', hsl);
      }
      if (colors.accent) {
        const hsl = hexToHsl(colors.accent);
        root.style.setProperty('--accent', hsl);
      }
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--secondary');
      root.style.removeProperty('--accent');
    }
  };

  // Apply saved theme and colors on mount
  useEffect(() => {
    const savedTheme = initialSettings.theme || 'light';
    const savedCustomTheme = initialSettings.customTheme;

    if (savedCustomTheme?.colors) {
      applyTheme(savedTheme, savedCustomTheme.colors);
    } else {
      applyTheme(savedTheme);
    }
  }, []); // Run only on mount

  const saveMutation = useMutation({
    mutationFn: (settings: UserSettings) => {
      console.log('[ThemeTab] Saving settings:', {
        theme: settings.theme,
        customTheme: settings.customTheme,
      });
      return saveSettings(settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Тема сохранена');
    },
    onError: (error) => {
      console.error('[ThemeTab] Save error:', error);
      toast.error('Ошибка сохранения темы');
    },
  });

  const getPresetColors = (presetId: string) => {
    const presets: Record<string, { primary?: string; secondary?: string; accent?: string }> = {
      blue: { primary: '#3b82f6', accent: '#60a5fa' },
      green: { primary: '#10b981', accent: '#34d399' },
      purple: { primary: '#8b5cf6', accent: '#a78bfa' },
      orange: { primary: '#f59e0b', accent: '#fbbf24' },
    };
    return presets[presetId] || {};
  };

  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    setShowCustom(false);

    // Apply color scheme to current theme
    const presetColors = getPresetColors(presetId);
    applyTheme(theme, presetColors);
    saveMutation.mutate({
      ...initialSettings,
      theme,
      customTheme: { name: presetId, colors: presetColors },
    });
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);

    // Check if we have a color scheme active
    const hasColorScheme = selectedPreset !== 'light' && selectedPreset !== 'dark';

    if (hasColorScheme) {
      // Keep the color scheme when changing base theme
      const colors = selectedPreset === 'custom' ? customColors : getPresetColors(selectedPreset);
      applyTheme(newTheme, colors);
      saveMutation.mutate({
        ...initialSettings,
        theme: newTheme,
        customTheme: { name: selectedPreset, colors },
      });
    } else {
      // No color scheme, just change base theme
      setSelectedPreset(newTheme);
      applyTheme(newTheme);
      saveMutation.mutate({
        ...initialSettings,
        theme: newTheme,
        customTheme: undefined,
      });
    }
  };

  const handleCustomColorChange = (colorType: 'primary' | 'secondary' | 'accent', value: string) => {
    const newColors = { ...customColors, [colorType]: value };
    setCustomColors(newColors);
    applyTheme(theme, newColors);
  };

  const handleSaveCustom = () => {
    saveMutation.mutate({
      ...initialSettings,
      theme,
      customTheme: { name: 'custom', colors: customColors },
    });
    setSelectedPreset('custom');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Тема оформления</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-3">Базовые темы</h3>
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
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Цветовые схемы</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {PRESET_THEMES.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                    selectedPreset === preset.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <span className="text-2xl">{preset.icon}</span>
                  <span className={`text-sm font-medium ${selectedPreset === preset.id ? 'text-primary' : 'text-foreground'}`}>
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">Кастомная цветовая схема</h3>
            <Button
              variant="outline"
              onClick={() => setShowCustom(!showCustom)}
              className="w-full"
            >
              {showCustom ? 'Скрыть настройки' : 'Показать настройки цветов'}
            </Button>
            {showCustom && (
              <div className="mt-4 space-y-4 p-4 rounded-lg border bg-card">
                <div>
                  <label className="text-sm font-medium mb-2 block">Основной цвет</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.primary || '#3b82f6'}
                      onChange={(e) => handleCustomColorChange('primary', e.target.value)}
                      className="h-10 w-20 rounded border cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={customColors.primary || '#3b82f6'}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                          handleCustomColorChange('primary', value);
                        }
                      }}
                      placeholder="#3b82f6"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Вторичный цвет</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.secondary || '#64748b'}
                      onChange={(e) => handleCustomColorChange('secondary', e.target.value)}
                      className="h-10 w-20 rounded border cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={customColors.secondary || '#64748b'}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                          handleCustomColorChange('secondary', value);
                        }
                      }}
                      placeholder="#64748b"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Акцентный цвет</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customColors.accent || '#8b5cf6'}
                      onChange={(e) => handleCustomColorChange('accent', e.target.value)}
                      className="h-10 w-20 rounded border cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={customColors.accent || '#8b5cf6'}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                          handleCustomColorChange('accent', value);
                        }
                      }}
                      placeholder="#8b5cf6"
                      className="flex-1"
                    />
                  </div>
                </div>
                <Button onClick={handleSaveCustom} className="w-full">
                  Сохранить кастомную схему
                </Button>
              </div>
            )}
          </div>
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

async function saveFilterRule(rule: { id?: string; name: string; enabled: boolean; conditions: any; actions: any[]; applyToExisting?: boolean }): Promise<AutoSortRule> {
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

async function syncRulesToSieve(): Promise<void> {
  const res = await fetch('/api/mail/filters/rules/sync-sieve', { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'Ошибка синхронизации');
  }
}

function FiltersTab() {
  const queryClient = useQueryClient();
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterQuery, setNewFilterQuery] = useState('');
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoSortRule | undefined>();
  const [isSyncingSieve, setIsSyncingSieve] = useState(false);
  const [isResettingProcessed, setIsResettingProcessed] = useState(false);
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
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Правила авто-сортировки</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Синтаксис фильтров для правил</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-semibold mb-2">📧 Поля для поиска по адресам</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">from:</code> - отправитель</li>
                      <li><code className="bg-muted px-1 rounded">to:</code> - получатель</li>
                      <li><code className="bg-muted px-1 rounded">cc:</code> - копия</li>
                      <li><code className="bg-muted px-1 rounded">bcc:</code> - скрытая копия</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">📝 Поля для поиска по содержимому</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">subject:</code> - тема письма</li>
                      <li><code className="bg-muted px-1 rounded">body:</code> - тело письма</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">📎 Вложения</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">has:attachment</code> - есть вложения</li>
                      <li><code className="bg-muted px-1 rounded">has:image</code> - есть изображения</li>
                      <li><code className="bg-muted px-1 rounded">has:document</code> - есть документы</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">🏷️ Статус письма</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">is:unread</code> - непрочитанное</li>
                      <li><code className="bg-muted px-1 rounded">is:read</code> - прочитанное</li>
                      <li><code className="bg-muted px-1 rounded">is:starred</code> - помеченное звездой</li>
                      <li><code className="bg-muted px-1 rounded">is:important</code> - важное</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">📅 Дата</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">after:2024-01-01</code> - после даты</li>
                      <li><code className="bg-muted px-1 rounded">before:7d</code> - до (7 дней назад)</li>
                      <li><code className="bg-muted px-1 rounded">after:today</code> - сегодня</li>
                      <li><code className="bg-muted px-1 rounded">after:yesterday</code> - вчера</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">📏 Размер</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">size:&gt;1MB</code> - больше 1 МБ</li>
                      <li><code className="bg-muted px-1 rounded">size:&gt;500KB</code> - больше 500 КБ</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">✨ Операторы</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">*</code> - подстановочный знак (любые символы)</li>
                      <li><code className="bg-muted px-1 rounded">OR</code> - логическое ИЛИ</li>
                      <li><code className="bg-muted px-1 rounded">-</code> - отрицание (исключить)</li>
                      <li><code className="bg-muted px-1 rounded">"точная фраза"</code> - точное совпадение</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">📚 Примеры</h3>
                    <div className="space-y-2 text-muted-foreground">
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">from:amazon</code>
                        <p className="text-xs pl-2">Все письма от адресов, содержащих "amazon"</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">from:*@amazon.com</code>
                        <p className="text-xs pl-2">Все письма от домена amazon.com</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">from:amazon OR from:ebay</code>
                        <p className="text-xs pl-2">Письма от Amazon ИЛИ от eBay</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">has:attachment size:&gt;1MB</code>
                        <p className="text-xs pl-2">Письма с вложениями больше 1 МБ</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">is:unread after:7d</code>
                        <p className="text-xs pl-2">Непрочитанные письма за последние 7 дней</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">subject:invoice -from:spam</code>
                        <p className="text-xs pl-2">Письма с "invoice" в теме, но не от spam</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">from:*@company.com subject:"quarterly report"</code>
                        <p className="text-xs pl-2">Письма от домена company.com с точной фразой в теме</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      💡 <strong>Совет:</strong> Используйте кавычки для точного поиска фраз с пробелами.
                      Комбинируйте несколько условий для создания мощных правил фильтрации!
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
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
          <Button
            variant="outline"
            size="sm"
            disabled={isSyncingSieve}
            onClick={async () => {
              setIsSyncingSieve(true);
              try {
                await syncRulesToSieve();
                queryClient.invalidateQueries({ queryKey: ['sieve-scripts'] });
                toast.success('Правила синхронизированы в Sieve-скрипт');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Ошибка синхронизации с Sieve');
              } finally {
                setIsSyncingSieve(false);
              }
            }}
          >
            <Code2 className="h-4 w-4 mr-2" />
            {isSyncingSieve ? 'Синхронизация...' : 'Синхронизировать в Sieve'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isResettingProcessed}
            onClick={async () => {
              setIsResettingProcessed(true);
              try {
                const res = await fetch('/api/mail/filters/rules/reset-processed', { method: 'POST' });
                if (!res.ok) throw new Error('Ошибка сброса кэша');
                toast.success('Кэш обработанных писем сброшен. При следующем запуске авто-сортировки все письма будут проверены заново.');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Ошибка сброса кэша');
              } finally {
                setIsResettingProcessed(false);
              }
            }}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {isResettingProcessed ? 'Сброс...' : 'Сбросить кэш авто-сортировки'}
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
          try {
            const rule = editingRule
              ? await saveFilterRule({ ...ruleData, id: editingRule.id })
              : await saveFilterRule(ruleData);
            queryClient.invalidateQueries({ queryKey: ['filter-rules'] });
            queryClient.invalidateQueries({ queryKey: ['sieve-scripts'] });

            if (rule.applyToExisting) {
              toast.success('Правило сохранено. Применение к существующим письмам запущено в фоне.');
              // Fire-and-forget: don't await so the UI is never blocked
              fetch('/api/mail/filters/rules/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ruleId: rule.id }),
              }).catch(() => {
                // Errors are logged server-side; background job will retry via daemon
              });
            } else {
              toast.success('Правило сохранено и синхронизировано в Sieve');
            }
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Ошибка сохранения правила');
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

function NotificationsTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => initialSettings.notifications?.enabled ?? true);
  const [browserNotifications, setBrowserNotifications] = useState(() => initialSettings.notifications?.browser ?? true);
  const [soundNotifications, setSoundNotifications] = useState(() => initialSettings.notifications?.sound ?? false);
  const [onlyImportant, setOnlyImportant] = useState(() => initialSettings.notifications?.onlyImportant ?? false);

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({
      ...initialSettings,
      notifications: {
        enabled: notificationsEnabled,
        browser: browserNotifications,
        sound: soundNotifications,
        onlyImportant,
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Настройки уведомлений сохранены');
      
      if (browserNotifications && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            toast.success('Разрешение на уведомления получено');
          } else if (permission === 'denied') {
            toast.error('Уведомления заблокированы. Разрешите их в настройках браузера.');
          }
        });
      }
    },
    onError: () => {
      toast.error('Ошибка сохранения настроек уведомлений');
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleRequestPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          setBrowserNotifications(true);
          toast.success('Разрешение на уведомления получено');
        } else if (permission === 'denied') {
          toast.error('Уведомления заблокированы');
        }
      });
    } else {
      toast.error('Браузер не поддерживает уведомления');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Уведомления</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="notificationsEnabled"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="notificationsEnabled" className="text-sm font-medium">
              Включить уведомления
            </label>
          </div>

          {notificationsEnabled && (
            <div className="space-y-4 pl-6">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="browserNotifications"
                  checked={browserNotifications}
                  onChange={(e) => setBrowserNotifications(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="browserNotifications" className="text-sm font-medium">
                  Браузерные уведомления
                </label>
                {browserNotifications && 'Notification' in window && Notification.permission === 'default' && (
                  <Button variant="outline" size="sm" onClick={handleRequestPermission}>
                    Запросить разрешение
                  </Button>
                )}
                {browserNotifications && 'Notification' in window && Notification.permission === 'denied' && (
                  <span className="text-xs text-destructive">Уведомления заблокированы</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="soundNotifications"
                  checked={soundNotifications}
                  onChange={(e) => setSoundNotifications(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="soundNotifications" className="text-sm font-medium">
                  Звуковые уведомления
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="onlyImportant"
                  checked={onlyImportant}
                  onChange={(e) => setOnlyImportant(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="onlyImportant" className="text-sm font-medium">
                  Только для важных писем
                </label>
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

function AdvancedTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const [forwardingEnabled, setForwardingEnabled] = useState(() => initialSettings.forwarding?.enabled || false);
  const [forwardingEmail, setForwardingEmail] = useState(() => initialSettings.forwarding?.email || '');
  const [keepCopy, setKeepCopy] = useState(() => initialSettings.forwarding?.keepCopy ?? true);
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
        email: forwardingEnabled ? forwardingEmail.trim() : '',
        keepCopy,
      },
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
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Алиасы могут быть созданы в административном интерфейсе почтового сервера.
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

function ImportTab() {
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Импорт писем</h2>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Импортируйте письма из EML файлов в ваш почтовый ящик. Вы можете выбрать папку для импорта.
          </p>
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Импортировать письма
          </Button>
        </div>
      </div>
      <EmailImport open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function SieveTab() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<SieveScript | undefined>(undefined);

  const { data: scripts = [], isLoading } = useQuery<SieveScript[]>({
    queryKey: ['sieve-scripts'],
    queryFn: async () => {
      const res = await fetch('/api/mail/sieve');
      if (!res.ok) throw new Error('Не удалось загрузить Sieve-скрипты');
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (params: { id?: string; name: string | null; content: string; activate: boolean }) => {
      const res = await fetch('/api/mail/sieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Ошибка сохранения');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sieve-scripts'] });
      toast.success('Sieve-скрипт сохранён');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка сохранения Sieve-скрипта');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/mail/sieve?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Не удалось удалить скрипт');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sieve-scripts'] });
      toast.success('Sieve-скрипт удалён');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка удаления');
    },
  });

  const handleEdit = (script: SieveScript) => {
    setEditingScript(script);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    setEditingScript(undefined);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sieve-скрипты</h2>
          <p className="text-sm text-muted-foreground">
            Скрипты выполняются на сервере Stalwart при доставке новых писем
          </p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Создать скрипт
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {!isLoading && scripts.length === 0 && (
        <p className="text-sm text-muted-foreground">Нет Sieve-скриптов. Создайте первый.</p>
      )}

      <div className="space-y-2">
        {scripts.map((script) => (
          <div
            key={script.id}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Code2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{script.name || 'Скрипт без названия'}</p>
                {script.isActive && (
                  <span className="text-xs text-green-600 font-medium">Активен</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <Button variant="ghost" size="sm" onClick={() => handleEdit(script)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteMutation.mutate(script.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <SieveScriptEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={(params) => saveMutation.mutateAsync(params)}
        existing={editingScript}
      />
    </div>
  );
}

function FoldersTab() {
  const queryClient = useQueryClient();
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string>('');
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [editFolderParentId, setEditFolderParentId] = useState<string>('');
  const { data: folders = [], isLoading } = useQuery({
    queryKey: ['folders'],
    queryFn: getFolders,
  });

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

  const createMutation = useMutation({
    mutationFn: (data: { name: string; parentId?: string }) => createFolder(data.name, data.parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setNewFolderName('');
      setNewFolderParentId('');
      toast.success('Папка создана');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка создания папки');
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, name, parentId }: { id: string; name: string; parentId?: string }) => {
      const res = await fetch(`/api/mail/folders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update folder');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      setEditingFolder(null);
      setEditFolderName('');
      setEditFolderParentId('');
      toast.success('Папка обновлена');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка обновления папки');
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
    createMutation.mutate({
      name: newFolderName.trim(),
      parentId: newFolderParentId || undefined,
    });
  };

  const handleEdit = (folder: Folder) => {
    setEditingFolder(folder);
    setEditFolderName(folder.name);
    setEditFolderParentId(folder.parentId || '');
  };

  const handleSaveEdit = () => {
    if (!editingFolder || !editFolderName.trim()) {
      toast.error('Введите название папки');
      return;
    }
    if (editFolderParentId === editingFolder.id) {
      toast.error('Папка не может быть родительской для самой себя');
      return;
    }
    updateFolderMutation.mutate({
      id: editingFolder.id,
      name: editFolderName.trim(),
      parentId: editFolderParentId || undefined,
    });
  };

  const renderFolderTree = (folder: Folder & { children?: Folder[] }, level = 0): React.ReactNode => {
    return (
      <div key={folder.id}>
        <div
          className={`flex items-center justify-between rounded-md border bg-card p-3 ${
            level > 0 ? 'ml-6' : ''
          }`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {folder.children && folder.children.length > 0 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium truncate">{folder.name}</span>
            {folder.parentId && (
              <span className="text-xs text-muted-foreground">(подпапка)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(folder)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(folder.id, folder.name, folder.role)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {folder.children?.map((child) => renderFolderTree(child, level + 1))}
      </div>
    );
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
          {!isLoading && organizedFolders.filter((f) => f.role === 'custom').length === 0 && (
            <p className="text-sm text-muted-foreground">Нет пользовательских папок</p>
          )}
          {!isLoading && organizedFolders.filter((f) => f.role === 'custom').length > 0 && (
            <div className="space-y-2">
              {organizedFolders
                .filter((f) => f.role === 'custom')
                .map((folder) => renderFolderTree(folder))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
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
          <Button variant="ghost" size="icon" onClick={() => router.push(`/${locale}/mail`)}>
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
            {activeTab === 'notifications' && <NotificationsTab initialSettings={settings} />}
            {activeTab === 'accessibility' && <AccessibilitySettings />}
            {activeTab === 'hotkeys' && <CustomHotkeysSettings />}
            {activeTab === 'subscriptions' && <SubscriptionManager />}
            {activeTab === 'pgp' && <PGPManager />}
            {activeTab === 'advanced' && <AdvancedTab initialSettings={settings} />}
            {activeTab === 'folders' && <FoldersTab />}
            {activeTab === 'labels' && <LabelsManager />}
            {activeTab === 'filters' && <FiltersTab />}
            {activeTab === 'sieve' && <SieveTab />}
            {activeTab === 'contacts' && <ContactsManager />}
            {activeTab === 'templates' && <EmailTemplatesManager />}
            {activeTab === 'import' && <ImportTab />}
            {activeTab === 'statistics' && <StatisticsDashboard />}
            {activeTab === 'backup' && <BackupRestore />}
            {activeTab === 'archive' && <AutoArchiveSettings />}
            {activeTab === 'monitoring' && <MonitoringDashboard />}
          </div>
        </div>
      </div>
    </div>
  );
}
