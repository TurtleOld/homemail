import type { ValidatedOidcIdentity } from '@/lib/oidc-id-token-validator';
import {
  bootstrapAdministratorIdentity,
  DuplicateAdministratorError,
  DuplicateOidcIdentityError,
  findAdministratorIdentity,
  findIdentityByOidc,
} from '@/lib/family-identity-store';
import type { HomeMailIdentity } from '@/lib/home-identity';

export type AdministratorBootstrapOutcome =
  | { kind: 'bootstrapped'; identity: HomeMailIdentity }
  | { kind: 'not-configured' }
  | { kind: 'email-mismatch' }
  | { kind: 'already-bootstrapped' };

/**
 * Creates the sole HomeMail administrator identity the first time a real,
 * already-validated OIDC sign-in matches HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL.
 *
 * `identity.email` must come from `validateOidcIdToken`'s output, never from
 * client-supplied request data — per ADR 0001, the first successful sign-in
 * must never be silently promoted, so this only compares against a specific,
 * operator-configured address and does nothing once any administrator exists.
 */
export async function bootstrapAdministratorIfConfigured(
  identity: Pick<ValidatedOidcIdentity, 'issuer' | 'subject' | 'email'>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AdministratorBootstrapOutcome> {
  const configuredEmail = environment.HOMEMAIL_BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (!configuredEmail) {
    return { kind: 'not-configured' };
  }

  if (identity.email?.trim().toLowerCase() !== configuredEmail.toLowerCase()) {
    return { kind: 'email-mismatch' };
  }

  const reference = { issuer: identity.issuer, subject: identity.subject };

  const existingForThisIdentity = await findIdentityByOidc(reference);
  if (existingForThisIdentity) {
    return { kind: 'already-bootstrapped' };
  }

  const existingAdministrator = await findAdministratorIdentity();
  if (existingAdministrator) {
    return { kind: 'already-bootstrapped' };
  }

  try {
    const created = await bootstrapAdministratorIdentity(reference, identity.email ?? configuredEmail);
    return { kind: 'bootstrapped', identity: created };
  } catch (error) {
    if (error instanceof DuplicateAdministratorError || error instanceof DuplicateOidcIdentityError) {
      return { kind: 'already-bootstrapped' };
    }
    throw error;
  }
}
