import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { validateCsrf } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { writeStorage, readStorage } from '@/lib/storage';
import { validateEmailList, sanitizeEmail } from '@/lib/email-validator';
import { SecurityLogger } from '@/lib/security-logger';
import type { DeliveryTracking } from '@/lib/types';

const sendSchema = z.object({
  to: z.array(z.string()).min(1),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string().min(1).max(1000),
  html: z.string().max(10 * 1024 * 1024),
  draftId: z.string().optional(),
  scheduledSend: z.object({
    enabled: z.boolean(),
    sendAt: z.string().datetime(),
  }).optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().max(255),
        mime: z.string().max(100),
        data: z.string(),
      })
    )
    .optional(),
  requestReadReceipt: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const csrfValid = await validateCsrf(request);
  if (!csrfValid) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const data = sendSchema.parse(body);

    const toValidation = validateEmailList(data.to);
    if (!toValidation.valid) {
      SecurityLogger.logSuspiciousActivity(request, 'Invalid email addresses in to field', {
        invalidEmails: toValidation.invalidEmails,
      });
      return NextResponse.json(
        { 
          error: 'Invalid email addresses',
          details: toValidation.invalidEmails 
        },
        { status: 400 }
      );
    }

    const ccValidation = data.cc ? validateEmailList(data.cc) : { valid: true, validEmails: [], invalidEmails: [] };
    if (!ccValidation.valid) {
      SecurityLogger.logSuspiciousActivity(request, 'Invalid email addresses in cc field', {
        invalidEmails: ccValidation.invalidEmails,
      });
      return NextResponse.json(
        { 
          error: 'Invalid email addresses in CC',
          details: ccValidation.invalidEmails 
        },
        { status: 400 }
      );
    }

    const bccValidation = data.bcc ? validateEmailList(data.bcc) : { valid: true, validEmails: [], invalidEmails: [] };
    if (!bccValidation.valid) {
      SecurityLogger.logSuspiciousActivity(request, 'Invalid email addresses in bcc field', {
        invalidEmails: bccValidation.invalidEmails,
      });
      return NextResponse.json(
        { 
          error: 'Invalid email addresses in BCC',
          details: bccValidation.invalidEmails 
        },
        { status: 400 }
      );
    }

    const validatedData = {
      ...data,
      to: toValidation.validEmails,
      cc: ccValidation.validEmails.length > 0 ? ccValidation.validEmails : undefined,
      bcc: bccValidation.validEmails.length > 0 ? bccValidation.validEmails : undefined,
    };

    if (validatedData.scheduledSend?.enabled) {
      const sendAt = new Date(validatedData.scheduledSend.sendAt);
      if (sendAt.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'Scheduled send time must be in the future' }, { status: 400 });
      }

      const scheduledMessage = {
        id: `scheduled_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        accountId: session.accountId,
        to: validatedData.to,
        cc: validatedData.cc,
        bcc: validatedData.bcc,
        subject: validatedData.subject,
        html: validatedData.html,
        attachments: validatedData.attachments,
        sendAt: sendAt.toISOString(),
        draftId: validatedData.draftId,
        createdAt: new Date().toISOString(),
      };

      const allScheduled = await readStorage<Record<string, Array<typeof scheduledMessage>>>(
        'allScheduledMessages',
        {}
      );
      if (!allScheduled[session.accountId]) {
        allScheduled[session.accountId] = [];
      }
      allScheduled[session.accountId].push(scheduledMessage);
      await writeStorage('allScheduledMessages', allScheduled);

      logger.info(`Scheduled message ${scheduledMessage.id} for ${sendAt.toISOString()}`);

      return NextResponse.json({ success: true, scheduled: true, scheduledId: scheduledMessage.id, sendAt: sendAt.toISOString() });
    }

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();

    const messageId = await provider.sendMessage(session.accountId, {
      to: validatedData.to,
      cc: validatedData.cc,
      bcc: validatedData.bcc,
      subject: validatedData.subject,
      html: validatedData.html,
      attachments: validatedData.attachments?.map((att) => ({
        filename: att.filename,
        mime: att.mime,
        data: Buffer.from(att.data, 'base64'),
      })),
    });

    if (validatedData.requestReadReceipt) {
      const tracking: DeliveryTracking = {
        messageId,
        status: 'sent',
        sentAt: new Date(),
        recipients: [
          ...validatedData.to.map((email) => ({ email, status: 'pending' as const })),
          ...(validatedData.cc || []).map((email) => ({ email, status: 'pending' as const })),
          ...(validatedData.bcc || []).map((email) => ({ email, status: 'pending' as const })),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await writeStorage(`delivery:${session.accountId}:${messageId}`, tracking);
    }

    if (validatedData.requestReadReceipt) {
      const tracking: DeliveryTracking = {
        messageId,
        status: 'sent',
        sentAt: new Date(),
        recipients: [
          ...validatedData.to.map((email) => ({ email, status: 'pending' as const })),
          ...(validatedData.cc || []).map((email) => ({ email, status: 'pending' as const })),
          ...(validatedData.bcc || []).map((email) => ({ email, status: 'pending' as const })),
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await writeStorage(`delivery:${session.accountId}:${messageId}`, tracking);
    }

    if (validatedData.draftId) {
      try {
        await provider.bulkUpdateMessages(session.accountId, {
          ids: [validatedData.draftId],
          action: 'delete',
        });
      } catch (error) {
        logger.error('Failed to delete draft after sending:', error);
      }
    }

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    logger.error('Send message error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
