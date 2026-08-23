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
    const format = searchParams.get('format') || 'pdf';

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

    if (format === 'pdf') {
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
        const pdfArrayBuffer = doc.output('arraybuffer');

        return new NextResponse(new Uint8Array(pdfArrayBuffer), {
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
