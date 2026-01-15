'use client';

import { useEffect } from 'react';
import { useReportWebVitals } from 'next/web-vitals';

export function PerformanceReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== 'development') return;
    console.info('WebVitals', metric);
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const entries = performance.getEntriesByType('navigation');
    if (entries.length > 0) {
      console.info('NavigationTiming', entries[0]);
    }
  }, []);

  return null;
}
