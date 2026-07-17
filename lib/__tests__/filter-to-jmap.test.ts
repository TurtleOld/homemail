import { describe, expect, it } from 'vitest';
import { convertFilterToJMAP } from '../filter-to-jmap';

describe('convertFilterToJMAP quick filters', () => {
  it('uses JMAP keywords for read state', () => {
    expect(convertFilterToJMAP(undefined, 'unread', undefined, 'inbox-id')).toEqual({
      inMailbox: 'inbox-id',
      notKeyword: '$seen',
    });
    expect(convertFilterToJMAP(undefined, 'read', undefined, 'inbox-id')).toEqual({
      inMailbox: 'inbox-id',
      hasKeyword: '$seen',
    });
  });

  it('uses the matching JMAP keyword for starred and important mail', () => {
    expect(convertFilterToJMAP(undefined, 'starred')).toEqual({
      hasKeyword: '$flagged',
    });
    expect(convertFilterToJMAP(undefined, 'important')).toEqual({
      hasKeyword: '$important',
    });
  });

  it('keeps attachment filtering unchanged', () => {
    expect(convertFilterToJMAP(undefined, 'hasAttachments')).toEqual({
      hasAttachment: true,
    });
  });
});
