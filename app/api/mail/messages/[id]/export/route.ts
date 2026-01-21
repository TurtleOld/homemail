import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { readStorage } from '@/lib/storage';
import { logger } from '@/lib/logger';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'eml';

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();
    const message = await provider.getMessage(session.accountId, id);

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    const messageLabels = await readStorage<Record<string, string[]>>(
      `messageLabels:${session.accountId}`,
      {}
    );

    message.labels = messageLabels[id] || [];

    if (format === 'eml') {
      const emlContent = createEML(message);
      const filename = `${message.subject || 'message'}.eml`.replaceAll(/[^a-zA-Z0-9._-]/g, '_');

      return new NextResponse(emlContent, {
        headers: {
          'Content-Type': 'message/rfc822',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    } else if (format === 'pdf') {
      try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF();

        let y = 20;
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 20;
        const maxWidth = pageWidth - 2 * margin;

        doc.setFontSize(16);
        doc.text('Email Export', margin, y);
        y += 10;

        doc.setFontSize(10);
        const fromText = `From: ${formatEmailAddress(message.from)}`;
        const fromLines = doc.splitTextToSize(fromText, maxWidth);
        doc.text(fromLines, margin, y);
        y += fromLines.length * 7;

        if (message.to && message.to.length > 0) {
          const toText = `To: ${message.to.map(formatEmailAddress).join(', ')}`;
          const toLines = doc.splitTextToSize(toText, maxWidth);
          doc.text(toLines, margin, y);
          y += toLines.length * 7;
        }

        if (message.cc && message.cc.length > 0) {
          const ccText = `Cc: ${message.cc.map(formatEmailAddress).join(', ')}`;
          const ccLines = doc.splitTextToSize(ccText, maxWidth);
          doc.text(ccLines, margin, y);
          y += ccLines.length * 7;
        }

        const subjectText = `Subject: ${message.subject || '(без темы)'}`;
        const subjectLines = doc.splitTextToSize(subjectText, maxWidth);
        doc.text(subjectLines, margin, y);
        y += subjectLines.length * 7;

        doc.text(`Date: ${formatDateForEmail(new Date(message.date))}`, margin, y);
        y += 10;

        doc.setDrawColor(200, 200, 200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        const bodyText = message.body?.text || message.body?.html?.replace(/<[^>]*>/g, '') || '';
        const lines = doc.splitTextToSize(bodyText, maxWidth);

        doc.setFontSize(11);
        for (const line of lines) {
          if (y > doc.internal.pageSize.getHeight() - 20) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, margin, y);
          y += 7;
        }

        const filename = `${message.subject || 'message'}.pdf`.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
        const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

        return new NextResponse(pdfBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        });
      } catch (error) {
        logger.error('[Export PDF] Error:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  } catch (error) {
    logger.error('[Export] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
