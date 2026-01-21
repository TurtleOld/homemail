import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { readStorage, writeStorage } from '@/lib/storage';
import { validateOrigin } from '@/lib/csrf';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category?: 'work' | 'personal' | 'general';
  variables?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  category: z.enum(['work', 'personal', 'general']).optional(),
  variables: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const templates = await readStorage<EmailTemplate[]>(`emailTemplates:${session.accountId}`, []);

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const data = templateSchema.parse(body);

    const templates = await readStorage<EmailTemplate[]>(`emailTemplates:${session.accountId}`, []);

    const variables = extractVariables(data.subject + ' ' + data.body).filter((v) => v !== '');

    const newTemplate: EmailTemplate = {
      id: `template_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      name: data.name,
      subject: data.subject,
      body: data.body,
      category: data.category || 'general',
      variables,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    templates.push(newTemplate);
    await writeStorage(`emailTemplates:${session.accountId}`, templates);

    return NextResponse.json(newTemplate);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function extractVariables(text: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  
  while ((match = variableRegex.exec(text)) !== null) {
    variables.add(match[1]!);
  }
  
  return Array.from(variables);
}
