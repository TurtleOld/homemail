import { describe, it, expect } from 'vitest';
import { formatDate } from '../utils';
import { groupMessagesByThread } from '../thread-utils';
import type { MessageListItem } from '../types';

describe('Производительность форматирования дат', () => {
  it('должен форматировать большое количество дат быстро', () => {
    const dates = Array.from({ length: 1000 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date;
    });

    const start = performance.now();
    dates.forEach((date) => formatDate(date));
    const end = performance.now();

    const duration = end - start;
    expect(duration).toBeLessThan(100);
  });
});

describe('Производительность группировки писем', () => {
  it('должен группировать большое количество писем быстро', () => {
    const messages: MessageListItem[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `msg${i}`,
      threadId: `thread${Math.floor(i / 5)}`,
      from: { email: `sender${i}@example.com`, name: `Sender ${i}` },
      subject: `Subject ${i}`,
      snippet: `Snippet ${i}`,
      date: new Date(Date.now() - i * 1000),
      flags: {
        unread: i % 2 === 0,
        starred: i % 3 === 0,
        important: i % 5 === 0,
        hasAttachments: i % 7 === 0,
      },
      size: 1024 * (i + 1),
    }));

    const start = performance.now();
    const threads = groupMessagesByThread(messages);
    const end = performance.now();

    const duration = end - start;
    expect(duration).toBeLessThan(50);
    expect(threads.length).toBeGreaterThan(0);
  });
});

describe('Производительность сортировки', () => {
  it('должен сортировать большое количество писем быстро', () => {
    const messages: MessageListItem[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `msg${i}`,
      threadId: `thread${i}`,
      from: { email: `sender${i}@example.com` },
      subject: `Subject ${i}`,
      snippet: '',
      date: new Date(Date.now() - Math.random() * 1000000000),
      flags: {
        unread: false,
        starred: false,
        important: false,
        hasAttachments: false,
      },
      size: Math.floor(Math.random() * 1000000),
    }));

    const start = performance.now();
    messages.sort((a, b) => b.date.getTime() - a.date.getTime());
    const end = performance.now();

    const duration = end - start;
    expect(duration).toBeLessThan(100);
    expect(messages[0]!.date.getTime()).toBeGreaterThanOrEqual(messages[messages.length - 1]!.date.getTime());
  });
});
