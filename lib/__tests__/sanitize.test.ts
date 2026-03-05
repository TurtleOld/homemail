import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../sanitize';

describe('sanitizeHtml', () => {
  it('should remove script tags', () => {
    const html = '<p>Hello</p><script>alert("xss")</script>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('<script>');
    expect(result).toContain('<p>Hello</p>');
  });

  it('should remove event handlers', () => {
    const html = '<p onclick="alert(1)">Click me</p>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('onclick');
  });

  it('should add target and rel to links', () => {
    const html = '<a href="https://example.com">Link</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('should block remote images by default', () => {
    const html = '<img src="https://example.com/image.jpg" alt="test">';
    const result = sanitizeHtml(html, false);
    expect(result).not.toContain('https://example.com/image.jpg');
  });

  it('should allow remote images when enabled', () => {
    const html = '<img src="https://example.com/image.jpg" alt="test">';
    const result = sanitizeHtml(html, true);
    expect(result).toContain('https://example.com/image.jpg');
  });

  it('should remove javascript: URLs', () => {
    const html = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtml(html);
    expect(result).toContain('href="#"');
    expect(result).not.toContain('javascript:');
  });

  // P0-2 additions
  it('should strip style= attributes', () => {
    const result = sanitizeHtml('<p style="color:red">text</p>');
    expect(result).not.toContain('style=');
  });

  it('should strip cid: href (email inline image protocol)', () => {
    const result = sanitizeHtml('<a href="cid:image001@example.com">click</a>');
    expect(result).not.toContain('cid:');
  });

  it('should strip <base> tag', () => {
    const result = sanitizeHtml('<base href="https://evil.com">safe text');
    expect(result).not.toContain('<base');
  });

  it('should strip <meta> tag', () => {
    const result = sanitizeHtml('<meta http-equiv="refresh" content="0; url=https://evil.com">');
    expect(result).not.toContain('<meta');
  });

  it('should strip all on* event handlers beyond the original set', () => {
    for (const h of ['onfocus', 'onblur', 'oninput', 'onchange', 'onsubmit', 'ondblclick']) {
      const result = sanitizeHtml(`<input ${h}="alert(1)">`);
      expect(result, `${h} should be stripped`).not.toContain(h);
    }
  });

  it('should not allow tracking pixels via CSS background-image in style=', () => {
    const html = '<div style="background-image:url(https://tracker.example.com/px)">x</div>';
    const result = sanitizeHtml(html);
    expect(result).not.toContain('tracker.example.com');
  });
});
