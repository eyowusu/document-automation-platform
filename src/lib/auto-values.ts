/**
 * Values for template fields that no spreadsheet column can supply.
 *
 * The officers using this are not technical, so anything the app can work out
 * honestly it fills in itself, and anything it cannot know it asks for once and
 * then remembers. Nothing here invents official data: coordinator contacts and
 * caterer details are never guessed, only recalled.
 */

/** Marker replaced with the row's position, so each contract is numbered. */
export const SEQUENCE_TOKEN = '{n}';

/** Today as yyyy-mm-dd, which is what the date parser expects. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Sensible starting values, applied only to fields with no matching column.
 * The contract number carries the sequence marker so every row differs.
 */
export function autoDefaults(): Record<string, string> {
  const year = new Date().getFullYear();
  return {
    contract_date: today(),
    start_date: today(),
    contract_number: `GSFP/CAT/${year}/${SEQUENCE_TOKEN}`,
  };
}

/** Fields the app fills in on its own, for labelling in the UI. */
export const AUTO_FILLED = new Set(Object.keys(autoDefaults()));

/**
 * Official details the app must be told rather than assume. Kept apart from
 * the defaults above so nothing here is ever pre-filled with a made-up value.
 */
export const MUST_BE_PROVIDED = [
  'rc_address',
  'rc_tel',
  'rc_email',
  'caterer_address',
  'caterer_tel',
];

/** Turns "GSFP/CAT/2026/{n}" into "GSFP/CAT/2026/007" for row 7. */
export function expandSequence(value: string, rowNumber: number): string {
  return value.split(SEQUENCE_TOKEN).join(String(rowNumber).padStart(3, '0'));
}

const STORE_PREFIX = 'gsfp:defaults:';

/**
 * Remembers the values typed for a template so later batches need no typing.
 * Held in the browser, so it is per-machine: a second officer on another
 * computer enters them once too.
 */
export function loadRemembered(templateId: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + templateId);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    // Only keep string entries; a tampered store must not break the workspace.
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, value as string])
    );
  } catch {
    return {};
  }
}

export function saveRemembered(templateId: string, values: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORE_PREFIX + templateId, JSON.stringify(values));
  } catch {
    // A full or blocked store is not worth interrupting the officer for.
  }
}
