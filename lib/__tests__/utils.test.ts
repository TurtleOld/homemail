import { describe, it, expect } from 'vitest';
import { validateEmail, parseEmailList, generateCursor, parseCursor } from '../utils';

describe('validateEmail', () => {
  it('should validate correct emails', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name@domain.co.uk')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('@example.com')).toBe(false);
    expect(validateEmail('test@')).toBe(false);
  });
});

describe('parseEmailList', () => {
  it('should parse comma-separated emails', () => {
    const result = parseEmailList('test1@example.com, test2@example.com');
    expect(result).toEqual(['test1@example.com', 'test2@example.com']);
  });

  it('should filter invalid emails', () => {
    const result = parseEmailList('valid@example.com, invalid, another@example.com');
    expect(result).toEqual(['valid@example.com', 'another@example.com']);
  });
});

describe('cursor pagination', () => {
  it('should generate and parse cursor', () => {
    const cursor = generateCursor(2, 50);
    const parsed = parseCursor(cursor);
    expect(parsed).toEqual({ page: 2, pageSize: 50 });
  });

  it('should return null for invalid cursor', () => {
    const parsed = parseCursor('invalid');
    expect(parsed).toBeNull();
  });
});
