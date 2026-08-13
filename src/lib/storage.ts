import 'server-only';
import { mkdir, writeFile } from 'fs/promises';
import { join, normalize, sep } from 'path';

/**
 * Documents live outside public/ so they are never served as static files.
 * They contain caterer names, addresses and phone numbers, and are only
 * reachable through an authenticated download route.
 */
export const STORAGE_ROOT = process.env.STORAGE_DIR
  ? normalize(process.env.STORAGE_DIR)
  : join(process.cwd(), 'storage');

/**
 * Resolves a stored relative path to an absolute one, refusing anything that
 * escapes the storage root (e.g. "../../.env" from a tampered database row).
 */
export function resolveStoragePath(relativePath: string): string {
  const cleaned = normalize(relativePath).replace(/^([/\\]|\.\.[/\\])+/, '');
  const absolute = join(STORAGE_ROOT, cleaned);

  if (absolute !== STORAGE_ROOT && !absolute.startsWith(STORAGE_ROOT + sep)) {
    throw new Error(`Path escapes storage root: ${relativePath}`);
  }
  return absolute;
}

/** Writes a file into storage and returns the path to persist on the record. */
export async function saveToStorage(
  folder: 'contracts' | 'templates',
  fileName: string,
  data: Buffer
): Promise<string> {
  const relativePath = `${folder}/${fileName}`;
  const absolute = resolveStoragePath(relativePath);
  await mkdir(join(STORAGE_ROOT, folder), { recursive: true });
  await writeFile(absolute, data);
  return relativePath;
}
