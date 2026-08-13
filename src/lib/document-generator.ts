import { Document, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';

export interface DocumentData {
  [key: string]: string | number | boolean;
}

export function replacePlaceholders(template: string, data: DocumentData): string {
  return template.replace(/{{\s*([^}]+?)\s*}}/g, (match, name: string) => {
    const value = data[name];
    return value === undefined || value === null ? match : String(value);
  });
}

export async function generateWordDocument(
  template: string,
  data: DocumentData
): Promise<Buffer> {
  const content = replacePlaceholders(template, data);
  
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: content,
                size: 24,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

export async function generatePdfDocument(
  template: string,
  data: DocumentData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const content = replacePlaceholders(template, data);
    const chunks: Buffer[] = [];
    
    const doc = new PDFDocument();
    
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    doc.fontSize(12).text(content, 50, 50);
    doc.end();
  });
}

export function extractPlaceholders(template: string): string[] {
  const regex = /{{([^}]+)}}/g;
  const placeholders: string[] = [];
  let match;
  
  while ((match = regex.exec(template)) !== null) {
    placeholders.push(match[1].trim());
  }
  
  return [...new Set(placeholders)];
}
