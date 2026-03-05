import { NextRequest, NextResponse } from 'next/server';
import { SecurityLogger } from '@/lib/security-logger';

// Receives Content-Security-Policy violation reports (report-uri directive).
// Browsers POST application/csp-report or application/reports+json payloads.
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let report: Record<string, unknown> = {};

    if (contentType.includes('application/csp-report') || contentType.includes('application/json')) {
      const body = await request.json().catch(() => null);
      if (body && typeof body === 'object') {
        // application/csp-report wraps in { "csp-report": { ... } }
        report = (body as any)['csp-report'] ?? body;
      }
    } else {
      // application/reports+json (Reporting API v1) — array of reports
      const body = await request.json().catch(() => null);
      if (Array.isArray(body) && body.length > 0) {
        report = body[0]?.body ?? body[0] ?? {};
      }
    }

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
