import crypto, { constants, type JsonWebKey, type KeyObject } from 'node:crypto';

const ASYMMETRIC_ALGORITHMS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
] as const;

export type SupportedOidcSigningAlgorithm = (typeof ASYMMETRIC_ALGORITHMS)[number];

export interface OidcJwk extends Record<string, unknown> {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
}

export interface OidcJwksProvider {
  getKeys(): Promise<readonly OidcJwk[]>;
}

export interface OidcValidationOptions {
  issuer: string;
  audience: string;
  nonce: string;
  jwks: OidcJwksProvider;
  now?: () => number;
  clockToleranceSeconds?: number;
  allowedAlgorithms?: readonly SupportedOidcSigningAlgorithm[];
}

export interface ValidatedOidcIdentity {
  issuer: string;
  subject: string;
  audience: readonly string[];
  expiresAt: number;
  nonce: string;
  email?: string;
  name?: string;
  preferredUsername?: string;
  claims: Readonly<Record<string, unknown>>;
}

export type OidcValidationErrorCode =
  | 'TOKEN_FORMAT_INVALID'
  | 'TOKEN_HEADER_INVALID'
  | 'TOKEN_ALGORITHM_REJECTED'
  | 'TOKEN_KEY_NOT_FOUND'
  | 'TOKEN_SIGNATURE_INVALID'
  | 'TOKEN_ISSUER_INVALID'
  | 'TOKEN_AUDIENCE_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_NOT_ACTIVE'
  | 'TOKEN_NONCE_INVALID'
  | 'TOKEN_SUBJECT_INVALID';

export class OidcValidationError extends Error {
  constructor(readonly code: OidcValidationErrorCode) {
    super('OIDC identity token validation failed');
    this.name = 'OidcValidationError';
  }
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
}

interface JwtClaims extends Record<string, unknown> {
  iss?: unknown;
  sub?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  nonce?: unknown;
  email?: unknown;
  name?: unknown;
  preferred_username?: unknown;
  azp?: unknown;
}

function decodeJsonSegment<T>(segment: string, code: OidcValidationErrorCode): T {
  if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new OidcValidationError(code);
  }
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new OidcValidationError(code);
  }
}

function audiences(value: unknown): string[] {
  if (typeof value === 'string' && value) return [value];
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item)) {
    return value;
  }
  return [];
}

function hashForAlgorithm(algorithm: SupportedOidcSigningAlgorithm): string {
  if (algorithm.endsWith('256')) return 'sha256';
  if (algorithm.endsWith('384')) return 'sha384';
  return 'sha512';
}

function verificationKey(jwk: OidcJwk): KeyObject {
  if (jwk.kty === 'oct') {
    throw new OidcValidationError('TOKEN_ALGORITHM_REJECTED');
  }
  try {
    return crypto.createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
  } catch {
    throw new OidcValidationError('TOKEN_KEY_NOT_FOUND');
  }
}

function verifySignature(
  algorithm: SupportedOidcSigningAlgorithm,
  key: KeyObject,
  signedData: Buffer,
  signature: Buffer,
): boolean {
  const hash = hashForAlgorithm(algorithm);
  if (algorithm.startsWith('PS')) {
    const saltLength = algorithm.endsWith('256') ? 32 : algorithm.endsWith('384') ? 48 : 64;
    return crypto.verify(hash, signedData, {
      key,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength,
    }, signature);
  }
  if (algorithm.startsWith('ES')) {
    return crypto.verify(hash, signedData, { key, dsaEncoding: 'ieee-p1363' }, signature);
  }
  return crypto.verify(hash, signedData, key, signature);
}

/**
 * Validates an OIDC ID token without creating sessions or identity records.
 * Symmetric JWKS keys are deliberately rejected: the deployed Stalwart 0.15
 * HS256 key is publicly retrievable and cannot be a HomeMail trust anchor.
 */
export async function validateOidcIdToken(
  token: string,
  options: OidcValidationOptions,
): Promise<ValidatedOidcIdentity> {
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new OidcValidationError('TOKEN_FORMAT_INVALID');
  }

  const [encodedHeader, encodedClaims, encodedSignature] = segments;
  const header = decodeJsonSegment<JwtHeader>(encodedHeader, 'TOKEN_HEADER_INVALID');
  const claims = decodeJsonSegment<JwtClaims>(encodedClaims, 'TOKEN_FORMAT_INVALID');

  const allowedAlgorithms = options.allowedAlgorithms ?? ASYMMETRIC_ALGORITHMS;
  if (
    typeof header.alg !== 'string' ||
    !allowedAlgorithms.includes(header.alg as SupportedOidcSigningAlgorithm)
  ) {
    throw new OidcValidationError('TOKEN_ALGORITHM_REJECTED');
  }
  const algorithm = header.alg as SupportedOidcSigningAlgorithm;

  const keys = await options.jwks.getKeys();
  const matchingKeys = keys.filter((key) =>
    key.kty !== 'oct' &&
    (typeof header.kid !== 'string' || key.kid === header.kid) &&
    (!key.alg || key.alg === algorithm) &&
    (!key.use || key.use === 'sig'),
  );
  if (matchingKeys.length !== 1) {
    throw new OidcValidationError('TOKEN_KEY_NOT_FOUND');
  }

  let signature: Buffer;
  if (!/^[A-Za-z0-9_-]+$/.test(encodedSignature)) {
    throw new OidcValidationError('TOKEN_SIGNATURE_INVALID');
  }
  try {
    signature = Buffer.from(encodedSignature, 'base64url');
  } catch {
    throw new OidcValidationError('TOKEN_SIGNATURE_INVALID');
  }
  const signedData = Buffer.from(`${encodedHeader}.${encodedClaims}`, 'ascii');
  if (!verifySignature(algorithm, verificationKey(matchingKeys[0]), signedData, signature)) {
    throw new OidcValidationError('TOKEN_SIGNATURE_INVALID');
  }

  if (claims.iss !== options.issuer) {
    throw new OidcValidationError('TOKEN_ISSUER_INVALID');
  }

  const tokenAudiences = audiences(claims.aud);
  if (!tokenAudiences.includes(options.audience)) {
    throw new OidcValidationError('TOKEN_AUDIENCE_INVALID');
  }
  if (tokenAudiences.length > 1 && claims.azp !== options.audience) {
    throw new OidcValidationError('TOKEN_AUDIENCE_INVALID');
  }

  const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const tolerance = Math.max(0, options.clockToleranceSeconds ?? 30);
  if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now - tolerance) {
    throw new OidcValidationError('TOKEN_EXPIRED');
  }
  if (typeof claims.nbf === 'number' && claims.nbf > now + tolerance) {
    throw new OidcValidationError('TOKEN_NOT_ACTIVE');
  }

  if (typeof claims.nonce !== 'string' || !claims.nonce || claims.nonce !== options.nonce) {
    throw new OidcValidationError('TOKEN_NONCE_INVALID');
  }
  if (typeof claims.sub !== 'string' || !claims.sub.trim()) {
    throw new OidcValidationError('TOKEN_SUBJECT_INVALID');
  }

  return Object.freeze({
    issuer: claims.iss,
    subject: claims.sub,
    audience: Object.freeze(tokenAudiences),
    expiresAt: claims.exp,
    nonce: claims.nonce,
    ...(typeof claims.email === 'string' ? { email: claims.email } : {}),
    ...(typeof claims.name === 'string' ? { name: claims.name } : {}),
    ...(typeof claims.preferred_username === 'string'
      ? { preferredUsername: claims.preferred_username }
      : {}),
    claims: Object.freeze({ ...claims }),
  });
}
