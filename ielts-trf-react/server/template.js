// Fills the parameterized TRF template with values for a single student and
// returns the complete HTML string, ready for Puppeteer's page.setContent().
//
// The CSS is a verbatim copy of ielts_trf (2).html with two additions:
//   1. a diagonal MOCK TEST watermark (::before on .trf-container)
//   2. a dashed-line institute footer below the main content
// Everything else — grey score boxes, dashed dividers, cursive signature,
// stamp circles — is the original CSS rendered by real Chrome, so the PDF
// matches the HTML template exactly.

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function nlBr(s) {
  return esc(s).replaceAll('\n', '<br>');
}

// Builds a circular seal (SVG vector) with curved text on top, curved text
// on bottom, and 1–3 lines of text in the middle. Rendered by headless
// Chrome so the SVG textPath is accurate and prints at full PDF resolution.
function sealSvg({ topText, bottomText, innerLines, idSuffix, color = '#0a3d7a' }) {
  const lines = (innerLines || []).map(l => String(l || '').trim()).filter(Boolean);
  const lineCount = lines.length;
  const lineSpacing = lineCount >= 3 ? 7 : 9;
  const startY = 50 - ((lineCount - 1) * lineSpacing) / 2 + 2.5;
  const mainSize = lineCount === 1 ? 11 : lineCount === 2 ? 8.5 : 7;

  const innerText = lines.map((line, i) => {
    const y = startY + i * lineSpacing;
    return `<text x="50" y="${y}" text-anchor="middle" fill="${color}" font-family="Arial, 'Arimo', sans-serif" font-size="${mainSize}" font-weight="900" letter-spacing="0.4">${esc(line)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="opacity:0.9;">
    <defs>
      <path id="top-${idSuffix}" d="M 16,50 A 34,34 0 0 1 84,50" fill="none"/>
      <path id="bot-${idSuffix}" d="M 84,50 A 34,34 0 0 1 16,50" fill="none"/>
    </defs>
    <circle cx="50" cy="50" r="46" fill="none" stroke="${color}" stroke-width="2.2"/>
    <circle cx="50" cy="50" r="37" fill="none" stroke="${color}" stroke-width="0.9"/>
    <text fill="${color}" font-family="Arial, 'Arimo', sans-serif" font-size="6.3" font-weight="900" letter-spacing="0.9">
      <textPath href="#top-${idSuffix}" startOffset="50%" text-anchor="middle">${esc(topText)}</textPath>
    </text>
    <text fill="${color}" font-family="Arial, 'Arimo', sans-serif" font-size="5.2" font-weight="700" letter-spacing="0.6">
      <textPath href="#bot-${idSuffix}" startOffset="50%" text-anchor="middle">${esc(bottomText)}</textPath>
    </text>
    <text x="15" y="53" text-anchor="middle" fill="${color}" font-size="5">★</text>
    <text x="85" y="53" text-anchor="middle" fill="${color}" font-size="5">★</text>
    ${innerText}
  </svg>`;
}

export function renderTrfHtml({ student, settings }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>IELTS TRF — ${esc(student.seat)} — ${esc(student.name)}</title>
<!-- Metric-compatible substitutes for Times New Roman (Tinos), Arial
     (Arimo) and Brush Script (Great Vibes). On Windows the native fonts
     listed first in each font-family stack are used and these Google
     fonts aren't fetched. On Linux (Render), the native fonts are
     missing so Chromium falls back to these identical-metric substitutes,
     keeping the PDF visually consistent across platforms. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&family=Tinos:ital,wght@0,400;0,700;1,400&family=Great+Vibes&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    background: #fff;
    font-family: 'Times New Roman', 'Tinos', Times, serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    width: 210mm;
    height: 297mm;
  }

  /* Size the TRF to the full A4 page so Chrome does not auto-shrink and
     leave blank space below. Flex column pushes the mock footer to the
     bottom edge; the middle grows to absorb any vertical slack. */
  .trf-container {
    position: relative;
    background: #fff;
    width: 210mm;
    height: 297mm;
    padding: 10mm 14mm 8mm 14mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .trf-spacer { flex: 1; min-height: 0; }

  /* MOCK TEST watermark — sits behind everything */
  .trf-container::before {
    content: "MOCK TEST";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-28deg);
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 140px;
    font-weight: 900;
    color: rgba(200, 0, 0, 0.08);
    letter-spacing: 14px;
    pointer-events: none;
    z-index: 0;
    white-space: nowrap;
  }
  .trf-container > * { position: relative; z-index: 1; }

  /* HEADER */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .logo-area h1 {
    font-family: 'Arial Black', 'Arimo', Arial, sans-serif;
    font-size: 32px;
    font-weight: 900;
    letter-spacing: 1px;
    color: #000;
    line-height: 1;
  }
  .logo-area h2 {
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 15px;
    font-weight: bold;
    color: #000;
    margin-top: 4px;
  }
  .academic-badge {
    border: 2px solid #000;
    padding: 10px 30px;
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 18px;
    font-weight: bold;
    letter-spacing: 2px;
    align-self: center;
  }

  .note-text {
    font-size: 10px;
    font-style: italic;
    line-height: 1.4;
    margin-bottom: 14px;
    color: #000;
  }
  .note-text span {
    font-style: normal;
    font-weight: bold;
  }

  /* META ROW */
  .meta-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 16px;
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 13px;
  }
  .meta-row label { font-weight: normal; color: #000; }
  .meta-box {
    border: 1px solid #000;
    padding: 4px 10px;
    font-size: 13px;
    min-width: 80px;
    display: inline-block;
    text-align: center;
    background: #fff;
  }

  hr.divider {
    border: none;
    border-top: 1.5px solid #000;
    margin: 10px 0 14px 0;
  }

  .section-title {
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 15px;
    font-weight: bold;
    margin-bottom: 12px;
    color: #000;
  }

  /* CANDIDATE */
  .candidate-section {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .candidate-fields { flex: 1; padding-right: 20px; }
  .field-row {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 13px;
  }
  .field-row label {
    width: 110px;
    flex-shrink: 0;
    color: #000;
  }
  .field-box {
    background: #c8c8c8;
    border: 1px solid #999;
    padding: 5px 10px;
    font-size: 13px;
    font-weight: bold;
    flex: 1;
    color: #000;
    min-height: 26px;
  }
  .field-box.short { flex: none; width: 180px; }
  .photo-box {
    width: 140px;
    height: 160px;
    border: 1px solid #aaa;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #aaa;
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 12px;
    letter-spacing: 1px;
    flex-shrink: 0;
  }

  /* SCORES — flat single-row layout so Overall + CEFR sit inline with
     Listening/Reading/Writing/Speaking, all with identical box styling. */
  .scores-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 13px;
    margin: 14px 0 10px 0;
    flex-wrap: nowrap;
    white-space: nowrap;
  }
  .score-label { color: #000; }
  .score-box {
    background: #c8c8c8;
    border: 1px solid #999;
    padding: 6px 10px;
    font-size: 15px;
    font-weight: bold;
    color: #000;
    min-width: 48px;
    text-align: center;
    min-height: 32px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  /* EXAMINER */
  .examiner-section {
    margin: 12px 0 16px 0;
    padding: 12px 14px;
    border: 1.5px solid #555;
    background: #f7f7f7;
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 13px;
  }
  .examiner-section .section-title {
    font-size: 13px;
    margin-bottom: 10px;
    border-bottom: 1px solid #ccc;
    padding-bottom: 6px;
  }
  .examiner-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .examiner-field {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .examiner-field label {
    width: 160px;
    flex-shrink: 0;
    color: #333;
    font-size: 12px;
  }
  .examiner-field .efield-box {
    flex: 1;
    border-bottom: 1.5px solid #555;
    padding: 3px 6px;
    font-size: 13px;
    font-weight: bold;
    background: transparent;
    color: #000;
    min-height: 22px;
  }

  /* BOTTOM */
  .bottom-section {
    display: flex;
    gap: 16px;
    margin-top: 6px;
  }
  .comments-area { flex: 1; }
  .comments-box {
    border: 1px solid #999;
    width: 100%;
    min-height: 80px;
    margin-top: 6px;
    background: #fff;
    padding: 8px 10px;
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 12px;
    white-space: pre-wrap;
  }
  .admin-sig {
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 12px;
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sig-line {
    font-family: 'Brush Script MT', 'Segoe Script', 'Lucida Handwriting', 'Great Vibes', cursive;
    font-size: 22px;
    border-bottom: 1px solid #000;
    padding: 0 10px;
    min-width: 140px;
    display: inline-block;
  }
  .stamp-area { display: flex; gap: 10px; }
  .stamp-box {
    border: 1px solid #999;
    width: 130px;
    text-align: center;
    padding: 8px 6px;
    font-family: Arial, 'Arimo', sans-serif;
    font-size: 11px;
  }
  .stamp-box .stamp-label {
    font-weight: bold;
    font-size: 11px;
    margin-bottom: 4px;
  }
  .stamp-seal {
    width: 100px;
    height: 100px;
    margin: 0 auto;
    display: block;
  }
  .stamp-seal svg { width: 100%; height: 100%; display: block; }
  .stamp-seal.tilt-left  { transform: rotate(-3deg); }
  .stamp-seal.tilt-right { transform: rotate(2.5deg); }

  .mock-footer {
    text-align: center;
    font-size: 10px;
    color: #666;
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px dashed #aaa;
    font-style: italic;
  }
</style>
</head>
<body>
<div class="trf-container">

  <div class="header">
    <div class="logo-area">
      <h1>IELTS BANGLADESH</h1>
      <h2>Mock Test Result</h2>
    </div>
    <div class="academic-badge">ACADEMIC</div>
  </div>

  <p class="note-text">
    <span>NOTE</span> <em>Admission to undergraduate and post graduate courses should be based on the ACADEMIC Reading and Writing Modules. GENERAL TRAINING Reading and Writing Modules are not designed to test the full range of language skills required for academic purposes.</em>
  </p>

  <div class="meta-row">
    <label>Centre Number</label>
    <span class="meta-box">${esc(settings.centre)}</span>
    <label>Date</label>
    <span class="meta-box">${esc(settings.dateFormatted)}</span>
    <label>Student Status</label>
    <span class="meta-box" style="min-width:110px;">${esc(settings.status)}</span>
  </div>

  <hr class="divider">

  <div class="section-title">Candidate Details</div>
  <div class="candidate-section">
    <div class="candidate-fields">
      <div class="field-row">
        <label>First Name</label>
        <div class="field-box">${esc(student.first)}</div>
      </div>
      <div class="field-row">
        <label>Last Name</label>
        <div class="field-box">${esc(student.last)}</div>
      </div>
      <div class="field-row">
        <label>Email Address</label>
        <div class="field-box">${esc(student.email)}</div>
      </div>
      <div class="field-row">
        <label>Phone Number</label>
        <div class="field-box short">${esc(student.phone)}</div>
      </div>
    </div>
    <div class="photo-box">PASSPORT PHOTO</div>
  </div>

  <hr class="divider">

  <div class="section-title">Test Results</div>
  <hr class="divider" style="margin-top:0;">

  <div class="scores-row">
    <span class="score-label">Listening</span>
    <span class="score-box">${esc(student.l)}</span>
    <span class="score-label">Reading</span>
    <span class="score-box">${esc(student.r)}</span>
    <span class="score-label">Writing</span>
    <span class="score-box">${esc(student.w)}</span>
    <span class="score-label">Speaking</span>
    <span class="score-box">${esc(student.s)}</span>
    <span class="score-label">Overall</span>
    <span class="score-box">${esc(student.overall)}</span>
    <span class="score-label">CEFR</span>
    <span class="score-box">${esc(student.cefr)}</span>
  </div>

  <div class="examiner-section">
    <div class="section-title">Examiner / Teacher Information</div>
    <div class="examiner-grid">
      <div class="examiner-field">
        <label>Writing Examiner Name:</label>
        <div class="efield-box">${esc(settings.writingEx)}</div>
      </div>
      <div class="examiner-field">
        <label>Speaking Examiner Name:</label>
        <div class="efield-box">${esc(settings.speakingEx)}</div>
      </div>
    </div>
  </div>

  <div class="bottom-section">
    <div class="comments-area">
      <div class="section-title" style="font-size:13px;">Administrator Comments</div>
      <div class="comments-box">${esc(settings.adminComments)}</div>
      <div class="admin-sig">
        <span>Administrator Signature</span>
        <span class="sig-line">${esc(settings.adminSig)}</span>
      </div>
    </div>

    <div class="stamp-area">
      <div class="stamp-box">
        <div class="stamp-label">Centre stamp</div>
        <div class="stamp-seal tilt-left">${sealSvg({
          topText: 'IELTS BANGLADESH',
          bottomText: `∗ MOCK CENTRE ∗ ${settings.centre || ''}`,
          innerLines: String(settings.centreStamp || '').split('\n'),
          idSuffix: 'centre',
        })}</div>
      </div>
      <div class="stamp-box">
        <div class="stamp-label">Validation stamp</div>
        <div class="stamp-seal tilt-right">${sealSvg({
          topText: 'VALIDATED',
          bottomText: settings.dateFormatted || 'MOCK TEST',
          innerLines: String(settings.validationStamp || '').split('\n'),
          idSuffix: 'validation',
        })}</div>
      </div>
    </div>
  </div>

  <div class="trf-spacer"></div>

  ${settings.footer ? `<div class="mock-footer">${esc(settings.footer)}</div>` : ''}

</div>
</body>
</html>`;
}
