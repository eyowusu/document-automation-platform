'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowRight, CheckCircle2, Download, FileSpreadsheet, FileText,
  Loader2, LogOut, ShieldCheck, Sparkles, Table2, Wand2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DERIVED_SOURCES, getMappableFields } from '@/lib/derived-fields';
import { autoMapFields } from '@/lib/field-matching';
import {
  AUTO_FILLED, autoDefaults, expandSequence, loadRemembered, saveRemembered, SEQUENCE_TOKEN,
} from '@/lib/auto-values';
import { cn } from '@/lib/utils';

interface Template {
  id: string;
  name: string;
  description: string | null;
  content: string;
  hasDocx: boolean;
  placeholders: string[];
}

interface ExcelData {
  headers: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

interface GeneratedDocument {
  fileName: string;
  downloadUrl: string;
  label: string;
}

/** Sentinel for "this field is the same on every document" in the column list. */
const FIXED_VALUE = '__fixed__';

function omit(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

const STEPS = [
  { title: 'Template', hint: 'Pick the official document' },
  { title: 'Excel data', hint: 'Upload your spreadsheet' },
  { title: 'Map fields', hint: 'Match columns to blanks' },
  { title: 'Generate', hint: 'Download the documents' },
];

export default function Workspace({ user }: { user: { email: string; name: string | null; role: string } }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [excelData, setExcelData] = useState<ExcelData | null>(null);
  const [excelFileName, setExcelFileName] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  // Fields absent from the spreadsheet (coordinator contacts, contract number)
  // are typed once here and repeated on every document in the batch.
  const [fixedValues, setFixedValues] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [documents, setDocuments] = useState<GeneratedDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [format, setFormat] = useState<'docx' | 'pdf'>('docx');
  const templateFileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /** Sends a request, bouncing to the sign-in page if the session has expired. */
  const api = useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const response = await fetch(input, init);
      if (response.status === 401) {
        router.push('/login');
        router.refresh();
        throw new Error('Session expired');
      }
      return response;
    },
    [router]
  );

  const template = templates.find(t => t.id === selectedTemplate) ?? null;

  // Fields the user has to map, including the source column behind any
  // placeholder the server derives (a contract_date feeds day/month/year).
  const mappable = useMemo(
    () => getMappableFields(template?.placeholders ?? []),
    [template]
  );
  const autoFilled = useMemo(
    () => (template?.placeholders ?? []).filter(p => DERIVED_SOURCES[p]),
    [template]
  );
  // A field counts as ready once it has a column or a typed-in value.
  const unmapped = mappable.filter(p => !columnMapping[p] && !fixedValues[p]?.trim());

  const currentStep = !template ? 0 : !excelData ? 1 : unmapped.length > 0 ? 2 : 3;

  useEffect(() => {
    api('/api/templates')
      .then(res => res.json())
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load templates. Is the server running?'));
  }, [api]);

  /**
   * Fills in step 3 by itself: columns matched by name, then the values the app
   * can work out (dates, contract numbering), then anything this template was
   * told last time. Only genuinely unknowable details are left to the officer.
   */
  const prepareMapping = (picked: Template, data: ExcelData) => {
    const fields = getMappableFields(picked.placeholders);
    const mapping = autoMapFields(fields, data.headers);

    const remembered = loadRemembered(picked.id);
    const defaults = autoDefaults();
    const values: Record<string, string> = {};
    for (const field of fields) {
      if (mapping[field]) continue;
      const value = remembered[field] ?? defaults[field];
      if (value !== undefined) values[field] = value;
    }

    setColumnMapping(mapping);
    setFixedValues(values);

    const ready = fields.filter(f => mapping[f] || values[f]?.trim()).length;
    const remaining = fields.length - ready;
    setNotice(
      remaining === 0
        ? `All ${fields.length} fields are ready. Check them below, then generate.`
        : `${ready} of ${fields.length} fields filled in automatically. The remaining ${remaining} ` +
            'cannot be guessed from your file — enter them once and they will be remembered next time.'
    );
  };

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplate(id);
    setDocuments([]);
    setError(null);
    const picked = templates.find(t => t.id === id);
    if (picked && excelData) {
      prepareMapping(picked, excelData);
    } else {
      setColumnMapping({});
      setFixedValues({});
    }
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setDocuments([]);
    const body = new FormData();
    body.append('file', file);

