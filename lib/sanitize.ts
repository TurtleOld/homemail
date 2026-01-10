import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'a',
  'img',
  'div',
  'span',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
];

const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class', 'style', 'target', 'rel'];

export function sanitizeHtml(html: string, allowRemoteImages: boolean = false): string {
  const config: Parameters<typeof DOMPurify.sanitize>[1] = {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  };

  let sanitized = DOMPurify.sanitize(html, config);

  if (!allowRemoteImages) {
    sanitized = sanitized.replace(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi, (match) => {
      return match.replace(/src=["'][^"']+["']/, 'src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ctext%3EИзображение заблокировано%3C/text%3E%3C/svg%3E"');
    });
  }

  sanitized = sanitized.replace(/<a\s+([^>]*href=["'])([^"']+)(["'][^>]*)>/gi, (match, before, url, after) => {
    const normalized = url.trim().toLowerCase();
    if (normalized.startsWith('javascript:') || normalized.startsWith('data:') || normalized.startsWith('vbscript:')) {
      return match.replace(/href=["'][^"']+["']/, 'href="#"');
    }
    if (!match.includes('target=')) {
      return match.replace(/>$/, ' target="_blank" rel="noopener noreferrer">');
    }
    if (!match.includes('rel=')) {
      return match.replace(/>$/, ' rel="noopener noreferrer">');
    }
    return match;
  });

  sanitized = sanitized.replace(/<a(?![^>]*\shref=)([^>]*)>/gi, (match, attrs) => {
    const hasTarget = /target\s*=/.test(attrs);
    const hasRel = /rel\s*=/.test(attrs);
    if (!hasTarget && !hasRel) {
      return `<a href="#"${attrs} target="_blank" rel="noopener noreferrer">`;
    }
    if (hasTarget && !hasRel) {
      return `<a href="#"${attrs} rel="noopener noreferrer">`;
    }
    return `<a href="#"${attrs}>`;
  });

  return sanitized;
}
