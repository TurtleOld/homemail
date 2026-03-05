import { NextRequest, NextResponse } from 'next/server';
import { SecurityLogger } from '@/lib/security-logger';

// Receives Content-Security-Policy violation reports (report-uri directive).
// Browsers POST application/csp-report or application/reports+json payloads.
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let report: Record<string, unknown> = {};

    const body = await request.json().catch(() => null);
    if (body != null) {
      if (Array.isArray(body)) {
        // application/reports+json (Reporting API v1) — array of report objects
        report = body[0]?.body ?? body[0] ?? {};
      } else if (typeof body === 'object') {
        // application/csp-report — wraps payload in { "csp-report": { ... } }
        // application/json — flat object
        report = (body as any)['csp-report'] ?? body;
      }
    }
    void contentType; // consumed implicitly via body shape detection above

    SecurityLogger.logSuspiciousActivity(request, 'csp_violation', {
      blockedUri: report['blocked-uri'] ?? report.blockedURL,
      violatedDirective: report['violated-directive'] ?? report.effectiveDirective,
      documentUri: report['document-uri'] ?? report.documentURL,
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      columnNumber: report['column-number'],
    });
  } catch {
    // Never let CSP report endpoint error — just swallow
  }

  return new NextResponse(null, { status: 204 });
}
