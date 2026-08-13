import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { withAuth } from '@/lib/api-auth';

export const POST = withAuth(async request => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    // cellDates keeps date columns as real dates instead of Excel serial numbers.
    const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (jsonData.length === 0) {
      return NextResponse.json({ error: 'Empty Excel file' }, { status: 400 });
    }

    const headers = (jsonData[0] as string[]).map(header => String(header ?? '').trim());
    const rows = (jsonData.slice(1) as unknown[][])
      // sheet_to_json returns sparse arrays, so blank cells are absent rather than empty
      .map(row => {
        const obj: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          const value = row[index];
          // Dates go out as ISO so they survive JSON and format predictably.
          obj[header] = value instanceof Date ? value.toISOString().slice(0, 10) : value ?? '';
        });
        return obj;
      })
      .filter(row => Object.values(row).some(value => String(value).trim() !== ''));

    return NextResponse.json({
      headers,
      rows,
      totalRows: rows.length,
    });
  } catch (error) {
    console.error('Error parsing Excel file:', error);
    return NextResponse.json({ error: 'Failed to parse Excel file' }, { status: 500 });
  }
});
