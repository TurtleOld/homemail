import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { processAutoSortRules } from '@/scripts/process-auto-sort-rules';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run auto-sort rules processing
    await processAutoSortRules();

    return NextResponse.json({ 
      success: true, 
      message: 'Auto-sort rules processed successfully' 
    });
  } catch (error) {
    console.error('[auto-sort-run] Error processing auto-sort rules:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process auto-sort rules', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}