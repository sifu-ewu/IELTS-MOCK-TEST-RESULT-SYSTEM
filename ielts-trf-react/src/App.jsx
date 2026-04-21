import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import {
  parseExcelFile, formatDate, cefrFromOverall, splitName,
  sanitizePhone, applyTemplate, pdfFilename, sanitizeFilenamePart,
} from './helpers.js';

const DEFAULT_SETTINGS = {
  centre: 'NGANJ',
  date: new Date().toISOString().slice(0, 10),
  status: '',
  writingEx: '',
  speakingEx: '',
  adminSig: '',
  adminComments: '',
  centreStamp: 'idp\nINDIA\nIN855',
  validationStamp: 'IELTS',
  footer: '',
  country: '880',
  waTemplate: `Dear {{firstName}},

Your IELTS Mock Test result ({{date}}) is ready.

Your scores:
Listening: {{listening}}
Reading: {{reading}}
Writing: {{writing}}
Speaking: {{speaking}}
Overall Band: {{overall}} (CEFR {{cefr}})

The Test Report Form PDF has been saved to your device — please attach it to this chat for your records.

Best regards,
IELTS Bangladesh`,
  emailSubject: 'IELTS Mock Test Result — {{date}}',
  emailBody: `Dear {{firstName}},

Your IELTS Mock Test result from {{date}} is attached as a PDF.

Your scores:
Listening: {{listening}}
Reading: {{reading}}
Writing: {{writing}}
Speaking: {{speaking}}
Overall Band: {{overall}} (CEFR Level: {{cefr}})

Please review the attached Test Report Form. If you have any questions about your performance, feel free to reach out.

Best regards,
IELTS Bangladesh`,
};

const STORAGE_KEY = 'ielts_trf_settings_v4';

function useLocalStorageSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);
  const update = (patch) => setSettings(s => ({ ...s, ...patch }));
  return [settings, update];
}

function buildRequestPayload(rawStudent, rawSettings) {
  const { first, last } = splitName(rawStudent.name);
  return {
    student: {
      seat: rawStudent.seat,
      name: rawStudent.name,
      first, last,
      email: rawStudent.email,
      phone: rawStudent.phone,
      l: rawStudent.l,
      r: rawStudent.r,
      w: rawStudent.w,
      s: rawStudent.s,
      overall: rawStudent.overall,
      cefr: cefrFromOverall(rawStudent.overall),
    },
    settings: {
      ...rawSettings,
      dateFormatted: formatDate(rawSettings.date),
    },
  };
}

