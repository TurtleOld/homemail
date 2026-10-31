import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage, withStorageLock } from '@/lib/storage';
import type { EmailTemplate } from '../route';

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  category: z.enum(['work', 'personal', 'general']).optional(),
});

function extractVariables(text: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  
  while ((match = variableRegex.exec(text)) !== null) {
    variables.add(match[1]!);
  }
  
  return Array.from(variables);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = updateTemplateSchema.parse(body);

    const key = `emailTemplates:${session.accountId}`;

    return await withStorageLock(key, async () => {
      const templates = await readStorage<EmailTemplate[]>(key, []);
      const templateIndex = templates.findIndex((t) => t.id === id);

      if (templateIndex === -1) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      const updatedTemplate = {
        ...templates[templateIndex]!,
        ...data,
        updatedAt: new Date(),
      };

      if (data.subject || data.body) {
        const subject = data.subject || updatedTemplate.subject;
        const body = data.body || updatedTemplate.body;
        updatedTemplate.variables = extractVariables(subject + ' ' + body);
      }

      templates[templateIndex] = updatedTemplate;
      await writeStorage(key, templates);

      return NextResponse.json(updatedTemplate);
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 });
    }
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const key = `emailTemplates:${session.accountId}`;

    return await withStorageLock(key, async () => {
      const templates = await readStorage<EmailTemplate[]>(key, []);
      const filteredTemplates = templates.filter((t) => t.id !== id);

      await writeStorage(key, filteredTemplates);

      return NextResponse.json({ success: true });
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
