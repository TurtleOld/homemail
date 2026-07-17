export function getPublicStalwartManagementUrl(
  environment: NodeJS.ProcessEnv = process.env
): string | null {
  const configuredUrl =
    environment.STALWART_MANAGEMENT_PUBLIC_URL || environment.STALWART_PUBLIC_URL;
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
