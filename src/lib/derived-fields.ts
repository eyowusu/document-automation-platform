import { DocumentData } from './document-generator';

/**
 * Placeholders the app works out itself, and the field each one is derived
 * from. The source field is what the user maps to an Excel column: mapping a
 * single `contract_date` fills the "this ___ day of ___, ___" blanks.
 */
export const DERIVED_SOURCES: Record<string, string> = {
  contract_day: 'contract_date',
  contract_month: 'contract_date',
  contract_year: 'contract_date',
  end_date: 'start_date',
};

/** Placeholders rendered as a long-form date, e.g. "11 August 2026". */
const DATE_PLACEHOLDERS = ['contract_date', 'start_date', 'end_date'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Default contract term from clause 1.1 of the catering contract. */
const DEFAULT_TERM_MONTHS = 24;

/**
 * The fields a user needs to map for a template: its own placeholders, minus
 * the ones derived automatically, plus the source columns those need.
 */
export function getMappableFields(placeholders: string[]): string[] {
  const fields = placeholders.filter(p => !DERIVED_SOURCES[p]);
  for (const placeholder of placeholders) {
    const source = DERIVED_SOURCES[placeholder];
    if (source && !fields.includes(source)) fields.push(source);
  }
  return fields;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    // Excel serial date: days since 1899-12-30 (UTC to avoid drift).
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000);
  }
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  // Clamp when the target month is shorter, e.g. 31 Jan + 1 month.
  if (result.getUTCDate() !== day) result.setUTCDate(0);
  return result;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || String(value).trim() === '';
}

/**
 * Expands a mapped Excel row into the full set of values a template needs:
 * splits a contract date into day/month/year, derives the expiry from the
 * start date and the contract term, and renders date columns in long form.
 * Values supplied explicitly are never overwritten.
 */
export function applyDerivedFields(data: DocumentData): DocumentData {
  const result: DocumentData = { ...data };

  const contractDate = parseDate(result.contract_date);
  if (contractDate) {
    if (isBlank(result.contract_day)) result.contract_day = String(contractDate.getUTCDate());
    if (isBlank(result.contract_month)) result.contract_month = MONTHS[contractDate.getUTCMonth()];
    if (isBlank(result.contract_year)) result.contract_year = String(contractDate.getUTCFullYear());
  }

  const startDate = parseDate(result.start_date);
  if (startDate && isBlank(result.end_date)) {
    result.end_date = formatDate(addMonths(startDate, DEFAULT_TERM_MONTHS));
  }

  for (const key of DATE_PLACEHOLDERS) {
    const parsed = parseDate(result[key]);
    if (parsed) result[key] = formatDate(parsed);
  }

  return result;
}

/**
 * Names every placeholder that would render blank, so a missing date is
 * reported instead of quietly leaving a gap in a signed document. Reports the
 * source column for derived placeholders, since that is what the user maps.
 */
export function findUnfilled(placeholders: string[], values: DocumentData): string[] {
  const missing = placeholders
    .filter(p => values[p] === undefined || values[p] === null)
    .map(p => DERIVED_SOURCES[p] ?? p);
  return [...new Set(missing)];
}
