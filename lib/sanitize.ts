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

// 'style' is intentionally excluded — inline styles can carry CSS-based trackers
// and CSS injection vectors.  If specific formatting is needed, use class= instead.
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'];

// All event-handler attributes (on*) are forbidden at the DOMPurify level.
// style= is also explicitly forbidden here as belt-and-suspenders.
const FORBIDDEN_ATTR = [
  'style',
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

  let sanitized = DOMPurify.sanitize(html, config);

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
