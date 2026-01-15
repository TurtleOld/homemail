'use client';

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { MessageDetail } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { Mail, Star, StarOff, Reply, ReplyAll, Forward, Trash2, Download } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface MessageViewerProps {
  message: MessageDetail | null;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
  onStar?: (starred: boolean) => void;
  onMarkRead?: (read: boolean) => void;
  allowRemoteImages?: boolean;
}

export function MessageViewer({
  message,
  onReply,
  onReplyAll,
  onForward,
  onDelete,
  onStar,
  onMarkRead,
  allowRemoteImages = false,
}: MessageViewerProps) {
  const queryClient = useQueryClient();
  const markedAsReadRef = useRef<Set<string>>(new Set());
  const [localAllowImages, setLocalAllowImages] = useState(false);

  useEffect(() => {
    if (message) {
      setLocalAllowImages(false);
    }
  }, [message?.id]);

  const hasRemoteImages = useMemo(() => {
    if (!message) return false;
    const htmlBody = message.body?.html;
    if (!htmlBody || typeof htmlBody !== 'string') return false;
    return /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi.test(htmlBody);
  }, [message]);

  const effectiveAllowImages = allowRemoteImages || localAllowImages;

  const sanitizedHtml = useMemo(() => {
    if (!message) return '';
    
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
    
    return '';
  }, [message, effectiveAllowImages]);

  const iframeSrcDoc = useMemo(() => {
    if (!sanitizedHtml) return '';
    return [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<style>',
      '* { box-sizing: border-box; }',
      'html, body { height: 100%; margin: 0; padding: 0; }',
      'body { padding: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #ffffff; color: #111827; line-height: 1.6; font-size: 15px; }',
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
      'blockquote { margin: 12px 0; padding: 12px 16px; border-left: 4px solid #e5e7eb; background: #f9fafb; color: #374151; }',
      'code { padding: 2px 6px; background: #f3f4f6; border-radius: 3px; font-family: "Courier New", monospace; font-size: 0.9em; }',
      'pre { margin: 12px 0; padding: 12px; background: #f3f4f6; border-radius: 4px; overflow-x: auto; }',
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
      'table th { background: #f9fafb; font-weight: 600; border: none !important; }',
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
  }, [sanitizedHtml]);

  const handleMarkRead = useCallback(async () => {
    if (!message) return;
    try {
      await fetch(`/api/mail/messages/${message.id}/flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unread: false }),
      });
      onMarkRead?.(true);
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    } catch (error) {
      console.error('Failed to update read status:', error);
    }
  }, [message, onMarkRead, queryClient]);

  useEffect(() => {
    if (!message) return;
    if (message.flags.unread && !markedAsReadRef.current.has(message.id)) {
      markedAsReadRef.current.add(message.id);
      handleMarkRead();
    }
  }, [message, handleMarkRead]);

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
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['message', message.id] });
    } catch (error) {
      console.error('Failed to update star:', error);
    }
  };

  return (
    <div className="flex h-full w-full flex-col border-l bg-background overflow-hidden">
      <div className="border-b bg-muted/50 p-4">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{message.subject || '(без темы)'}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              <div>
                <strong>От:</strong> {message.from.name ? `${message.from.name} <${message.from.email}>` : message.from.email}
              </div>
              {message.to.length > 0 && (
                <div>
                  <strong>Кому:</strong> {message.to.map((t) => (t.name ? `${t.name} <${t.email}>` : t.email)).join(', ')}
                </div>
              )}
              {message.cc && message.cc.length > 0 && (
                <div>
                  <strong>Копия:</strong> {message.cc.map((c) => (c.name ? `${c.name} <${c.email}>` : c.email)).join(', ')}
                </div>
              )}
              <div>
                <strong>Дата:</strong> {formatDate(message.date)}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" onClick={handleStar} title={message.flags.starred ? 'Убрать из избранного' : 'Добавить в избранное'}>
              {message.flags.starred ? <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" /> : <StarOff className="h-4 w-4" />}
            </Button>
            {message.flags.unread && (
              <Button variant="ghost" size="icon" onClick={handleMarkRead} title="Отметить как прочитанное">
                <Mail className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onReply}>
            <Reply className="mr-2 h-4 w-4" />
            Ответить
          </Button>
          <Button variant="outline" size="sm" onClick={onReplyAll}>
            <ReplyAll className="mr-2 h-4 w-4" />
            Ответить всем
          </Button>
          <Button variant="outline" size="sm" onClick={onForward}>
            <Forward className="mr-2 h-4 w-4" />
            Переслать
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" />
            Удалить
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto flex flex-col">
        {message.attachments.length > 0 && (
          <div className="border-b bg-muted/30 p-4 flex-shrink-0">
            <h3 className="mb-2 text-sm font-semibold">Вложения ({message.attachments.length}):</h3>
            <div className="space-y-2">
              {message.attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between rounded border bg-background p-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{att.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {(att.size / 1024).toFixed(1)} KB • {att.mime}
                    </div>
                  </div>
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
                  >
                    <Download className="h-4 w-4" />
                  </Button>
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
    </div>
  );
}