async function fetchPdfBlob(student, settings) {
  const res = await fetch('/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequestPayload(student, settings)),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch {}
    throw new Error(`PDF server responded ${res.status}${detail ? ': ' + detail : ''}`);
  }
  return await res.blob();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export default function App() {
  const [settings, updateSettings] = useLocalStorageSettings();
  const [roster, setRoster] = useState([]);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [previewIdx, setPreviewIdx] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [progress, setProgress] = useState({ active: false, current: 0, total: 0, message: '' });
  const [generatedPdfs, setGeneratedPdfs] = useState(new Map());
  const [toastMsg, setToastMsg] = useState('');
  const [serverOk, setServerOk] = useState(null);
  const toastTimer = useRef(null);

  // Ping backend once on mount
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.ok ? setServerOk(true) : setServerOk(false))
      .catch(() => setServerOk(false));
  }, []);

  const selectedCount = roster.filter(s => s.selected).length;
  const hasRoster = roster.length > 0;
  const firstSelected = roster.find(s => s.selected);

  function showToast(msg, ms = 4500) {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), ms);
  }

  async function handleFile(file) {
    setParseError('');
    setFileName(file.name);
    try {
      const list = await parseExcelFile(file);
      if (list.length === 0) {
        setParseError('No student rows found under the header.');
        return;
      }
      setRoster(list);
      setGeneratedPdfs(new Map());
      setPreviewIdx(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }
    } catch (err) {
      setParseError(err.message || String(err));
      setRoster([]);
    }
  }

  const toggleRow  = idx => setRoster(r => r.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
  const toggleAll  = checked => setRoster(r => r.map(s => ({ ...s, selected: checked })));

  async function handlePreview() {
    if (!firstSelected) return;
    setPreviewLoading(true);
    try {
      const blob = await fetchPdfBlob(firstSelected, settings);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewIdx(roster.indexOf(firstSelected));
    } catch (err) {
      showToast('Preview failed: ' + err.message, 6000);
    } finally {
      setPreviewLoading(false);
    }
  }

  function closePreview() {
    setPreviewIdx(null);
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(''); }
  }

  async function handleGenerate() {
    const toRender = roster.filter(s => s.selected);
    if (toRender.length === 0) { showToast('No students selected.'); return; }

    const CONCURRENCY = 4;
    setProgress({ active: true, current: 0, total: toRender.length, message: `Rendering (up to ${CONCURRENCY} in parallel)…` });
    const zip = new JSZip();
    const newMap = new Map();

    try {
      const started = Date.now();
      let completed = 0;

      // Simple worker-pool so we keep up to CONCURRENCY requests in flight
      // without dropping to a serial await-loop.
      let cursor = 0;
      async function worker() {
        while (true) {
          const i = cursor++;
          if (i >= toRender.length) return;
          const stu = toRender[i];
          const blob = await fetchPdfBlob(stu, settings);
          const fname = pdfFilename(stu);
          zip.file(fname, blob);
          newMap.set(stu.seat, { blob, filename: fname });
          completed++;
          setProgress({
            active: true,
            current: completed,
            total: toRender.length,
            message: `Generated ${completed} / ${toRender.length}`,
          });
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toRender.length) }, worker));

      setProgress({ active: true, current: toRender.length, total: toRender.length, message: 'Bundling ZIP…' });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const batchId = settings.status || 'batch';
      downloadBlob(zipBlob, `IELTS_TRF_${sanitizeFilenamePart(batchId)}_${settings.date}.zip`);
      setGeneratedPdfs(newMap);
      setProgress({ active: false, current: toRender.length, total: toRender.length, message: '' });
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      showToast(`Generated ${toRender.length} PDFs in ${elapsed}s. Per-student WhatsApp / Email buttons are now active.`);
    } catch (err) {
      console.error(err);
      setProgress({ active: false, current: 0, total: 0, message: '' });
      showToast('Generation failed: ' + (err.message || err), 6500);
    }
  }

  function handleDelivery(student, kind) {
    const cached = generatedPdfs.get(student.seat);
    if (!cached) { showToast('PDF not generated yet.'); return; }
    const { first } = splitName(student.name);
    const vars = {
      firstName: first || student.name,
      fullName:  student.name,
      date:      formatDate(settings.date),
      listening: student.l || '—',
      reading:   student.r || '—',
      writing:   student.w || '—',
      speaking:  student.s || '—',
      overall:   student.overall || '—',
      cefr:      cefrFromOverall(student.overall) || '—',
      batch:     settings.status || '',
    };

    if (kind === 'download') {
      downloadBlob(cached.blob, cached.filename);
      return;
    }

    downloadBlob(cached.blob, cached.filename);

    if (kind === 'wa') {
      const phone = sanitizePhone(student.phone, settings.country);
      const msg = applyTemplate(settings.waTemplate, vars);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
      showToast('PDF downloaded. Drag it into the WhatsApp chat. Browsers can’t auto-attach files.', 6000);
    } else if (kind === 'mail') {
      const subject = applyTemplate(settings.emailSubject, vars);
      const body = applyTemplate(settings.emailBody, vars);
      window.location.href = `mailto:${encodeURIComponent(student.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      showToast('PDF downloaded. Attach it to the email draft.', 6000);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>IELTS Mock TRF — PDF Generator</h1>
        <p>Vector-quality PDFs via headless Chrome (Puppeteer). Upload batch Excel → fill common fields → download ZIP → deliver per student.</p>
        {serverOk === false && (
          <div className="server-warning">
            ⚠️ Backend at <code>/api</code> is not reachable. Run <code>npm run dev</code> from the project root (starts both the Vite UI and the Puppeteer backend on port 3001).
          </div>
        )}
      </header>

      <main className="app-main">
        {/* STEP 1: SETTINGS */}
        <section className="panel">
          <h2><span className="step">1</span> Batch Settings</h2>
          <p className="panel-desc">Filled once per batch. Auto-saved to browser — next upload will pre-fill.</p>
          <div className="grid">
            <Field label="Centre Number" value={settings.centre} onChange={v => updateSettings({ centre: v })} />
            <Field label="Test Date" type="date" value={settings.date} onChange={v => updateSettings({ date: v })} />
            <Field label="Student Status / Batch ID" value={settings.status} onChange={v => updateSettings({ status: v })} placeholder="e.g. 20260212" />
            <Field label="Writing Examiner" value={settings.writingEx} onChange={v => updateSettings({ writingEx: v })} placeholder="e.g. Mr. James Harlow" />
            <Field label="Speaking Examiner" value={settings.speakingEx} onChange={v => updateSettings({ speakingEx: v })} placeholder="e.g. Ms. Priya Meenakshi" />
            <Field label="Administrator Signature" value={settings.adminSig} onChange={v => updateSettings({ adminSig: v })} placeholder="e.g. Pagla Sifu" />
            <Field label="Centre Stamp (use newlines)" textarea rows={3} value={settings.centreStamp} onChange={v => updateSettings({ centreStamp: v })} />
            <Field label="Validation Stamp" value={settings.validationStamp} onChange={v => updateSettings({ validationStamp: v })} />
            <Field label="Administrator Comments (same for all)" textarea rows={2} wide value={settings.adminComments} onChange={v => updateSettings({ adminComments: v })} />
            <Field label="Institute Footer Text" wide value={settings.footer} onChange={v => updateSettings({ footer: v })} placeholder="e.g. Mock test by Prolific IELTS Academy · +880..." />
            <Field label="WhatsApp Country Code" value={settings.country} onChange={v => updateSettings({ country: v })} />
            <Field label="WhatsApp Template — placeholders: {{firstName}} {{date}} {{listening}} {{reading}} {{writing}} {{speaking}} {{overall}} {{cefr}} {{batch}}" textarea rows={8} wide value={settings.waTemplate} onChange={v => updateSettings({ waTemplate: v })} />
            <Field label="Email Subject Template" value={settings.emailSubject} onChange={v => updateSettings({ emailSubject: v })} />
            <Field label="Email Body Template (same placeholders as WhatsApp)" textarea rows={10} wide value={settings.emailBody} onChange={v => updateSettings({ emailBody: v })} />
          </div>
        </section>

        {/* STEP 2: UPLOAD */}
        <section className="panel">
          <h2><span className="step">2</span> Upload Excel</h2>
          <p className="panel-desc">Expected columns: Student Name, Number, E-Mail, Seat, L, R, W, S, Overall.</p>
          <UploadZone onFile={handleFile} fileName={fileName} error={parseError} />
        </section>

        {/* STEP 3: ROSTER */}
        {hasRoster && (
          <section className="panel">
            <h2><span className="step">3</span> Roster Preview</h2>
            <p className="panel-desc">Amber rows have a missing Overall. Uncheck to exclude from this run.</p>
            <div className="table-wrap">
              <table className="roster">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={selectedCount === roster.length} onChange={e => toggleAll(e.target.checked)} /></th>
                    <th>Seat</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>L</th><th>R</th><th>W</th><th>S</th>
                    <th>Overall</th><th>CEFR</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((s, idx) => {
                    const cefr = cefrFromOverall(s.overall);
                    const hasPdf = generatedPdfs.has(s.seat);
                    return (
                      <tr key={idx} className={!s.overall ? 'amber' : ''}>
                        <td><input type="checkbox" checked={s.selected} onChange={() => toggleRow(idx)} /></td>
                        <td>{s.seat}</td>
                        <td>{s.name}</td>
                        <td>{s.phone}</td>
                        <td>{s.email}</td>
                        <td className="band">{s.l}</td>
                        <td className="band">{s.r}</td>
                        <td className="band">{s.w}</td>
                        <td className="band">{s.s}</td>
                        <td className="band">{s.overall}</td>
                        <td className="band">{cefr}</td>
                        <td className="actions">
                          {hasPdf ? (
                            <>
                              <button className="btn btn-sm btn-secondary" onClick={() => handleDelivery(s, 'download')} title="Re-download">⬇️</button>
                              <button className="btn btn-sm btn-success" onClick={() => handleDelivery(s, 'wa')} disabled={!s.phone} title={!s.phone ? 'No phone' : 'Open WhatsApp'}>📱 WA</button>
                              <button className="btn btn-sm btn-primary" onClick={() => handleDelivery(s, 'mail')} disabled={!s.email} title={!s.email ? 'No email' : 'Open email'}>✉️ Mail</button>
                            </>
                          ) : (
                            <span className="muted">generate first</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="count-line">{selectedCount} of {roster.length} students will be generated.</div>
          </section>
        )}

        {/* STEP 4: GENERATE */}
        {hasRoster && (
          <section className="panel">
            <h2><span className="step">4</span> Preview & Generate</h2>
            <div className="btn-row">
              <button className="btn btn-secondary" disabled={!firstSelected || progress.active || previewLoading || serverOk === false} onClick={handlePreview}>
                {previewLoading ? 'Loading preview…' : 'Preview first selected student'}
              </button>
              <button className="btn btn-success" disabled={progress.active || selectedCount === 0 || serverOk === false} onClick={handleGenerate}>
                {progress.active ? 'Generating…' : 'Generate all PDFs (ZIP)'}
              </button>
            </div>
            {progress.active && (
              <div className="progress-wrap">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }} />
                </div>
                <div className="progress-text">{progress.message}</div>
              </div>
            )}
          </section>
        )}
      </main>

      {previewIdx !== null && previewUrl && (
        <div className="modal-backdrop" onClick={closePreview}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closePreview}>×</button>
            <h3 className="modal-title">Preview — Seat {roster[previewIdx]?.seat}, {roster[previewIdx]?.name}</h3>
            <iframe src={previewUrl} title="TRF preview" style={{ width: '100%', height: '78vh', border: 'none' }} />
          </div>
        </div>
      )}

      {toastMsg && <div className="toast show">{toastMsg}</div>}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', textarea = false, rows = 2, placeholder = '', wide = false }) {
  return (
    <div className={'field' + (wide ? ' field-wide' : '')}>
      <label>{label}</label>
      {textarea
        ? <textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

function UploadZone({ onFile, fileName, error }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  return (
    <label
      className={'upload-zone' + (drag ? ' drag' : '')}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault(); setDrag(false);
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
      }}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      <div className="icon">📂</div>
      <div className="msg"><strong>Click to choose</strong> or drag & drop an .xlsx file</div>
      {fileName && <div className="file-name">{fileName}</div>}
      {error && <div className="error-text">{error}</div>}
    </label>
  );
}
