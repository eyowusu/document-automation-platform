// Registers the GSFP catering contract template and writes a matching sample
// spreadsheet. Run with: node scripts/seed-catering-template.mjs
import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
const PizZip = require('pizzip');

const prisma = new PrismaClient();
// Templates live in private storage, never under public/.
const STORAGE_PATH = 'templates/catering-contract-2025.docx';
const NAME = 'Catering Services Contract 2026';

const buffer = readFileSync(`storage/${STORAGE_PATH}`);
// Extract placeholders directly from the DOCX XML to avoid the lodash dependency
const zip = new PizZip(buffer);
const xml = zip.file('word/document.xml')?.asText() || '';
const placeholderRegex = /\{\{([^}]+)\}\}/g;
const placeholders = new Set();
let match;
while ((match = placeholderRegex.exec(xml)) !== null) {
  placeholders.add(match[1].trim());
}
const placeholderArray = Array.from(placeholders);

const existing = await prisma.template.findFirst({ where: { storagePath: STORAGE_PATH } });
const data = {
  name: NAME,
  description:
    'Official GSFP catering services contract. Preserves the coat of arms, cover page, clause numbering and signature blocks.',
  content: placeholderArray.map(p => `{{${p}}}`).join('\n'),
  storagePath: STORAGE_PATH,
  placeholders: JSON.stringify(placeholderArray),
};

const template = existing
  ? await prisma.template.update({ where: { id: existing.id }, data })
  : await prisma.template.create({ data });

console.log(`${existing ? 'Updated' : 'Created'} template ${template.id}`);
console.log('Placeholders:', placeholderArray.join(', '));

// Sample spreadsheet: one row per caterer, one column per mappable field.
// contract_day/month/year and end_date are filled in automatically.
const columns = [
  'caterer_name', 'contract_number', 'contract_date', 'district', 'region',
  'school_name', 'school_location', 'start_date', 'caterer_address',
  'caterer_tel', 'rc_address', 'rc_tel', 'rc_email',
];
const sample = [
  ['Adjoa Mensah Catering Services', 'GSFP/CAT/2026/001', '2026-01-15', 'Ga East Municipal', 'Greater Accra',
   'Dome Presbyterian Basic School', 'Dome, Accra', '2026-01-15', 'P. O. Box 42, Dome, Accra',
   '0244123456', 'Regional Coordinating Council, Accra', '0302987654', 'gsfp.greateraccra@gsfp.gov.gh'],
  ['Yaa Asantewaa Foods Ltd', 'GSFP/CAT/2026/002', '2026-01-15', 'Kumasi Metropolitan', 'Ashanti',
   'Asafo Anglican Basic School', 'Asafo, Kumasi', '2026-01-15', 'P. O. Box 118, Adum, Kumasi',
   '0201987654', 'Regional Coordinating Council, Kumasi', '0322045612', 'gsfp.ashanti@gsfp.gov.gh'],
  ['Northern Star Catering Enterprise', 'GSFP/CAT/2026/003', '2026-02-01', 'Tamale Metropolitan', 'Northern',
   'Lamashegu Primary School', 'Lamashegu, Tamale', '2026-02-01', 'P. O. Box 76, Tamale',
   '0555112233', 'Regional Coordinating Council, Tamale', '0372022334', 'gsfp.northern@gsfp.gov.gh'],
];

const sheet = XLSX.utils.aoa_to_sheet([columns, ...sample]);
sheet['!cols'] = columns.map(c => ({ wch: Math.max(16, c.length + 4) }));
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, 'Caterers');
writeFileSync('public/templates/caterers-sample.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
console.log('Wrote public/templates/caterers-sample.xlsx');

await prisma.$disconnect();
