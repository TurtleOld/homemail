export type MailViewport = 'mobile' | 'tablet' | 'desktop';

export function getMailViewport(width: number): MailViewport {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}
