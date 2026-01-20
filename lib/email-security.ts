import type { MessageDetail } from './types';

export interface EmailSecurityAnalysis {
  isSuspicious: boolean;
  isPhishing: boolean;
  isSpam: boolean;
  warnings: string[];
  score: number;
}

const PHISHING_KEYWORDS = [
  'urgent action required',
  'verify your account',
  'suspended account',
  'click here immediately',
  'limited time offer',
  'congratulations you won',
  'claim your prize',
  'verify your identity',
  'account will be closed',
  'update your payment',
];

const SPAM_KEYWORDS = [
  'free money',
  'act now',
  'limited time',
  'click here',
  'buy now',
  'special offer',
  'no obligation',
  'risk free',
];

const SUSPICIOUS_DOMAINS = [
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
];

export function analyzeEmailSecurity(message: MessageDetail): EmailSecurityAnalysis {
  const warnings: string[] = [];
  let score = 0;

  const subject = (message.subject || '').toLowerCase();
  const html = (message.body?.html || '').toLowerCase();
  const text = (message.body?.text || '').toLowerCase();
  const content = `${subject} ${html} ${text}`;

  let isPhishing = false;
  let isSpam = false;

  for (const keyword of PHISHING_KEYWORDS) {
    if (content.includes(keyword)) {
      isPhishing = true;
      score += 20;
      warnings.push(`Contains phishing keyword: "${keyword}"`);
    }
  }

  for (const keyword of SPAM_KEYWORDS) {
    if (content.includes(keyword)) {
      isSpam = true;
      score += 10;
      warnings.push(`Contains spam keyword: "${keyword}"`);
    }
  }

  const fromDomain = message.from?.email?.split('@')[1]?.toLowerCase();
  const displayName = message.from?.name || '';

  if (fromDomain && !displayName) {
    score += 5;
    warnings.push('Sender has no display name');
  }

  if (fromDomain && displayName.toLowerCase() !== fromDomain) {
    const nameDomain = displayName.toLowerCase().replace(/[^a-z0-9.]/g, '');
    if (nameDomain.includes('.') && !nameDomain.includes(fromDomain)) {
      score += 15;
      warnings.push('Display name domain mismatch');
    }
  }

  if (html) {
    const linkMatches = html.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi) || [];
    for (const match of linkMatches) {
      const hrefMatch = match.match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        const href = hrefMatch[1];
        try {
          const url = new URL(href);
          if (url.hostname !== fromDomain) {
            score += 5;
            warnings.push(`Link points to different domain: ${url.hostname}`);
          }

          for (const domain of SUSPICIOUS_DOMAINS) {
            if (url.hostname.includes(domain)) {
              score += 10;
              warnings.push(`Contains URL shortener: ${domain}`);
            }
          }
        } catch {
          if (href.startsWith('javascript:') || href.startsWith('data:')) {
            score += 30;
            warnings.push('Contains dangerous link');
          }
        }
      }
    }

    const imageMatches = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) || [];
    for (const match of imageMatches) {
      const srcMatch = match.match(/src=["']([^"']+)["']/i);
      if (srcMatch) {
        const src = srcMatch[1];
        if (src.startsWith('http') && !src.includes(fromDomain || '')) {
          score += 3;
        }
      }
    }
  }

  if (message.attachments && message.attachments.length > 0) {
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.jar'];
    for (const attachment of message.attachments) {
      const ext = attachment.filename.toLowerCase().substring(attachment.filename.lastIndexOf('.'));
      if (dangerousExtensions.includes(ext)) {
        score += 25;
        warnings.push(`Contains dangerous attachment: ${attachment.filename}`);
      }
    }
  }

  const isSuspicious = score >= 30;

  return {
    isSuspicious,
    isPhishing: isPhishing && score >= 40,
    isSpam: isSpam && score >= 30,
    warnings: warnings.slice(0, 10),
    score: Math.min(score, 100),
  };
}

export function getSecurityBadge(analysis: EmailSecurityAnalysis): {
  label: string;
  color: string;
  icon: string;
} {
  if (analysis.isPhishing) {
    return {
      label: 'Phishing',
      color: 'red',
      icon: '⚠️',
    };
  }

  if (analysis.isSpam) {
    return {
      label: 'Spam',
      color: 'orange',
      icon: '📧',
    };
  }

  if (analysis.isSuspicious) {
    return {
      label: 'Suspicious',
      color: 'yellow',
      icon: '⚠️',
    };
  }

  return {
    label: 'Safe',
    color: 'green',
    icon: '✓',
  };
}
