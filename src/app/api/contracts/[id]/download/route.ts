import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api-auth';
import { resolveStoragePath } from '@/lib/storage';

const CONTENT_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

/**
 * Serves a generated document to a signed-in user. Documents are held outside
 * public/, so this route is the only way to reach one.
 */
export const GET = withAuth<{ params: Promise<{ id: string }> }>(async (_request, { params }) => {
  const { id } = await params;

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  let file: Buffer;
  try {
    file = await readFile(resolveStoragePath(contract.storagePath));
  } catch {
    return NextResponse.json({ error: 'Document file is missing' }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type': CONTENT_TYPES[contract.format] ?? 'application/octet-stream',
      // Quotes escaped so a caterer name with a quote cannot break the header.
      'Content-Disposition': `attachment; filename="${contract.fileName.replace(/"/g, '')}"`,
      'Content-Length': String(file.length),
      // Personal data: never cached by a proxy or the browser disk cache.
      'Cache-Control': 'private, no-store',
    },
  });
});
