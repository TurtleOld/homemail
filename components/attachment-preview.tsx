'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download, FileText, Image, File } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface AttachmentPreviewProps {
  attachmentId: string;
  messageId: string;
  filename: string;
  mime: string;
  open: boolean;
  onClose: () => void;
}

export function AttachmentPreview({
  attachmentId,
  messageId,
  filename,
  mime,
  open,
  onClose,
}: AttachmentPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setContent(null);
      setError(null);
      setLoading(true);
      return;
    }

    const loadAttachment = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const url = `/api/mail/attachments/${attachmentId}/download?messageId=${messageId}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error('Failed to load attachment');
        }

        if (mime.startsWith('image/')) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          setContent(objectUrl);
        } else if (mime === 'application/pdf') {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          setContent(objectUrl);
        } else if (mime.startsWith('text/')) {
          const text = await response.text();
          setContent(text);
        } else {
          setError('Предпросмотр недоступен для этого типа файла');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки вложения');
      } finally {
        setLoading(false);
      }
    };

    loadAttachment();

    return () => {
      if (content && typeof content === 'string' && content.startsWith('blob:')) {
        URL.revokeObjectURL(content);
      }
    };
  }, [open, attachmentId, messageId, mime]);

  const handleDownload = () => {
    const url = `/api/mail/attachments/${attachmentId}/download?messageId=${messageId}`;
    window.open(url, '_blank');
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto"></div>
            <p className="text-sm text-muted-foreground">Загрузка...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <File className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={handleDownload} className="mt-4">
              <Download className="h-4 w-4 mr-2" />
              Скачать файл
            </Button>
          </div>
        </div>
      );
    }

    if (!content) {
      return null;
    }

    if (mime.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center min-h-[400px] bg-muted/30 p-4">
          <img
            src={content}
            alt={filename}
            className="max-w-full max-h-[70vh] object-contain"
          />
        </div>
      );
    }

    if (mime === 'application/pdf') {
      return (
        <div className="w-full h-[70vh]">
          <iframe
            src={content}
            className="w-full h-full border-0"
            title={filename}
          />
        </div>
      );
    }

    if (mime.startsWith('text/')) {
      return (
        <div className="bg-muted/30 p-4 rounded-md max-h-[70vh] overflow-auto">
          <pre className="text-sm whitespace-pre-wrap font-mono">
            {content}
          </pre>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              {mime.startsWith('image/') ? (
                <Image className="h-5 w-5" />
              ) : mime === 'application/pdf' ? (
                <FileText className="h-5 w-5" />
              ) : (
                <File className="h-5 w-5" />
              )}
              {filename}
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
