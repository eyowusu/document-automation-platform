import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api-auth';
import { resolveStoragePath } from '@/lib/storage';

// Next 16 passes route params as a promise.
type Context = { params: Promise<{ id: string }> };

export const GET = withAuth<Context>(async (_request, { params }) => {
  try {
    const { id } = await params;
    const template = await prisma.template.findUnique({
      where: { id },
      include: { excelMappings: true },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...template,
      storagePath: undefined,
      hasDocx: Boolean(template.storagePath),
      placeholders: JSON.parse(template.placeholders),
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
});

export const PUT = withAuth<Context>(async (request, { params }) => {
  try {
    const { id } = await params;
    const { name, description, content, placeholders } = await request.json();

    const template = await prisma.template.update({
      where: { id },
      data: {
        name,
        description,
        content,
        placeholders: JSON.stringify(placeholders ?? []),
      },
    });

    return NextResponse.json({
      ...template,
      storagePath: undefined,
      hasDocx: Boolean(template.storagePath),
      placeholders: JSON.parse(template.placeholders),
    });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
});

export const DELETE = withAuth<Context>(async (_request, { params, user }) => {
  try {
    const { id } = await params;

    if (user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only an administrator can delete a template' },
        { status: 403 }
      );
    }

    const template = await prisma.template.findUnique({
      where: { id },
      include: { _count: { select: { contracts: true } } },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    if (template._count.contracts > 0) {
      return NextResponse.json(
        {
          error: `This template has generated ${template._count.contracts} document(s) and cannot be deleted.`,
        },
        { status: 409 }
      );
    }

    await prisma.template.delete({ where: { id } });
    if (template.storagePath) {
      await unlink(resolveStoragePath(template.storagePath)).catch(() => {});
    }

    return NextResponse.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
});
