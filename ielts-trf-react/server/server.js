import express from 'express';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { renderTrfHtml } from './template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const distDir     = path.join(projectRoot, 'dist');

const app = express();
app.use(express.json({ limit: '2mb' }));

// ── Optional HTTP Basic Auth ───────────────────────────────────────
// Set BASIC_AUTH_USER + BASIC_AUTH_PASS as env vars (on Render or in
// .env) to lock the app behind a password. Leave unset for open access
// on local dev.
const AUTH_USER = process.env.BASIC_AUTH_USER;
const AUTH_PASS = process.env.BASIC_AUTH_PASS;
if (AUTH_USER && AUTH_PASS) {
  app.use((req, res, next) => {
    if (req.path === '/api/health') return next();
    const hdr = req.headers.authorization || '';
    const [scheme, encoded] = hdr.split(' ');
    if (scheme === 'Basic' && encoded) {
      const [u, p] = Buffer.from(encoded, 'base64').toString().split(':');
      if (u === AUTH_USER && p === AUTH_PASS) return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="IELTS TRF Generator"');
    res.status(401).send('Authentication required');
  });
  console.log('[server] basic auth enabled');
}

// ── Puppeteer pooling ──────────────────────────────────────────────
// Launch a single browser instance and reuse it across requests.
// Launching Chromium takes ~1s; reusing keeps each PDF render under 300ms.
//
// We also pre-render a throwaway warmup page during launch. Without this,
// the very first real PDF request lands on a cold renderer whose fonts
// and layout engine haven't fully initialized — producing a PDF that can
// drop interpolated text (e.g. score values) while keeping the static
// layout. Subsequent pages render correctly once Chromium is warm.
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const br = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage', // Small /dev/shm on Render free tier
          '--font-render-hinting=none',
        ],
      });
      await warmup(br);
      return br;
    })();
  }
  return browserPromise;
}

async function warmup(browser) {
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<html><body style="font-family:'Times New Roman',Arial"><div>warmup ${Date.now()}</div></body></html>`,
      { waitUntil: 'domcontentloaded' }
    );
    await page.pdf({ format: 'A4', printBackground: true });
    await page.close();
    console.log('[server] chromium warmed up');
  } catch (err) {
    console.warn('[server] warmup failed (not fatal):', err.message);
  }
}

async function renderPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.emulateMediaType('print');
    // 'domcontentloaded' (not networkidle0) — template has no external
    // resources, so DOM-ready = fully rendered. Saves ~500ms per request.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // Wait for fonts to finish loading before snapshotting the page.
    // Without this, Chromium's first render can capture a layout that
    // hasn't finished substituting from fallback fonts.
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      // Margins are owned by the .trf-container CSS padding so Chrome
      // does not add its own whitespace on top.
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });
    return pdfBuffer;
  } finally {
    await page.close();
  }
}

// ── API ────────────────────────────────────────────────────────────
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const { student, settings } = req.body || {};
    if (!student || !settings) {
      return res.status(400).json({ error: 'Request body must include { student, settings }' });
    }
    const html = renderTrfHtml({ student, settings });
    const pdfBuffer = await renderPdf(html);
    // Puppeteer v23 returns Uint8Array; Express serializes that as JSON unless
    // we coerce to Node Buffer first.
    const buf = Buffer.from(pdfBuffer);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  } catch (err) {
    console.error('PDF generation failed:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Static frontend (production mode only) ─────────────────────────
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] ${fs.existsSync(distDir) ? 'serving built frontend from dist/' : 'API-only (frontend served by vite dev)'}`);
  // Kick off chromium launch+warmup eagerly so the first real request is fast
  // and doesn't risk the cold-start text-dropping bug.
  getBrowser().catch(err => console.error('[server] browser launch failed:', err));
});

// Clean shutdown of Chromium
async function shutdown() {
  console.log('[server] shutting down…');
  try {
    if (browserPromise) {
      const br = await browserPromise;
      await br.close();
    }
  } catch {}
  process.exit(0);
}
process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
