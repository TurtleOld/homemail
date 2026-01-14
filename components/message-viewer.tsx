'use client';

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import type { MessageDetail } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import { Button } from '@/components/ui/button';
import { Mail, Star, StarOff, Reply, ReplyAll, Forward, Trash2, Download } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

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
      'html, body { height: 100%; }',
      'body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, sans-serif; background: #ffffff; color: #111827; }',
      'img { max-width: 100%; height: auto; }',
      'a { color: #2563eb; }',
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
                    onClick={() => {
                      window.open(`/api/mail/attachments/${att.id}/download?messageId=${message.id}`, '_blank');
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
