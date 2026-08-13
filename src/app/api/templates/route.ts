import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api-auth';
import { extractPlaceholders } from '@/lib/document-generator';

function resolvePlaceholders(stored: string, content: string): string[] {
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // stored value is not valid JSON, fall back to the template content
  }
  return extractPlaceholders(content);
}

export const GET = withAuth(async () => {
  try {
    const templates = await prisma.template.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const parsedTemplates = templates.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      content: template.content,
      // The storage path is internal; the client only needs to know whether an
      // official Word layout is attached.
      hasDocx: Boolean(template.storagePath),
      placeholders: resolvePlaceholders(template.placeholders, template.content),
      createdAt: template.createdAt,
    }));

    return NextResponse.json(parsedTemplates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
});

export const POST = withAuth(async request => {
  try {
    const body = await request.json();
    const { name, description, content, placeholders } = body;

    if (!name || !content) {
      return NextResponse.json({ error: 'Name and content are required' }, { status: 400 });
    }

    const resolved = placeholders?.length ? placeholders : extractPlaceholders(content);

    const template = await prisma.template.create({
      data: {
        name,
        description,
        content,
        placeholders: JSON.stringify(resolved),
      },
    });

    return NextResponse.json(
      { ...template, hasDocx: false, placeholders: resolved },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
});
