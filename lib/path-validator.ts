import path from 'node:path';
import { SecurityLogger } from './security-logger';
import { logger } from './logger';

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/app/data' : path.join(process.cwd(), 'data'));

const ALLOWED_EXTENSIONS = [
  '.json',
  '.jsonl',
  '.enc',
  '.txt',
  '.log',
];

const FORBIDDEN_PATTERNS = [
  '..',
  '../',
  '..\\',
  '/etc/',
  '/proc/',
  '/sys/',
  '/dev/',
  'C:\\',
  'D:\\',
  'E:\\',
];

export interface PathValidationResult {
  valid: boolean;
  normalizedPath?: string;
  reason?: string;
}

export function validatePath(
  filePath: string,
  baseDir: string = DATA_DIR,
  request?: Request
): PathValidationResult {
  if (!filePath || typeof filePath !== 'string') {
    return {
      valid: false,
      reason: 'Invalid path',
    };
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (filePath.includes(pattern)) {
      if (request) {
        SecurityLogger.logPathTraversalAttempt(request, filePath, {
          reason: 'forbidden_pattern',
          pattern,
        });
      }
      return {
        valid: false,
        reason: 'Path contains forbidden pattern',
      };
    }
  }

  try {
    const normalized = path.normalize(filePath);
    const resolved = path.resolve(baseDir, normalized);

    if (!resolved.startsWith(path.resolve(baseDir))) {
      if (request) {
        SecurityLogger.logPathTraversalAttempt(request, filePath, {
          reason: 'path_outside_base_dir',
          resolved,
          baseDir,
        });
      }
      return {
        valid: false,
        reason: 'Path is outside base directory',
      };
    }

    const ext = path.extname(resolved);
    if (ext && !ALLOWED_EXTENSIONS.includes(ext.toLowerCase())) {
      logger.warn(`[PathValidator] Unusual file extension: ${ext} for path: ${filePath}`);
    }

    return {
      valid: true,
      normalizedPath: resolved,
    };
  } catch (error) {
    if (request) {
      SecurityLogger.logPathTraversalAttempt(request, filePath, {
        reason: 'path_validation_error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      valid: false,
      reason: error instanceof Error ? error.message : 'Path validation failed',
    };
  }
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .substring(0, 255);
}
