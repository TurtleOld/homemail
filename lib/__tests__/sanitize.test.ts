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
});
