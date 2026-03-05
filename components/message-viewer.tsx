'use client';

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { MessageDetail, Label } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useLocaleSettings } from '@/lib/hooks';
import { sanitizeHtml } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { Mail, Star, StarOff, Reply, ReplyAll, Forward, Trash2, Download, AlertCircle, Tag, X, FileDown, Printer, Eye, Languages, Lock, MoreHorizontal, ChevronLeft } from 'lucide-react';
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
  const [previewAttachment, setPreviewAttachment] = useState<{ id: string; filename: string; mime: string } | null>(null);
  const [showTranslator, setShowTranslator] = useState(false);
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

  useEffect(() => {
    if (message) {
      setLocalAllowImages(false);
    }
  }, [message?.id]);

  const hasRemoteImages = useMemo(() => {
    if (!message || !message.body) return false;
    try {
      const htmlBody = message.body?.html;
      if (!htmlBody || typeof htmlBody !== 'string') return false;
      return /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi.test(htmlBody);
    } catch (error) {
      console.error('Error checking remote images:', error);
      return false;
    }
  }, [message]);

  const effectiveAllowImages = allowRemoteImages || localAllowImages;

  const sanitizedHtml = useMemo(() => {
    if (!message || !message.body) return '';
    
    try {
      const htmlBody = message.body?.html;
      const textBody = message.body?.text;
      
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
  }, [message, effectiveAllowImages]);

  const isDark = useMemo(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  }, [message?.id]);

  const iframeSrcDoc = useMemo(() => {
    if (!sanitizedHtml) return '';
    const bgColor = isDark ? 'hsl(217.2, 32.6%, 17.5%)' : '#ffffff';
    const textColor = isDark ? 'hsl(210, 40%, 98%)' : '#111827';
    const codeBg = isDark ? 'hsl(222.2, 84%, 4.9%)' : '#f3f4f6';
    const blockquoteBg = isDark ? 'hsl(217.2, 32.6%, 17.5%)' : '#f9fafb';
    const blockquoteBorder = isDark ? 'hsl(215, 20.2%, 65.1%)' : '#e5e7eb';
    const blockquoteText = isDark ? 'hsl(210, 40%, 98%)' : '#374151';
    const tableHeaderBg = isDark ? 'hsl(217.2, 32.6%, 20%)' : '#f9fafb';
    return [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<style>',
      '* { box-sizing: border-box; }',
      'html, body { height: 100%; margin: 0; padding: 0; }',
      `body { padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: ${bgColor}; color: ${textColor}; line-height: 1.6; font-size: 15px; transition: background-color 0.3s ease, color 0.3s ease; }`,
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
      'img { max-width: 100%; height: auto; display: block; margin: 12px auto; }',
      'img[align="left"] { float: left; margin: 0 16px 12px 0; }',
      'img[align="right"] { float: right; margin: 0 0 12px 16px; }',
      'img[align="center"] { display: block; margin: 12px auto; float: none; }',
      'table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 12px 0; border: none !important; }',
      'table[width] { width: 100% !important; max-width: 100%; border: none !important; }',
      'table td, table th { padding: 8px 12px; border: none !important; word-wrap: break-word; }',
      `table th { background: ${tableHeaderBg}; font-weight: 600; border: none !important; color: ${textColor}; }`,
      'table[role="presentation"] { width: 100% !important; border: none !important; }',
      'table[role="presentation"] td { padding: 0; border: none !important; }',
      'table[style*="border"], table[style*="Border"] { border: none !important; }',
      'td[style*="border"], td[style*="Border"], th[style*="border"], th[style*="Border"] { border: none !important; }',
      'table[style*="border-color"], table[style*="Border-color"] { border: none !important; }',
      'td[style*="border-color"], td[style*="Border-color"], th[style*="border-color"], th[style*="Border-color"] { border: none !important; }',
      'div { margin: 0; }',
      'div[align="center"] { text-align: center; }',
      'div[align="left"] { text-align: left; }',
      'div[align="right"] { text-align: right; }',
      'p[align="center"] { text-align: center; }',
      'p[align="left"] { text-align: left; }',
      'p[align="right"] { text-align: right; }',
      'span[style*="text-align: center"], span[style*="text-align:center"], span[style*="text-align: center;"] { display: block; text-align: center; }',
      'span[style*="text-align: right"], span[style*="text-align:right"], span[style*="text-align: right;"] { display: block; text-align: right; }',
      'div[style*="text-align: center"], div[style*="text-align:center"], div[style*="text-align: center;"] { text-align: center !important; }',
      'div[style*="text-align: right"], div[style*="text-align:right"], div[style*="text-align: right;"] { text-align: right !important; }',
      'td[align="center"], th[align="center"] { text-align: center; }',
      'td[align="left"], th[align="left"] { text-align: left; }',
      'td[align="right"], th[align="right"] { text-align: right; }',
      '.button, a[class*="button"], a[class*="Button"], a[class*="btn"], a[class*="Btn"] { display: inline-block; padding: 12px 24px; margin: 12px auto; background: #2563eb !important; color: #ffffff !important; text-decoration: none !important; border-radius: 6px; text-align: center; font-weight: 500; border: none; }',
      'a[style*="background-color"], a[style*="background-color:"] { display: inline-block; padding: 12px 24px; margin: 12px auto; text-align: center; border-radius: 6px; text-decoration: none !important; }',
      'a[style*="background:"], a[style*="background:"] { display: inline-block; padding: 12px 24px; margin: 12px auto; text-align: center; border-radius: 6px; text-decoration: none !important; }',
      'div[style*="text-align: center"] .button, div[style*="text-align: center"] a[class*="button"], div[style*="text-align: center"] a[class*="Button"], div[style*="text-align: center"] a[class*="btn"], div[style*="text-align: center"] a[class*="Btn"], div[align="center"] .button, div[align="center"] a[class*="button"], div[align="center"] a[class*="Button"], div[align="center"] a[class*="btn"], div[align="center"] a[class*="Btn"] { margin: 12px auto; }',
      'td[align="center"] .button, td[align="center"] a[class*="button"], td[align="center"] a[class*="Button"], td[align="center"] a[class*="btn"], td[align="center"] a[class*="Btn"], td[style*="text-align: center"] .button, td[style*="text-align: center"] a[class*="button"], td[style*="text-align: center"] a[class*="Button"], td[style*="text-align: center"] a[class*="btn"], td[style*="text-align: center"] a[class*="Btn"] { margin: 12px auto; }',
      'table[align="center"] { margin-left: auto; margin-right: auto; }',
      'table[align="left"] { margin-left: 0; margin-right: auto; }',
      'table[align="right"] { margin-left: auto; margin-right: 0; }',
      'table[style*="margin: 0 auto"], table[style*="margin:0 auto"] { margin-left: auto !important; margin-right: auto !important; }',
      'td[style*="text-align: center"], td[style*="text-align:center"], td[style*="text-align: center;"] { text-align: center !important; }',
      'td[style*="text-align: right"], td[style*="text-align:right"], td[style*="text-align: right;"] { text-align: right !important; }',
      'div[style*="width"], div[style*="max-width"] { max-width: 100% !important; }',
      'span[style*="width"], span[style*="max-width"] { max-width: 100% !important; }',
      'td[style*="width"], td[style*="max-width"] { max-width: 100% !important; }',
      '@media (max-width: 600px) {',
      '  body { padding: 12px; font-size: 14px; }',
      '  img[align="left"], img[align="right"] { float: none; display: block; margin: 12px auto; }',
      '  table { font-size: 14px; width: 100% !important; max-width: 100% !important; }',
      '  table td, table th { padding: 6px 8px; max-width: 100% !important; word-wrap: break-word; }',
      '  div[style*="width"], div[style*="max-width"] { width: 100% !important; max-width: 100% !important; }',
      '  span[style*="width"], span[style*="max-width"] { width: 100% !important; max-width: 100% !important; }',
      '  td[style*="width"], td[style*="max-width"] { width: auto !important; max-width: 100% !important; }',
      '}',
      '</style>',
      '</head>',
      `<body>${sanitizedHtml}</body>`,
      '</html>',
    ].join('');
  }, [sanitizedHtml, isDark]);

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
      <div className="flex h-full flex-col p-4 space-y-4">
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
      <div className="flex h-full items-center justify-center text-muted-foreground">
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
      <div className="flex h-full items-center justify-center text-muted-foreground">
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
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  return (
    <div className="flex h-full w-full flex-col border-l bg-background overflow-hidden max-md:border-l-0" role="region" aria-label={t('viewerLabel')}>
      {/* Header — subject, from/to, auth badges, secondary actions */}
      <div className="border-b bg-background px-4 pt-4 pb-3 max-md:px-3 max-md:pt-3 max-md:pb-2 flex-shrink-0">
        <div className="flex items-start gap-2">
          {isMobile && onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0 -ml-1" aria-label="Back">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold max-md:text-base break-words leading-tight">{message.subject || tCommon('noSubject')}</h2>
            <div className="mt-1.5 text-sm text-muted-foreground max-md:text-xs space-y-0.5">
              <div className="break-words">
                <span className="font-medium text-foreground">{message.from?.name || message.from?.email}</span>
                {message.from?.name && <span className="ml-1 text-muted-foreground">&lt;{message.from.email}&gt;</span>}
              </div>
              {message.to && message.to.length > 0 && (
                <div className="break-words text-muted-foreground text-xs">
                  {t('to')} {message.to.map((r) => (r?.name ? `${r.name} <${r.email || ''}>` : r?.email || '')).join(', ')}
                </div>
              )}
              {message.cc && message.cc.length > 0 && (
                <div className="break-words text-muted-foreground text-xs">
                  {t('cc')} {message.cc.map((c) => (c?.name ? `${c.name} <${c.email || ''}>` : c?.email || '')).join(', ')}
                </div>
              )}
              <div className="text-muted-foreground text-xs tabular-nums">
                {message.date ? formatDate(message.date, localeSettings) : tCommon('unknown')}
              </div>
            </div>
            {/* Auth badges */}
            {message.authResults && (
              <div className="mt-2 flex flex-wrap gap-1">
                {(['dkim', 'spf', 'dmarc'] as const).map((key) => {
                  const result = message.authResults![key];
                  if (!result || result === 'none') return null;
                  const isPass = result === 'pass';
                  return (
                    <span
                      key={key}
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold ${
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
              <div className="mt-2 flex flex-wrap gap-1">
                {messageLabelObjects.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                    style={{
                      backgroundColor: `${label.color || '#3b82f6'}15`,
                      color: label.color || '#3b82f6',
                      border: `1px solid ${label.color || '#3b82f6'}30`,
                    }}
                  >
                    {label.name}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveLabel(label.id); }}
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
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStar}
              title={message.flags?.starred ? t('removeFromFavorites') : t('addToFavorites')}
              aria-label={message.flags?.starred ? t('removeFromFavorites') : t('addToFavorites')}
              className="h-8 w-8"
            >
              {message.flags?.starred
                ? <Star className="h-4 w-4 fill-[hsl(var(--starred))] text-[hsl(var(--starred))]" />
                : <Star className="h-4 w-4 text-muted-foreground" />}
            </Button>
            {/* Overflow menu — secondary actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={handleToggleImportant} className="cursor-pointer">
                  <AlertCircle className={`mr-2 h-4 w-4 ${message.flags?.important ? 'fill-orange-500 text-orange-500' : ''}`} />
                  {message.flags?.important ? t('removeImportance') : t('markImportant')}
                </DropdownMenuItem>
                {message.flags?.unread && (
                  <DropdownMenuItem onClick={handleMarkRead} className="cursor-pointer">
                    <Mail className="mr-2 h-4 w-4" />
                    {t('markRead')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => setShowTranslator(!showTranslator)} className="cursor-pointer">
                  <Languages className="mr-2 h-4 w-4" />
                  {t('translate')}
                </DropdownMenuItem>
                {/* Labels submenu inline */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="cursor-pointer">
                      <Tag className="mr-2 h-4 w-4" />
                      {t('labels')}
                    </DropdownMenuItem>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="left" className="w-48">
                    {labels.length === 0 ? (
                      <div className="p-2 text-sm text-muted-foreground">{t('noLabels')}</div>
                    ) : labels.map((label) => {
                      const isSelected = message?.labels?.includes(label.id) || false;
                      return (
                        <DropdownMenuItem key={label.id} onClick={() => handleToggleLabel(label.id)} className="flex items-center gap-2 cursor-pointer">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color || '#3b82f6' }} />
                          <span className="flex-1">{label.name}</span>
                          {isSelected && <span className="text-xs text-muted-foreground">✓</span>}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
                {message && message.body && message.body.text && message.body.text.includes('-----BEGIN PGP MESSAGE-----') && (
                  <DropdownMenuItem onClick={async () => {
                    try {
                      const res = await fetch('/api/pgp/decrypt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encryptedMessage: message.body?.text || message.body?.html?.replace(/<[^>]*>/g, '') || '' }) });
                      if (res.ok) {
                        const data = await res.json();
                        toast.success(t('decrypted'));
                        if (message.body) { message.body.text = data.decryptedMessage; message.body.html = data.decryptedMessage.replace(/\n/g, '<br>'); }
                      } else { toast.error(t('decryptFailed')); }
                    } catch { toast.error(t('decryptError')); }
                  }} className="cursor-pointer">
                    <Lock className="mr-2 h-4 w-4" />
                    {t('decrypt')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { if (!message) return; window.open(`/api/mail/messages/${message.id}/export?format=eml`, '_blank'); }} className="cursor-pointer">
                  <Download className="mr-2 h-4 w-4" />
                  {t('exportEml')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { if (!message) return; window.open(`/api/mail/messages/${message.id}/export?format=pdf`, '_blank'); }} className="cursor-pointer">
                  <FileDown className="mr-2 h-4 w-4" />
                  {t('exportPdf')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrint} className="cursor-pointer">
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
          <div className="border-b bg-muted/20 px-4 py-3 max-md:px-3 max-md:py-2 flex-shrink-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('attachments', { count: message.attachments.length })}</h3>
            <div className="flex flex-wrap gap-2">
              {message.attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium truncate max-w-[160px]">{att.filename}</div>
                    <div className="text-xs text-muted-foreground">{(att.size / 1024).toFixed(1)} KB</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {(att.mime.startsWith('image/') || att.mime === 'application/pdf' || att.mime.startsWith('text/')) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewAttachment({ id: att.id, filename: att.filename, mime: att.mime })} title={t('preview')}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async () => {
                      try {
                        const url = `/api/mail/attachments/${att.id}/download?messageId=${message.id}`;
                        const response = await fetch(url);
                        if (!response.ok) { const error = await response.json().catch(() => ({ error: 'Failed to download' })); toast.error(error.error || t('downloadError')); return; }
                        const blob = await response.blob();
                        const downloadUrl = window.URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = downloadUrl; link.download = att.filename;
                        document.body.appendChild(link); link.click(); document.body.removeChild(link);
                        window.URL.revokeObjectURL(downloadUrl);
                      } catch { toast.error(t('downloadError')); }
                    }} title={t('download')}>
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasRemoteImages && !effectiveAllowImages && (
          <div className="border-b bg-amber-50 dark:bg-amber-900/10 px-4 py-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => setLocalAllowImages(true)} className="h-7 text-xs">
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
          <div className="flex-1 w-full min-h-[300px] flex items-center justify-center text-muted-foreground">
            <p>{t('noBody')}</p>
          </div>
        )}
        {showTranslator && message && message.body && (
          <div className="p-4 border-t">
            <MessageTranslator
              originalText={message.body.text || message.body.html?.replace(/<[^>]*>/g, '') || ''}
              originalHtml={message.body.html}
            />
          </div>
        )}
        {message && (
          <div className="p-4 border-t">
            <DeliveryTracking messageId={message.id} />
          </div>
        )}
      </div>

      {/* Sticky bottom toolbar — primary actions */}
      <div className="flex-shrink-0 border-t bg-background px-4 py-2.5 max-md:px-3 max-md:pb-safe-bottom">
        <div className="flex items-center gap-2 max-md:gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReply}
            className="gap-1.5 font-medium max-md:min-h-[44px] touch-manipulation"
            aria-label={t('reply')}
          >
            <Reply className="h-4 w-4" />
            <span className="max-md:hidden">{t('reply')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReplyAll}
            className="gap-1.5 font-medium max-md:min-h-[44px] touch-manipulation"
            aria-label={t('replyAll')}
          >
            <ReplyAll className="h-4 w-4" />
            <span className="max-md:hidden">{t('replyAll')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onForward}
            className="gap-1.5 font-medium max-md:min-h-[44px] touch-manipulation"
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
