import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getClientIp } from '@/lib/client-ip';
import { isRedesignFeatureEnabled } from '@/lib/feature-flags';
import { getMailProvider, getMailProviderForAccount } from '@/lib/get-provider';
import { logger } from '@/lib/logger';
import { fetchProtectedImage, ProtectedImageError, validateImageBytes } from '@/lib/protected-image-fetcher';
import { verifyImageResourceToken } from '@/lib/protected-message-content';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSession } from '@/lib/session';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const QUIET_PLACEHOLDER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8xWAAAAAElFTkSuQmCC',
  'base64',
);

function imageResponse(data: Buffer, mime: string, cacheControl: string, status = 'ok'): NextResponse {
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.length),
      'Cache-Control': cacheControl,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-HomeMail-Image-Status': status,
    },
  });
}

function placeholder(reason: string, token?: string, observable = true): NextResponse {
  if (observable) {
    logger.warn('[ProtectedImage]', {
      event: 'image_rejected',
      reason,
      tokenId: token ? crypto.createHash('sha256').update(token).digest('hex').slice(0, 12) : undefined,
    });
  }
  return imageResponse(QUIET_PLACEHOLDER, 'image/png', 'private, no-store', 'placeholder');
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!isRedesignFeatureEnabled('protectedMessageContent')) return placeholder('feature_disabled', token, false);

  const session = await getSession(request);
  if (!session) return placeholder('unauthorized', token, false);

  const rateLimit = checkRateLimit(`${session.accountId}:${getClientIp(request)}`, 'image_resource', request);
  if (!rateLimit.allowed) return placeholder('rate_limited', token);

  const payload = verifyImageResourceToken(token);
  if (!payload || payload.accountId !== session.accountId) return placeholder('invalid_token', token);

  try {
    if (payload.kind === 'external') {
      if (!isRedesignFeatureEnabled('remoteImageFetching')) return placeholder('remote_fetch_disabled', token);
      const result = await fetchProtectedImage(payload.url);
      logger.info('[ProtectedImage]', {
        event: 'image_fetched',
        kind: 'external',
        cache: result.cacheStatus,
        tokenId: crypto.createHash('sha256').update(token).digest('hex').slice(0, 12),
      });
      return imageResponse(result.data, result.mime, 'private, max-age=600');
    }

    const provider = process.env.MAIL_PROVIDER === 'stalwart'
      ? getMailProviderForAccount(session.accountId)
      : getMailProvider();
    const attachment = await provider.getAttachment(
      session.accountId,
      payload.messageId,
      payload.attachmentId,
    );
    if (!attachment || attachment.data.length > MAX_IMAGE_BYTES) return placeholder('cid_unavailable', token);
    const mime = validateImageBytes(attachment.data, attachment.mime);
    return imageResponse(attachment.data, mime, 'private, max-age=600');
  } catch (error) {
    return placeholder(error instanceof ProtectedImageError ? error.code : 'resource_failed', token);
  }
}