    try {
      const response = await api('/api/excel/parse', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not read that spreadsheet.');
        return;
      }
      setExcelData(data);
      setExcelFileName(file.name);
      if (template) prepareMapping(template, data);
    } catch {
      setError('Could not read that spreadsheet.');
    }
  };

  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    const body = new FormData();
    body.append('file', file);

    try {
      const response = await api('/api/templates/upload', { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Could not upload that template.');
        return;
      }
      setTemplates(current => [data, ...current]);
      handleSelectTemplate(data.id);
      setNotice(`Template added with ${data.placeholders.length} fields.`);
    } catch {
      setError('Could not upload that template.');
    } finally {
      setIsUploading(false);
      if (templateFileRef.current) templateFileRef.current.value = '';
    }
  };

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const handleGenerate = async () => {
    if (!template || !excelData || unmapped.length > 0) return;

    setIsGenerating(true);
    setError(null);
    setDocuments([]);
    setProgress({ done: 0, total: excelData.rows.length });
    // Keep what was typed so the next batch for this template needs no typing.
    saveRemembered(template.id, fixedValues);

    const results: GeneratedDocument[] = [];
    const failures: string[] = [];

    for (const [index, row] of excelData.rows.entries()) {
      const data: Record<string, unknown> = {};
      for (const placeholder of mappable) {
        const column = columnMapping[placeholder];
        if (column) {
          data[placeholder] = row[column];
          continue;
        }
        // Typed-in values are shared by the batch, except for the numbering
        // marker, which advances so no two contracts carry the same number.
        data[placeholder] = expandSequence(fixedValues[placeholder] ?? '', index + 1);
      }

      try {
        const response = await api('/api/contracts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: template.id, data, format }),
        });
        const result = await response.json();

        // PDF support is missing for the whole run, not just this row: stop
        // rather than repeat the same failure for every caterer.
        if (response.status === 503) {
          setError(result.error ?? 'PDF export is unavailable.');
          setIsGenerating(false);
          return;
        }

        if (response.ok && result.contract) {
          const primary = Object.values(data).find(value => String(value ?? '').trim() !== '');
          results.push({
            fileName: result.fileName ?? result.downloadUrl.split('/').pop(),
            downloadUrl: result.downloadUrl,
            label: String(primary ?? `Row ${index + 2}`),
          });
        } else {
          const detail = result.missing?.length ? `: ${result.missing.join(', ')}` : '';
          failures.push(`Row ${index + 2} — ${result.error ?? response.status}${detail}`);
        }
      } catch (caught) {
        failures.push(`Row ${index + 2} — ${caught instanceof Error ? caught.message : 'request failed'}`);
      }

      setProgress({ done: index + 1, total: excelData.rows.length });
      setDocuments([...results]);
    }

    setError(failures.length > 0 ? failures.slice(0, 4).join(' · ') : null);
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Ghana flag stripe */}
      <div className="h-1.5 w-full bg-gradient-to-r from-red-600 via-yellow-400 to-green-600" />

      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-5">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
            <ShieldCheck className="size-6 text-white" />
          </div>
          <div className="mr-auto">
            <h1 className="text-xl font-bold tracking-tight">Document Automation Platform</h1>
            <p className="text-sm text-slate-500">Ghana School Feeding Programme — National Secretariat</p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:inline-flex">
            <Sparkles className="size-3.5" />
            Letterhead preserved
          </span>
          <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
            <div className="grid size-8 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {(user.name ?? user.email).slice(0, 2).toUpperCase()}
            </div>
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-semibold">{user.name ?? user.email}</p>
              <p className="text-xs text-slate-500 capitalize">{user.role}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} title="Sign out">
              <LogOut />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <Stepper current={currentStep} />

        {notice && (
          <Banner tone="info" onDismiss={() => setNotice(null)}>
            {notice}
          </Banner>
        )}
        {error && (
          <Banner tone="error" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Step 1 — template */}
          <Panel
            step={1}
            title="Choose a template"
            hint="Official documents keep their letterhead, logo and signature lines."
            tone="emerald"
            icon={<FileText className="size-5" />}
          >
            <div className="space-y-2">
              {templates.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                  No templates yet. Upload a Word document below to begin.
                </p>
              )}
              {templates.map(item => {
                const active = item.id === selectedTemplate;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectTemplate(item.id)}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition-all',
                      active
                        ? 'border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                          active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                        )}
                      >
                        <FileText className="size-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-semibold">
                          <span className="truncate">{item.name}</span>
                          {active && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
                        </p>
                        {item.description && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{item.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Tag tone={item.hasDocx ? 'emerald' : 'slate'}>
                            {item.hasDocx ? 'Official Word layout' : 'Plain text'}
                          </Tag>
                          <Tag tone="violet">{item.placeholders.length} fields</Tag>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
              <Label htmlFor="template-file" className="text-sm font-semibold">
                Add a Word template
              </Label>
              <p className="mt-1 mb-3 text-xs text-slate-500">
                A .docx where each blank is written as <code className="rounded bg-slate-200 px-1">{'{{field_name}}'}</code>.
              </p>
              <Input
                ref={templateFileRef}
                id="template-file"
                type="file"
                accept=".docx"
                disabled={isUploading}
                onChange={handleTemplateUpload}
                className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-emerald-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-emerald-700"
              />
              {isUploading && (
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="size-3.5 animate-spin" /> Reading placeholders…
                </p>
              )}
            </div>
          </Panel>

          {/* Step 2 — spreadsheet */}
          <Panel
            step={2}
            title="Upload your Excel file"
            hint="One row per document. The first row must hold the column names."
            tone="blue"
            icon={<FileSpreadsheet className="size-5" />}
          >
            <Input
              id="excel"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              className="cursor-pointer file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-700"
            />

            {!excelData && (
              <div className="mt-4 rounded-xl bg-blue-50/60 p-4 text-sm text-blue-900 ring-1 ring-blue-100">
                <p className="font-semibold">Need a starting point?</p>
                <p className="mt-1 text-blue-800/80">
                  Download the sample spreadsheet, replace the rows with your caterers and upload it back.
                </p>
                <a
                  href="/templates/caterers-sample.xlsx"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Download className="size-3.5" /> Sample spreadsheet
                </a>
              </div>
            )}

            {excelData && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-4 ring-1 ring-blue-100">
                  <Table2 className="size-8 shrink-0 text-blue-600" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{excelFileName}</p>
                    <p className="text-sm text-slate-600">
                      <strong className="text-blue-700">{excelData.totalRows}</strong> rows ·{' '}
                      <strong className="text-blue-700">{excelData.headers.length}</strong> columns
                    </p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Columns found
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {excelData.headers.map(header => (
                      <Tag key={header} tone="blue">{header}</Tag>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Panel>
        </div>

        {/* Step 3 — mapping */}
        {template && excelData && (
          <Panel
            step={3}
            title="Match your columns to the document"
            hint="Each field below is a blank in the document that gets filled from your spreadsheet."
            tone="violet"
            icon={<Wand2 className="size-5" />}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => template && prepareMapping(template, excelData)}
              >
                <Wand2 /> Match automatically
              </Button>
              <span
                className={cn(
                  'text-sm font-medium',
                  unmapped.length === 0 ? 'text-emerald-700' : 'text-amber-700'
                )}
              >
                {unmapped.length === 0
                  ? `All ${mappable.length} fields matched`
                  : `${unmapped.length} of ${mappable.length} still need a column`}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {mappable.map(placeholder => {
                const value = columnMapping[placeholder];
                const isFixed = !value && fixedValues[placeholder] !== undefined;
                const ready = Boolean(value) || Boolean(fixedValues[placeholder]?.trim());
                const sample = value && excelData.rows[0] ? String(excelData.rows[0][value] ?? '') : '';
                return (
                  <div
                    key={placeholder}
                    className={cn(
                      'rounded-xl border p-3 transition-colors',
                      ready ? 'border-violet-200 bg-violet-50/40' : 'border-amber-200 bg-amber-50/40'
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <code className="truncate text-sm font-semibold text-violet-900">
                        {placeholder}
                      </code>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {isFixed && ready && (
                          <Tag tone={AUTO_FILLED.has(placeholder) ? 'emerald' : 'slate'}>
                            {AUTO_FILLED.has(placeholder) ? 'automatic' : 'same for all'}
                          </Tag>
                        )}
                        {ready ? (
                          <CheckCircle2 className="size-4 text-violet-600" />
                        ) : (
                          <AlertCircle className="size-4 text-amber-500" />
                        )}
                      </span>
                    </div>
                    <Select
                      value={isFixed ? FIXED_VALUE : (value ?? '')}
                      onValueChange={next => {
                        if (next === FIXED_VALUE) {
                          setColumnMapping(current => omit(current, placeholder));
                          setFixedValues(current => ({ ...current, [placeholder]: current[placeholder] ?? '' }));
                          return;
                        }
                        setFixedValues(current => omit(current, placeholder));
                        setColumnMapping(current => ({ ...current, [placeholder]: next || '' }));
                      }}
                    >
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue placeholder="Choose a column" />
                      </SelectTrigger>
                      <SelectContent>
                        {excelData.headers.map(header => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                        <SelectItem value={FIXED_VALUE}>Same on every document…</SelectItem>
                      </SelectContent>
                    </Select>
                    {isFixed && (
                      <>
                        <Input
                          value={fixedValues[placeholder] ?? ''}
                          onChange={event =>
                            setFixedValues(current => ({ ...current, [placeholder]: event.target.value }))
                          }
                          placeholder={`Used on all ${excelData.totalRows} documents`}
                          className="mt-2 bg-white"
                        />
                        {(fixedValues[placeholder] ?? '').includes(SEQUENCE_TOKEN) && (
                          <p className="mt-1 text-xs text-emerald-700">
                            Numbered per document: {expandSequence(fixedValues[placeholder] ?? '', 1)} …{' '}
                            {expandSequence(fixedValues[placeholder] ?? '', excelData.totalRows)}
                          </p>
                        )}
                      </>
                    )}
                    {sample && (
                      <p className="mt-2 truncate text-xs text-slate-500">
                        First row: <span className="font-medium text-slate-700">{sample}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {autoFilled.length > 0 && (
              <div className="mt-4 rounded-xl bg-emerald-50/70 p-4 ring-1 ring-emerald-100">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                  <Sparkles className="size-4" /> Filled in automatically
                </p>
                <p className="mt-1 text-xs text-emerald-800/80">
                  Worked out from the columns you mapped, so they need none of their own.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {autoFilled.map(item => (
                    <Tag key={item} tone="emerald">
                      {item} ← {DERIVED_SOURCES[item]}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        )}

        {/* Step 4 — generate */}
        {template && excelData && (
          <Panel
            step={4}
            title="Generate the documents"
            hint="One signature-ready Word document per row, with every blank filled in."
            tone="amber"
            icon={<Sparkles className="size-5" />}
          >
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Download format
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'docx', label: 'Word (.docx)', hint: 'Editable before signing' },
                  { id: 'pdf', label: 'PDF', hint: 'Fixed layout for circulation' },
                ] as const).map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setFormat(option.id)}
                    className={cn(
                      'rounded-xl border px-4 py-2.5 text-left transition-colors',
                      format === option.id
                        ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-500/20'
                        : 'border-slate-200 bg-white hover:border-amber-300'
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {format === option.id && <CheckCircle2 className="size-4 text-amber-600" />}
                      {option.label}
                    </span>
                    <span className="text-xs text-slate-500">{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || unmapped.length > 0}
              size="lg"
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin" /> Generating {progress.done} of {progress.total}…
                </>
              ) : (
                <>
                  Generate {excelData.totalRows} document{excelData.totalRows === 1 ? '' : 's'}
                  <ArrowRight />
                </>
              )}
            </Button>

            {unmapped.length > 0 && (
              <p className="mt-3 text-center text-sm text-amber-700">
                Match the remaining fields above first: {unmapped.join(', ')}
              </p>
            )}

            {isGenerating && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            )}

            {documents.length > 0 && (
              <div className="mt-6">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  <p className="font-semibold">
                    {documents.length} document{documents.length === 1 ? '' : 's'} ready
                  </p>
                </div>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {documents.map(document => (
                    <li
                      key={document.downloadUrl}
                      className="flex items-center gap-3 p-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
                        <FileText className="size-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{document.label}</p>
                        <p className="truncate text-xs text-slate-500">{document.fileName}</p>
                      </div>
                      <a
                        href={document.downloadUrl}
                        download
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                      >
                        <Download className="size-3.5" /> Download
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-center text-xs text-slate-400">
        Generated documents keep the official layout and are left unsigned for hand signature.
      </footer>
    </div>
  );
}

const TONES = {
  emerald: { ring: 'ring-emerald-100', chip: 'bg-emerald-600', glow: 'from-emerald-500/10' },
  blue: { ring: 'ring-blue-100', chip: 'bg-blue-600', glow: 'from-blue-500/10' },
  violet: { ring: 'ring-violet-100', chip: 'bg-violet-600', glow: 'from-violet-500/10' },
  amber: { ring: 'ring-amber-100', chip: 'bg-amber-500', glow: 'from-amber-500/10' },
} as const;

function Panel({
  step, title, hint, tone, icon, children,
}: {
  step: number;
  title: string;
  hint: string;
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = TONES[tone];
  return (
    <section className={cn('relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1', styles.ring)}>
      <div className={cn('pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent', styles.glow)} />
      <div className="relative flex items-start gap-3">
        <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-sm', styles.chip)}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">Step {step}</p>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{hint}</p>
        </div>
      </div>
      <div className="relative mt-5">{children}</div>
    </section>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.title} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors',
                done && 'bg-emerald-600 text-white',
                active && 'bg-slate-900 text-white ring-4 ring-slate-900/10',
                !done && !active && 'bg-slate-100 text-slate-400'
              )}
            >
              {done ? <CheckCircle2 className="size-4" /> : index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn('truncate text-sm font-semibold', active ? 'text-slate-900' : 'text-slate-500')}>
                {step.title}
              </p>
              <p className="truncate text-xs text-slate-400">{step.hint}</p>
            </div>
            {index < STEPS.length - 1 && (
              <div className={cn('hidden h-0.5 w-6 rounded-full sm:block', done ? 'bg-emerald-500' : 'bg-slate-200')} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const TAG_TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
} as const;

function Tag({ tone, children }: { tone: keyof typeof TAG_TONES; children: React.ReactNode }) {
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TAG_TONES[tone])}>
      {children}
    </span>
  );
}

function Banner({
  tone, onDismiss, children,
}: {
  tone: 'info' | 'error';
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const error = tone === 'error';
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl p-4 text-sm ring-1',
        error ? 'bg-rose-50 text-rose-900 ring-rose-200' : 'bg-sky-50 text-sky-900 ring-sky-200'
      )}
    >
      {error ? (
        <AlertCircle className="mt-0.5 size-4.5 shrink-0 text-rose-500" />
      ) : (
        <Sparkles className="mt-0.5 size-4.5 shrink-0 text-sky-500" />
      )}
      <p className="flex-1">{children}</p>
      <button type="button" onClick={onDismiss} className="shrink-0 opacity-50 hover:opacity-100">
        <X className="size-4" />
      </button>
    </div>
  );
}
