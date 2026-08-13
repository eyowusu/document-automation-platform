// Moves documents that were written to the web-served public/ directory into
// private storage/. Safe to re-run. Usage: node scripts/migrate-to-private-storage.mjs
import { existsSync } from 'fs';
import { mkdir, readdir, rename } from 'fs/promises';
import { join } from 'path';

const moves = [
  ['public/contracts', 'storage/contracts'],
  ['public/templates', 'storage/templates'],
];

for (const [from, to] of moves) {
  if (!existsSync(from)) continue;
  await mkdir(to, { recursive: true });

  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    // The sample spreadsheet holds fabricated data and stays downloadable
    // without signing in, so users can see the expected column layout.
    if (entry.name === 'caterers-sample.xlsx') continue;

    const target = join(to, entry.name);
    if (existsSync(target)) continue;
    await rename(join(from, entry.name), target);
    console.log(`moved ${entry.name} -> ${to}`);
  }
}

console.log('Done. Generated documents are no longer web-served.');
