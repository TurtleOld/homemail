import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readStorage } from '@/lib/storage';
import { logger } from '@/lib/logger';
import JSZip from 'jszip';

const exportSchema = z.object({
  messageIds: z.array(z.string()).min(1).max(100),
  format: z.enum(['eml', 'zip']).default('zip'),
});

function formatEmailAddress(addr: { email: string; name?: string }): string {
  if (addr.name) {
    return `${addr.name} <${addr.email}>`;
  }
  return addr.email;
}

function formatDateForEmail(date: Date): string {
  return date.toUTCString();
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value;
  }
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`;
}

function createEML(message: any): string {
  const lines: string[] = [];

  lines.push(`From: ${formatEmailAddress(message.from)}`);
  if (message.to && message.to.length > 0) {
    lines.push(`To: ${message.to.map(formatEmailAddress).join(', ')}`);
  }
  if (message.cc && message.cc.length > 0) {
    lines.push(`Cc: ${message.cc.map(formatEmailAddress).join(', ')}`);
  }
  if (message.bcc && message.bcc.length > 0) {
    lines.push(`Bcc: ${message.bcc.map(formatEmailAddress).join(', ')}`);
  }
  lines.push(`Subject: ${encodeHeader(message.subject || '')}`);
  lines.push(`Date: ${formatDateForEmail(new Date(message.date))}`);
  if (message.headers) {
    for (const [key, value] of Object.entries(message.headers)) {
      if (!['from', 'to', 'cc', 'bcc', 'subject', 'date'].includes(key.toLowerCase())) {
        lines.push(`${key}: ${value}`);
      }
    }
  }
  lines.push('MIME-Version: 1.0');

  const hasAttachments = message.attachments && message.attachments.length > 0;
  const hasHtml = message.body?.html;
  const hasText = message.body?.text;

  if (hasAttachments || (hasHtml && hasText)) {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);

    if (hasHtml && hasText) {
      const altBoundary = `----=_Part_Alt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      lines.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
      lines.push('');
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(message.body.text);
      lines.push(`--${altBoundary}`);
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(message.body.html);
      lines.push(`--${altBoundary}--`);
    } else if (hasText) {
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(message.body.text);
    } else if (hasHtml) {
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(message.body.html);
    }

    if (hasAttachments) {
      for (const att of message.attachments) {
        lines.push(`--${boundary}`);
        lines.push(`Content-Type: ${att.mime}`);
        lines.push('Content-Transfer-Encoding: base64');
        lines.push(`Content-Disposition: attachment; filename="${encodeHeader(att.filename)}"`);
        lines.push('');
        lines.push('[Attachment data would be here in base64]');
      }
      lines.push(`--${boundary}--`);
    }
  } else {
    if (hasHtml) {
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(message.body.html);
    } else if (hasText) {
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(message.body.text);
    }
  }

  return lines.join('\r\n');
}

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = exportSchema.parse(body);

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

    const messageLabels = await readStorage<Record<string, string[]>>(
      `messageLabels:${session.accountId}`,
      {}
    );

    const messages: any[] = [];
    for (const messageId of data.messageIds) {
      const message = await provider.getMessage(session.accountId, messageId);
      if (message) {
        message.labels = messageLabels[messageId] || [];
        messages.push(message);
      }
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages found' }, { status: 404 });
    }

    if (data.format === 'zip') {
      const zip = new JSZip();

      for (const message of messages) {
        const emlContent = createEML(message);
        const filename = `${message.subject || 'message'}.eml`.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
        zip.file(filename, emlContent);
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
      const filename = `messages_export_${Date.now()}.zip`;

      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('[BulkExport] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
