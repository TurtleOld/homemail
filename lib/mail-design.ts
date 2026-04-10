export type MailDesignVariant = 'legacy' | 'calm-productivity';

const CALM_PRODUCTIVITY = 'calm-productivity';

export function getMailDesignVariant(value?: string | null): MailDesignVariant {
  return value === CALM_PRODUCTIVITY ? CALM_PRODUCTIVITY : 'legacy';
}

export function isCalmProductivityEnabled(value?: string | null): boolean {
  return getMailDesignVariant(value) === CALM_PRODUCTIVITY;
}
