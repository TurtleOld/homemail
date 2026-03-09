/**
 * Next.js instrumentation hook.
 * Runs once per Node.js process at server startup — before any request handling.
 * This guarantees the auto-sort daemon starts reliably without depending on
 * an external health-check poller.
 */
export async function onRequestError(
  err: { digest: string } & Error,
  _request: { path: string; method: string; headers: { [key: string]: string } },
  _context: { routerKind: string; routePath: string; routeType: string; renderSource: string; revalidateReason: string | undefined; renderType: string },
) {
  // Optional: centralized error logging
}

export async function register() {
  // Only start in the Node.js runtime (not Edge).
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAutoSortDaemon } = await import('@/lib/auto-sort-daemon');
    startAutoSortDaemon().catch((e) => {
      console.error('[instrumentation] Failed to start auto-sort daemon:', e);
    });
  }
}
