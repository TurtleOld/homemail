'use client';

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { MessageDetail, Label } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useLocaleSettings } from '@/lib/hooks';
import { sanitizeHtml } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import {
  Mail,
  Star,
  StarOff,
  Reply,
  ReplyAll,
  Forward,
  Trash2,
  Download,
  AlertCircle,
  Tag,
  X,
  FileDown,
  Printer,
  Eye,
  Languages,
  Lock,
  MoreHorizontal,
  ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AttachmentPreview } from '@/components/attachment-preview';
import { MessageTranslator } from '@/components/message-translator';
import { DeliveryTracking } from '@/components/delivery-tracking';
import { useTranslations } from 'next-intl';

interface MessageViewerProps {
  message: MessageDetail | null;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  onStar?: (starred: boolean) => void;
  onMarkRead?: (read: boolean) => void;
  onToggleImportant?: (important: boolean) => void;
  allowRemoteImages?: boolean;
  isLoading?: boolean;
  hasSelection?: boolean;
  isMobile?: boolean;
  onBack?: () => void;
  error?: Error | null;
}

async function getLabels(): Promise<Label[]> {
  const res = await fetch('/api/mail/labels');
  if (!res.ok) {
    throw new Error('Failed to load labels');
  }
  return res.json();
}

async function updateMessageLabels(messageId: string, labelIds: string[]): Promise<void> {
  const res = await fetch(`/api/mail/messages/${messageId}/labels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labelIds }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update labels');
  }
}

export function MessageViewer({
  message,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onStar,
  onMarkRead,
  onToggleImportant,
  allowRemoteImages = false,
  isLoading = false,
  hasSelection = false,
  isMobile = false,
  onBack,
  error,
}: MessageViewerProps) {
  const localeSettings = useLocaleSettings();
  const t = useTranslations('messageViewer');
  const tCommon = useTranslations('common');
  const markedAsReadRef = useRef<Set<string>>(new Set());
  const [localAllowImages, setLocalAllowImages] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{
    id: string;
    filename: string;
    mime: string;
  } | null>(null);
  const [showTranslator, setShowTranslator] = useState(false);
  const [decryptedBody, setDecryptedBody] = useState<{ text?: string; html?: string } | null>(null);
  const queryClient = useQueryClient();

  const { data: labels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: getLabels,
  });

  const updateLabelsMutation = useMutation({
    mutationFn: ({ messageId, labelIds }: { messageId: string; labelIds: string[] }) =>
      updateMessageLabels(messageId, labelIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.messageId] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      if (message) {
        queryClient.setQueryData(['messages', message.id], (old: MessageDetail | undefined) => {
          if (!old) return old;
          return { ...old, labels: variables.labelIds };
        });
      }
      toast.success(t('labelsUpdated'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('labelsUpdateError'));
    },
  });

  const body = decryptedBody ?? message?.body;

  const hasRemoteImages = useMemo(() => {
    if (!body) return false;
    try {
      const htmlBody = body.html;
      if (!htmlBody || typeof htmlBody !== 'string') return false;
      return /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi.test(htmlBody);
    } catch (error) {
      console.error('Error checking remote images:', error);
      return false;
    }
  }, [body]);

  const effectiveAllowImages = allowRemoteImages || localAllowImages;

  const sanitizedHtml = useMemo(() => {
    if (!body) return '';

    try {
      const htmlBody = body.html;
      const textBody = body.text;

      if (htmlBody && typeof htmlBody === 'string' && htmlBody.trim().length > 0) {
        return sanitizeHtml(htmlBody, effectiveAllowImages);
      }
      if (textBody && typeof textBody === 'string' && textBody.trim().length > 0) {
        const escaped = textBody
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
          .replace(/\n/g, '<br>');
        return `<p>${escaped}</p>`;
      }
    } catch (error) {
      console.error('Error sanitizing HTML:', error);
      return '';
    }

    return '';
  }, [body, effectiveAllowImages]);

  const isDark = useMemo(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  }, [message?.id]);

  const isTableLayout = useMemo(() => {
    if (!sanitizedHtml) return false;
    const trimmed = sanitizedHtml.trim();
    return /^<table[\s>]/i.test(trimmed);
  }, [sanitizedHtml]);

  const iframeSrcDoc = useMemo(() => {
    if (!sanitizedHtml) return '';
    const shellBg = isDark ? 'hsl(220, 24%, 12%)' : '#f4f7fb';
    const paperBg = '#ffffff';
    const textColor = '#111827';
    const codeBg = '#f3f4f6';
    const blockquoteBg = '#f8fafc';
    const blockquoteBorder = '#dbe4f0';
    const blockquoteText = '#334155';
    const panelBorder = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';
    const panelShadow = isDark
      ? '0 22px 44px -28px rgba(0,0,0,0.65)'
      : '0 22px 44px -28px rgba(15,23,42,0.18)';
    return [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<style>',
      '* { box-sizing: border-box; }',
      `html, body { min-height: 100%; margin: 0; padding: 0; background: ${shellBg}; }`,
      `body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: ${textColor}; line-height: 1.6; font-size: 15px; word-wrap: break-word; overflow-wrap: break-word; overflow-x: auto; }`,
      '.email-shell { padding: 20px; }',
      `.email-content { width: 100%; max-width: 920px; margin: 0 auto; padding: 24px; background: ${paperBg}; color: ${textColor}; border: 1px solid ${panelBorder}; border-radius: 18px; box-shadow: ${panelShadow}; }`,
      '.email-content--table-layout { padding: 0; overflow: hidden; }',
      'p { margin: 0 0 12px 0; }',
      'p:last-child { margin-bottom: 0; }',
      'h1, h2, h3, h4, h5, h6 { margin: 0 0 12px 0; font-weight: 600; line-height: 1.3; }',
      'h1 { font-size: 24px; }',
      'h2 { font-size: 20px; }',
      'h3 { font-size: 18px; }',
      'h4 { font-size: 16px; }',
      'h5 { font-size: 14px; }',
      'h6 { font-size: 13px; }',
      'ul, ol { margin: 0 0 12px 0; padding-left: 24px; }',
      'li { margin: 4px 0; }',
      `blockquote { margin: 12px 0; padding: 12px 16px; border-left: 4px solid ${blockquoteBorder}; background: ${blockquoteBg}; color: ${blockquoteText}; }`,
      `code { padding: 2px 6px; background: ${codeBg}; border-radius: 3px; font-family: "Courier New", monospace; font-size: 0.9em; color: ${textColor}; }`,
      `pre { margin: 12px 0; padding: 12px; background: ${codeBg}; border-radius: 4px; overflow-x: auto; }`,
      'pre code { padding: 0; background: transparent; }',
      'a { color: #2563eb; text-decoration: underline; }',
      'a:hover { color: #1d4ed8; }',
      'img { max-width: 100%; height: auto; display: block; }',
      'img[align="left"] { float: left; margin: 0 16px 12px 0; }',
      'img[align="right"] { float: right; margin: 0 0 12px 16px; }',
      'img[align="center"] { display: block; margin: 12px auto; float: none; }',
      'table { max-width: 100%; border-collapse: collapse; margin-left: auto; margin-right: auto; }',
      'table td, table th { word-wrap: break-word; }',
      `table th { font-weight: 600; color: ${textColor}; }`,
      'table[role="presentation"] { border: none !important; }',
      'table[role="presentation"] td { border: none !important; }',
      'div[align="center"] { text-align: center; }',
      'div[align="left"] { text-align: left; }',
      'div[align="right"] { text-align: right; }',
      'p[align="center"] { text-align: center; }',
      'p[align="left"] { text-align: left; }',
      'p[align="right"] { text-align: right; }',
      'td[align="center"], th[align="center"] { text-align: center; }',
      'td[align="left"], th[align="left"] { text-align: left; }',
      'td[align="right"], th[align="right"] { text-align: right; }',
      'td[valign="top"], th[valign="top"] { vertical-align: top; }',
      'td[valign="middle"], th[valign="middle"] { vertical-align: middle; }',
      'td[valign="bottom"], th[valign="bottom"] { vertical-align: bottom; }',
      'table[align="center"] { margin-left: auto; margin-right: auto; }',
      'table[align="left"] { margin-left: 0; margin-right: auto; }',
      'table[align="right"] { margin-left: auto; margin-right: 0; }',
      'body, body * { max-width: 100%; }',
      '@media (max-width: 600px) {',
      '  body { font-size: 14px; }',
      '  .email-shell { padding: 8px; }',
      '  .email-content { padding: 14px; border-radius: 14px; }',
      '  img[align="left"], img[align="right"] { float: none; display: block; margin: 12px auto; }',
      '  table { font-size: 14px; max-width: 100% !important; }',
      '  table td, table th { word-wrap: break-word; }',
      '}',
      '</style>',
      '</head>',
      `<body><div class="email-shell"><div class="email-content${isTableLayout ? ' email-content--table-layout' : ''}">${sanitizedHtml}</div></div></body>`,
      '</html>',
    ].join('');
  }, [sanitizedHtml, isDark, isTableLayout]);

  const messageLabelObjects = useMemo(() => {
    if (!message?.labels) return [];
    return labels.filter((label) => message.labels?.includes(label.id));
  }, [message?.labels, labels]);

  const handleMarkRead = useCallback(async () => {
    if (!message) return;
    try {
      await fetch(`/api/mail/messages/${message.id}/flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unread: false }),
      });
      onMarkRead?.(true);
    } catch (error) {
      console.error('Failed to update read status:', error);
    }
  }, [message, onMarkRead]);

  useEffect(() => {
    if (!message || !message.flags) return;
    if (message.flags.unread && !markedAsReadRef.current.has(message.id)) {
      markedAsReadRef.current.add(message.id);
      handleMarkRead();
    }
  }, [message, handleMarkRead]);

  if (isLoading && hasSelection) {
    return (
      <div className="mail-panel-surface flex h-full flex-col p-4 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="flex-1 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mail-panel-surface flex h-full items-center justify-center text-slate-500">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 mb-4 opacity-50 text-destructive" />
          <p className="text-destructive font-medium mb-2">{t('loadError')}</p>
          <p className="text-sm">{error.message || t('loadErrorDesc')}</p>
        </div>
      </div>
    );
  }

  if (!message) {
    return (
      <div className="mail-panel-surface flex h-full items-center justify-center text-slate-500">
        <div className="text-center">
          <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>{t('selectToView')}</p>
        </div>
      </div>
    );
  }

  const handleStar = async () => {
    const newStarred = !message.flags.starred;
    try {
      await fetch(`/api/mail/messages/${message.id}/flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: newStarred }),
      });
      onStar?.(newStarred);
    } catch (error) {
      console.error('Failed to update star:', error);
    }
  };

  const handleToggleImportant = async () => {
    if (!message || !message.flags) return;
    const newImportant = !message.flags.important;
    try {
      await fetch(`/api/mail/messages/${message.id}/flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ important: newImportant }),
      });
      onToggleImportant?.(newImportant);
    } catch (error) {
      console.error('Failed to update important:', error);
    }
  };

  const handleToggleLabel = (labelId: string) => {
    if (!message) return;
    const currentLabelIds = message.labels || [];
    const newLabelIds = currentLabelIds.includes(labelId)
      ? currentLabelIds.filter((id) => id !== labelId)
      : [...currentLabelIds, labelId];
    updateLabelsMutation.mutate({ messageId: message.id, labelIds: newLabelIds });
  };

  const handleRemoveLabel = (labelId: string) => {
    if (!message) return;
    const currentLabelIds = message.labels || [];
    const newLabelIds = currentLabelIds.filter((id) => id !== labelId);
    updateLabelsMutation.mutate({ messageId: message.id, labelIds: newLabelIds });
  };

  const handlePrint = () => {
    if (!message) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const printContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${message.subject || 'Letter'}</title><style>@media print{@page{margin:2cm}body{margin:0;padding:0}}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:800px;margin:0 auto;padding:20px;line-height:1.6}.header{border-bottom:2px solid #e0e0e0;padding-bottom:15px;margin-bottom:20px}.header h1{margin:0 0 10px 0;font-size:20px}.header-info{font-size:12px;color:#666}.header-info div{margin:5px 0}.content{margin-top:20px}</style></head><body><div class="header"><h1>${message.subject || '(no subject)'}</h1><div class="header-info"><div><strong>From:</strong> ${message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email}</div>${message.to.length > 0 ? `<div><strong>To:</strong> ${message.to.map((r) => (r.name ? `${r.name} <${r.email}>` : r.email)).join(', ')}</div>` : ''}${message.cc && message.cc.length > 0 ? `<div><strong>Cc:</strong> ${message.cc.map((c) => (c.name ? `${c.name} <${c.email}>` : c.email)).join(', ')}</div>` : ''}<div><strong>Date:</strong> ${formatDate(message.date, localeSettings)}</div></div></div><div class="content">${sanitizedHtml}</div></body></html>`;
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <div
      className="mail-panel-surface flex h-full w-full flex-col overflow-hidden border-l border-white/70 max-md:border-l-0"
      role="region"
      aria-label={t('viewerLabel')}
    >
      {/* Header — subject, from/to, auth badges, secondary actions */}
      <div className="mail-panel-muted border-b border-white/80 px-5 pb-4 pt-5 max-md:px-3 max-md:pb-2 max-md:pt-3 flex-shrink-0">
        <div className="flex items-start gap-2">
          {isMobile && onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="flex-shrink-0 -ml-1"
              aria-label="Back"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold max-md:text-base break-words leading-tight">
              {message.subject || tCommon('noSubject')}
            </h2>
            <div className="mt-2 space-y-1 text-sm text-slate-500 max-md:text-xs">
              <div className="break-words">
                <span className="font-medium text-foreground">
                  {message.from?.name || message.from?.email}
                </span>
                {message.from?.name && (
                  <span className="ml-1 text-slate-500">&lt;{message.from.email}&gt;</span>
                )}
              </div>
              {message.to && message.to.length > 0 && (
                <div className="break-words text-xs text-slate-500">
                  {t('to')}{' '}
                  {message.to
                    .map((r) => (r?.name ? `${r.name} <${r.email || ''}>` : r?.email || ''))
                    .join(', ')}
                </div>
              )}
              {message.cc && message.cc.length > 0 && (
                <div className="break-words text-xs text-slate-500">
                  {t('cc')}{' '}
                  {message.cc
                    .map((c) => (c?.name ? `${c.name} <${c.email || ''}>` : c?.email || ''))
                    .join(', ')}
                </div>
              )}
              <div className="text-xs tabular-nums text-slate-500">
                {message.date ? formatDate(message.date, localeSettings) : tCommon('unknown')}
              </div>
            </div>
            {/* Auth badges */}
            {message.authResults && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(['dkim', 'spf', 'dmarc'] as const).map((key) => {
                  const result = message.authResults![key];
                  if (!result || result === 'none') return null;
                  const isPass = result === 'pass';
                  return (
                    <span
                      key={key}
                      className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-mono font-semibold ${
                        isPass
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                          : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                      }`}
                      title={`${key.toUpperCase()}: ${result}`}
                    >
                      {key.toUpperCase()} {isPass ? '✓' : '✗'}
                    </span>
                  );
                })}
              </div>
            )}
            {/* Labels */}
            {messageLabelObjects.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {messageLabelObjects.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: `${label.color || '#3b82f6'}15`,
                      color: label.color || '#3b82f6',
                      border: `1px solid ${label.color || '#3b82f6'}30`,
                    }}
                  >
                    {label.name}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveLabel(label.id);
                      }}
                      className="hover:opacity-70"
                      aria-label={t('removeLabel', { name: label.name })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Top-right: star, important, overflow menu */}
          <div className="flex items-center gap-1 rounded-2xl border border-white/70 bg-white/75 p-1 shadow-sm backdrop-blur-sm flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStar}
              title={message.flags?.starred ? t('removeFromFavorites') : t('addToFavorites')}
              aria-label={message.flags?.starred ? t('removeFromFavorites') : t('addToFavorites')}
              className="h-8 w-8 rounded-xl"
            >
              {message.flags?.starred ? (
                <Star className="h-4 w-4 fill-[hsl(var(--starred))] text-[hsl(var(--starred))]" />
              ) : (
                <Star className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            {/* Overflow menu — secondary actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-xl"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-2xl border-white/80 bg-white/95 p-1 shadow-[0_24px_48px_-24px_hsl(var(--shadow-soft)/0.35)]"
              >
                <DropdownMenuItem
                  onClick={handleToggleImportant}
                  className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                >
                  <AlertCircle
                    className={`mr-2 h-4 w-4 ${message.flags?.important ? 'fill-orange-500 text-orange-500' : ''}`}
                  />
                  {message.flags?.important ? t('removeImportance') : t('markImportant')}
                </DropdownMenuItem>
                {message.flags?.unread && (
                  <DropdownMenuItem
                    onClick={handleMarkRead}
                    className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {t('markRead')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setShowTranslator(!showTranslator)}
                  className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                >
                  <Languages className="mr-2 h-4 w-4" />
                  {t('translate')}
                </DropdownMenuItem>
                {/* Labels submenu inline */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                    >
                      <Tag className="mr-2 h-4 w-4" />
                      {t('labels')}
                    </DropdownMenuItem>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="left"
                    className="w-48 rounded-2xl border-white/80 bg-white/95 p-1 shadow-[0_24px_48px_-24px_hsl(var(--shadow-soft)/0.35)]"
                  >
                    {labels.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">{t('noLabels')}</div>
                    ) : (
                      labels.map((label) => {
                        const isSelected = message?.labels?.includes(label.id) || false;
                        return (
                          <DropdownMenuItem
                            key={label.id}
                            onClick={() => handleToggleLabel(label.id)}
                            className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                          >
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: label.color || '#3b82f6' }}
                            />
                            <span className="flex-1">{label.name}</span>
                            {isSelected && <span className="text-xs text-muted-foreground">✓</span>}
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {message &&
                  message.body &&
                  message.body.text &&
                  message.body.text.includes('-----BEGIN PGP MESSAGE-----') && (
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/pgp/decrypt', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              encryptedMessage:
                                message.body?.text ||
                                message.body?.html?.replace(/<[^>]*>/g, '') ||
                                '',
                            }),
                          });
                          if (res.ok) {
                            const data = await res.json();
                            toast.success(t('decrypted'));
                            setDecryptedBody({
                              text: data.decryptedMessage,
                              html: data.decryptedMessage.replace(/\n/g, '<br>'),
                            });
                          } else {
                            toast.error(t('decryptFailed'));
                          }
                        } catch {
                          toast.error(t('decryptError'));
                        }
                      }}
                      className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      {t('decrypt')}
                    </DropdownMenuItem>
                  )}
                <DropdownMenuItem
                  onClick={() => {
                    if (!message) return;
                    window.open(`/api/mail/messages/${message.id}/export?format=eml`, '_blank');
                  }}
                  className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t('exportEml')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (!message) return;
                    window.open(`/api/mail/messages/${message.id}/export?format=pdf`, '_blank');
                  }}
                  className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {t('exportPdf')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handlePrint}
                  className="cursor-pointer rounded-xl px-3 py-2 text-slate-700 focus:bg-[hsl(var(--surface-selected))]"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {t('print')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto flex flex-col">
        {message.attachments && message.attachments.length > 0 && (
          <div className="border-b border-white/70 bg-[hsl(var(--surface-panel-muted)/0.7)] px-4 py-3 max-md:px-3 max-md:py-2 flex-shrink-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {t('attachments', { count: message.attachments.length })}
            </h3>
            <div className="flex flex-wrap gap-2">
              {message.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 rounded-2xl border border-white/80 bg-background/90 px-3 py-2 text-sm shadow-sm transition-colors hover:mail-hover-surface"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[160px]">{att.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {(att.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(att.mime.startsWith('image/') ||
                      att.mime === 'application/pdf' ||
                      att.mime.startsWith('text/')) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setPreviewAttachment({
                            id: att.id,
                            filename: att.filename,
                            mime: att.mime,
                          })
                        }
                        title={t('preview')}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={async () => {
                        try {
                          const url = `/api/mail/attachments/${att.id}/download?messageId=${message.id}`;
                          const response = await fetch(url);
                          if (!response.ok) {
                            const error = await response
                              .json()
                              .catch(() => ({ error: 'Failed to download' }));
                            toast.error(error.error || t('downloadError'));
                            return;
                          }
                          const blob = await response.blob();
                          const downloadUrl = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = downloadUrl;
                          link.download = att.filename;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                          window.URL.revokeObjectURL(downloadUrl);
                        } catch {
                          toast.error(t('downloadError'));
                        }
                      }}
                      title={t('download')}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasRemoteImages && !effectiveAllowImages && (
          <div className="border-b border-border/70 bg-[hsl(var(--surface-panel-muted)/0.92)] px-4 py-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocalAllowImages(true)}
              className="h-8 rounded-xl border-border/80 bg-background/90 text-foreground shadow-sm hover:mail-hover-surface"
            >
              {t('showImages')}
            </Button>
          </div>
        )}
        {iframeSrcDoc ? (
          <iframe
            sandbox="allow-same-origin allow-popups"
            srcDoc={iframeSrcDoc}
            className="flex-1 w-full border-0 min-h-[300px]"
            title="Message content"
          />
        ) : (
          <div className="flex min-h-[300px] w-full flex-1 items-center justify-center text-slate-500">
            <p>{t('noBody')}</p>
          </div>
        )}
        {showTranslator && message && message.body && (
          <div className="border-t border-white/70 p-4">
            <MessageTranslator
              originalText={message.body.text || message.body.html?.replace(/<[^>]*>/g, '') || ''}
              originalHtml={message.body.html}
            />
          </div>
        )}
        {message && (
          <div className="border-t border-white/70 p-4">
            <DeliveryTracking messageId={message.id} />
          </div>
        )}
      </div>

      {/* Sticky bottom toolbar — primary actions */}
      <div className="mail-panel-muted flex-shrink-0 border-t border-white/80 px-4 py-3 max-md:px-3 max-md:pb-safe-bottom">
        <div className="flex items-center gap-2 max-md:gap-1.5 max-md:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReply}
            className="gap-1.5 rounded-2xl bg-white/75 px-4 font-medium text-slate-700 shadow-sm hover:mail-hover-surface max-md:min-h-[44px] max-md:flex-1 touch-manipulation"
            aria-label={t('reply')}
          >
            <Reply className="h-4 w-4" />
            <span className="max-md:hidden">{t('reply')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReplyAll}
            className="gap-1.5 rounded-2xl bg-white/75 px-4 font-medium text-slate-700 shadow-sm hover:mail-hover-surface max-md:min-h-[44px] max-md:flex-1 touch-manipulation"
            aria-label={t('replyAll')}
          >
            <ReplyAll className="h-4 w-4" />
            <span className="max-md:hidden">{t('replyAll')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onForward}
            className="gap-1.5 rounded-2xl bg-white/75 px-4 font-medium text-slate-700 shadow-sm hover:mail-hover-surface max-md:min-h-[44px] max-md:flex-1 touch-manipulation"
            aria-label={t('forward')}
          >
            <Forward className="h-4 w-4" />
            <span className="max-md:hidden">{t('forward')}</span>
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 max-md:min-h-[44px] touch-manipulation"
            aria-label={tCommon('delete')}
          >
            <Trash2 className="h-4 w-4" />
            <span className="max-md:hidden">{tCommon('delete')}</span>
          </Button>
        </div>
      </div>

      {previewAttachment && (
        <AttachmentPreview
          attachmentId={previewAttachment.id}
          messageId={message.id}
          filename={previewAttachment.filename}
          mime={previewAttachment.mime}
          open={!!previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
}
