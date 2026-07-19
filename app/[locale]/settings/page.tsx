'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  SETTINGS_SECTION_IDS,
  getSettingsSectionFromPathname,
  getSettingsSectionHref,
  type SettingsSectionId,
} from '@/lib/settings-routes';
import { SettingsSectionError, SettingsSectionLoading } from '@/components/settings/settings-section-state';

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
  theme: 'light' | 'dark' | 'system';
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
  const res = await fetch('/api/settings', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to load settings');
  }
  return res.json();
}

async function saveSettings(settings: UserSettings): Promise<UserSettings> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    throw new Error('Failed to save settings');
  }
  return res.json();
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

type TabId = SettingsSectionId;

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

interface TabGroup {
  id: 'mail' | 'organization' | 'interface' | 'data' | 'security' | 'system';
  label: string;
  tabs: Tab[];
}

function getTabGroups(
  theme: UserSettings['theme'],
  tabLabels: Record<TabId, string>,
  groupLabels: Record<TabGroup['id'], string>,
): TabGroup[] {
  const themeIcon = theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />;

  return [
    { id: 'mail', label: groupLabels.mail, tabs: [
      { id: 'signature', label: tabLabels.signature, icon: <Mail className="h-4 w-4" /> },
      { id: 'autoReply', label: tabLabels.autoReply, icon: <RotateCcw className="h-4 w-4" /> },
      { id: 'advanced', label: tabLabels.advanced, icon: <Forward className="h-4 w-4" /> },
      { id: 'templates', label: tabLabels.templates, icon: <FileText className="h-4 w-4" /> },
    ] },
    { id: 'organization', label: groupLabels.organization, tabs: [
      { id: 'folders', label: tabLabels.folders, icon: <FolderPlus className="h-4 w-4" /> },
      { id: 'labels', label: tabLabels.labels, icon: <Tag className="h-4 w-4" /> },
      { id: 'filters', label: tabLabels.filters, icon: <Filter className="h-4 w-4" /> },
      { id: 'subscriptions', label: tabLabels.subscriptions, icon: <Rss className="h-4 w-4" /> },
      { id: 'archive', label: tabLabels.archive, icon: <Archive className="h-4 w-4" /> },
    ] },
    { id: 'interface', label: groupLabels.interface, tabs: [
      { id: 'theme', label: tabLabels.theme, icon: themeIcon },
      { id: 'interface', label: tabLabels.interface, icon: <Layout className="h-4 w-4" /> },
      { id: 'language', label: tabLabels.language, icon: <Globe className="h-4 w-4" /> },
      { id: 'notifications', label: tabLabels.notifications, icon: <Bell className="h-4 w-4" /> },
      { id: 'accessibility', label: tabLabels.accessibility, icon: <Accessibility className="h-4 w-4" /> },
      { id: 'hotkeys', label: tabLabels.hotkeys, icon: <Keyboard className="h-4 w-4" /> },
    ] },
    { id: 'data', label: groupLabels.data, tabs: [
      { id: 'contacts', label: tabLabels.contacts, icon: <Users className="h-4 w-4" /> },
      { id: 'import', label: tabLabels.import, icon: <Upload className="h-4 w-4" /> },
      { id: 'backup', label: tabLabels.backup, icon: <Database className="h-4 w-4" /> },
    ] },
    { id: 'security', label: groupLabels.security, tabs: [
      { id: 'pgp', label: tabLabels.pgp, icon: <Key className="h-4 w-4" /> },
    ] },
    { id: 'system', label: groupLabels.system, tabs: [
      { id: 'stalwart', label: tabLabels.stalwart, icon: <Database className="h-4 w-4" /> },
      { id: 'sieve', label: tabLabels.sieve, icon: <Code2 className="h-4 w-4" /> },
      { id: 'monitoring', label: tabLabels.monitoring, icon: <Activity className="h-4 w-4" /> },
      { id: 'statistics', label: tabLabels.statistics, icon: <BarChart3 className="h-4 w-4" /> },
    ] },
  ];
}

function LanguageTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  return <AdvancedTab initialSettings={initialSettings} section="locale" />;
}

function SignatureTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const t = useTranslations('settings.signature');
  const common = useTranslations('common');
  const [signatures, setSignatures] = useState<Signature[]>(() => initialSettings.signatures || []);
  const [newSignatureName, setNewSignatureName] = useState('');
  const [newSignatureContent, setNewSignatureContent] = useState('');
  const [newSignatureContext, setNewSignatureContext] = useState<'work' | 'personal' | 'autoReply' | 'general'>('general');

  const saveMutation = useMutation({
    mutationFn: () => saveSettings({ ...initialSettings, signatures }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(t('saveSuccess'));
    },
    onError: () => {
      toast.error(t('saveError'));
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleAddSignature = () => {
    if (!newSignatureName.trim() || !newSignatureContent.trim()) {
      toast.error(t('emptyError'));
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
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('subheading')}</h3>
            </div>

            <div className="space-y-4 p-4 border rounded-md bg-muted/30">
              <div className="space-y-2">
                <label htmlFor="new-sig-name" className="text-sm font-medium">{t('nameLabel')}</label>
                <Input
                  id="new-sig-name"
                  value={newSignatureName}
                  onChange={(e) => setNewSignatureName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="new-sig-context" className="text-sm font-medium">{t('contextLabel')}</label>
                <select
                  id="new-sig-context"
                  value={newSignatureContext}
                  onChange={(e) => setNewSignatureContext(e.target.value as 'work' | 'personal' | 'autoReply' | 'general')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="general">{t('contextGeneral')}</option>
                  <option value="work">{t('contextWork')}</option>
                  <option value="personal">{t('contextPersonal')}</option>
                  <option value="autoReply">{t('contextAutoReply')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="new-sig-content" className="text-sm font-medium">{t('contentLabel')}</label>
                <textarea
                  id="new-sig-content"
                  value={newSignatureContent}
                  onChange={(e) => setNewSignatureContent(e.target.value)}
                  placeholder={t('contentPlaceholder')}
                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  rows={4}
                />
              </div>
              <Button onClick={handleAddSignature} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                {t('addButton')}
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
                          <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary">{t('defaultBadge')}</span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {sig.context === 'work' ? t('contextWork') : sig.context === 'personal' ? t('contextPersonal') : sig.context === 'autoReply' ? t('contextAutoReply') : t('contextGeneral')}
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
                          title={t('setDefault')}
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
          {saveMutation.isPending ? common('saving') : common('save')}
        </Button>
      </div>
    </div>
  );
}

function AutoReplyTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const t = useTranslations('settings.autoReply');
  const signatureT = useTranslations('settings.signature');
  const common = useTranslations('common');
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
      toast.success(signatureT('saveSuccess'));
    },
    onError: () => {
      toast.error(signatureT('saveError'));
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
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
              {t('enable')}
            </label>
          </div>

          {autoReplyEnabled && (
            <div className="space-y-4 pl-6">
              <div className="space-y-2">
                <label htmlFor="autoReplySubject" className="text-sm font-medium">{t('subjectLabel')}</label>
                <Input
                  id="autoReplySubject"
                  value={autoReplySubject}
                  onChange={(e) => setAutoReplySubject(e.target.value)}
                  placeholder={t('subjectPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('subjectHelp')}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="autoReplyMessage" className="text-sm font-medium">{t('bodyLabel')}</label>
                <textarea
                  id="autoReplyMessage"
                  value={autoReplyMessage}
                  onChange={(e) => setAutoReplyMessage(e.target.value)}
                  placeholder={t('bodyPlaceholder')}
                  className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  {t('bodyHelp')}
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
                    {t('schedule')}
                  </label>
                </div>

                {scheduleEnabled && (
                  <div className="space-y-4 pl-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label htmlFor="startDate" className="text-sm font-medium">{t('startDate')}</label>
                        <Input
                          id="startDate"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="endDate" className="text-sm font-medium">{t('endDate')}</label>
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
                        <label htmlFor="startTime" className="text-sm font-medium">{t('startTime')}</label>
                        <Input
                          id="startTime"
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="endTime" className="text-sm font-medium">{t('endTime')}</label>
                        <Input
                          id="endTime"
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('scheduleHelp')}
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
          {saveMutation.isPending ? common('saving') : common('save')}
        </Button>
      </div>
    </div>
  );
}

const PRESET_THEMES = [
  { id: 'blue', icon: '💙' },
  { id: 'green', icon: '💚' },
  { id: 'purple', icon: '💜' },
  { id: 'orange', icon: '🧡' },
];

function ThemeTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const t = useTranslations('settings.theme');
  const [theme, setTheme] = useState<UserSettings['theme']>(() => initialSettings.theme || 'system');
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    // If custom theme is saved, use its name, otherwise use the base theme
    if (initialSettings.customTheme?.name) {
      return initialSettings.customTheme.name;
    }
    return initialSettings.theme || 'light';
  });
  const [customColors, setCustomColors] = useState(() => initialSettings.customTheme?.colors || {});
  const [showCustom, setShowCustom] = useState(false);

  const applyTheme = (themeId: UserSettings['theme'], colors?: { primary?: string; secondary?: string; accent?: string }) => {
    window.dispatchEvent(new CustomEvent('homemail-theme-change', {
      detail: { preference: themeId, colors },
    }));
  };

  const saveMutation = useMutation({
    mutationFn: (settings: UserSettings) => saveSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(t('saveSuccess'));
    },
    onError: (error) => {
      console.error('[ThemeTab] Save error:', error);
      toast.error(t('saveError'));
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

  const handleThemeChange = (newTheme: UserSettings['theme']) => {
    setTheme(newTheme);

    // Check if we have a color scheme active
    const hasColorScheme = !['light', 'dark', 'system'].includes(selectedPreset);

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
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-3">{t('baseThemes')}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  {t('light')}
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
                  {t('dark')}
                </span>
              </button>
              <button
                onClick={() => handleThemeChange('system')}
                className={`flex flex-col items-center gap-3 rounded-lg border-2 p-6 transition-all ${
                  theme === 'system'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Layout className={`h-8 w-8 ${theme === 'system' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`font-medium ${theme === 'system' ? 'text-primary' : 'text-foreground'}`}>
                  {t('system')}
                </span>
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">{t('colorSchemes')}</h3>
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
                    {t(preset.id)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium mb-3">{t('custom')}</h3>
            <Button
              variant="outline"
              onClick={() => setShowCustom(!showCustom)}
              className="w-full"
            >
              {showCustom ? t('hideSettings') : t('showSettings')}
            </Button>
            {showCustom && (
              <div className="mt-4 space-y-4 p-4 rounded-lg border bg-card">
                <div>
                  <label className="text-sm font-medium mb-2 block">{t('primaryColor')}</label>
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
                  <label className="text-sm font-medium mb-2 block">{t('secondaryColor')}</label>
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
                  <label className="text-sm font-medium mb-2 block">{t('accentColor')}</label>
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
                  {t('saveCustom')}
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
    throw new Error(body.message || 'Failed to synchronize rules');
  }
}

function FiltersTab() {
  const queryClient = useQueryClient();
  const t = useTranslations('settings.filters');
  const [newFilterName, setNewFilterName] = useState('');
  const [newFilterQuery, setNewFilterQuery] = useState('');
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoSortRule | undefined>();
  const [isSyncingSieve, setIsSyncingSieve] = useState(false);
  const [isResettingProcessed, setIsResettingProcessed] = useState(false);
  const { data: filters = [], isLoading: filtersLoading, error: filtersError, refetch: refetchFilters } = useQuery({
    queryKey: ['saved-filters'],
    queryFn: getSavedFilters,
  });

  const { data: rules = [], isLoading: rulesLoading, error: rulesError, refetch: refetchRules } = useQuery({
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
      toast.success(t('saveSuccess'));
    },
    onError: () => {
      toast.error(t('saveError'));
    },
  });

  const deleteFilterMutation = useMutation({
    mutationFn: deleteFilter,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters'] });
      toast.success(t('deleteSuccess'));
    },
    onError: () => {
      toast.error(t('deleteError'));
    },
  });

  const handleCreateFilter = () => {
    if (!newFilterName.trim() || !newFilterQuery.trim()) {
      toast.error(t('emptyError'));
      return;
    }
    createFilterMutation.mutate({
      name: newFilterName.trim(),
      query: newFilterQuery.trim(),
      isPinned: false,
    });
  };

  const handleDeleteFilter = (filterId: string, filterName: string) => {
    if (confirm(t('deleteConfirm', { name: filterName }))) {
      deleteFilterMutation.mutate(filterId);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              value={newFilterName}
              onChange={(e) => setNewFilterName(e.target.value)}
              placeholder={t('namePlaceholder')}
            />
            <Input
              value={newFilterQuery}
              onChange={(e) => setNewFilterQuery(e.target.value)}
              placeholder={t('queryPlaceholder')}
            />
            <Button onClick={handleCreateFilter} disabled={createFilterMutation.isPending}>
              {createFilterMutation.isPending ? t('creating') : t('createButton')}
            </Button>
          </div>

          {filtersLoading && <p className="text-sm text-muted-foreground">{t('loadingFilters')}</p>}
          {!filtersLoading && filtersError && <SettingsSectionError title={t('loadError')} description={t('loadErrorDescription')} retryLabel={t('retry')} onRetry={() => void refetchFilters()} />}
          {!filtersLoading && !filtersError && filters.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noFilters')}</p>
          )}
          {!filtersLoading && !filtersError && filters.length > 0 && (
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
            <h2 className="text-xl font-semibold">{t('autoSortHeading')}</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('syntaxHelpTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="font-semibold mb-2">{t('syntax.addressFields')}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">from:</code>: {t('syntax.sender')}</li>
                      <li><code className="bg-muted px-1 rounded">to:</code>: {t('syntax.recipient')}</li>
                      <li><code className="bg-muted px-1 rounded">cc:</code>: {t('syntax.cc')}</li>
                      <li><code className="bg-muted px-1 rounded">bcc:</code>: {t('syntax.bcc')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">{t('syntax.contentFields')}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">subject:</code>: {t('syntax.subject')}</li>
                      <li><code className="bg-muted px-1 rounded">body:</code>: {t('syntax.body')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">{t('syntax.attachments')}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">has:attachment</code>: {t('syntax.hasAttachments')}</li>
                      <li><code className="bg-muted px-1 rounded">has:image</code>: {t('syntax.hasImages')}</li>
                      <li><code className="bg-muted px-1 rounded">has:document</code>: {t('syntax.hasDocuments')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">{t('syntax.messageStatus')}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">is:unread</code>: {t('syntax.unread')}</li>
                      <li><code className="bg-muted px-1 rounded">is:read</code>: {t('syntax.read')}</li>
                      <li><code className="bg-muted px-1 rounded">is:starred</code>: {t('syntax.starred')}</li>
                      <li><code className="bg-muted px-1 rounded">is:important</code>: {t('syntax.important')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">{t('syntax.date')}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">after:2024-01-01</code>: {t('syntax.afterDate')}</li>
                      <li><code className="bg-muted px-1 rounded">before:7d</code>: {t('syntax.beforeDate')}</li>
                      <li><code className="bg-muted px-1 rounded">after:today</code>: {t('syntax.today')}</li>
                      <li><code className="bg-muted px-1 rounded">after:yesterday</code>: {t('syntax.yesterday')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">{t('syntax.size')}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">size:&gt;1MB</code>: {t('syntax.larger1mb')}</li>
                      <li><code className="bg-muted px-1 rounded">size:&gt;500KB</code>: {t('syntax.larger500kb')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">{t('syntax.operators')}</h3>
                    <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                      <li><code className="bg-muted px-1 rounded">*</code>: {t('syntax.wildcard')}</li>
                      <li><code className="bg-muted px-1 rounded">OR</code>: {t('syntax.logicalOr')}</li>
                      <li><code className="bg-muted px-1 rounded">-</code>: {t('syntax.negation')}</li>
                      <li><code className="bg-muted px-1 rounded">&quot;exact phrase&quot;</code>: {t('syntax.exactMatch')}</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">{t('syntax.examples')}</h3>
                    <div className="space-y-2 text-muted-foreground">
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">from:amazon</code>
                        <p className="text-xs pl-2">{t('syntax.exampleAmazon')}</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">from:*@amazon.com</code>
                        <p className="text-xs pl-2">{t('syntax.exampleDomain')}</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">from:amazon OR from:ebay</code>
                        <p className="text-xs pl-2">{t('syntax.exampleOr')}</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">has:attachment size:&gt;1MB</code>
                        <p className="text-xs pl-2">{t('syntax.exampleAttachment')}</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">is:unread after:7d</code>
                        <p className="text-xs pl-2">{t('syntax.exampleUnread')}</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">subject:invoice -from:spam</code>
                        <p className="text-xs pl-2">{t('syntax.exampleExclude')}</p>
                      </div>
                      <div>
                        <code className="bg-muted px-2 py-1 rounded block mb-1">from:*@company.com subject:&quot;quarterly report&quot;</code>
                        <p className="text-xs pl-2">{t('syntax.exampleExact')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground">
                      {t('syntax.tip')}
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
            {t('createRule')}
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
                toast.success(t('syncSuccess'));
              } catch {
                toast.error(t('syncError'));
              } finally {
                setIsSyncingSieve(false);
              }
            }}
          >
            <Code2 className="h-4 w-4 mr-2" />
            {isSyncingSieve ? t('syncing') : t('syncSieve')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={isResettingProcessed}
            onClick={async () => {
              setIsResettingProcessed(true);
              try {
                const res = await fetch('/api/mail/filters/rules/reset-processed', { method: 'POST' });
                if (!res.ok) throw new Error(t('resetError'));
                toast.success(t('resetSuccess'));
              } catch {
                toast.error(t('resetError'));
              } finally {
                setIsResettingProcessed(false);
              }
            }}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {isResettingProcessed ? t('resetting') : t('resetCache')}
          </Button>
        </div>
        <div className="space-y-4">
          {rulesLoading && <p className="text-sm text-muted-foreground">{t('rulesLoading')}</p>}
          {!rulesLoading && rulesError && <SettingsSectionError title={t('rulesLoadError')} description={t('loadErrorDescription')} retryLabel={t('retry')} onRetry={() => void refetchRules()} />}
          {!rulesLoading && !rulesError && rules.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('noRules')}</p>
          )}
          {!rulesLoading && !rulesError && rules.length > 0 && (
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
                        {rule.enabled ? t('enabled') : t('disabled')}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t('actionCount', { count: rule.actions.length })}
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
                        if (confirm(t('deleteRuleConfirm', { name: rule.name }))) {
                          deleteFilterRule(rule.id).then(() => {
                            queryClient.invalidateQueries({ queryKey: ['filter-rules'] });
                            toast.success(t('ruleDeleteSuccess'));
                          }).catch(() => {
                            toast.error(t('ruleDeleteError'));
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
            {t('rulesHelp')}
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
              toast.success(t('ruleSavedBackground'));
              // Fire-and-forget: don't await so the UI is never blocked
              fetch('/api/mail/filters/rules/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ruleId: rule.id }),
              }).catch(() => {
                // Errors are logged server-side; background job will retry via daemon
              });
            } else {
              toast.success(t('ruleSavedSieve'));
            }
          } catch {
            toast.error(t('ruleSaveError'));
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
  const t = useTranslations('settings.interface');
  const common = useTranslations('common');
  const [density, setDensity] = useState<'compact' | 'comfortable' | 'spacious'>(() => initialSettings.ui?.density || 'comfortable');
  const [messagesPerPage, setMessagesPerPage] = useState(() => initialSettings.ui?.messagesPerPage || 50);
  const [sortBy, setSortBy] = useState<'date' | 'from' | 'subject' | 'size'>(() => initialSettings.ui?.sortBy || 'date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => initialSettings.ui?.sortOrder || 'desc');
  const [groupBy, setGroupBy] = useState<'none' | 'date' | 'sender'>(() => initialSettings.ui?.groupBy || 'none');

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSettings({
        ...initialSettings,
        ui: {
          density,
          messagesPerPage,
          sortBy,
          sortOrder,
          groupBy,
        },
      }),
    onSuccess: (savedSettings) => {
      queryClient.setQueryData<UserSettings>(['settings'], savedSettings);
      window.localStorage.setItem('homemail-settings-updated-at', Date.now().toString());
      toast.success(t('saveSuccess'));
    },
    onError: () => {
      toast.error(t('saveError'));
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
        <div className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="density" className="text-sm font-medium">{t('density')}</label>
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
                  {t('compact')}
                </span>
                <span className="text-xs text-muted-foreground">{t('compactHelp')}</span>
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
                  {t('comfortable')}
                </span>
                <span className="text-xs text-muted-foreground">{t('comfortableHelp')}</span>
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
                  {t('spacious')}
                </span>
                <span className="text-xs text-muted-foreground">{t('spaciousHelp')}</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="messagesPerPage" className="text-sm font-medium">{t('messagesPerPage')}</label>
            <Input
              id="messagesPerPage"
              type="number"
              min="10"
              max="100"
              value={messagesPerPage}
              onChange={(e) => setMessagesPerPage(Math.max(10, Math.min(100, parseInt(e.target.value, 10) || 50)))}
            />
            <p className="text-xs text-muted-foreground">
              {t('messagesPerPageHelp')}
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="sortBy" className="text-sm font-medium">{t('sortBy')}</label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'from' | 'subject' | 'size')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="date">{t('date')}</option>
              <option value="from">{t('sender')}</option>
              <option value="subject">{t('subject')}</option>
              <option value="size">{t('size')}</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="sortOrder" className="text-sm font-medium">{t('sortOrder')}</label>
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
                  {t('descending')}
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
                  {t('ascending')}
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="groupBy" className="text-sm font-medium">{t('groupBy')}</label>
            <select
              id="groupBy"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'none' | 'date' | 'sender')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="none">{t('groupNone')}</option>
              <option value="date">{t('groupDate')}</option>
              <option value="sender">{t('groupSender')}</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {t('groupHelp')}
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? common('saving') : common('save')}
        </Button>
      </div>
    </div>
  );
}

function NotificationsTab({ initialSettings }: { readonly initialSettings: UserSettings }) {
  const queryClient = useQueryClient();
  const t = useTranslations('settings.notifications');
  const common = useTranslations('common');
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
      toast.success(t('saveSuccess'));
      
      if (browserNotifications && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted') {
            toast.success(t('permissionGranted'));
          } else if (permission === 'denied') {
            toast.error(t('permissionBlockedHelp'));
          }
        });
      }
    },
    onError: () => {
      toast.error(t('saveError'));
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
          toast.success(t('permissionGranted'));
        } else if (permission === 'denied') {
          toast.error(t('permissionBlocked'));
        }
      });
    } else {
      toast.error(t('unsupported'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
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
              {t('enable')}
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
                  {t('browser')}
                </label>
                {browserNotifications && 'Notification' in window && Notification.permission === 'default' && (
                  <Button variant="outline" size="sm" onClick={handleRequestPermission}>
                    {t('requestPermission')}
                  </Button>
                )}
                {browserNotifications && 'Notification' in window && Notification.permission === 'denied' && (
                  <span className="text-xs text-destructive">{t('permissionBlocked')}</span>
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
                  {t('sound')}
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
                  {t('importantOnly')}
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? common('saving') : common('save')}
        </Button>
      </div>
    </div>
  );
}

function AdvancedTab({ initialSettings, section = 'mail' }: { readonly initialSettings: UserSettings; readonly section?: 'mail' | 'locale' }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations('settings.advanced');
  const languageT = useTranslations('settings.language');
  const common = useTranslations('common');
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

  const prevLanguage = initialSettings.locale?.language || 'ru';

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
      toast.success(t('saveSuccess'));
      // Redirect to new locale if language changed
      if (language !== prevLanguage) {
        router.push(`/${language}/settings`);
      }
    },
    onError: (error: Error) => {
      console.error('Settings save error:', error);
      toast.error(t('saveError'));
    },
  });

  const handleSave = () => {
    if (section === 'mail' && forwardingEnabled && !forwardingEmail) {
      toast.error(t('forwardingEmailRequired'));
      return;
    }
    saveMutation.mutate();
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">
          {section === 'mail' ? t('mailHeading') : t('localeHeading')}
        </h2>
        <div className="space-y-8">
          {section === 'mail' && <>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Forward className="h-5 w-5" />
              <h3 className="text-lg font-semibold">{t('forwardingHeading')}</h3>
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
                  {t('forwardingEnable')}
                </label>
              </div>

              {forwardingEnabled && (
                <div className="space-y-4 pl-6">
                  <div className="space-y-2">
                    <label htmlFor="forwardingEmail" className="text-sm font-medium">{t('forwardingEmail')}</label>
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
                      {t('keepCopy')}
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AtSign className="h-5 w-5" />
              <h3 className="text-lg font-semibold">{t('aliasesHeading')}</h3>
            </div>
            <div className="rounded-md border border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.1)] p-3 text-sm text-foreground">
              {t('aliasesHelp')}
            </div>
          </div>
          </>}

          {section === 'locale' && <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              <h3 className="text-lg font-semibold">{t('localeHeading')}</h3>
            </div>
            <div className="space-y-4 pl-7">
              <div className="space-y-2">
                <label htmlFor="language" className="text-sm font-medium">{t('interfaceLanguage')}</label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'ru' | 'en')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="ru">{languageT('russian')}</option>
                  <option value="en">{languageT('english')}</option>
                </select>
              </div>

              <div className="space-y-2">
                <label htmlFor="dateFormat" className="text-sm font-medium">{t('dateFormat')}</label>
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
                <label htmlFor="timeFormat" className="text-sm font-medium">{t('timeFormat')}</label>
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
                      {t('time24')}
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
                      {t('time12')}
                    </span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="timezone" className="text-sm font-medium">{t('timezone')}</label>
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
                  {t('currentTimezone', { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
                </p>
              </div>
            </div>
          </div>}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? common('saving') : common('save')}
        </Button>
      </div>
    </div>
  );
}

function ImportTab() {
  const t = useTranslations('settings.import');
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('description')}
          </p>
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            {t('open')}
          </Button>
        </div>
      </div>
      <EmailImport open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function SieveTab() {
  const queryClient = useQueryClient();
  const t = useTranslations('settings.sieve');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<SieveScript | undefined>(undefined);

  const { data: scripts = [], isLoading, error, refetch } = useQuery<SieveScript[]>({
    queryKey: ['sieve-scripts'],
    queryFn: async () => {
      const res = await fetch('/api/mail/sieve');
      if (!res.ok) throw new Error('sieve_unavailable');
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
        throw new Error(data.message || t('saveError'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sieve-scripts'] });
      toast.success(t('saveSuccess'));
    },
    onError: () => {
      toast.error(t('saveError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/mail/sieve?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(t('deleteError'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sieve-scripts'] });
      toast.success(t('deleteSuccess'));
    },
    onError: () => {
      toast.error(t('deleteError'));
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
          <h2 className="text-lg font-semibold">{t('heading')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t('create')}
        </Button>
      </div>

      {isLoading && <SettingsSectionLoading label={t('loading')} />}

      {!isLoading && error && (
        <SettingsSectionError title={t('loadError')} description={t('loadErrorDescription')} retryLabel={t('retry')} onRetry={() => void refetch()} />
      )}

      {!isLoading && !error && scripts.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
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
                <p className="text-sm font-medium truncate">{script.name || t('unnamed')}</p>
                {script.isActive && (
                  <span className="text-xs text-[hsl(var(--status-success))] font-medium">{t('active')}</span>
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
  const t = useTranslations('settings.folders');
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
      toast.success(t('createSuccess'));
    },
    onError: () => {
      toast.error(t('createError'));
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
      toast.success(t('updateSuccess'));
    },
    onError: () => {
      toast.error(t('updateError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      toast.success(t('deleteSuccess'));
    },
    onError: () => {
      toast.error(t('deleteError'));
    },
  });

  const handleCreate = () => {
    if (!newFolderName.trim()) {
      toast.error(t('nameRequired'));
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
      toast.error(t('nameRequired'));
      return;
    }
    if (editFolderParentId === editingFolder.id) {
      toast.error(t('selfParentError'));
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
              <span className="text-xs text-muted-foreground">{t('subfolder')}</span>
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
      toast.error(t('systemDeleteError'));
      return;
    }
    if (confirm(t('deleteConfirm', { name: folderName }))) {
      deleteMutation.mutate(folderId);
    }
  };

  const customFolders = folders.filter((f) => f.role === 'custom');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">{t('heading')}</h2>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={t('namePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreate();
                }
              }}
            />
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? t('creating') : t('create')}
            </Button>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">{t('loading')}</p>}
          {!isLoading && organizedFolders.filter((f) => f.role === 'custom').length === 0 && (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
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
  const locale = useLocale();
  const shell = useTranslations('settings.shell');
  const tabs = useTranslations('settings.tabs');
  const stalwartT = useTranslations('settings.stalwart');
  const routeSection = getSettingsSectionFromPathname(pathname);
  const activeTab = routeSection || 'signature';
  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const currentTheme = settings?.theme || 'system';
  const tabLabels = Object.fromEntries(
    SETTINGS_SECTION_IDS.map((id) => [id, tabs(id)]),
  ) as Record<TabId, string>;
  const tabGroups = getTabGroups(currentTheme, tabLabels, {
    mail: shell('groups.mail'),
    organization: shell('groups.organization'),
    interface: shell('groups.interface'),
    data: shell('groups.data'),
    security: shell('groups.security'),
    system: shell('groups.system'),
  });
  const activeTabLabel = tabGroups.flatMap((group) => group.tabs).find((tab) => tab.id === activeTab)?.label;

  if (isLoading) {
    return (
      <div className="mail-app-shell min-h-dvh p-6" aria-busy="true" aria-label={shell('loading')}>
        <div className="mx-auto grid max-w-6xl grid-cols-[17rem_minmax(0,1fr)] gap-8">
          <div className="space-y-4 border-r border-border pr-6">
            <Skeleton className="h-8 w-36" />
            {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
          </div>
          <div className="space-y-5">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <main className="mail-app-shell min-h-dvh p-6">
        <div className="mx-auto max-w-2xl pt-16">
          <SettingsSectionError
            title={shell('loadError')}
            description={shell('loadErrorDescription')}
            retryLabel={shell('retry')}
            onRetry={() => void refetch()}
          />
        </div>
      </main>
    );
  }

  return (
    <div className="mail-app-shell flex min-h-dvh flex-col">
      <header className="mail-panel-muted border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-[1440px] items-center gap-3">
          <Button variant="ghost" size="icon" className="max-lg:hidden" onClick={() => router.push(`/${locale}/mail`)} aria-label={shell('backToMail')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {routeSection && (
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => router.push(`/${locale}/settings`)} aria-label={shell('backToSections')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{shell('title')}</h1>
            <p className="text-xs text-muted-foreground">{activeTabLabel}</p>
          </div>
        </div>
      </header>
      <div className="mx-auto grid min-h-0 w-full max-w-[1440px] flex-1 grid-cols-[17rem_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="mail-sidebar-surface overflow-y-auto border-r border-border max-lg:hidden">
          <nav className="space-y-5 p-4" aria-label={shell('navigationLabel')}>
            {tabGroups.map((group) => (
              <section key={group.id} aria-labelledby={`settings-group-${group.id}`}>
                <h2 id={`settings-group-${group.id}`} className="mb-1.5 px-2 text-xs font-medium text-muted-foreground">
                  {group.label}
                </h2>
                <div className="space-y-0.5">
                  {group.tabs.map((tab) => (
                    <Link
                      key={tab.id}
                      href={getSettingsSectionHref(locale, tab.id)}
                      aria-current={activeTab === tab.id ? 'page' : undefined}
                      className={`flex min-h-9 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${activeTab === tab.id ? 'mail-selected-surface font-medium text-foreground' : 'text-muted-foreground hover:mail-hover-surface hover:text-foreground'}`}
                    >
                      {tab.icon}<span>{tab.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </nav>
        </aside>
        <main id="main-content" className="mail-panel-surface min-w-0 overflow-y-auto px-6 pb-12 pt-8 max-sm:px-4">
          {!routeSection && (
            <nav className="mx-auto max-w-3xl space-y-6 lg:hidden" aria-label={shell('navigationLabel')}>
              {tabGroups.map((group) => (
                <section key={group.id} aria-labelledby={`mobile-settings-group-${group.id}`}>
                  <h2 id={`mobile-settings-group-${group.id}`} className="mb-2 text-xs font-medium text-muted-foreground">{group.label}</h2>
                  <div className="divide-y divide-border border-y border-border">
                    {group.tabs.map((tab) => (
                      <Link key={tab.id} href={getSettingsSectionHref(locale, tab.id)} className="flex min-h-12 items-center gap-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {tab.icon}<span className="flex-1">{tab.label}</span><ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </nav>
          )}
          <div className={`mx-auto max-w-3xl ${routeSection ? '' : 'max-lg:hidden'}`}>
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
            {activeTab === 'language' && <LanguageTab initialSettings={settings} />}
            {activeTab === 'stalwart' && (
              <section className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold">{stalwartT('heading')}</h2>
                  <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
                    {stalwartT('description')}
                  </p>
                </div>
                <Button onClick={() => router.push(`/${locale}/settings/stalwart`)}>
                  {stalwartT('openAdmin')}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
