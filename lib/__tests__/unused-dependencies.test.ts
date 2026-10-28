import { describe, expect, it } from 'vitest';
import packageJson from '@/package.json';

// Packages that were removed because nothing in the repository imports them.
// See issue #106.
const UNUSED_DEPENDENCIES = [
  'csv-writer',
  'vcard-json',
  'nodemailer',
  'dompurify',
  '@types/nodemailer',
  '@types/dompurify',
];

describe('unused dependencies', () => {
  it('does not declare them in package.json', () => {
    const declared = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const name of UNUSED_DEPENDENCIES) {
      expect(declared).not.toHaveProperty(name);
    }
  });
});
