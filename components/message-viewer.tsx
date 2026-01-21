'use client';

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { MessageDetail, Label } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { useLocaleSettings } from '@/lib/hooks';
import { sanitizeHtml } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { Mail, Star, StarOff, Reply, ReplyAll, Forward, Trash2, Download, AlertCircle, Tag, X, FileDown, Printer, Eye, Languages, Lock } from 'lucide-react';
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
      toast.success('Метки обновлены');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Ошибка обновления меток');
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
          <p className="text-destructive font-medium mb-2">Ошибка загрузки письма</p>
          <p className="text-sm">{error.message || 'Не удалось загрузить письмо'}</p>
        </div>
      </div>
    );
  }

  if (!message) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>Выберите письмо для просмотра</p>
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

  const messageLabelObjects = useMemo(() => {
    if (!message?.labels) return [];
    return labels.filter((label) => message.labels?.includes(label.id));
  }, [message?.labels, labels]);

  return (
    <div className="flex h-full w-full flex-col border-l bg-background overflow-hidden max-md:border-l-0" role="region" aria-label="Просмотр письма">
      <div className="border-b bg-muted/50 p-4 max-md:p-2 transition-colors duration-200">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold max-md:text-base break-words">{message.subject || '(без темы)'}</h2>
            <div className="mt-1 text-sm text-muted-foreground max-md:text-xs">
              <div className="break-words">
                <strong>От:</strong> {message.from?.name ? `${message.from.name} <${message.from.email || ''}>` : message.from?.email || 'Неизвестно'}
              </div>
              {message.to && message.to.length > 0 && (
                <div className="break-words">
                  <strong>Кому:</strong> {message.to.map((t) => (t?.name ? `${t.name} <${t.email || ''}>` : t?.email || '')).join(', ')}
                </div>
              )}
              {message.cc && message.cc.length > 0 && (
                <div className="break-words">
                  <strong>Копия:</strong> {message.cc.map((c) => (c?.name ? `${c.name} <${c.email || ''}>` : c?.email || '')).join(', ')}
                </div>
              )}
              <div>
                <strong>Дата:</strong> {message.date ? formatDate(message.date, localeSettings) : 'Неизвестно'}
              </div>
            </div>
            {messageLabelObjects.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {messageLabelObjects.map((label) => (
                  <span
                    key={label.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      backgroundColor: `${label.color || '#3b82f6'}20`,
                      color: label.color || '#3b82f6',
                      border: `1px solid ${label.color || '#3b82f6'}40`,
                    }}
                  >
                    {label.name}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveLabel(label.id);
                      }}
                      className="hover:opacity-70"
                      aria-label={`Удалить метку ${label.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleStar} 
              title={message.flags?.starred ? 'Убрать из избранного' : 'Добавить в избранное'}
              aria-label={message.flags?.starred ? 'Убрать из избранного' : 'Добавить в избранное'}
            >
              {message.flags?.starred ? <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" /> : <StarOff className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleImportant}
              title={message.flags?.important ? 'Убрать важность' : 'Отметить как важное'}
              aria-label={message.flags?.important ? 'Убрать важность' : 'Отметить как важное'}
            >
              <AlertCircle
                className={`h-4 w-4 ${message.flags?.important ? 'fill-orange-500 text-orange-500' : ''}`}
              />
            </Button>
            {message.flags && message.flags.unread && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleMarkRead} 
                title="Отметить как прочитанное"
                aria-label="Отметить как прочитанное"
              >
                <Mail className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2 max-md:flex-wrap max-md:gap-2 max-md:justify-center">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onReply} 
            className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
            aria-label="Ответить"
          >
            <Reply className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
            <span className="max-md:hidden">Ответить</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onReplyAll} 
            className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
            aria-label="Ответить всем"
          >
            <ReplyAll className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
            <span className="max-md:hidden">Ответить всем</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onForward} 
            className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
            aria-label="Переслать"
          >
            <Forward className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
            <span className="max-md:hidden">Переслать</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onDelete} 
            className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
            aria-label="Удалить"
          >
            <Trash2 className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
            <span className="max-md:hidden">Удалить</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowTranslator(!showTranslator)} 
            className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
            aria-label="Перевести"
          >
            <Languages className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
            <span className="max-md:hidden">Перевести</span>
          </Button>
          {message && message.body && message.body.text && message.body.text.includes('-----BEGIN PGP MESSAGE-----') && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={async () => {
                try {
                  const res = await fetch('/api/pgp/decrypt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      encryptedMessage: message.body?.text || message.body?.html?.replace(/<[^>]*>/g, '') || '',
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    toast.success('Письмо расшифровано');
                    if (message.body) {
                      message.body.text = data.decryptedMessage;
                      message.body.html = data.decryptedMessage.replace(/\n/g, '<br>');
                    }
                  } else {
                    toast.error('Не удалось расшифровать. Проверьте наличие приватного ключа.');
                  }
                } catch (error) {
                  toast.error('Ошибка расшифровки');
                }
              }}
              className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
              aria-label="Расшифровать"
            >
              <Lock className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
              <span className="max-md:hidden">Расшифровать</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
                aria-label="Управление метками"
              >
                <Tag className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
                <span className="max-md:hidden">Метки</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {labels.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">
                  Нет меток. Создайте метки в настройках.
                </div>
              ) : (
                labels.map((label) => {
                  const isSelected = message?.labels?.includes(label.id) || false;
                  return (
                    <DropdownMenuItem
                      key={label.id}
                      onClick={() => handleToggleLabel(label.id)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: label.color || '#3b82f6' }}
                      />
                      <span className="flex-1">{label.name}</span>
                      {isSelected && (
                        <span className="text-xs text-muted-foreground">✓</span>
                      )}
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
                aria-label="Экспорт письма"
              >
                <FileDown className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
                <span className="max-md:hidden">Экспорт</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  if (!message) return;
                  const url = `/api/mail/messages/${message.id}/export?format=eml`;
                  window.open(url, '_blank');
                }}
                className="cursor-pointer"
              >
                <Download className="mr-2 h-4 w-4" />
                Экспорт в EML
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (!message) return;
                  const url = `/api/mail/messages/${message.id}/export?format=pdf`;
                  window.open(url, '_blank');
                }}
                className="cursor-pointer"
              >
                <FileDown className="mr-2 h-4 w-4" />
                Экспорт в PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
              </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!message) return;
              const printWindow = window.open('', '_blank');
              if (!printWindow) return;
              
              const printContent = `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <title>${message.subject || 'Письмо'}</title>
                    <style>
                      @media print {
                        @page {
                          margin: 2cm;
                        }
                        body {
                          margin: 0;
                          padding: 0;
                        }
                      }
                      body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                        line-height: 1.6;
                      }
                      .header {
                        border-bottom: 2px solid #e0e0e0;
                        padding-bottom: 15px;
                        margin-bottom: 20px;
                      }
                      .header h1 {
                        margin: 0 0 10px 0;
                        font-size: 20px;
                      }
                      .header-info {
                        font-size: 12px;
                        color: #666;
                      }
                      .header-info div {
                        margin: 5px 0;
                      }
                      .content {
                        margin-top: 20px;
                      }
                    </style>
                  </head>
                  <body>
                    <div class="header">
                      <h1>${message.subject || '(без темы)'}</h1>
                      <div class="header-info">
                        <div><strong>От:</strong> ${message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email}</div>
                        ${message.to.length > 0 ? `<div><strong>Кому:</strong> ${message.to.map((t) => (t.name ? `${t.name} <${t.email}>` : t.email)).join(', ')}</div>` : ''}
                        ${message.cc && message.cc.length > 0 ? `<div><strong>Копия:</strong> ${message.cc.map((c) => (c.name ? `${c.name} <${c.email}>` : c.email)).join(', ')}</div>` : ''}
                        <div><strong>Дата:</strong> ${formatDate(message.date, localeSettings)}</div>
                      </div>
                    </div>
                    <div class="content">
                      ${sanitizedHtml}
                    </div>
                  </body>
                </html>
              `;
              
              printWindow.document.write(printContent);
              printWindow.document.close();
              
              setTimeout(() => {
                printWindow.print();
                printWindow.close();
              }, 250);
            }}
            className="max-md:min-h-[44px] max-md:min-w-[44px] max-md:px-3 max-md:text-sm touch-manipulation"
            aria-label="Печать письма"
          >
            <Printer className="mr-2 h-4 w-4 max-md:mr-0 max-md:h-5 max-md:w-5" />
            <span className="max-md:hidden">Печать</span>
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex flex-col max-md:pb-4">
        {message.attachments && message.attachments.length > 0 && (
          <div className="border-b bg-muted/30 p-4 max-md:p-2 flex-shrink-0">
            <h3 className="mb-2 text-sm font-semibold max-md:text-xs">Вложения ({message.attachments.length}):</h3>
            <div className="space-y-2">
              {message.attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between rounded border bg-background p-2 max-md:p-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium max-md:text-xs truncate">{att.filename}</div>
                    <div className="text-xs text-muted-foreground max-md:text-[10px]">
                      {(att.size / 1024).toFixed(1)} KB • {att.mime}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(att.mime.startsWith('image/') || att.mime === 'application/pdf' || att.mime.startsWith('text/')) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewAttachment({ id: att.id, filename: att.filename, mime: att.mime })}
                        title="Предпросмотр"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          const url = `/api/mail/attachments/${att.id}/download?messageId=${message.id}`;
                          const response = await fetch(url);
                          if (!response.ok) {
                            const error = await response.json().catch(() => ({ error: 'Failed to download' }));
                            toast.error(error.error || 'Ошибка скачивания');
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
                        } catch (error) {
                          console.error('Download error:', error);
                          toast.error('Ошибка скачивания');
                        }
                      }}
                      title="Скачать"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasRemoteImages && !effectiveAllowImages && (
          <div className="border-b bg-muted/30 p-4 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocalAllowImages(true)}
              className="w-full"
            >
              Изображения по умолчанию не отображаются. Нажмите здесь, чтобы их загрузить
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
            <p>Тело письма отсутствует</p>
          </div>
        )}
      </div>
        {showTranslator && message && message.body && (
          <div className="mb-4 p-4 border rounded-lg">
            <MessageTranslator
              originalText={message.body.text || message.body.html?.replace(/<[^>]*>/g, '') || ''}
              originalHtml={message.body.html}
            />
          </div>
        )}
        {message && (
          <div className="mb-4">
            <DeliveryTracking messageId={message.id} />
          </div>
        )}
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
