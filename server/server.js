/**
 * ClearWay server — serves the dashboard and runs document extraction.
 *
 * Zero dependencies: Node 18+ (built-in http + fetch).
 *
 *   POST /api/analyze   { desc, dest, mode, supplier, docs:{inv:[{name,type,data(base64)}], pl:[...], bl:[...], certs:[...], art:[...]} }
 *                      → { ex:{inv,pl,bl}, classification, simulated:boolean, notes:[...] }
 *   GET  /api/health    → { ok, live:boolean, model }
 *
 * With ANTHROPIC_API_KEY set, extraction + classification are done by Claude reading the
 * actual documents (PDF, images, CSV/TXT). Without a key the endpoint answers { simulated:true }
 * and the browser falls back to its built-in simulation so the UI still works end to end.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const rules = require('../public/rules.js');

loadDotEnv();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const PUBLIC = path.join(__dirname, '..', 'public');
const MAX_BODY = 40 * 1024 * 1024;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, live: !!API_KEY, model: API_KEY ? MODEL : null });
    if (req.method === 'POST' && url.pathname === '/api/analyze') return analyze(req, res);
    if (req.method === 'GET') return serveStatic(url.pathname, res);
    json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`ClearWay running at http://localhost:${PORT}`);
  console.log(API_KEY ? `Extraction: live (${MODEL})` : 'Extraction: SIMULATED — set ANTHROPIC_API_KEY in .env to analyze real documents');
});

/* ------------------------------------------------------------------ */
async function analyze(req, res) {
  const body = await readJson(req);
  if (!body || typeof body !== 'object') return json(res, 400, { error: 'bad json' });
  const { desc = '', dest = 'US', mode = 'Ocean', docs = {} } = body;
  const notes = [];

  if (!API_KEY) return json(res, 200, { simulated: true, notes: ['ANTHROPIC_API_KEY not set; browser will simulate extraction.'] });

  const content = [];
  const docNames = { inv: 'COMMERCIAL INVOICE', pl: 'PACKING LIST', bl: 'BILL OF LADING / AIR WAYBILL', certs: 'CERTIFICATE / TEST REPORT', art: 'LABEL OR PACKAGING ARTWORK' };
  let attached = 0;
  for (const key of ['inv', 'pl', 'bl', 'certs', 'art']) {
    for (const f of docs[key] || []) {
      if (!f || !f.data) continue;
      const block = toContentBlock(f);
      if (!block) { notes.push(`${f.name}: unsupported type ${f.type || '?'} — skipped`); continue; }
      content.push({ type: 'text', text: `--- ${docNames[key]} (${f.name}) ---` });
      content.push(block);
      attached++;
    }
  }
  if (!attached) return json(res, 200, { simulated: true, notes: ['No readable documents attached.'] });

  content.push({ type: 'text', text: buildPrompt({ desc, dest, mode, present: Object.fromEntries(['inv', 'pl', 'bl'].map(k => [k, !!(docs[k] || []).some(f => f && f.data)])) }) });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 2000, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error('Anthropic API error', r.status, t.slice(0, 500));
    return json(res, 200, { simulated: true, notes: [`Extraction service error ${r.status}; browser will simulate.`] });
  }
  const data = await r.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const parsed = extractJson(text);
  if (!parsed) return json(res, 200, { simulated: true, notes: ['Could not parse extraction result; browser will simulate.'] });

  // classification: prefer the model's reasoning, fall back to keyword rules
  let classification = null;
  if (parsed.classification && parsed.classification.code) {
    const c = parsed.classification;
    classification = { code: c.code, text: c.description || '', why: c.rationale || '', duty: c.duty_note || 'see tariff schedule', conf: clamp(Number(c.confidence) || 60, 5, 99) };
  } else {
    classification = rules.classify({ desc, dest });
  }
  json(res, 200, { simulated: false, ex: { inv: parsed.inv || null, pl: parsed.pl || null, bl: parsed.bl || null }, classification, certificates: parsed.certificates || [], notes: [...notes, ...(parsed.notes || [])] });
}

const SYSTEM = `You are a customs documentation analyst for small importers. You read commercial invoices, packing lists, bills of lading / air waybills, certificates and label artwork, and return precise structured data. Never invent values: if a field is not present in a document, return an empty string. Keep units as written (e.g. "594 kg"). Quantities are total units across all line items. Respond with JSON only.`;

function buildPrompt({ desc, dest, mode, present }) {
  return `Shipper's description of the goods: "${desc}". Destination market: ${dest}. Mode: ${mode}.
Documents attached: invoice=${present.inv}, packing list=${present.pl}, transport document=${present.bl}.

Extract the following fields from EACH attached document (omit documents that are not attached, use null):
  desc      - product description exactly as written on that document
  qty       - total quantity in units (number as string, no thousands separators)
  cartons   - total number of cartons/packages
  weight    - total gross weight with unit
  value     - total value with currency (invoice only; "" elsewhere unless present)
  incoterm  - Incoterm and named place if stated
  consignee - consignee / buyer legal name exactly as written
  origin    - country of origin if stated
  hs        - HS/HTS code if stated

Then classify the goods for ${dest}: give the most likely ${dest === 'US' ? '10-digit HTSUS' : dest === 'EU' ? '8-digit CN/TARIC' : '10-digit UK Global Tariff'} code, a short description of the heading, a 1–2 sentence rationale citing the relevant heading/notes, a confidence 0–100, and a short duty note (base rate plus any known additional measures such as Section 301/232 for China origin). Say if more product detail is needed.

If certificates or test reports are attached, list each with: type (e.g. FCC SDoC, CPC, CE DoC, EN 71, FDA registration), issuer/lab, report number, date, and whether it plausibly covers the described product.

Return exactly this JSON shape and nothing else:
{"inv":{...}|null,"pl":{...}|null,"bl":{...}|null,
 "classification":{"code":"","description":"","rationale":"","confidence":0,"duty_note":""},
 "certificates":[{"type":"","issuer":"","number":"","date":"","covers_product":true}],
 "notes":["anything the importer should know, e.g. missing signatures, illegible pages, inconsistent units"]}`;
}

function toContentBlock(f) {
  const type = (f.type || '').toLowerCase();
  const name = (f.name || '').toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } };
  if (/^image\/(png|jpeg|jpg|webp|gif)$/.test(type)) return { type: 'image', source: { type: 'base64', media_type: type === 'image/jpg' ? 'image/jpeg' : type, data: f.data } };
  if (type.startsWith('text/') || /\.(csv|txt|tsv|md|json)$/.test(name)) {
    const text = Buffer.from(f.data, 'base64').toString('utf8').slice(0, 60000);
    return { type: 'text', text };
  }
  return null; // xlsx/docx: not supported in this version — export to PDF or CSV first
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

/* ------------------------------------------------------------------ */
function serveStatic(pathname, res) {
  let p = decodeURIComponent(pathname);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}
function json(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch (e) { resolve(null); } });
    req.on('error', reject);
  });
}
function loadDotEnv() {
  const p = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
