import { useCallback, useEffect, useRef, useState } from 'react';
import { UploadCloud, FileText, Trash2, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import Button from './Button';
import useToast from './Toast';

/* --- Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, newlines) ---- */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!nonEmpty.length) return { headers: [], records: [] };
  const headers = nonEmpty[0].map((h) => h.trim());
  const records = nonEmpty.slice(1).map((r, idx) => {
    const obj = { __row: idx + 2 };
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    return obj;
  });
  return { headers, records };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Three-step CSV import: upload → validate → import.
 *
 * The validation pass happens entirely in the browser so the admin sees
 * exactly which rows are bad (and can download an error report) before
 * anything touches the server. The actual insert is still done by the
 * existing backend endpoint via `onImport`, so business logic is unchanged.
 */
export default function ImportCsvModal({
  open,
  onClose,
  title = 'Import CSV',
  entityLabel = 'rows',
  requiredColumns = [],
  dedupeKey,
  validateRow,
  onImport,
  onDownloadTemplate,
  onDone,
}) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = useCallback(() => {
    setFile(null); setAnalysis(null); setStep(1); setBusy(false); setProgress(0); setDragging(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  useEffect(() => { if (open) reset(); }, [open, reset]);

  async function acceptFile(f) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast.error('Unsupported file', 'Please choose a .csv file.');
      return;
    }
    setFile(f);
    try {
      const text = await f.text();
      const { headers, records } = parseCsv(text);
      const missing = requiredColumns.filter((c) => !headers.includes(c));
      const seen = new Set();
      const errors = [];
      let valid = 0;
      let duplicates = 0;

      records.forEach((rec) => {
        if (missing.length) return;
        const problem = validateRow ? validateRow(rec) : null;
        if (problem) {
          errors.push({ row: rec.__row, field: problem.field || '—', problem: problem.message || String(problem), value: problem.value ?? '' });
          return;
        }
        if (dedupeKey) {
          const k = String(rec[dedupeKey] || '').toLowerCase();
          if (k && seen.has(k)) {
            duplicates += 1;
            errors.push({ row: rec.__row, field: dedupeKey, problem: 'Duplicate in file', value: rec[dedupeKey] });
            return;
          }
          if (k) seen.add(k);
        }
        valid += 1;
      });

      setAnalysis({ headers, records, missing, errors, valid, duplicates, total: records.length });
      setStep(2);
    } catch {
      toast.error('Could not read file', 'The CSV could not be parsed. Check the file and try again.');
      setFile(null);
    }
  }

  function downloadErrorReport() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['row,field,problem,value', ...analysis.errors.map((e) => [e.row, esc(e.field), esc(e.problem), esc(e.value)].join(','))].join('\n');
    downloadCsv('import_error_report.csv', csv);
    toast.info('Error report downloaded');
  }

  async function runImport() {
    if (!file) return;
    setBusy(true);
    setStep(3);
    setProgress(8);
    const tick = setInterval(() => setProgress((p) => (p < 88 ? p + Math.random() * 12 : p)), 220);
    try {
      const result = await onImport(file);
      clearInterval(tick);
      setProgress(100);
      const created = result?.inserted ?? result?.created ?? 0;
      const failed = (result?.errors?.length) ?? 0;
      const duplicates = result?.duplicatesSkipped ?? 0;
      if (duplicates && failed > duplicates) {
        toast.warning(`${created} imported, ${duplicates} duplicates skipped, ${failed - duplicates} failed`, `Duplicate rows (same question text + options as an existing question) were skipped automatically.`);
      } else if (duplicates) {
        toast.warning(`${created} imported, ${duplicates} duplicates skipped`, `Duplicate rows (same question text + options as an existing question) were skipped automatically.`);
      } else if (failed) {
        toast.warning(`${created} imported, ${failed} failed`, `Check the ${entityLabel} that were rejected and re-upload them.`);
      } else {
        toast.success(`${created} ${entityLabel} imported successfully`);
      }
      onDone?.(result);
      setTimeout(() => { onClose?.(); }, 500);
    } catch (err) {
      clearInterval(tick);
      setBusy(false);
      setStep(2);
      setProgress(0);
      toast.error('Failed to import CSV', err.message);
    }
  }

  const canImport = analysis && !analysis.missing.length && analysis.valid > 0;

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      variant="drawer"
      title={title}
      description="Upload a CSV, review what will be created, then import."
      footer={step === 2 ? (
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={runImport} disabled={!canImport} icon={UploadCloud}>
            Import {analysis?.valid ?? 0} {entityLabel}
          </Button>
        </>
      ) : step === 1 ? (
        <>
          {onDownloadTemplate && <Button variant="outline" icon={Download} onClick={onDownloadTemplate}>Download Template</Button>}
          <span className="spacer" />
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </>
      ) : null}
    >
      <div className="step-row">
        <div className={`step ${step === 1 ? 'active' : 'done'}`}><span className="step-num">1</span> Upload CSV</div>
        <div className="step-line" />
        <div className={`step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}><span className="step-num">2</span> Validate</div>
        <div className="step-line" />
        <div className={`step ${step === 3 ? 'active' : ''}`}><span className="step-num">3</span> Import</div>
      </div>

      {step === 1 && (
        <>
          <div
            className={`dropzone ${dragging ? 'dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}
            role="button"
            tabIndex={0}
            aria-label="Upload a CSV file"
          >
            <div className="dropzone-icon"><UploadCloud size={22} /></div>
            <strong>Drag &amp; drop your CSV here</strong>
            <p>or click to choose a file</p>
            <p style={{ fontSize: '.73rem', color: 'var(--muted-2)' }}>CSV files only · up to 5 MB</p>
          </div>
          <input
            ref={inputRef} type="file" accept=".csv,text/csv" hidden
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
          {!!requiredColumns.length && (
            <p className="field-hint" style={{ marginTop: 14 }}>
              Required columns: <strong>{requiredColumns.join(', ')}</strong>
            </p>
          )}
        </>
      )}

      {step === 2 && analysis && (
        <>
          <div className="file-pill" style={{ marginBottom: 18 }}>
            <div className="icon-box icon-box-sm tone-purple"><FileText size={15} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{file.name}</strong>
              <span>{formatSize(file.size)}</span>
            </div>
            <Button variant="ghost" size="xs" icon={Trash2} onClick={reset} aria-label="Remove file" />
          </div>

          {analysis.missing.length ? (
            <div className="error-banner">
              <AlertTriangle size={16} />
              <span>Missing required column{analysis.missing.length > 1 ? 's' : ''}: {analysis.missing.join(', ')}. Download the template to see the expected format.</span>
            </div>
          ) : (
            <>
              <div className="validate-grid">
                <div className="validate-tile"><strong>{analysis.total}</strong><span>Total rows</span></div>
                <div className="validate-tile"><strong style={{ color: 'var(--success)' }}>{analysis.valid}</strong><span>Valid</span></div>
                <div className="validate-tile"><strong style={{ color: analysis.errors.length - analysis.duplicates > 0 ? 'var(--danger)' : undefined }}>{analysis.errors.length - analysis.duplicates}</strong><span>Invalid</span></div>
                <div className="validate-tile"><strong style={{ color: analysis.duplicates > 0 ? 'var(--warning)' : undefined }}>{analysis.duplicates}</strong><span>Duplicates</span></div>
              </div>

              {analysis.errors.length > 0 ? (
                <>
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <strong style={{ fontSize: '.85rem' }}>Rows that will be skipped</strong>
                    <Button variant="outline" size="xs" icon={Download} onClick={downloadErrorReport}>Download Error Report</Button>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                    <table>
                      <thead><tr><th>Row</th><th>Field</th><th>Problem</th><th>Value</th></tr></thead>
                      <tbody>
                        {analysis.errors.slice(0, 100).map((e, i) => (
                          <tr key={i}>
                            <td className="td-nowrap">{e.row}</td>
                            <td className="td-muted">{e.field}</td>
                            <td>{e.problem}</td>
                            <td className="td-muted td-clip">{e.value || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="empty-state" style={{ padding: '26px 12px' }}>
                  <div className="empty-state-icon tone-green"><CheckCircle2 size={22} /></div>
                  <h3>Everything checks out</h3>
                  <p>All {analysis.total} rows are valid and ready to import.</p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {step === 3 && (
        <div style={{ padding: '18px 0' }}>
          <p style={{ fontSize: '.86rem', fontWeight: 700, marginBottom: 10 }}>
            {progress >= 100 ? 'Finishing up…' : `Importing ${analysis?.valid ?? ''} ${entityLabel}…`}
          </p>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(progress)}%` }} /></div>
          <p className="field-hint" style={{ marginTop: 8 }}>{Math.round(progress)}% · please keep this window open.</p>
        </div>
      )}
    </Modal>
  );
}
