import { isRedesignFeatureEnabled } from './feature-flags';

export type StalwartAdminOperation =
  | 'principal.create'
  | 'principal.update'
  | 'principal.suspend'
  | 'principal.delete'
  | 'mailbox.create'
  | 'credential.update'
  | 'oauth.revoke'
  | 'configuration.read';

export interface StalwartAdminCapabilities {
  supported: boolean;
  serverVersion: string | null;
  protocol: 'rest-v0.15' | 'unsupported';
  operations: Readonly<Record<StalwartAdminOperation, boolean>>;
  reason?: 'unknown-version' | 'unsupported-version' | 'management-api-unavailable';
}

export interface Stalwart015CapabilityEvidence {
  serverVersion?: string;
  managementApi: 'rest-v0.15' | 'unknown' | 'unavailable';
  operations?: Partial<Record<StalwartAdminOperation, boolean>>;
}

export interface StalwartPrincipalInput {
  operationId: string;
  name: string;
  email: string;
}

export interface StalwartMailboxInput {
  operationId: string;
  principalId: string;
  email: string;
}

export interface StalwartAdminMutationTransport {
  createPrincipal(input: StalwartPrincipalInput): Promise<{ principalId: string }>;
  updatePrincipal(principalId: string, changes: Readonly<Record<string, unknown>>): Promise<void>;
  suspendPrincipal(principalId: string): Promise<void>;
  deletePrincipal(principalId: string): Promise<void>;
  createMailbox(input: StalwartMailboxInput): Promise<{ mailboxId: string }>;
  updateCredential(principalId: string, password: string): Promise<void>;
  revokeOauthGrants(principalId: string): Promise<void>;
  readConfiguration(): Promise<Readonly<Record<string, unknown>>>;
}

export interface StalwartAdminAdapter extends StalwartAdminMutationTransport {
  detectCapabilities(): Promise<StalwartAdminCapabilities>;
}

const OPERATIONS: readonly StalwartAdminOperation[] = [
  'principal.create',
  'principal.update',
  'principal.suspend',
  'principal.delete',
  'mailbox.create',
  'credential.update',
  'oauth.revoke',
  'configuration.read',
];

function unsupported(
  evidence: Stalwart015CapabilityEvidence,
  reason: NonNullable<StalwartAdminCapabilities['reason']>,
): StalwartAdminCapabilities {
  return Object.freeze({
    supported: false,
    serverVersion: evidence.serverVersion ?? null,
    protocol: 'unsupported',
    operations: Object.freeze(Object.fromEntries(OPERATIONS.map((operation) => [operation, false])) as Record<StalwartAdminOperation, boolean>),
    reason,
  });
}

export function detectStalwart015Capabilities(
  evidence: Stalwart015CapabilityEvidence,
): StalwartAdminCapabilities {
  if (!evidence.serverVersion) return unsupported(evidence, 'unknown-version');
  if (!/^0\.15\.\d+(?:[-+].*)?$/.test(evidence.serverVersion)) {
    return unsupported(evidence, 'unsupported-version');
  }
  if (evidence.managementApi !== 'rest-v0.15') {
    return unsupported(evidence, 'management-api-unavailable');
  }

  const operations = Object.freeze(Object.fromEntries(
    OPERATIONS.map((operation) => [operation, evidence.operations?.[operation] === true]),
  ) as Record<StalwartAdminOperation, boolean>);

  return Object.freeze({
    supported: true,
    serverVersion: evidence.serverVersion,
    protocol: 'rest-v0.15',
    operations,
  });
}

export class StalwartAdminCapabilityError extends Error {
  readonly code = 'STALWART_ADMIN_CAPABILITY_UNAVAILABLE';

  constructor(readonly operation: StalwartAdminOperation, readonly capabilities: StalwartAdminCapabilities) {
    super('Stalwart administrative mutation is unavailable');
    this.name = 'StalwartAdminCapabilityError';
  }
}

export class StalwartAdministrationDisabledError extends Error {
  readonly code = 'STALWART_ADMINISTRATION_DISABLED';

  constructor() {
    super('Stalwart administration is disabled');
    this.name = 'StalwartAdministrationDisabledError';
  }
}

/**
 * The injected probe and transport make the
 * version-specific 0.15 contract testable without production credentials.
 * Every operation is disabled by default and capability-checked immediately
 * before the transport can mutate Stalwart.
 */
export class Stalwart015AdminAdapter implements StalwartAdminAdapter {
  constructor(
    private readonly probe: () => Promise<Stalwart015CapabilityEvidence>,
    private readonly transport: StalwartAdminMutationTransport,
    private readonly enabled: () => boolean = () => isRedesignFeatureEnabled('stalwartAdministration'),
  ) {}

  async detectCapabilities(): Promise<StalwartAdminCapabilities> {
    return detectStalwart015Capabilities(await this.probe());
  }

  private async require(operation: StalwartAdminOperation): Promise<void> {
    if (!this.enabled()) throw new StalwartAdministrationDisabledError();
    const capabilities = await this.detectCapabilities();
    if (!capabilities.supported || !capabilities.operations[operation]) {
      throw new StalwartAdminCapabilityError(operation, capabilities);
    }
  }

  async createPrincipal(input: StalwartPrincipalInput): Promise<{ principalId: string }> {
    await this.require('principal.create');
    return this.transport.createPrincipal(input);
  }

  async updatePrincipal(principalId: string, changes: Readonly<Record<string, unknown>>): Promise<void> {
    await this.require('principal.update');
    return this.transport.updatePrincipal(principalId, changes);
  }

  async suspendPrincipal(principalId: string): Promise<void> {
    await this.require('principal.suspend');
    return this.transport.suspendPrincipal(principalId);
  }

  async deletePrincipal(principalId: string): Promise<void> {
    await this.require('principal.delete');
    return this.transport.deletePrincipal(principalId);
  }

  async createMailbox(input: StalwartMailboxInput): Promise<{ mailboxId: string }> {
    await this.require('mailbox.create');
    return this.transport.createMailbox(input);
  }

  async updateCredential(principalId: string, password: string): Promise<void> {
    await this.require('credential.update');
    return this.transport.updateCredential(principalId, password);
  }

  async revokeOauthGrants(principalId: string): Promise<void> {
    await this.require('oauth.revoke');
    return this.transport.revokeOauthGrants(principalId);
  }

  async readConfiguration(): Promise<Readonly<Record<string, unknown>>> {
    await this.require('configuration.read');
    return this.transport.readConfiguration();
  }
}
