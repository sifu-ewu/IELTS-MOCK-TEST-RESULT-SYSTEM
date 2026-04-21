import * as XLSX from 'xlsx';

export function normalizeBand(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  if (!s || /^[xX\-]$/.test(s) || /^n\/?a$/i.test(s)) return '';
  const n = parseFloat(s);
  if (isNaN(n)) return '';
  return n.toFixed(1);
}

export function cefrFromOverall(overallStr) {
  if (!overallStr) return '';
  const n = parseFloat(overallStr);
  if (isNaN(n)) return '';
  if (n >= 9)   return 'C2';
  if (n >= 7)   return 'C1';
  if (n >= 5.5) return 'B2';
  if (n >= 4)   return 'B1';
  if (n >= 3)   return 'A2';
  if (n >= 2)   return 'A1';
  return '';
}

export function splitName(full) {
  const t = String(full || '').trim().replace(/\s+/g, ' ');
  if (!t) return { first: '', last: '' };
  const parts = t.split(' ');
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export function formatDate(ymd) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d)) return ymd;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}/${months[d.getMonth()]}/${d.getFullYear()}`;
}

export function sanitizePhone(raw, country) {
  let s = String(raw || '').replace(/[^\d+]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s.slice(1);
  const cc = String(country || '880').replace(/\D/g, '');
  if (s.startsWith(cc)) return s;
  if (s.startsWith('0')) return cc + s.slice(1);
  if (s.startsWith('1') && cc === '880') return cc + s;
  return cc + s;
}

export function applyTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export function sanitizeFilenamePart(s) {
  return String(s || '').replace(/[^a-zA-Z0-9]+/g, '').slice(0, 40) || 'X';
}

export function pdfFilename(student) {
  const { first, last } = splitName(student.name);
  const seat = String(student.seat || '').padStart(2, '0');
  return `Seat-${sanitizeFilenamePart(seat)}_${sanitizeFilenamePart(first)}-${sanitizeFilenamePart(last)}.pdf`;
}

function findHeaderRow(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 15); i++) {
    const row = (aoa[i] || []).map(c => String(c || '').trim().toLowerCase());
    if (row.some(c => c === 'student name') && row.some(c => c === 'seat')) return i;
  }
  return 0;
}

function columnIndex(header, names) {
  const low = header.map(h => String(h || '').trim().toLowerCase());
  for (const n of names) {
    const i = low.indexOf(n.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

export async function parseExcelFile(file) {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const hIdx = findHeaderRow(aoa);
  const header = aoa[hIdx] || [];
  const iName = columnIndex(header, ['student name', 'name']);
  const iNum  = columnIndex(header, ['number', 'phone', 'phone number']);
  const iMail = columnIndex(header, ['e-mail', 'email']);
  const iSeat = columnIndex(header, ['seat', 'seat no', 'seat number']);
  const iL    = columnIndex(header, ['l', 'listening']);
  const iR    = columnIndex(header, ['r', 'reading']);
  const iW    = columnIndex(header, ['w', 'writing']);
  const iS    = columnIndex(header, ['s', 'speaking']);
  const iO    = columnIndex(header, ['overall', 'overall band']);

  if (iName === -1) {
    throw new Error('Could not find "Student Name" column. Check your Excel headers.');
  }

  const roster = [];
  for (let r = hIdx + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const name = String(row[iName] ?? '').trim();
    const seat = String(row[iSeat] ?? '').trim();
    if (!name && !seat) continue;

    roster.push({
      seat,
      name,
      phone: String(row[iNum] ?? '').trim(),
      email: String(row[iMail] ?? '').trim(),
      l: normalizeBand(row[iL]),
      r: normalizeBand(row[iR]),
      w: normalizeBand(row[iW]),
      s: normalizeBand(row[iS]),
      overall: normalizeBand(row[iO]),
      selected: true,
    });
  }

  return roster;
}
