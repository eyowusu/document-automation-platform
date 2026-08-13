<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Document Automation Platform (GSFP)

Generates official Ghana School Feeding Programme documents from Excel data.

## Verification

```bash
npx tsc --noEmit   # clean
npm run lint       # clean
node scripts/seed-catering-template.mjs   # registers the catering template + sample xlsx
```

After changing `prisma/schema.prisma`, run `npx prisma generate` **and restart
the dev server** — a stale client reports phantom errors about columns that no
longer exist (`fileUrl`) or models it has not seen yet (`Session`). The IDE
needs "TypeScript: Restart TS Server" for the same reason; trust `npx tsc
--noEmit` over the editor's squiggles.

`prisma.config.ts` was generated for Prisma 6 but this project pins Prisma
5.22.0, which has no `prisma/config` export and never reads the file. It is
excluded in `tsconfig.json`; delete the exclusion if Prisma is upgraded.

## Templates

Two kinds, both using `{{placeholder}}`:

- **Uploaded .docx** (`Template.fileUrl` set) — rendered by docxtemplater using the
  original file as the container, so letterheads, coat of arms, tables, clause
  numbering and signature lines survive. This is required for anything signed.
- **Plain text** (`content` only) — rendered by `docx` into a new file. Loses all
  formatting; only for internal notes.

`scripts/build-catering-template.py` authors the catering contract template from the
agency's original .docx by replacing fill-in blanks with placeholders at known
`<w:t>` indices. Handwritten signature lines are deliberately left as dotted rules.
Word stores the signature text boxes as `mc:AlternateContent`, so that text exists
twice in the XML and both copies must be replaced.

The script also converts the coat of arms from a floating `<wp:anchor>` to an
inline image (`inline_pictures`). In the original the logo is dragged to a fixed
offset measured *from a paragraph*, with `<wp:wrapNone/>` so text does not flow
around it — so as soon as a filled placeholder changes the height of the text
above, the logo slides over the letterhead. Inline puts it in the flow of its own
centred paragraph. The two signature text boxes stay floating: they sit side by
side and overlap nothing. Regenerate the template from the **pristine** original,
never from a previously patched copy.

Two traps when editing `word/document.xml`:
- Edit it as a **string**. Re-serialising with ElementTree renames namespace
  prefixes (`w:` becomes `ns0:`) and shifts the `<w:t>` indices the build script
  depends on, which makes the next build fail with "Text nodes not found".
- Do not add spacing to the `Normal` style to fix the cover page. It changes all
  197 paragraphs of a legal document and moves paragraph-anchored floats.

## Gotchas

- `XLSX.sheet_to_json(ws, {header: 1})` returns **sparse** arrays: blank cells are
  absent, blank rows are `[]`. Normalise before mapping by index.
- Read workbooks with `cellDates: true`, or date columns arrive as serial numbers.
- Don't use `docxtemplater/js/inspect-module.js`: it statically requires `lodash`,
  which is not a dependency and breaks the Turbopack build. `extractDocxPlaceholders`
  parses the XML instead.
- A placeholder with no value at all is a 400, not a blank: a silent gap in a signed
  contract is worse than a failed row. Empty spreadsheet *cells* are allowed.
- Derived placeholders (`contract_day/month/year`, `end_date`) come from a source
  column via `DERIVED_SOURCES`; the mapping UI must offer the source, not the target.
- Real district spreadsheets use human headings (`NAME ON EZWICH(VERIFICATION)`,
  `NAME OF SCHOOL FEEDING SCHOOL`), so auto-mapping matches on aliases and token
  overlap in `src/lib/field-matching.ts`, not on the placeholder name. Keep
  `MIN_SCORE` high enough that `EMIS CODE`/`EZWICH NUMBER` never land in
  `contract_number` — a wrong number on a signed contract is worse than a blank.
- The officers are not technical, so step 3 fills itself: columns matched by
  name, then `src/lib/auto-values.ts` defaults (today's date, `GSFP/CAT/<year>/{n}`
  numbering), then values remembered from the last batch. With the district
  returns this leaves 5 of 13 fields to enter, down from 9.
- `{n}` in a typed value expands per row (`expandSequence`), so contract numbers
  never repeat across a batch. Check no `{n}` reaches the rendered document.
- `school_location` deliberately borrows the district column via
  `FALLBACK_FIELDS`; the UI shows the first-row value so it can be overridden.
- The caterer's address/telephone and the whole Regional Coordinator witness
  block are **not** fields. They keep the original dotted rules and are written
  in by hand at signing, like the signatures (`SIGNATURE_LINES`). Do not
  reintroduce them as placeholders: the district returns do not carry them, and
  a plausible-looking wrong contact on a signed contract is the worst outcome
  available.
- Clause 1.1's commencement and expiry are static text (`CONTRACT_START` /
  `CONTRACT_END` in the build script), not fields: the agency uses one term for
  a whole contract cycle. Edit those constants and rebuild when the cycle turns.
  The agency's copy reads "THRID TERM"; the build corrects it to "THIRD".
- Net effect with the district returns: all 7 remaining fields fill themselves,
  so an officer uploads a sheet and presses Generate with no typing.
- PDF export converts the rendered .docx with LibreOffice (`src/lib/pdf-convert.ts`)
  and returns 503 with an install hint when it is absent. Do not "fix" that by
  re-drawing the contract with pdfkit: a PDF that does not match the Word original
  is worse than no PDF. LibreOffice needs the private
  `-env:UserInstallation` profile or it refuses to convert while a desktop
  instance is open.

## Security verification

### Authentication and session management
- Database-backed sessions
- HTTP-only cookies
- Session invalidation on logout
- Login throttling (5 attempts, 15-minute lockout)

### Private storage
- Templates and contracts stored under `storage/` (not `public/`)
- Authenticated download routes
- Path traversal protection in `src/lib/storage.ts`
- Old public URLs return 404

### Test results
- Unauthenticated API routes return 401
- Unauthenticated page access redirects to /login
- Login with wrong password returns 401
- Login with correct credentials returns 200 and user object
- Session cookie is HttpOnly
- Logout invalidates session (reusing cookie returns 401)
- Forged session token returns 401
- Authenticated document generation works
- Authenticated download returns valid DOCX with logo
- Path traversal attempts rejected by storage guard
- Login throttling activates after 5 failed attempts

### Admin credentials
- Email: coordinator@gsfp.gov.gh
- Password: GSFP@2025Secure!
- Role: admin
- Note: Password must be at least 12 characters
