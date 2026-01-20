import { describe, it, expect, beforeEach } from 'vitest';
import { validateEmail, validateEmailList, sanitizeEmail, isEmailInjectionSafe } from '../email-validator';
import { validatePath, sanitizeFilename } from '../path-validator';
import { validateUrl } from '../url-validator';
import { timingSafeEqual, constantTimeCompare } from '../security-utils';
import { checkBruteForce, recordFailedAttempt, recordSuccess } from '../brute-force-protection';
import { checkReplayProtection, generateNonce, generateTimestamp } from '../replay-protection';
import { analyzeEmailSecurity } from '../email-security';
import type { MessageDetail } from '../types';

describe('Email Validation', () => {
  it('should validate correct email addresses', () => {
    const result = validateEmail('test@example.com');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('test@example.com');
  });

  it('should reject invalid email addresses', () => {
    const result = validateEmail('invalid-email');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should detect email injection attempts', () => {
    expect(isEmailInjectionSafe('test@example.com')).toBe(true);
    expect(isEmailInjectionSafe('test@example.com\r\n')).toBe(false);
    expect(isEmailInjectionSafe('test@example.com%0a')).toBe(false);
  });

  it('should validate email lists', () => {
    const result = validateEmailList(['test@example.com', 'invalid', 'another@test.com']);
    expect(result.valid).toBe(false);
    expect(result.validEmails).toContain('test@example.com');
    expect(result.invalidEmails.length).toBeGreaterThan(0);
  });
});

describe('Path Validation', () => {
  it('should validate safe paths', () => {
    const result = validatePath('test.json');
    expect(result.valid).toBe(true);
  });

  it('should reject path traversal attempts', () => {
    const result = validatePath('../../../etc/passwd');
    expect(result.valid).toBe(false);
  });

  it('should sanitize filenames', () => {
    expect(sanitizeFilename('test<>file.txt')).toBe('test__file.txt');
    expect(sanitizeFilename('../../../etc/passwd')).not.toContain('../');
  });
});

describe('URL Validation', () => {
  it('should validate safe URLs', async () => {
    const result = await validateUrl('https://example.com');
    expect(result.valid).toBe(true);
  });

  it('should reject localhost URLs', async () => {
    const result = await validateUrl('http://localhost:8080');
    expect(result.valid).toBe(false);
  });

  it('should reject private IP addresses', async () => {
    const result = await validateUrl('http://192.168.1.1');
    expect(result.valid).toBe(false);
  });
});

describe('Security Utils', () => {
  it('should perform timing-safe comparison', () => {
    const a = 'test-string';
    const b = 'test-string';
    const c = 'different';

    expect(timingSafeEqual(a, b)).toBe(true);
    expect(timingSafeEqual(a, c)).toBe(false);
  });

  it('should perform constant-time string comparison', () => {
    expect(constantTimeCompare('test', 'test')).toBe(true);
    expect(constantTimeCompare('test', 'different')).toBe(false);
  });
});

describe('Brute Force Protection', () => {
  beforeEach(() => {
  });

  it('should allow requests within limits', () => {
    const result = checkBruteForce('127.0.0.1', 'test@example.com');
    expect(result.allowed).toBe(true);
  });

  it('should block after too many attempts', () => {
    const ip = '127.0.0.1';
    const email = 'test@example.com';

    for (let i = 0; i < 6; i++) {
      recordFailedAttempt(ip, email);
    }

    const result = checkBruteForce(ip, email);
    expect(result.allowed).toBe(false);
  });

  it('should reset on success', () => {
    const ip = '127.0.0.1';
    const email = 'test@example.com';

    recordFailedAttempt(ip, email);
    recordSuccess(ip, email);

    const result = checkBruteForce(ip, email);
    expect(result.allowed).toBe(true);
  });
});

describe('Replay Protection', () => {
  it('should validate valid nonce and timestamp', () => {
    const nonce = generateNonce();
    const timestamp = generateTimestamp();
    const result = checkReplayProtection(nonce, timestamp);
    expect(result.valid).toBe(true);
  });

  it('should reject reused nonces', () => {
    const nonce = generateNonce();
    const timestamp = generateTimestamp();

    checkReplayProtection(nonce, timestamp);
    const result = checkReplayProtection(nonce, timestamp);
    expect(result.valid).toBe(false);
  });

  it('should reject expired timestamps', () => {
    const nonce = generateNonce();
    const oldTimestamp = Date.now() - 400000;
    const result = checkReplayProtection(nonce, oldTimestamp);
    expect(result.valid).toBe(false);
  });
});

describe('Email Security Analysis', () => {
  it('should detect phishing attempts', () => {
    const message: MessageDetail = {
      id: '1',
      subject: 'Urgent action required - verify your account',
      from: { email: 'suspicious@example.com', name: 'Bank' },
      body: { html: '<p>Click here immediately</p>', text: 'Click here immediately' },
      date: new Date(),
      flags: { unread: true, starred: false, important: false, hasAttachments: false },
    };

    const analysis = analyzeEmailSecurity(message);
    expect(analysis.isPhishing || analysis.isSuspicious).toBe(true);
  });

  it('should detect spam', () => {
    const message: MessageDetail = {
      id: '2',
      subject: 'Free money - act now!',
      from: { email: 'spam@example.com', name: 'Spammer' },
      body: { html: '<p>Limited time offer</p>', text: 'Limited time offer' },
      date: new Date(),
      flags: { unread: true, starred: false, important: false, hasAttachments: false },
    };

    const analysis = analyzeEmailSecurity(message);
    expect(analysis.isSpam || analysis.isSuspicious).toBe(true);
  });

  it('should detect dangerous attachments', () => {
    const message: MessageDetail = {
      id: '3',
      subject: 'Test',
      from: { email: 'test@example.com', name: 'Test' },
      body: { html: '<p>Test</p>', text: 'Test' },
      date: new Date(),
      flags: { unread: true, starred: false, important: false, hasAttachments: true },
      attachments: [
        { id: '1', filename: 'virus.exe', mime: 'application/x-msdownload', size: 1000 },
      ],
    };

    const analysis = analyzeEmailSecurity(message);
    expect(analysis.warnings.some((w) => w.includes('dangerous attachment'))).toBe(true);
  });
});
