export function validateOrigin(request: Request): boolean {
  // Skip validation in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');
  const xForwardedHost = request.headers.get('x-forwarded-host');
  const xForwardedProto = request.headers.get('x-forwarded-proto');

  // Use forwarded headers if behind proxy (nginx)
  const actualHost = xForwardedHost || host;
  const protocol = xForwardedProto || 'http';

  // If behind nginx proxy, be more lenient with validation
  if (xForwardedHost || xForwardedProto) {
    // Behind proxy - validate hostname match instead of exact origin
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const originHost = originUrl.hostname;
        // Allow if hostname matches (ignore port differences)
        if (originHost === actualHost || originHost === host || originHost === 'localhost') {
          return true;
        }
      } catch {
        // Invalid origin URL, but if we have host, allow it
        if (actualHost) {
          return true;
        }
      }
    }
    
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        const refererHost = refererUrl.hostname;
        if (refererHost === actualHost || refererHost === host || refererHost === 'localhost') {
          return true;
        }
      } catch {
        // Invalid referer URL
      }
    }
    
    // If we have host from proxy, allow the request
    if (actualHost) {
      return true;
    }
  }

  // Standard validation for direct access
  if (!origin && !referer) {
    return false;
  }

  const expectedOrigin = actualHost ? `${protocol}://${actualHost}` : null;

  if (origin && expectedOrigin) {
    if (origin !== expectedOrigin) {
      // Check hostname match
      try {
        const originUrl = new URL(origin);
        const expectedUrl = new URL(expectedOrigin);
        if (originUrl.hostname === expectedUrl.hostname || originUrl.hostname === 'localhost') {
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }
  }

  if (referer && expectedOrigin) {
    if (!referer.startsWith(expectedOrigin)) {
      try {
        const refererUrl = new URL(referer);
        const expectedUrl = new URL(expectedOrigin);
        if (refererUrl.hostname === expectedUrl.hostname || refererUrl.hostname === 'localhost') {
          return true;
        }
      } catch {
        return false;
      }
      return false;
    }
  }

  return true;
}
