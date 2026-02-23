'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import CodeBlock from '@tiptap/extension-code-block';
import Underline from '@tiptap/extension-underline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Quote, Code, Link as LinkIcon, X, Paperclip, File, Clock, ChevronDown, FileText, Lock, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateEmail, parseEmailList } from '@/lib/utils';
import { toast } from 'sonner';
import type { Draft } from '@/lib/types';
import { ContactAutocomplete } from './contact-autocomplete';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

function removeSignatureFromHtml(html: string, signatures: Signature[]): string {
  if (signatures.length === 0) return html;
  let result = html;
  for (const sig of signatures) {
    const signatureValue = sig.content.trim();
    if (!signatureValue) continue;
    const signatureHtml = signatureValue.replace(/\n/g, '<br>');
    const signatureDiv = `<div style="border-top: 1px solid #e0e0e0; padding-top: 10px;">${signatureHtml}</div>`;
    const escapedSignature = signatureDiv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedSignatureWithBreaks = `<br><br>${escapedSignature}`;
    result = result.replace(new RegExp(escapedSignatureWithBreaks, 'gi'), '');
    result = result.replace(new RegExp(escapedSignature, 'gi'), '');
  }
  return result;
}

interface MinimizedDraft {
  id: string;
  to: string;
  subject: string;
  html: string;
}

interface AttachmentFile {
  id: string;
  file: File;
  data: string;
  mime: string;
}

interface Signature {
  id: string;
  name: string;
  content: string;
  isDefault?: boolean;
  context?: 'work' | 'personal' | 'autoReply' | 'general';
}

interface ComposeProps {
  open: boolean;
  onClose: () => void;
  onMinimize?: (draft: MinimizedDraft) => void;
  initialDraft?: Draft | null;
  replyTo?: { subject: string; from: { email: string; name?: string }; body: string };
  forwardFrom?: { subject: string; body: string };
  signatures?: Signature[];
}

