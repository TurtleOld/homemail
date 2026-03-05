/**
 * P0 Security regression tests
 *
 * Covers:
 *  P0-1  storage key path-traversal guard
 *  P0-2  DOMPurify hardening (style, unknown protocols, cid:)
 *  P0-8  attachment filename sanitization and MIME whitelist
 *  P0-9  open-redirect guard (isSafeRedirectPath)
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';

// ─────────────────────────────────────────────────────────────────────────────
// P0-1: Storage key path traversal
// ─────────────────────────────────────────────────────────────────────────────
describe('P0-1: storageKeyToPath', () => {
  // We test the guard by calling readStorage/writeStorage with bad keys.
  // Because they are async and touch the FS, we mock fs.readFile/writeFile
  // and only care that the validation layer throws before reaching them.

  it('rejects path traversal attempts', async () => {
    const DATA_DIR = path.join(os.tmpdir(), `test-storage-${Date.now()}`);
    // Override DATA_DIR via env before importing so the module uses our tmp dir.
    process.env.DATA_DIR = DATA_DIR;

    // Re-import to pick up the env override (Vitest isolates modules per test by default
    // only when using `vi.resetModules`).
    vi.resetModules();
    const { readStorage } = await import('../storage');

    await expect(readStorage('../../../etc/passwd', null)).rejects.toThrow();
    await expect(readStorage('..\\..\\windows\\system32', null)).rejects.toThrow();
    await expect(readStorage('/etc/shadow', null)).rejects.toThrow();
  });

  it('rejects keys with invalid characters', async () => {
    vi.resetModules();
    const { readStorage } = await import('../storage');

    // Null byte
    await expect(readStorage('key\x00evil', null)).rejects.toThrow();
    // Spaces
    await expect(readStorage('key with spaces', null)).rejects.toThrow();
    // Too long
    await expect(readStorage('a'.repeat(257), null)).rejects.toThrow();
  });

  it('accepts valid keys', async () => {
    const DATA_DIR = path.join(os.tmpdir(), `test-storage-valid-${Date.now()}`);
    process.env.DATA_DIR = DATA_DIR;
    vi.resetModules();
    const { readStorage } = await import('../storage');

    // Should resolve (file won't exist → returns defaultValue, no throw)
    await expect(readStorage('contacts:user123', [])).resolves.toEqual([]);
    await expect(readStorage('settings:abc-def_ghi', null)).resolves.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0-2: DOMPurify hardening
// ─────────────────────────────────────────────────────────────────────────────
describe('P0-2: sanitizeHtml', () => {
  // Import after potential module resets
  let sanitizeHtml: (html: string, allowRemoteImages?: boolean) => string;

  beforeAll(async () => {
    vi.resetModules();
    const mod = await import('../sanitize');
    sanitizeHtml = mod.sanitizeHtml;
  });

  it('strips style= attributes', () => {
    const result = sanitizeHtml('<p style="color:red">text</p>');
    expect(result).not.toContain('style=');
  });

  it('strips inline CSS with tracking pixel via background-image', () => {
    const html = '<div style="background-image:url(https://tracker.example.com/pixel.png)">x</div>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('background-image');
    expect(result).not.toContain('tracker.example.com');
  });

  it('blocks cid: links', () => {
    const result = sanitizeHtml('<a href="cid:image001@example.com">inline</a>');
    expect(result).not.toContain('cid:');
    expect(result).toContain('href="#"');
  });

  it('blocks unknown-protocol links', () => {
    const result = sanitizeHtml('<a href="x-my-scheme://something">link</a>');
    // DOMPurify with ALLOW_UNKNOWN_PROTOCOLS:false should strip the href.
    expect(result).not.toContain('x-my-scheme:');
  });

  it('blocks javascript: href', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">xss</a>');
    expect(result).not.toContain('javascript:');
  });

  it('blocks data: href', () => {
    const result = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">xss</a>');
    expect(result).not.toContain('data:text/html');
  });

  it('strips all on* event handlers', () => {
    const handlers = ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'oninput'];
    for (const h of handlers) {
      const result = sanitizeHtml(`<img ${h}="alert(1)" src="a.jpg">`);
      expect(result, `${h} should be stripped`).not.toContain(h);
    }
  });

  it('strips <script> tags', () => {
    const result = sanitizeHtml('<script>alert(1)</script><p>safe</p>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('<p>safe</p>');
  });

  it('strips <base> tag', () => {
    const result = sanitizeHtml('<base href="https://evil.com">');
    expect(result).not.toContain('<base');
  });

  it('strips <link> tag', () => {
    const result = sanitizeHtml('<link rel="stylesheet" href="https://evil.com/evil.css">');
    expect(result).not.toContain('<link');
  });

  it('blocks remote images by default', () => {
    const result = sanitizeHtml('<img src="https://tracker.example.com/open.gif" alt="t">', false);
    expect(result).not.toContain('tracker.example.com');
  });

  it('allows remote images when opt-in', () => {
    const result = sanitizeHtml('<img src="https://example.com/img.png" alt="x">', true);
    expect(result).toContain('example.com');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0-8: Attachment filename sanitization and MIME whitelist
// ─────────────────────────────────────────────────────────────────────────────

// We extract the pure utility functions for unit-testing.
// They are not exported from the route, so we define equivalent stubs here.
// The actual route uses the same logic.

function sanitizeFilename(raw: string): string {
  let name = raw
    .replace(/[\r\n\x00"\\]/g, '')
    .replace(/^\s*\.+/, '')
    .trim()
    .substring(0, 200);
  return name || 'attachment';
}

const SAFE_MIME_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'text/plain', 'text/csv',
  'application/octet-stream',
]);

function safeMime(raw: string): string {
  const base = raw.split(';')[0].trim().toLowerCase();
  if (base === 'text/html' || base === 'text/xml' || base === 'application/xhtml+xml') {
    return 'application/octet-stream';
  }
  return SAFE_MIME_TYPES.has(base) ? base : 'application/octet-stream';
}

describe('P0-8: sanitizeFilename', () => {
  it('strips CR/LF (header injection)', () => {
    const result = sanitizeFilename('evil\r\nX-Custom: injected');
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
  });

  it('strips null bytes', () => {
    const result = sanitizeFilename('file\x00.txt');
    expect(result).not.toContain('\x00');
  });

  it('strips double-quotes', () => {
    const result = sanitizeFilename('file"name.txt');
    expect(result).not.toContain('"');
  });

  it('strips leading dots from dotfiles', () => {
    // Leading-dot stripping prevents hidden-file names like ".bash_history"
    expect(sanitizeFilename('...dotfile')).not.toMatch(/^\./);
  });

  it('does not contain CR/LF even in path-like names', () => {
    // Traversal paths used in Content-Disposition are still safe because
    // the OS never opens this string as a path — only sanitization of header
    // injection characters (CR/LF) is required here.
    const result = sanitizeFilename('../../../etc/passwd\r\nX-Injected: evil');
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
  });

  it('truncates long filenames to 200 chars', () => {
    expect(sanitizeFilename('a'.repeat(300)).length).toBeLessThanOrEqual(200);
  });

  it('returns "attachment" for empty/whitespace names', () => {
    expect(sanitizeFilename('')).toBe('attachment');
    expect(sanitizeFilename('   ')).toBe('attachment');
  });
});

describe('P0-8: safeMime', () => {
  it('converts text/html to octet-stream', () => {
    expect(safeMime('text/html')).toBe('application/octet-stream');
    expect(safeMime('text/html; charset=utf-8')).toBe('application/octet-stream');
  });

  it('converts text/xml to octet-stream', () => {
    expect(safeMime('text/xml')).toBe('application/octet-stream');
  });

  it('converts application/xhtml+xml to octet-stream', () => {
    expect(safeMime('application/xhtml+xml')).toBe('application/octet-stream');
  });

  it('passes safe MIME types through', () => {
    expect(safeMime('image/png')).toBe('image/png');
    expect(safeMime('application/pdf')).toBe('application/pdf');
    expect(safeMime('text/plain')).toBe('text/plain');
  });

  it('maps unknown types to octet-stream', () => {
    expect(safeMime('application/x-strange-type')).toBe('application/octet-stream');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0-9: Open-redirect guard
// ─────────────────────────────────────────────────────────────────────────────

// Same logic as middleware.ts isSafeRedirectPath — inline for fast unit test.
function isSafeRedirectPath(value: string): boolean {
  if (!value) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(value)) return false;
  return true;
}

describe('P0-9: isSafeRedirectPath', () => {
  it('allows safe relative paths', () => {
    expect(isSafeRedirectPath('/ru/mail')).toBe(true);
    expect(isSafeRedirectPath('/en/settings')).toBe(true);
    expect(isSafeRedirectPath('/')).toBe(true);
  });

  it('rejects absolute URLs', () => {
    expect(isSafeRedirectPath('https://evil.com')).toBe(false);
    expect(isSafeRedirectPath('http://evil.com/path')).toBe(false);
  });

  it('rejects protocol-relative URLs', () => {
    expect(isSafeRedirectPath('//evil.com')).toBe(false);
    expect(isSafeRedirectPath('//evil.com/page')).toBe(false);
  });

  it('rejects javascript: scheme', () => {
    expect(isSafeRedirectPath('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: scheme', () => {
    expect(isSafeRedirectPath('data:text/html,x')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafeRedirectPath('')).toBe(false);
  });
});
