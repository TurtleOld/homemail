import crypto, { generateKeyPairSync, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  OidcValidationError,
  validateOidcIdToken,
  type OidcJwk,
  type OidcValidationErrorCode,
} from '@/lib/oidc-id-token-validator';

const NOW_MS = 1_800_000_000_000;
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const ISSUER = 'https://identity.example.test';
const AUDIENCE = 'homemail';
const NONCE = 'nonce-from-authorization-request';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signToken(
  privateKey: KeyObject,
  claims: Record<string, unknown>,
  kid = 'key-1',
): string {
  const header = encode({ alg: 'RS256', typ: 'JWT', kid });
  const payload = encode(claims);
  const data = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(data, 'ascii'), privateKey);
  return `${data}.${signature.toString('base64url')}`;
}

function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as OidcJwk;
  jwk.kid = 'key-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const claims = {
    iss: ISSUER,
    sub: 'stable-subject',
    aud: AUDIENCE,
    exp: NOW_SECONDS + 300,
    nonce: NONCE,
    email: 'member@example.test',
  };
  const options = {
    issuer: ISSUER,
    audience: AUDIENCE,
    nonce: NONCE,
    now: () => NOW_MS,
    clockToleranceSeconds: 0,
    jwks: { getKeys: async () => [jwk] },
  };
  return { privateKey, claims, options };
}

async function expectCode(promise: Promise<unknown>, code: OidcValidationErrorCode): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code } satisfies Partial<OidcValidationError>);
}

describe('OIDC ID token validation boundary', () => {
  it('accepts a correctly signed token with required identity claims', async () => {
    const { privateKey, claims, options } = fixture();
    const identity = await validateOidcIdToken(signToken(privateKey, claims), options);

    expect(identity).toMatchObject({
      issuer: ISSUER,
      subject: 'stable-subject',
      audience: [AUDIENCE],
      nonce: NONCE,
      email: 'member@example.test',
    });
  });

  it('rejects a forged signature', async () => {
    const { claims, options } = fixture();
    const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await expectCode(
      validateOidcIdToken(signToken(attacker.privateKey, claims), options),
      'TOKEN_SIGNATURE_INVALID',
    );
  });

  it('rejects expired tokens', async () => {
    const { privateKey, claims, options } = fixture();
    await expectCode(
      validateOidcIdToken(signToken(privateKey, { ...claims, exp: NOW_SECONDS - 1 }), options),
      'TOKEN_EXPIRED',
    );
  });

  it('requires exact issuer, audience, and nonce', async () => {
    const { privateKey, claims, options } = fixture();

    await expectCode(
      validateOidcIdToken(signToken(privateKey, { ...claims, iss: 'https://attacker.test' }), options),
      'TOKEN_ISSUER_INVALID',
    );
    await expectCode(
      validateOidcIdToken(signToken(privateKey, { ...claims, aud: 'different-client' }), options),
      'TOKEN_AUDIENCE_INVALID',
    );
    await expectCode(
      validateOidcIdToken(signToken(privateKey, { ...claims, nonce: 'different-nonce' }), options),
      'TOKEN_NONCE_INVALID',
    );
    const { nonce: _nonce, ...withoutNonce } = claims;
    await expectCode(
      validateOidcIdToken(signToken(privateKey, withoutNonce), options),
      'TOKEN_NONCE_INVALID',
    );
  });

  it('rejects symmetric and none algorithms even when a JWKS advertises them', async () => {
    const header = encode({ alg: 'HS256', kid: 'default' });
    const payload = encode({
      iss: ISSUER,
      sub: 'forged-subject',
      aud: AUDIENCE,
      exp: NOW_SECONDS + 300,
      nonce: NONCE,
    });
    const token = `${header}.${payload}.${Buffer.from('forged').toString('base64url')}`;

    await expectCode(validateOidcIdToken(token, {
      issuer: ISSUER,
      audience: AUDIENCE,
      nonce: NONCE,
      now: () => NOW_MS,
      jwks: { getKeys: async () => [{ kty: 'oct', kid: 'default', alg: 'HS256', k: 'public-secret' }] },
    }), 'TOKEN_ALGORITHM_REJECTED');
  });
});
