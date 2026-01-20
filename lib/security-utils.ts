import crypto from 'node:crypto';

export function timingSafeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const aBuffer = typeof a === 'string' ? Buffer.from(a, 'utf8') : a;
  const bBuffer = typeof b === 'string' ? Buffer.from(b, 'utf8') : b;

  if (aBuffer.length !== bBuffer.length) {
    crypto.timingSafeEqual(aBuffer, aBuffer);
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
