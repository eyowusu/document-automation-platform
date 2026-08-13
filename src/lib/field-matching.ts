/**
 * Matches template placeholders to real spreadsheet headers.
 *
 * Agency spreadsheets are written for people, not for this app: a caterer
 * arrives as "NAME ON EZWICH(VERIFICATION)" and a school as "NAME OF SCHOOL
 * FEEDING SCHOOL". Matching on the placeholder name alone therefore finds
 * almost nothing, so each field also carries the wordings the districts
 * actually use.
 */

/** Alternative header wordings seen in regional submissions. */
const ALIASES: Record<string, string[]> = {
  caterer_name: [
    'name of caterer', 'caterer', 'caterer name', 'name on ezwich',
    'name on ezwich verification', 'ezwich name', 'name of service provider',
    'service provider', 'contractor', 'name of contractor',
  ],
  school_name: [
    'name of school', 'school', 'school name', 'name of school feeding school',
    'feeding school', 'beneficiary school', 'name of beneficiary school',
  ],
  school_location: [
    'location', 'school location', 'town', 'community', 'locality',
    'location of school', 'address of school', 'village',
  ],
  district: ['district', 'mmda', 'municipal', 'assembly', 'district assembly', 'metro'],
  region: ['region', 'regional'],
  contract_number: [
    'contract number', 'contract no', 'agreement number', 'agreement no',
    'reference number', 'reference no', 'contract reference',
  ],
  caterer_address: [
    'address', 'postal address', 'caterer address', 'address of caterer',
    'box address', 'postal box',
  ],
  caterer_tel: [
    'tel', 'telephone', 'phone', 'mobile', 'mobile number', 'contact',
    'contact number', 'phone number', 'telephone number', 'caterer tel',
  ],
  rc_address: ['regional coordinator address', 'rc address', 'coordinator address'],
  rc_tel: [
    'regional coordinator tel', 'rc tel', 'coordinator telephone',
    'regional coordinator telephone', 'coordinator tel',
  ],
  rc_email: [
    'regional coordinator email', 'rc email', 'coordinator email', 'email',
    'email address',
  ],
  contract_date: ['contract date', 'date', 'date of contract', 'signing date', 'date signed'],
  start_date: [
    'start date', 'commencement date', 'effective date', 'date of commencement',
    'contract start', 'from',
  ],
  end_date: ['end date', 'expiry date', 'expiration date', 'termination date', 'contract end', 'to'],
};

/**
 * Fields that can honestly reuse another field's column when the spreadsheet
 * has no column of their own. The district is the nearest thing these returns
 * carry to a school's location, and it is shown in the UI with its first-row
 * value so the officer can see what was reused and override it.
 */
const FALLBACK_FIELDS: Record<string, string[]> = {
  school_location: ['district'],
};

/** Words that carry no meaning in a column heading. */
const STOPWORDS = new Set(['of', 'on', 'the', 'for', 'and', 'in', 'at', 's', 'sn']);

/** "Caterer Name " and "caterer_name" must compare equal. */
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 0 && !STOPWORDS.has(token))
  );
}

/** Only accept a match a person would also have made. */
const MIN_SCORE = 55;

/** How well `header` answers for `candidate`, 0 (unrelated) to 100 (identical). */
function score(candidate: string, header: string): number {
  const a = normalise(candidate);
  const b = normalise(header);
  if (!a || !b) return 0;
  if (a === b) return 100;
  // "NAME ON EZWICH(VERIFICATION)" contains the alias "name on ezwich".
  if (b.includes(a) || a.includes(b)) return 80;

  const candidateTokens = tokens(candidate);
  const headerTokens = tokens(header);
  if (candidateTokens.size === 0) return 0;
  let shared = 0;
  for (const token of candidateTokens) if (headerTokens.has(token)) shared += 1;
  return Math.round((shared / candidateTokens.size) * 60);
}

/** Best score for a field across its own name and every alias. */
function bestScore(field: string, header: string): number {
  const candidates = [field.replace(/_/g, ' '), ...(ALIASES[field] ?? [])];
  return candidates.reduce((best, candidate) => Math.max(best, score(candidate, header)), 0);
}

/**
 * Pairs each field with the spreadsheet column that fits it best. A column is
 * used at most once, and the strongest pairs win, so a header that suits two
 * fields goes to the one it describes more closely.
 */
export function autoMapFields(fields: string[], headers: string[]): Record<string, string> {
  const candidates: { field: string; header: string; score: number }[] = [];
  for (const field of fields) {
    for (const header of headers) {
      const value = bestScore(field, header);
      if (value >= MIN_SCORE) candidates.push({ field, header, score: value });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();
  for (const { field, header } of candidates) {
    if (mapping[field] || usedHeaders.has(header)) continue;
    mapping[field] = header;
    usedHeaders.add(header);
  }

  // Second pass: let a field with no column of its own borrow a related one.
  // These columns are deliberately allowed to serve two fields.
  for (const field of fields) {
    if (mapping[field]) continue;
    for (const donor of FALLBACK_FIELDS[field] ?? []) {
      if (mapping[donor]) {
        mapping[field] = mapping[donor];
        break;
      }
    }
  }
  return mapping;
}
