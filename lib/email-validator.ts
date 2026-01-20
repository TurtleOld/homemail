const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 255;

const DANGEROUS_PATTERNS = [
  /\r|\n/,
  /%0[ad]/i,
  /[<>]/,
  /javascript:/i,
  /vbscript:/i,
  /on\w+\s*=/i,
];

export interface EmailValidationResult {
  valid: boolean;
  normalized?: string;
  errors: string[];
}

export function validateEmail(email: string): EmailValidationResult {
  const errors: string[] = [];

  if (!email || typeof email !== 'string') {
    return {
      valid: false,
      errors: ['Email is required'],
    };
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      errors: ['Email cannot be empty'],
    };
  }

  if (trimmed.length > MAX_EMAIL_LENGTH) {
    errors.push(`Email exceeds maximum length of ${MAX_EMAIL_LENGTH} characters`);
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      errors.push('Email contains dangerous characters or patterns');
      break;
    }
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    errors.push('Email format is invalid');
  }

  const [localPart, domain] = trimmed.split('@');

  if (!localPart || !domain) {
    errors.push('Email must contain @ symbol');
  } else {
    if (localPart.length > MAX_LOCAL_PART_LENGTH) {
      errors.push(`Local part exceeds maximum length of ${MAX_LOCAL_PART_LENGTH} characters`);
    }

    if (localPart.startsWith('.') || localPart.endsWith('.')) {
      errors.push('Local part cannot start or end with a dot');
    }

    if (localPart.includes('..')) {
      errors.push('Local part cannot contain consecutive dots');
    }

    if (domain.length > MAX_DOMAIN_LENGTH) {
      errors.push(`Domain exceeds maximum length of ${MAX_DOMAIN_LENGTH} characters`);
    }

    if (domain.startsWith('.') || domain.endsWith('.')) {
      errors.push('Domain cannot start or end with a dot');
    }

    if (domain.includes('..')) {
      errors.push('Domain cannot contain consecutive dots');
    }

    const domainParts = domain.split('.');
    if (domainParts.length < 2) {
      errors.push('Domain must contain at least one dot');
    }

    for (const part of domainParts) {
      if (part.length === 0) {
        errors.push('Domain parts cannot be empty');
        break;
      }
      if (part.startsWith('-') || part.endsWith('-')) {
        errors.push('Domain parts cannot start or end with a hyphen');
        break;
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  const normalized = trimmed.toLowerCase();

  return {
    valid: true,
    normalized,
    errors: [],
  };
}

export function validateEmailList(emails: string[]): {
  valid: boolean;
  validEmails: string[];
  invalidEmails: Array<{ email: string; errors: string[] }>;
} {
  const validEmails: string[] = [];
  const invalidEmails: Array<{ email: string; errors: string[] }> = [];

  for (const email of emails) {
    const validation = validateEmail(email);
    if (validation.valid && validation.normalized) {
      validEmails.push(validation.normalized);
    } else {
      invalidEmails.push({
        email,
        errors: validation.errors,
      });
    }
  }

  return {
    valid: invalidEmails.length === 0,
    validEmails,
    invalidEmails,
  };
}

export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/[<>]/g, '');
}

export function isEmailInjectionSafe(email: string): boolean {
  const dangerousChars = ['\r', '\n', '%0a', '%0d', '<', '>'];
  const lowerEmail = email.toLowerCase();
  
  for (const char of dangerousChars) {
    if (lowerEmail.includes(char)) {
      return false;
    }
  }

  return !lowerEmail.includes('javascript:') && !lowerEmail.includes('vbscript:');
}
