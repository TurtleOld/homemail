import crypto from 'node:crypto';
import { readStorage, writeStorage } from '@/lib/storage';
import { oidcIdentityKey, type HomeMailIdentity, type MailboxAssignment, type OidcIdentityReference } from '@/lib/home-identity';

const SCHEMA_VERSION = 1;

interface IdentityRecordFile {
  version: number;
  identities: HomeMailIdentity[];
}

interface MailboxAssignmentRecordFile {
  version: number;
  assignments: MailboxAssignment[];
}

const IDENTITIES_KEY = 'homeIdentities';
const MAILBOX_ASSIGNMENTS_KEY = 'mailboxAssignments';

const EMPTY_IDENTITIES: IdentityRecordFile = { version: SCHEMA_VERSION, identities: [] };
const EMPTY_ASSIGNMENTS: MailboxAssignmentRecordFile = { version: SCHEMA_VERSION, assignments: [] };

export class DuplicateAdministratorError extends Error {
  constructor() {
    super('An administrator identity already exists');
    this.name = 'DuplicateAdministratorError';
  }
}

export class DuplicateOidcIdentityError extends Error {
  constructor() {
    super('An identity already exists for this (issuer, subject) pair');
    this.name = 'DuplicateOidcIdentityError';
  }
}

async function readIdentities(): Promise<IdentityRecordFile> {
  return readStorage<IdentityRecordFile>(IDENTITIES_KEY, EMPTY_IDENTITIES);
}

async function writeIdentities(file: IdentityRecordFile): Promise<void> {
  await writeStorage(IDENTITIES_KEY, file);
}

export async function listHomeMailIdentities(): Promise<readonly HomeMailIdentity[]> {
  return (await readIdentities()).identities;
}

export async function findIdentityByOidc(
  reference: OidcIdentityReference,
): Promise<HomeMailIdentity | null> {
  const key = oidcIdentityKey(reference);
  const { identities } = await readIdentities();
  return identities.find((identity) => oidcIdentityKey(identity.oidc) === key) ?? null;
}

export async function findAdministratorIdentity(): Promise<HomeMailIdentity | null> {
  const { identities } = await readIdentities();
  return identities.find((identity) => identity.role === 'administrator') ?? null;
}

/**
 * Creates the sole HomeMail administrator identity for a verified (issuer, subject)
 * pair, unless an administrator or an identity for that pair already exists.
 *
 * Read-modify-write against the same on-disk file: the existing-administrator
 * and existing-(issuer,subject) checks are re-evaluated against freshly read
 * state immediately before the write, so two concurrent bootstrap attempts
 * cannot both create an administrator record. The loser observes its own
 * duplicate error rather than silently overwriting the winner.
 */
export async function bootstrapAdministratorIdentity(
  reference: OidcIdentityReference,
  displayName: string,
): Promise<HomeMailIdentity> {
  const key = oidcIdentityKey(reference);

  // Re-read immediately before writing rather than reusing an earlier read:
  // this narrows (without eliminating) the window in which two concurrent
  // bootstrap attempts could both pass the check before either writes.
  const file = await readIdentities();
  if (file.identities.some((identity) => identity.role === 'administrator')) {
    throw new DuplicateAdministratorError();
  }
  if (file.identities.some((identity) => oidcIdentityKey(identity.oidc) === key)) {
    throw new DuplicateOidcIdentityError();
  }

  const identity: HomeMailIdentity = {
    id: crypto.randomUUID(),
    oidc: reference,
    displayName,
    role: 'administrator',
    status: 'active',
  };

  await writeIdentities({
    version: SCHEMA_VERSION,
    identities: [...file.identities, identity],
  });

  return identity;
}

async function readMailboxAssignments(): Promise<MailboxAssignmentRecordFile> {
  return readStorage<MailboxAssignmentRecordFile>(MAILBOX_ASSIGNMENTS_KEY, EMPTY_ASSIGNMENTS);
}

export async function listMailboxAssignmentsForMember(
  memberId: string,
): Promise<readonly MailboxAssignment[]> {
  const { assignments } = await readMailboxAssignments();
  return assignments.filter((assignment) => assignment.memberId === memberId);
}
