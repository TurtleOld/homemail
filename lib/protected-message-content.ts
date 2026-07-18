import crypto from 'node:crypto';
import type { Attachment, MessageDetail } from '@/lib/types';
import { sanitizeHtml } from '@/lib/sanitize';

const TOKEN_VERSION = 1;
const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const RESOURCE_PATH = '/api/mail/resources/image/';

export type ImageResourceTokenPayload =
  | {
      v: typeof TOKEN_VERSION;
      kind: 'external';
      accountId: string;
      messageId: string;
      url: string;
      expiresAt: number;
    }
  | {
      v: typeof TOKEN_VERSION;
      kind: 'cid';
      accountId: string;
      messageId: string;
      attachmentId: string;
      expiresAt: number;
    };

type ImageResourceTokenInput =
  | Omit<Extract<ImageResourceTokenPayload, { kind: 'external' }>, 'v' | 'expiresAt'>
  | Omit<Extract<ImageResourceTokenPayload, { kind: 'cid' }>, 'v' | 'expiresAt'>;

type SigningEnvironment = Readonly<Record<string, string | undefined>>;

function signingKey(environment: SigningEnvironment = process.env): Buffer {
  const secret = environment.HOMEMAIL_IMAGE_SIGNING_SECRET || environment.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('Image resource signing requires a secret of at least 32 characters');
  }
  return crypto.createHmac('sha256', 'homemail-image-resource-key-v1')
    .update(secret)
    .digest();
}

export function signImageResourceToken(
  payload: ImageResourceTokenInput,
  options: { now?: number; environment?: SigningEnvironment } = {},
): string {
  const body: ImageResourceTokenPayload = {
    ...payload,
    v: TOKEN_VERSION,
    expiresAt: (options.now ?? Date.now()) + TOKEN_LIFETIME_MS,
  } as ImageResourceTokenPayload;
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = crypto.createHmac('sha256', signingKey(options.environment))
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyImageResourceToken(
  token: string,
  options: { now?: number; environment?: SigningEnvironment } = {},
): ImageResourceTokenPayload | null {
  try {
    const [encoded, suppliedSignature, extra] = token.split('.');
    if (!encoded || !suppliedSignature || extra) return null;
    const expected = crypto.createHmac('sha256', signingKey(options.environment))
      .update(encoded)
      .digest();
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<ImageResourceTokenPayload>;
    if (
      payload.v !== TOKEN_VERSION ||
      typeof payload.accountId !== 'string' ||
      payload.accountId.length > 256 ||
      typeof payload.messageId !== 'string' ||
      payload.messageId.length > 512 ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= (options.now ?? Date.now())
    ) return null;
    if (payload.kind === 'external' && typeof payload.url === 'string' && payload.url.length <= 4096) {
      return payload as ImageResourceTokenPayload;
    }
    if (payload.kind === 'cid' && typeof payload.attachmentId === 'string' && payload.attachmentId.length <= 1024) {
      return payload as ImageResourceTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeContentId(value: string): string {
  return decodeURIComponent(value).trim().replace(/^<|>$/g, '').toLowerCase();
}

function replaceImageSources(html: string, mapSource: (source: string) => string | null): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const source = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    if (!source) return tag;
    const original = source[1] ?? source[2] ?? source[3] ?? '';
    const replacement = mapSource(original);
    if (!replacement) return tag.replace(source[0], '');
    const escaped = replacement.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return tag.replace(source[0], `src="${escaped}"`);
  });
}

function cidAttachment(source: string, attachments: Attachment[]): Attachment | undefined {
  if (!source.trim().toLowerCase().startsWith('cid:')) return undefined;
  const wanted = normalizeContentId(source.trim().slice(4));
  return attachments.find((attachment) =>
    attachment.contentId ? normalizeContentId(attachment.contentId) === wanted : false
  );
}

export function protectMessageForDelivery(
  message: MessageDetail,
  accountId: string,
  options: { remoteImagesEnabled: boolean; now?: number; environment?: SigningEnvironment },
): MessageDetail {
  if (!message.body.html) return message;

  const withCidResources = replaceImageSources(message.body.html, (source) => {
    const attachment = cidAttachment(source, message.attachments);
    if (!attachment) return source;
    const token = signImageResourceToken({
      kind: 'cid',
      accountId,
      messageId: message.id,
      attachmentId: attachment.id,
    }, options);
    return `${RESOURCE_PATH}${token}`;
  });

  const sanitized = sanitizeHtml(withCidResources, options.remoteImagesEnabled);
  const protectedHtml = replaceImageSources(sanitized, (source) => {
    if (!/^https?:\/\//i.test(source)) return source;
    if (!options.remoteImagesEnabled) return null;
    let normalizedUrl: string;
    try {
      const parsed = new URL(source);
      parsed.hash = '';
      normalizedUrl = parsed.href;
    } catch {
      return null;
    }
    if (normalizedUrl.length > 4096) return null;
    const token = signImageResourceToken({
      kind: 'external',
      accountId,
      messageId: message.id,
      url: normalizedUrl,
    }, options);
    return `${RESOURCE_PATH}${token}`;
  });

  return {
    ...message,
    body: { ...message.body, html: protectedHtml },
  };
}
