import 'server-only';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const run = promisify(execFile);

/**
 * Turns a rendered .docx into a PDF using LibreOffice.
 *
 * The official contract has a coat of arms, a cover-page table, numbered
 * clauses and signature blocks. Re-drawing that by hand in a PDF library would
 * silently produce a different-looking document, which is not acceptable for
 * something an agency signs, so the Word file is converted as-is instead.
 */

/** Where LibreOffice usually lives, in the order worth trying. */
const CANDIDATES = [
  'soffice',
  'libreoffice',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/lib/libreoffice/program/soffice',
  '/snap/bin/libreoffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
];

export const PDF_SETUP_HINT =
  'PDF export needs LibreOffice on the server. Install it with ' +
  '"sudo apt install libreoffice-writer" and restart the app. Word (.docx) ' +
  'download works without it.';

let cached: string | null | undefined;

/** The LibreOffice binary to use, or null when none is installed. */
export async function findConverter(): Promise<string | null> {
  if (cached !== undefined) return cached;
  for (const candidate of CANDIDATES) {
    try {
      await run(candidate, ['--version'], { timeout: 20_000 });
      cached = candidate;
      return cached;
    } catch {
      // not at this path, try the next
    }
  }
  cached = null;
  return cached;
}

export async function isPdfAvailable(): Promise<boolean> {
  return (await findConverter()) !== null;
}

export async function convertDocxToPdf(docx: Buffer): Promise<Buffer> {
  const converter = await findConverter();
  if (!converter) throw new Error(PDF_SETUP_HINT);

  const workDir = await mkdtemp(join(tmpdir(), 'gsfp-pdf-'));
  const input = join(workDir, 'contract.docx');
  const output = join(workDir, 'contract.pdf');

  try {
    await writeFile(input, docx);
    // A private profile directory matters: LibreOffice refuses to convert
    // headlessly while another instance holds the default profile, which it
    // would if a user has it open on the same machine.
    await run(
      converter,
      [
        '--headless',
        '--norestore',
        `-env:UserInstallation=file://${join(workDir, 'profile')}`,
        '--convert-to',
        'pdf',
        '--outdir',
        workDir,
        input,
      ],
      { timeout: 120_000 }
    );
    return await readFile(output);
  } catch (error) {
    // A failed conversion leaves no .pdf behind, so the read is what fails.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not convert the document to PDF: ${detail}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
