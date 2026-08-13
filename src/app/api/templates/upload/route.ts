import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api-auth';
import { saveToStorage } from '@/lib/storage';
import { extractDocxPlaceholders } from '@/lib/docx-template';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_BYTES = 50 * 1024 * 1024;

export const POST = withAuth(async request => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const name = String(formData.get('name') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.docx') || (file.type && file.type !== DOCX_MIME)) {
      return NextResponse.json(
        { error: 'Only .docx templates are supported. Save the document as .docx in Word first.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Template must be smaller than 50MB' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let placeholders: string[];
    try {
      placeholders = extractDocxPlaceholders(buffer);
    } catch {
      return NextResponse.json(
        { error: 'Could not read this .docx. It may be corrupt or password protected.' },
        { status: 400 }
      );
    }

    if (placeholders.length === 0) {
      return NextResponse.json(
        {
          error:
            'No placeholders found. Mark the blanks in your document as {{caterer_name}}, {{start_date}} and so on, then upload again.',
        },
        { status: 400 }
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = await saveToStorage('templates', `${Date.now()}-${safeName}`, buffer);

    const template = await prisma.template.create({
      data: {
        name: name || file.name.replace(/\.docx$/i, ''),
        description: description || null,
        // The uploaded file is the source of truth; content is kept for preview.
        content: placeholders.map(p => `{{${p}}}`).join('\n'),
        storagePath,
        placeholders: JSON.stringify(placeholders),
      },
    });

    return NextResponse.json(
      { ...template, storagePath: undefined, hasDocx: true, placeholders },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading template:', error);
    return NextResponse.json({ error: 'Failed to upload template' }, { status: 500 });
  }
});
