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
import { Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, Quote, Code, Link as LinkIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateEmail, parseEmailList } from '@/lib/utils';
import { toast } from 'sonner';
import type { Draft } from '@/lib/types';

function removeSignatureFromHtml(html: string, signature?: string): string {
  if (!signature) return html;
  const signatureValue = signature.trim();
  const signatureHtml = signatureValue.replace(/\n/g, '<br>');
  const signatureDiv = `<div style="border-top: 1px solid #e0e0e0; padding-top: 10px;">${signatureHtml}</div>`;
  const escapedSignature = signatureDiv.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedSignatureWithBreaks = `<br><br>${escapedSignature}`;
  let result = html;
  result = result.replace(new RegExp(escapedSignatureWithBreaks, 'gi'), '');
  result = result.replace(new RegExp(escapedSignature, 'gi'), '');
  return result;
}

interface MinimizedDraft {
  id: string;
  to: string;
  subject: string;
  html: string;
}

interface ComposeProps {
  open: boolean;
  onClose: () => void;
  onMinimize?: (draft: MinimizedDraft) => void;
  initialDraft?: Draft | null;
  replyTo?: { subject: string; from: { email: string; name?: string }; body: string };
  forwardFrom?: { subject: string; body: string };
  signature?: string;
}

export function Compose({ open, onClose, onMinimize, initialDraft, replyTo, forwardFrom, signature }: ComposeProps) {
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
  const suppressDirtyRef = useRef(false);
  const didInitRef = useRef(false);

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
        const htmlWithoutSignature = removeSignatureFromHtml(initialDraft.html, signature);
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
    didInitRef.current = true;
  }, [initialDraft, replyTo, forwardFrom, editor, open, signature]);

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
      html = removeSignatureFromHtml(html, signature);

      const res = await fetch('/api/mail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      }
    } catch (error) {
      console.error('Failed to save draft:', error);
    } finally {
      setSaving(false);
    }
  }, [editor, to, cc, bcc, showCc, showBcc, subject, draftId, signature]);

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
      toast.error('Укажите получателя');
      return;
    }

    for (const email of toList) {
      if (!validateEmail(email)) {
        toast.error(`Неверный email: ${email}`);
        return;
      }
    }

    setSending(true);
    try {
      let html = editor.getHTML();
      const signatureValue = signature?.trim();
      if (signatureValue) {
        const signatureHtml = signatureValue.replace(/\n/g, '<br>');
        const signatureDiv = `<div style="border-top: 1px solid #e0e0e0; padding-top: 10px;">${signatureHtml}</div>`;
        const trimmedHtml = html.trim();
        const hasContent = trimmedHtml && trimmedHtml !== '<p></p>' && !trimmedHtml.match(/^<p>\s*<\/p>$/i);
        if (!html.includes(signatureDiv)) {
          html += hasContent ? `<br><br>${signatureDiv}` : signatureDiv;
        }
      }

      const res = await fetch('/api/mail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList,
          cc: showCc ? parseEmailList(cc) : [],
          bcc: showBcc ? parseEmailList(bcc) : [],
          subject,
          html,
          draftId: draftId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorMessage = data.error || data.details || `Ошибка отправки (${res.status})`;
        console.error('Send error:', errorMessage, data);
        toast.error(errorMessage);
        return;
      }

      toast.success('Письмо отправлено');
      onClose();
    } catch (error) {
      console.error('Send error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка соединения';
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
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
          <DialogTitle className="max-md:text-base">{replyTo ? 'Ответить' : forwardFrom ? 'Переслать' : 'Новое письмо'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto space-y-4 max-md:space-y-2">
          <div>
            <Input
              placeholder="Кому"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mb-2 max-md:text-sm"
            />
            {showCc && (
              <Input
                placeholder="Копия"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="mb-2 max-md:text-sm"
              />
            )}
            {showBcc && (
              <Input
                placeholder="Скрытая копия"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="mb-2 max-md:text-sm"
              />
            )}
            <div className="flex gap-2 text-sm max-md:text-xs">
              <button
                type="button"
                onClick={() => setShowCc(!showCc)}
                className="text-primary hover:underline"
              >
                {showCc ? 'Скрыть' : 'Копия'}
              </button>
              <button
                type="button"
                onClick={() => setShowBcc(!showBcc)}
                className="text-primary hover:underline"
              >
                {showBcc ? 'Скрыть' : 'Скрытая копия'}
              </button>
            </div>
          </div>
          <Input
            placeholder="Тема"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="max-md:text-sm"
          />
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
        <DialogFooter className="max-md:flex-col max-md:gap-2">
          <Button variant="outline" onClick={handleClose} className="max-md:w-full">
            Отмена
          </Button>
          <Button onClick={handleSend} disabled={sending || saving} className="max-md:w-full">
            {sending ? 'Отправка...' : saving ? 'Сохранение...' : 'Отправить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
