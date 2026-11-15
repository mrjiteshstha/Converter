// POST /api/html-to-pdf
// Body (JSON): { html, format?, landscape?, marginMm?, media?, javascript? }
// Renders the HTML in headless Chromium and returns the PDF.

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const FORMATS = new Set(['A3', 'A4', 'A5', 'Letter', 'Legal']);
const MAX_HTML_BYTES = 4.4 * 1024 * 1024; // Vercel rejects request bodies over 4.5 MB

// Pages must not reach local or internal addresses from the server.
function isBlockedHost(host) {
  host = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function allowRequest(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return true;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return !isBlockedHost(u.hostname);
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_HTML_BYTES + 4096) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function fail(res, status, message) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({ error: message }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Use POST.');
  }

  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return fail(res, e.status === 413 ? 413 : 400, e.status === 413 ? 'This file is larger than the 4.5 MB request limit.' : 'The request was not valid JSON.');
  }

  const html = body && body.html;
  if (typeof html !== 'string' || !html.trim()) return fail(res, 400, 'No HTML was provided.');
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) return fail(res, 413, 'This file is larger than the 4.5 MB request limit.');

  const format = FORMATS.has(body.format) ? body.format : 'A4';
  const landscape = body.landscape === true;
  const media = body.media === 'print' ? 'print' : 'screen';
  const javascript = body.javascript !== false;
  const marginMm = Math.min(50, Math.max(0, Number(body.marginMm) || 0));

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setJavaScriptEnabled(javascript);
    await page.emulateMediaType(media);

    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (allowRequest(r.url())) r.continue();
      else r.abort('blockedbyclient');
    });

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map((img) =>
          img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; })
        )
      );
    });

    const pdf = await page.pdf({
      format,
      landscape,
      printBackground: true,
      preferCSSPageSize: true,
      margin: marginMm ? { top: marginMm + 'mm', right: marginMm + 'mm', bottom: marginMm + 'mm', left: marginMm + 'mm' } : undefined,
    });

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(pdf));
  } catch (e) {
    console.error('html-to-pdf failed:', e && e.stack ? e.stack : e);
    const timeout = e && /timeout/i.test(String(e.message));
    fail(res, 500, timeout ? 'The page took too long to load. Check that it does not wait on a slow or missing resource.' : 'The PDF could not be created.');
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
