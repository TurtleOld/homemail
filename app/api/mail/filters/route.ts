import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { SavedFilter } from '@/lib/types';

const filtersFilePath = join(process.cwd(), 'data', 'filters.json');

const savedFilterSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  query: z.string(),
  isPinned: z.boolean().optional(),
});

async function loadFilters(accountId: string): Promise<SavedFilter[]> {
  try {
    const data = await readFile(filtersFilePath, 'utf-8');
    const allFilters = JSON.parse(data) as Record<string, SavedFilter[]>;
    return allFilters[accountId] || [];
  } catch {
    return [];
  }
}

async function saveFilters(accountId: string, filters: SavedFilter[]): Promise<void> {
  try {
    const { mkdir } = await import('fs/promises');
    await mkdir(join(process.cwd(), 'data'), { recursive: true });
  } catch {
  }

  let allFilters: Record<string, SavedFilter[]> = {};
  try {
    const data = await readFile(filtersFilePath, 'utf-8');
    allFilters = JSON.parse(data);
  } catch {
  }

  allFilters[accountId] = filters;
  await writeFile(filtersFilePath, JSON.stringify(allFilters, null, 2), 'utf-8');
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const filters = await loadFilters(session.accountId);
    return NextResponse.json(filters);
  } catch (error) {
    console.error('[filters] Error loading filters:', error);
    return NextResponse.json(
      { error: 'Failed to load filters', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = savedFilterSchema.parse(body);

    const filters = await loadFilters(session.accountId);
    const now = new Date();

    let filter: SavedFilter;
    if (data.id) {
      const existing = filters.find((f) => f.id === data.id);
      if (!existing) {
        return NextResponse.json({ error: 'Filter not found' }, { status: 404 });
      }
      filter = {
        ...existing,
        name: data.name,
        query: data.query,
        isPinned: data.isPinned ?? existing.isPinned,
        updatedAt: now,
      };
      const index = filters.findIndex((f) => f.id === data.id);
      filters[index] = filter;
    } else {
      filter = {
        id: `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        query: data.query,
        isPinned: data.isPinned ?? false,
        createdAt: now,
        updatedAt: now,
      };
      filters.push(filter);
    }

    await saveFilters(session.accountId, filters);
    return NextResponse.json(filter);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid filter data', details: error.errors }, { status: 400 });
    }
    console.error('[filters] Error saving filter:', error);
    return NextResponse.json(
      { error: 'Failed to save filter', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const filterId = searchParams.get('id');

    if (!filterId) {
      return NextResponse.json({ error: 'Filter ID required' }, { status: 400 });
    }

    const filters = await loadFilters(session.accountId);
    const filtered = filters.filter((f) => f.id !== filterId);

    if (filters.length === filtered.length) {
      return NextResponse.json({ error: 'Filter not found' }, { status: 404 });
    }

    await saveFilters(session.accountId, filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[filters] Error deleting filter:', error);
    return NextResponse.json(
      { error: 'Failed to delete filter', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}