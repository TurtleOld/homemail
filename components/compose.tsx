'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { validateEmail, parseEmailList } from '@/lib/utils';
import { toast } from 'sonner';
import type { Draft } from '@/lib/types';

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
}

export function Compose({ open, onClose, onMinimize, initialDraft, replyTo, forwardFrom }: ComposeProps) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(initialDraft?.id);

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false }), CodeBlock, Underline],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[300px] p-4 focus:outline-none',
      },
    },
  });

  useEffect(() => {
    if (!editor || !open) return;

    const loadSignature = async () => {
      try {
        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.signature && settings.signature.trim()) {
            const signatureHtml = settings.signature.replace(/\n/g, '<br>');
            const signatureDiv = `<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">${signatureHtml}</div>`;
            
            const currentContent = editor.getHTML();
            const trimmedContent = currentContent.trim();
            if (!currentContent.includes(signatureDiv) && trimmedContent !== '<p></p>' && trimmedContent !== '') {
              editor.commands.insertContent(signatureDiv);
            } else if (trimmedContent === '' || trimmedContent === '<p></p>') {
              editor.commands.setContent(signatureDiv);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load signature:', error);
      }
    };

    if (initialDraft) {
      setTo(initialDraft.to?.join(', ') || '');
      setCc(initialDraft.cc?.join(', ') || '');
      setBcc(initialDraft.bcc?.join(', ') || '');
      setSubject(initialDraft.subject || '');
      setDraftId(initialDraft.id);
      if (initialDraft.html) {
        editor.commands.setContent(initialDraft.html);
      }
    } else if (replyTo) {
      setTo(replyTo.from.email);
      setSubject(replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`);
      editor.commands.setContent(`<blockquote>${replyTo.body}</blockquote>`);
      setTimeout(() => loadSignature(), 200);
    } else if (forwardFrom) {
      setSubject(forwardFrom.subject.startsWith('Fwd:') ? forwardFrom.subject : `Fwd: ${forwardFrom.subject}`);
      editor.commands.setContent(`<blockquote>${forwardFrom.body}</blockquote>`);
      setTimeout(() => loadSignature(), 200);
    } else {
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      setDraftId(undefined);
      editor.commands.setContent('');
      setTimeout(() => loadSignature(), 200);
    }
  }, [initialDraft, replyTo, forwardFrom, editor, open]);

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
      const res = await fetch('/api/mail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId,
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject,
          html: editor.getHTML(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDraftId(data.id);
      }
    } catch (error) {
      console.error('Failed to save draft:', error);
    } finally {
      setSaving(false);
    }
  }, [editor, to, cc, bcc, showCc, showBcc, subject, draftId]);

  useEffect(() => {
    if (!open || !editor) return;

    const interval = setInterval(() => {
      saveDraft();
    }, 10000);

    return () => clearInterval(interval);
  }, [open, editor, saveDraft]);

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
      
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        if (settings.signature && settings.signature.trim()) {
          const signatureHtml = settings.signature.replace(/\n/g, '<br>');
          const signatureDiv = `<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">${signatureHtml}</div>`;
          
          if (!html.includes(signatureDiv)) {
            html += signatureDiv;
          }
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{replyTo ? 'Ответить' : forwardFrom ? 'Переслать' : 'Новое письмо'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto space-y-4">
          <div>
            <Input
              placeholder="Кому"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mb-2"
            />
            {showCc && (
              <Input
                placeholder="Копия"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="mb-2"
              />
            )}
            {showBcc && (
              <Input
                placeholder="Скрытая копия"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="mb-2"
              />
            )}
            <div className="flex gap-2 text-sm">
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
          />
          <div className="border rounded-md">
            <div className="border-b p-2 flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={editor.isActive('bold') ? 'bg-muted' : ''}
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={editor.isActive('italic') ? 'bg-muted' : ''}
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={editor.isActive('underline') ? 'bg-muted' : ''}
              >
                <UnderlineIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={editor.isActive('bulletList') ? 'bg-muted' : ''}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={editor.isActive('orderedList') ? 'bg-muted' : ''}
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                className={editor.isActive('blockquote') ? 'bg-muted' : ''}
              >
                <Quote className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                className={editor.isActive('codeBlock') ? 'bg-muted' : ''}
              >
                <Code className="h-4 w-4" />
              </Button>
            </div>
            <EditorContent editor={editor} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Отмена
          </Button>
          <Button onClick={handleSend} disabled={sending || saving}>
            {sending ? 'Отправка...' : saving ? 'Сохранение...' : 'Отправить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