export function Compose({ open, onClose, onMinimize, initialDraft, replyTo, forwardFrom, signatures = [] }: ComposeProps) {
  const t = useTranslations('compose');
  const tCommon = useTranslations('common');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(initialDraft?.id);
  const [isDirty, setIsDirty] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [scheduledSend, setScheduledSend] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [requestReadReceipt, setRequestReadReceipt] = useState(false);
  const [encryptMessage, setEncryptMessage] = useState(false);
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(() => {
    const defaultSig = signatures.find(s => s.isDefault);
    return defaultSig?.id || (signatures.length > 0 ? signatures[0]!.id : null);
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suppressDirtyRef = useRef(false);
  const didInitRef = useRef(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  
  const MAX_FILE_SIZE = 25 * 1024 * 1024;

  const getCsrfToken = useCallback(async (): Promise<string> => {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    const token = match ? decodeURIComponent(match[1]!) : '';
    if (token) return token;
    try {
      const res = await fetch('/api/auth/csrf');
      if (res.ok) {
        const data = await res.json();
        return data.csrfToken || '';
      }
    } catch {
      // ignore
    }
    return '';
  }, []);

  const getCsrfHeader = useCallback((): Record<string, string> => {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    const token = match ? decodeURIComponent(match[1]!) : '';
    return token ? { 'x-csrf-token': token } : {};
  }, []);

  useEffect(() => {
    if (!open) return;
    const hasCookie = /(?:^|;\s*)csrf_token=/.test(document.cookie);
    if (hasCookie) return;
    fetch('/api/auth/csrf').catch(() => {
      // best-effort; if it fails the subsequent POST will return 403
    });
  }, [open]);

  const { data: templates = [] } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const res = await fetch('/api/mail/templates');
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (signatures.length > 0) {
      const defaultSig = signatures.find(s => s.isDefault);
      setSelectedSignatureId(defaultSig?.id || signatures[0]!.id);
    } else {
      setSelectedSignatureId(null);
    }
  }, [signatures]);

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), CodeBlock, Underline],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[300px] max-md:min-h-[200px] p-4 max-md:p-2 focus:outline-none',
      },
    },
  });

  useEffect(() => {
    if (!editor || !open) return;

    if (initialDraft) {
      suppressDirtyRef.current = true;
      setTo(initialDraft.to?.join(', ') || '');
      setCc(initialDraft.cc?.join(', ') || '');
      setBcc(initialDraft.bcc?.join(', ') || '');
      setSubject(initialDraft.subject || '');
      setDraftId(initialDraft.id);
      if (initialDraft.html) {
        const htmlWithoutSignature = removeSignatureFromHtml(initialDraft.html, signatures);
        editor.commands.setContent(htmlWithoutSignature);
      }
      requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      });
      setIsDirty(false);
    } else if (replyTo) {
      suppressDirtyRef.current = true;
      setTo(replyTo.from.email);
      setSubject(replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`);
      editor.commands.setContent(`<blockquote>${replyTo.body}</blockquote>`);
      requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      });
      setIsDirty(false);
    } else if (forwardFrom) {
      suppressDirtyRef.current = true;
      setSubject(forwardFrom.subject.startsWith('Fwd:') ? forwardFrom.subject : `Fwd: ${forwardFrom.subject}`);
      editor.commands.setContent(`<blockquote>${forwardFrom.body}</blockquote>`);
      requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      });
      setIsDirty(false);
    } else {
      suppressDirtyRef.current = true;
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setDraftId(undefined);
      editor.commands.setContent('');
      requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      });
      setIsDirty(false);
    }
    setAttachments([]);
    didInitRef.current = true;
  }, [initialDraft, replyTo, forwardFrom, editor, open, signatures]);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      if (suppressDirtyRef.current) return;
      setIsDirty(true);
    };
    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (!didInitRef.current || !open) return;
    setIsDirty(true);
  }, [to, cc, bcc, subject, showCc, showBcc, open]);

  const saveDraft = useCallback(async () => {
    if (!editor) return;

    const toList = parseEmailList(to);
    const ccList = showCc ? parseEmailList(cc) : [];
    const bccList = showBcc ? parseEmailList(bcc) : [];

    if (toList.length === 0 && !subject && !editor.getHTML()) {
      return;
    }

    setSaving(true);
    try {
      let html = editor.getHTML();
      html = removeSignatureFromHtml(html, signatures);

      const res = await fetch('/api/mail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeader() },
        body: JSON.stringify({
          id: draftId,
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject,
          html,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDraftId(data.id);
        setIsDirty(false);
      } else {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || t('draftSaveError');
        console.error('Failed to save draft:', errorMessage, errorData);
        toast.error(t('draftSaveError'), {
          description: errorMessage,
          duration: 5000,
        });
      }
    } catch (error) {
      console.error('Failed to save draft:', error);
      const errorMessage = error instanceof Error ? error.message : t('draftSaveError');
      toast.error(t('draftSaveError'), {
        description: errorMessage,
        duration: 5000,
      });
    } finally {
      setSaving(false);
    }
  }, [editor, to, cc, bcc, showCc, showBcc, subject, draftId, signatures]);

  useEffect(() => {
    if (!open || !editor) return;

    const interval = setInterval(() => {
      if (isDirty) {
        saveDraft();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [open, editor, saveDraft, isDirty]);

  const handleSend = async () => {
    if (!editor) return;

    const toList = parseEmailList(to);
    if (toList.length === 0) {
      toast.error(t('noRecipient'));
      return;
    }

    for (const email of toList) {
      if (!validateEmail(email)) {
        toast.error(t('invalidEmail', { email }));
        return;
      }
    }

    setSending(true);
    try {
      let html = editor.getHTML();
      const selectedSignature = selectedSignatureId ? signatures.find(s => s.id === selectedSignatureId) : null;
      if (selectedSignature) {
        const signatureValue = selectedSignature.content.trim();
        if (signatureValue) {
          const signatureHtml = signatureValue.replace(/\n/g, '<br>');
          const signatureDiv = `<div style="border-top: 1px solid #e0e0e0; padding-top: 10px;">${signatureHtml}</div>`;
          const trimmedHtml = html.trim();
          const hasContent = trimmedHtml && trimmedHtml !== '<p></p>' && !trimmedHtml.match(/^<p>\s*<\/p>$/i);
          if (!html.includes(signatureDiv)) {
            html += hasContent ? `<br><br>${signatureDiv}` : signatureDiv;
          }
        }
      }

      if (encryptMessage) {
        try {
          const allRecipients = [...toList, ...(showCc ? parseEmailList(cc) : []), ...(showBcc ? parseEmailList(bcc) : [])];
          const res = await fetch('/api/pgp/encrypt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: html.replace(/<[^>]*>/g, ''),
              recipientEmails: allRecipients,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            html = data.encryptedMessage;
          } else {
            const errorData = await res.json().catch(() => ({}));
            const missingRecipients = errorData.missingRecipients || allRecipients;
            
            let description = '';
            
            if (missingRecipients.length > 0) {
              description = t('missingKeys', { recipients: missingRecipients.join(', ') });
            }

            toast.error(t('encryptFailed'), {
              description: description,
              duration: 12000,
            });
            setSending(false);
            return;
          }
        } catch (error) {
          console.error('Encryption error:', error);
          toast.error(t('encryptError'));
          setSending(false);
          return;
        }
      }

      const attachmentsData = attachments.length > 0
        ? attachments.map((att) => ({
            filename: att.file.name,
            mime: att.mime,
            data: att.data,
          }))
        : undefined;

      const body: any = {
        to: toList,
        cc: showCc ? parseEmailList(cc) : [],
        bcc: showBcc ? parseEmailList(bcc) : [],
        subject,
        html,
        draftId: draftId,
        attachments: attachmentsData,
        requestReadReceipt,
      };

      if (scheduledSend && scheduledDate && scheduledTime) {
        const sendAt = new Date(`${scheduledDate}T${scheduledTime}`);
        if (sendAt.getTime() > Date.now()) {
          body.scheduledSend = {
            enabled: true,
            sendAt: sendAt.toISOString(),
          };
        } else {
          toast.error(t('pasteDateError'));
          setSending(false);
          return;
        }
      }

      const csrfToken = await getCsrfToken();
      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorMessage = data.error || data.details || `Ошибка отправки (${res.status})`;
        console.error('Send error:', errorMessage, data);
        toast.error(errorMessage);
        setSending(false);
        return;
      }

      const responseData = await res.json();
      if (responseData.scheduled) {
        toast.success(t('scheduledSuccess', { date: new Date(responseData.sendAt).toLocaleString() }));
        onClose();
        setSending(false);
        return;
      }

      const allEmails = [...toList, ...(showCc ? parseEmailList(cc) : []), ...(showBcc ? parseEmailList(bcc) : [])];
      const allEmailStrings = [
        ...(to ? to.split(',').map((e) => e.trim()).filter(Boolean) : []),
        ...(showCc && cc ? cc.split(',').map((e) => e.trim()).filter(Boolean) : []),
        ...(showBcc && bcc ? bcc.split(',').map((e) => e.trim()).filter(Boolean) : []),
      ];
      
      for (const emailString of allEmailStrings) {
        try {
          const emailMatch = emailString.match(/^(.+?)\s*<([^\s@]+@[^\s@]+\.[^\s@]+)>$/);
          const emailAddress = emailMatch ? emailMatch[2]!.trim() : emailString.trim();
          const emailName = emailMatch ? emailMatch[1]!.trim() : undefined;
          
          if (emailAddress && validateEmail(emailAddress)) {
            await fetch('/api/contacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: emailAddress,
                name: emailName,
              }),
            });
          }
        } catch (error) {
          console.error('Failed to save contact:', error);
        }
      }

      toast.success(t('sent'));
      onClose();
    } catch (error) {
      console.error('Send error:', error);
      const errorMessage = error instanceof Error ? error.message : t('sendError');
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newAttachments: AttachmentFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t('fileTooLarge', { filename: file.name, size: (MAX_FILE_SIZE / 1024 / 1024).toFixed(0) }));
        continue;
      }

      try {
        const data = await readFileAsBase64(file);
        newAttachments.push({
          id: `${Date.now()}-${i}`,
          file,
          data,
          mime: file.type || 'application/octet-stream',
        });
      } catch (error) {
        console.error('Error reading file:', error);
        toast.error(t('fileReadError', { filename: file.name }));
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
      setIsDirty(true);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
    setIsDirty(true);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const handleClose = async () => {
    await saveDraft();
    if (onMinimize && (to || subject || editor?.getHTML())) {
      const id = draftId || `draft_${Date.now()}`;
      onMinimize({
        id,
        to,
        subject,
        html: editor?.getHTML() || '',
      });
    } else {
      onClose();
    }
  };

  if (!editor) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] max-md:max-w-full max-md:max-h-full max-md:h-full max-md:rounded-none max-md:m-0 flex flex-col">
        <DialogHeader>
          <DialogTitle className="max-md:text-base">{replyTo ? t('replyTitle') : forwardFrom ? t('forwardTitle') : t('newMessage')}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto space-y-4 max-md:space-y-2">
          <div>
            <ContactAutocomplete
              value={to}
              onChange={setTo}
              placeholder={t('toPlaceholder')}
              className="mb-2"
              multiple
            />
            {showCc && (
              <ContactAutocomplete
                value={cc}
                onChange={setCc}
                placeholder={t('ccPlaceholder')}
                className="mb-2"
                multiple
              />
            )}
            {showBcc && (
              <ContactAutocomplete
                value={bcc}
                onChange={setBcc}
                placeholder={t('bccPlaceholder')}
                className="mb-2"
                multiple
              />
            )}
            <div className="flex gap-2 text-sm max-md:text-xs">
              <button
                type="button"
                onClick={() => setShowCc(!showCc)}
                className="text-primary hover:underline"
              >
                {showCc ? t('hide') : t('cc')}
              </button>
              <button
                type="button"
                onClick={() => setShowBcc(!showBcc)}
                className="text-primary hover:underline"
              >
                {showBcc ? t('hide') : t('bcc')}
              </button>
            </div>
          </div>
          <Input
            placeholder={t('subjectPlaceholder')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="max-md:text-sm"
          />
          {signatures.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('signatureLabel')}</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="max-md:text-xs">
                    {selectedSignatureId ? signatures.find(s => s.id === selectedSignatureId)?.name || t('noSignature') : t('noSignature')}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => setSelectedSignatureId(null)}>
                    {t('noSignature')}
                  </DropdownMenuItem>
                  {signatures.map((sig) => (
                    <DropdownMenuItem
                      key={sig.id}
                      onClick={() => setSelectedSignatureId(sig.id)}
                      className={selectedSignatureId === sig.id ? 'bg-accent' : ''}
                    >
                      <div className="flex items-center gap-2">
                        <span>{sig.name}</span>
                        {sig.isDefault && (
                          <span className="text-xs text-muted-foreground">{t('defaultBadge')}</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {attachments.length > 0 && (
            <div className="border rounded-md p-2 max-md:p-1.5 bg-muted/30">
              <div className="text-sm font-medium mb-2 max-md:text-xs">{t('attachments', { count: attachments.length })}</div>
              <div className="space-y-1">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between rounded border bg-background p-2 max-md:p-1.5"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <File className="h-4 w-4 max-md:h-3 max-md:w-3 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium max-md:text-xs truncate">{att.file.name}</div>
                        <div className="text-xs text-muted-foreground max-md:text-[10px]">
                          {formatFileSize(att.file.size)} • {att.mime}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachment(att.id)}
                      className="h-7 w-7 max-md:h-6 max-md:w-6 p-0 flex-shrink-0"
                      aria-label={t('removeAttachment', { filename: att.file.name })}
                    >
                      <X className="h-4 w-4 max-md:h-3 max-md:w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div
            className={cn(
              'border-2 border-dashed rounded-md p-4 max-md:p-2 transition-colors',
              isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary/50'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center justify-center cursor-pointer"
            >
              <Paperclip className="h-6 w-6 max-md:h-5 max-md:w-5 text-muted-foreground mb-2" />
              <span className="text-sm text-muted-foreground max-md:text-xs text-center">
                {t('dropzone')}
              </span>
              <span className="text-xs text-muted-foreground/70 max-md:text-[10px] mt-1">
                {t('maxFileSize', { size: (MAX_FILE_SIZE / 1024 / 1024).toFixed(0) })}
              </span>
            </label>
          </div>
          <div className="border rounded-md">
            <div className="border-b p-2 max-md:p-1 flex gap-2 max-md:gap-1 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={cn(editor.isActive('bold') ? 'bg-muted' : '', 'max-md:h-7 max-md:w-7 max-md:p-0')}
              >
                <Bold className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={cn(editor.isActive('italic') ? 'bg-muted' : '', 'max-md:h-7 max-md:w-7 max-md:p-0')}
              >
                <Italic className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={cn(editor.isActive('underline') ? 'bg-muted' : '', 'max-md:h-7 max-md:w-7 max-md:p-0')}
              >
                <UnderlineIcon className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={cn(editor.isActive('bulletList') ? 'bg-muted' : '', 'max-md:h-7 max-md:w-7 max-md:p-0')}
              >
                <List className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={cn(editor.isActive('orderedList') ? 'bg-muted' : '', 'max-md:h-7 max-md:w-7 max-md:p-0')}
              >
                <ListOrdered className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={cn(editor.isActive('blockquote') ? 'bg-muted' : '', 'max-md:h-7 max-md:w-7 max-md:p-0')}
              >
                <Quote className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                className={cn(editor.isActive('codeBlock') ? 'bg-muted' : '', 'max-md:h-7 max-md:w-7 max-md:p-0')}
              >
                <Code className="h-4 w-4 max-md:h-3 max-md:w-3" />
              </Button>
            </div>
            <EditorContent editor={editor} />
          </div>
        </div>
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="scheduledSend"
              checked={scheduledSend}
              onChange={(e) => setScheduledSend(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="scheduledSend" className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t('scheduleSend')}
            </label>
          </div>
          {scheduledSend && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div className="space-y-1">
                <label htmlFor="scheduledDate" className="text-xs text-muted-foreground">{t('dateLabel')}</label>
                <Input
                  id="scheduledDate"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="scheduledTime" className="text-xs text-muted-foreground">{t('timeLabel')}</label>
                <Input
                  id="scheduledTime"
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="requestReadReceipt"
              checked={requestReadReceipt}
              onChange={(e) => setRequestReadReceipt(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="requestReadReceipt" className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              {t('readReceipt')}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="encryptMessage"
              checked={encryptMessage}
              onChange={(e) => setEncryptMessage(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="encryptMessage" className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              {t('encryptPgp')}
            </label>
          </div>
        </div>
        <DialogFooter className="max-md:flex-col max-md:gap-2">
          <Button variant="outline" onClick={handleClose} className="max-md:w-full">
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleSend} disabled={sending || saving} className="max-md:w-full">
            {sending ? t('sending') : saving ? tCommon('saving') : scheduledSend ? t('scheduledSend') : t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
