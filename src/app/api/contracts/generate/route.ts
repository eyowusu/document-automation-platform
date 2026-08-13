import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api-auth';
import { resolveStoragePath, saveToStorage } from '@/lib/storage';
import { generateWordDocument, generatePdfDocument, extractPlaceholders } from '@/lib/document-generator';
import { extractDocxPlaceholders, renderDocxTemplate } from '@/lib/docx-template';
import { applyDerivedFields, findUnfilled } from '@/lib/derived-fields';
import { convertDocxToPdf, isPdfAvailable, PDF_SETUP_HINT } from '@/lib/pdf-convert';

/** Builds a filesystem-safe file name, e.g. "Adjoa Mensah Catering" -> "adjoa-mensah-catering". */
function slugify(value: unknown, fallback: string): string {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

export const POST = withAuth(async (request, { user }) => {
  try {
    const body = await request.json();
    const { templateId, data = {}, format } = body;

    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // A template is either an uploaded .docx (letterhead, tables and signature
    // blocks preserved) or plain text typed into the app.
    let templateFile: Buffer | null = null;
    if (template.storagePath) {
      try {
        templateFile = await readFile(resolveStoragePath(template.storagePath));
      } catch {
        return NextResponse.json({ error: 'Template file is missing' }, { status: 410 });
      }
    }

    const values = applyDerivedFields(data);

    const placeholders = templateFile
      ? extractDocxPlaceholders(templateFile)
      : extractPlaceholders(template.content);

    // An empty cell is allowed and renders as blank, but a placeholder with no
    // value at all is refused: a silent gap in a signed contract is worse than
    // a failed row. Derived placeholders report the column to map instead.
    const unfilled = findUnfilled(placeholders, values);
    if (unfilled.length > 0) {
      return NextResponse.json(
        { error: 'Unmapped placeholders', missing: unfilled },
        { status: 400 }
      );
    }

    const stamp = Date.now();
    const name = slugify(values.caterer_name ?? values.name, 'document');

    let buffer: Buffer;
    let fileName: string;
    const savedFormat = format === 'pdf' ? 'pdf' : 'docx';

    if (templateFile) {
      const rendered = renderDocxTemplate(templateFile, values);
      if (format === 'pdf') {
        // Refuse rather than fall back to a re-drawn PDF: a contract that does
        // not match the Word original is worse than no PDF at all.
        if (!(await isPdfAvailable())) {
          return NextResponse.json({ error: PDF_SETUP_HINT }, { status: 503 });
        }
        buffer = await convertDocxToPdf(rendered);
        fileName = `${name}-${stamp}.pdf`;
      } else {
        buffer = rendered;
        fileName = `${name}-${stamp}.docx`;
      }
    } else if (format === 'pdf') {
      buffer = await generatePdfDocument(template.content, values);
      fileName = `${name}-${stamp}.pdf`;
    } else {
      buffer = await generateWordDocument(template.content, values);
      fileName = `${name}-${stamp}.docx`;
    }

    const storagePath = await saveToStorage('contracts', fileName, buffer);

    const contract = await prisma.contract.create({
      data: {
        templateId,
        data: JSON.stringify(values),
        storagePath,
        fileName,
        format: savedFormat,
        status: 'completed',
        generatedById: user.id,
      },
    });

    return NextResponse.json({
      contract,
      fileName,
      downloadUrl: `/api/contracts/${contract.id}/download`,
    });
  } catch (error) {
    console.error('Error generating contract:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate contract';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
