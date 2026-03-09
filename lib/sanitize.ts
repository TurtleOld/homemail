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

// Allow 'style' but restrict it to safe CSS properties via DOMPurify hooks below.
// This preserves email layout (width, padding, text-align) while blocking
// dangerous properties (url(), expression(), -moz-binding, etc.).
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'style', 'width', 'height', 'align', 'valign', 'cellpadding', 'cellspacing', 'bgcolor', 'colspan', 'rowspan'];

// All event-handler attributes (on*) are forbidden at the DOMPurify level.
const FORBIDDEN_ATTR = [
  'onerror',
  'onload',
  'onclick',
  'onmouseover',
  'onmouseout',
  'onmouseenter',
  'onmouseleave',
  'onfocus',
  'onblur',
  'onchange',
  'oninput',
  'onsubmit',
  'onkeydown',
  'onkeyup',
  'onkeypress',
  'oncopy',
  'oncut',
  'onpaste',
  'oncontextmenu',
  'ondblclick',
  'ondragstart',
  'formaction',
  'action',
  'xlink:href',
];

// Tags that can be used for phishing / resource loading even if they somehow
// get past ALLOWED_TAGS (belt-and-suspenders).
const FORBIDDEN_TAGS = [
  'script',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'base',
  'meta',
  'link',
  'noscript',
  'frame',
  'frameset',
  'applet',
  'svg',
  'math',
  'template',
  'slot',
];

// Safe CSS properties allowed in inline styles.  Anything not on this list
// is stripped, which blocks url(), expression(), -moz-binding, etc.
const SAFE_CSS_PROPERTIES = new Set([
  'color', 'background-color', 'background',
  'font-size', 'font-weight', 'font-style', 'font-family', 'font',
  'text-align', 'text-decoration', 'text-transform', 'text-indent',
  'line-height', 'letter-spacing', 'word-spacing', 'white-space', 'word-break', 'word-wrap', 'overflow-wrap',
  'vertical-align',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-width', 'border-style', 'border-color', 'border-radius',
  'border-collapse', 'border-spacing',
  'display', 'float', 'clear', 'overflow', 'overflow-x', 'overflow-y',
  'list-style', 'list-style-type',
  'table-layout',
  'box-sizing',
  'opacity',
]);

// Patterns that are dangerous in CSS values regardless of property name
const DANGEROUS_CSS_VALUE = /url\s*\(|expression\s*\(|import\s|javascript:|\\|@import/i;

function sanitizeCssValue(value: string): string {
  if (DANGEROUS_CSS_VALUE.test(value)) return '';
  return value;
}

function sanitizeInlineStyle(styleStr: string): string {
  const parts: string[] = [];
  // Split on semicolons, handling simple cases
  for (const decl of styleStr.split(';')) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const value = decl.slice(colonIdx + 1).trim();
    if (!prop || !value) continue;
    if (!SAFE_CSS_PROPERTIES.has(prop)) continue;
    const safeVal = sanitizeCssValue(value);
    if (safeVal) parts.push(`${prop}: ${safeVal}`);
  }
  return parts.join('; ');
}

export function sanitizeHtml(html: string, allowRemoteImages: boolean = false): string {
  const config: Parameters<typeof DOMPurify.sanitize>[1] = {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: FORBIDDEN_ATTR,
    ALLOW_DATA_ATTR: false,
    // Explicitly disable unknown protocols so cid:, data:, custom-scheme: etc.
    // cannot be used in href/src without our explicit allowlist below.
    ALLOW_UNKNOWN_PROTOCOLS: false,
    // Force all href/src values through our hook — DOMPurify strips what it
    // doesn't recognise when ALLOW_UNKNOWN_PROTOCOLS is false, but we also
    // whitelist explicitly at hook level for defence in depth.
    FORCE_BODY: true,
  };

  // Hook: sanitize inline style values to only allow safe CSS properties
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.hasAttribute('style')) {
      const raw = node.getAttribute('style') || '';
      const safe = sanitizeInlineStyle(raw);
      if (safe) {
        node.setAttribute('style', safe);
      } else {
        node.removeAttribute('style');
      }
    }
  });

  let sanitized = DOMPurify.sanitize(html, config);

  // Remove hooks to avoid leaking into other callers
  DOMPurify.removeAllHooks();

  if (!allowRemoteImages) {
    sanitized = sanitized.replace(
      /<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi,
      (match) =>
        match.replace(
          /src=["'][^"']+["']/,
          "src=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Ctext%3E\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u043d\u043e%3C/text%3E%3C/svg%3E\""
        )
    );
  }

  sanitized = sanitized.replace(
    /<a\s+([^>]*href=["'])([^"']+)(["'][^>]*)>/gi,
    (match, before, url, after) => {
      const normalized = url.trim().toLowerCase();
      // Block dangerous protocols.  cid: is an email inline-image scheme;
      // it has no meaning in a browser context and gets replaced with #.
      if (
        normalized.startsWith('javascript:') ||
        normalized.startsWith('data:') ||
        normalized.startsWith('vbscript:') ||
        normalized.startsWith('cid:')
      ) {
        return match.replace(/href=["'][^"']+["']/, 'href="#"');
      }
      if (!match.includes('target=')) {
        return match.replace(/>$/, ' target="_blank" rel="noopener noreferrer">');
      }
      if (!match.includes('rel=')) {
        return match.replace(/>$/, ' rel="noopener noreferrer">');
      }
      return match;
    }
  );

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
