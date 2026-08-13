import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { DocumentData } from './document-generator';

// Matches the {{placeholder}} convention used by the plain-text templates.
const delimiters = { start: '{{', end: '}}' };

// Placeholders can appear in the body, headers or footers of a document.
const TEXT_PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/;

// The signature drawing XML that should be preserved in the document
const SIGNATURE_DRAWING = `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1714500" cy="714375"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="Signature"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Signature"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId8" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1714500" cy="714375"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Reads the placeholder names out of a .docx.
 *
 * Word splits typed text across runs, so `{{caterer_name}}` is often stored as
 * `{{caterer_` + `name}}`. Stripping the markup first rejoins those fragments,
 * which is why this does not simply search the raw XML.
 */
export function extractDocxPlaceholders(file: Buffer): string[] {
  const zip = new PizZip(file);
  const names: string[] = [];

  for (const path of Object.keys(zip.files)) {
    if (!TEXT_PARTS.test(path)) continue;
    const text = decodeEntities(zip.files[path].asText().replace(/<[^>]*>/g, ''));
    for (const match of text.matchAll(/\{\{([^{}]+)\}\}/g)) {
      const name = match[1].trim();
      // Skip loop and condition markers; only plain values are mappable.
      if (name && !/^[#/^]/.test(name)) names.push(name);
    }
  }

  return [...new Set(names)];
}

/**
 * Fills a .docx template with `data`, returning a new document. The uploaded
 * file is used as the container, so letterheads, logos, tables, clause
 * numbering, fonts and signature lines are preserved exactly.
 */
export function renderDocxTemplate(file: Buffer, data: DocumentData): Buffer {
  const zip = new PizZip(file);

  const doc = new Docxtemplater(zip, {
    delimiters,
    paragraphLoop: true,
    linebreaks: true,
    // An unmapped placeholder renders blank rather than throwing.
    nullGetter: () => '',
  });

  doc.render(data);

  // Post-process: ensure the signature drawing is preserved
  const outputZip = doc.getZip();
  const documentXml = outputZip.files['word/document.xml']?.asText();
  if (documentXml) {
    // Check if the signature drawing is present after "Witnessed by"
    if (!documentXml.includes('Witnessed by </w:t>') || 
        !documentXml.includes('r:embed="rId8"') || 
        !documentXml.includes('Signature')) {
      // Re-insert the signature drawing after "Witnessed by "
      const updatedXml = documentXml.replace(
        /(<w:t[^>]*>Witnessed by <\/w:t>.*?<\/w:p>)/,
        `$1${SIGNATURE_DRAWING}`
      );
      outputZip.file('word/document.xml', updatedXml);
    }
  }

  return outputZip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  }) as Buffer;
}
