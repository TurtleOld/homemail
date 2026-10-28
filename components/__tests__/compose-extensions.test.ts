import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { composeExtensions } from '../compose';

describe('compose editor extensions', () => {
  it('registers each extension name exactly once', () => {
    const editor = new Editor({ extensions: composeExtensions, content: '<p>test</p>' });
    const names = editor.extensionManager.extensions.map((extension) => extension.name);
    editor.destroy();

    expect(names).toEqual(expect.arrayContaining(['link', 'underline', 'codeBlock']));
    expect(new Set(names).size).toBe(names.length);
  });
});
