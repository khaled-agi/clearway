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
const crypto = require('crypto');
const rules = require('../public/rules.js');

loadDotEnv();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const PUBLIC = path.join(__dirname, '..', 'public');
const MAX_BODY = 40 * 1024 * 1024;
const DATA = path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA, 'workspaces'), { recursive: true });
const readJsonFile = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJsonFile = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1));
const USERS = () => readJsonFile(path.join(DATA, 'users.json'), { users: [], sessions: {} });
const saveUsers = (u) => writeJsonFile(path.join(DATA, 'users.json'), u);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, live: !!API_KEY, model: API_KEY ? MODEL : null, auth: true });
    if (url.pathname.startsWith('/api/auth/')) return auth(req, res, url);
    if (url.pathname === '/api/state') return state(req, res);
    if (req.method === 'POST' && url.pathname === '/api/invite') return invite(req, res);
    if (req.method === 'POST' && url.pathname === '/api/analyze') return analyze(req, res);
    if (req.method === 'GET' && url.pathname === '/api/tariff') return tariff(url, res);
    if (req.method === 'GET' && url.pathname === '/api/rates') return rates(url, res);
    if (req.method === 'GET' && url.pathname === '/api/integrations') return json(res, 200, integrationStatus());
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

/* ------------------------------------------------------------------
   Accounts & workspaces (zero-dependency: scrypt password hashes, cookie sessions, JSON files in data/)
   ------------------------------------------------------------------ */
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(x => x[0]));
function currentUser(req) { const u = USERS(); const sid = cookies(req).cw_session; const s = sid && u.sessions[sid]; if (!s) return null; const user = u.users.find(x => x.id === s.userId); return user ? { user, db: u } : null; }
function hashPw(pw, salt) { salt = salt || crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex'); }
function checkPw(pw, stored) { const [salt, h] = stored.split(':'); return crypto.timingSafeEqual(Buffer.from(h, 'hex'), crypto.scryptSync(pw, salt, 32)); }
function setSession(res, db, userId) { const sid = crypto.randomBytes(24).toString('hex'); db.sessions[sid] = { userId, at: Date.now() }; saveUsers(db); res.setHeader('set-cookie', `cw_session=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`); }
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, workspaceId: u.workspaceId, role: u.role });
const wsFile = id => path.join(DATA, 'workspaces', id + '.json');

async function auth(req, res, url) {
  const action = url.pathname.split('/')[3];
  if (req.method === 'GET' && action === 'me') { const c = currentUser(req); if (!c) return json(res, 200, { user: null }); const ws = readJsonFile(wsFile(c.user.workspaceId), null); return json(res, 200, { user: publicUser(c.user), workspace: ws && { id: ws.id, name: ws.name, members: ws.members } }); }
  const body = (await readJson(req)) || {};
  const email = String(body.email || '').trim().toLowerCase();
  if (action === 'signup') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    if (String(body.password || '').length < 8) return json(res, 400, { error: 'Password must be at least 8 characters.' });
    const db = USERS(); if (db.users.some(u => u.email === email)) return json(res, 409, { error: 'An account with this email already exists — sign in instead.' });
    // invited? join the inviting workspace
    let wsId = null, role = 'Importer';
    for (const f of fs.readdirSync(path.join(DATA, 'workspaces'))) { const ws = readJsonFile(path.join(DATA, 'workspaces', f), null); const inv = ws && (ws.invites || []).find(i => i.email === email); if (inv) { wsId = ws.id; role = inv.role; ws.invites = ws.invites.filter(i => i.email !== email); ws.members.push({ email, role }); writeJsonFile(wsFile(ws.id), ws); break; } }
    if (!wsId) { wsId = 'ws_' + crypto.randomBytes(6).toString('hex'); writeJsonFile(wsFile(wsId), { id: wsId, name: body.company || email.split('@')[1], members: [{ email, role: 'Importer' }], invites: [], state: null, updatedAt: Date.now() }); }
    const user = { id: 'u_' + crypto.randomBytes(6).toString('hex'), email, name: body.name || '', pw: hashPw(String(body.password)), workspaceId: wsId, role, createdAt: Date.now() };
    db.users.push(user); setSession(res, db, user.id);
    return json(res, 200, { user: publicUser(user) });
  }
  if (action === 'login') {
    const db = USERS(); const user = db.users.find(u => u.email === email);
    if (!user || !checkPw(String(body.password || ''), user.pw)) return json(res, 401, { error: 'Email or password is incorrect.' });
    setSession(res, db, user.id); return json(res, 200, { user: publicUser(user) });
  }
  if (action === 'logout') { const db = USERS(); delete db.sessions[cookies(req).cw_session]; saveUsers(db); res.setHeader('set-cookie', 'cw_session=; Path=/; Max-Age=0'); return json(res, 200, { ok: true }); }
  json(res, 404, { error: 'unknown auth action' });
}
async function state(req, res) {
  const c = currentUser(req); if (!c) return json(res, 401, { error: 'sign in required' });
  const ws = readJsonFile(wsFile(c.user.workspaceId), null); if (!ws) return json(res, 404, { error: 'workspace missing' });
  if (req.method === 'GET') return json(res, 200, { state: ws.state, updatedAt: ws.updatedAt, workspace: { id: ws.id, name: ws.name, members: ws.members, invites: ws.invites } });
  if (req.method === 'PUT') { const body = await readJson(req); if (!body || typeof body !== 'object') return json(res, 400, { error: 'bad json' }); ws.state = body.state; ws.updatedAt = Date.now(); if (body.workspaceName) ws.name = body.workspaceName; writeJsonFile(wsFile(ws.id), ws); return json(res, 200, { ok: true, updatedAt: ws.updatedAt }); }
  json(res, 405, { error: 'method not allowed' });
}
async function invite(req, res) {
  const c = currentUser(req); if (!c) return json(res, 401, { error: 'sign in required' });
  const body = (await readJson(req)) || {}; const email = String(body.email || '').trim().toLowerCase(); const role = ['Importer', 'Factory', 'Forwarder', 'Broker'].includes(body.role) ? body.role : 'Factory';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
  const ws = readJsonFile(wsFile(c.user.workspaceId), null); ws.invites = (ws.invites || []).filter(i => i.email !== email); ws.invites.push({ email, role, at: Date.now(), by: c.user.email }); writeJsonFile(wsFile(ws.id), ws);
  json(res, 200, { ok: true, invites: ws.invites, note: 'No email is sent in this version: tell them to sign up at your ClearWay address with this email and they will land in your workspace.' });
}

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

/* ------------------------------------------------------------------
   Official tariff lookups (free, no key):
     US  — USITC HTS REST API        https://hts.usitc.gov/reststop/search?keyword=...
     UK  — UK Trade Tariff API       https://www.trade-tariff.service.gov.uk/api/v2/commodities/{10 digits}
   EU TARIC and Canada's tariff have no simple public JSON API; we link to the official lookups instead.
   ------------------------------------------------------------------ */
async function tariff(url, res) {
  const dest = (url.searchParams.get('dest') || 'US').toUpperCase();
  const code = (url.searchParams.get('code') || '').replace(/[^0-9]/g, '');
  const q = url.searchParams.get('q') || '';
  try {
    if (dest === 'US') {
      const kw = code || q; if (!kw) return json(res, 400, { error: 'code or q required' });
      const r = await fetch('https://hts.usitc.gov/reststop/search?keyword=' + encodeURIComponent(kw), { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('USITC ' + r.status);
      const rows = await r.json();
      const hits = (Array.isArray(rows) ? rows : []).filter(x => x.htsno).slice(0, 12).map(x => ({ code: x.htsno, description: x.description, general: x.general, special: x.special, other: x.other, units: x.units }));
      return json(res, 200, { dest, source: 'USITC HTS (official)', url: 'https://hts.usitc.gov/?query=' + encodeURIComponent(kw), hits, note: 'Chapter 99 measures (Section 301/232, IEEPA) are additional to the general rate shown.' });
    }
    if (dest === 'UK') {
      if (!code) return json(res, 400, { error: 'a 10-digit code is required for UK lookups' });
      const r = await fetch(`https://www.trade-tariff.service.gov.uk/api/v2/commodities/${code.padEnd(10, '0').slice(0, 10)}`, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('UK Trade Tariff ' + r.status);
      const j = await r.json();
      const a = j.data && j.data.attributes || {};
      const measures = (j.included || []).filter(i => i.type === 'measure').length;
      return json(res, 200, { dest, source: 'UK Trade Tariff (official)', url: `https://www.trade-tariff.service.gov.uk/commodities/${code}`, hits: [{ code: a.goods_nomenclature_item_id, description: a.formatted_description || a.description, general: a.basic_duty_rate ? String(a.basic_duty_rate).replace(/<[^>]+>/g, '') : '', measures }] });
    }
    const links = { EU: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp?Lang=en&Taric=' + code, CA: 'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/tblmod-eng.html' };
    return json(res, 200, { dest, source: null, url: links[dest] || null, hits: [], note: 'No public JSON API for this market; open the official lookup.' });
  } catch (e) {
    return json(res, 502, { error: String(e.message || e), hint: 'The server could not reach the official tariff site. Check network access.' });
  }
}

/* ------------------------------------------------------------------
   Freight rates: adapters for commercial APIs (need keys) + a built-in lane estimate.
   Set FREIGHTOS_API_KEY / MAERSK_CLIENT_ID+SECRET / FLEXPORT_API_KEY in .env to enable live quotes.
   ------------------------------------------------------------------ */
const LANES = { // very rough 2026 market ranges, USD; replace with live quotes
  'CN-US': { ocean40: [2800, 4800], ocean20: [2000, 3400], lclCbm: [95, 160], airKg: [4.2, 7.5], expressKg: [6.5, 11], days: { Ocean: 30, Air: 6, Express: 4 }, thc: 650, docs: 120 },
  'CN-CA': { ocean40: [3000, 5200], ocean20: [2200, 3600], lclCbm: [100, 170], airKg: [4.5, 8], expressKg: [7, 12], days: { Ocean: 32, Air: 6, Express: 4 }, thc: 600, docs: 120 },
  'CN-EU': { ocean40: [2600, 4600], ocean20: [1900, 3200], lclCbm: [90, 150], airKg: [4.0, 7.0], expressKg: [6, 10.5], days: { Ocean: 38, Air: 6, Express: 4 }, thc: 420, docs: 110 },
  'CN-UK': { ocean40: [2700, 4700], ocean20: [2000, 3300], lclCbm: [95, 155], airKg: [4.2, 7.2], expressKg: [6.2, 10.8], days: { Ocean: 38, Air: 6, Express: 4 }, thc: 380, docs: 110 },
};
function integrationStatus() {
  return {
    tariff: { usitc: true, ukTradeTariff: true, taric: 'link-only', cbsa: 'link-only' },
    rates: {
      freightos: !!process.env.FREIGHTOS_API_KEY, maersk: !!(process.env.MAERSK_CLIENT_ID && process.env.MAERSK_CLIENT_SECRET), flexport: !!process.env.FLEXPORT_API_KEY, shippo: !!process.env.SHIPPO_API_KEY,
      builtin: true,
    },
    extraction: !!API_KEY,
  };
}
const ORIGIN_FACTOR = { CN: 1, HK: 1, VN: 1.05, TH: 1.05, ID: 1.08, MY: 1.03, KH: 1.1, IN: 1.1, BD: 1.15, PK: 1.15, LK: 1.1, KR: 0.95, TW: 0.95, JP: 1.0, TR: 0.7, AE: 0.8, EG: 0.75, DE: 0.35, NL: 0.35, BE: 0.35, FR: 0.4, ES: 0.45, IT: 0.45, GR: 0.5, PL: 0.4, GB: 0.4, US: 0.5, CA: 0.5, MX: 0.45, BR: 0.9, AU: 1.0, ZA: 1.0, NG: 1.1 };
async function rates(url, res) {
  const dest = (url.searchParams.get('dest') || 'US').toUpperCase(), mode = url.searchParams.get('mode') || 'Ocean', origin = (url.searchParams.get('origin') || 'CN').toUpperCase();
  const factor = ORIGIN_FACTOR[origin] || 1;
  const cbm = Number(url.searchParams.get('cbm')) || 10, kg = Number(url.searchParams.get('kg')) || 600, value = Number(url.searchParams.get('value')) || 10000;
  const base = LANES['CN-' + dest] || LANES['CN-US'];
  const lane = { ...base, ocean40: base.ocean40.map(x => Math.round(x * factor)), ocean20: base.ocean20.map(x => Math.round(x * factor)), lclCbm: base.lclCbm.map(x => x * factor), airKg: base.airKg.map(x => x * factor), expressKg: base.expressKg.map(x => x * factor), days: { Ocean: Math.round(base.days.Ocean * (factor < 0.6 ? 0.5 : 1)), Air: base.days.Air, Express: base.days.Express } };
  // Live adapters would go here; each returns the same shape. None is called without a key.
  const quotes = [];
  if (mode === 'Ocean') {
    if (cbm >= 25) quotes.push({ provider: 'Built-in estimate', service: cbm > 55 ? '40ft FCL' : '20ft FCL', low: cbm > 55 ? lane.ocean40[0] : lane.ocean20[0], high: cbm > 55 ? lane.ocean40[1] : lane.ocean20[1], days: lane.days.Ocean });
    else quotes.push({ provider: 'Built-in estimate', service: `LCL ${cbm} cbm`, low: Math.round(lane.lclCbm[0] * cbm), high: Math.round(lane.lclCbm[1] * cbm), days: lane.days.Ocean + 5 });
  } else if (mode === 'Air') quotes.push({ provider: 'Built-in estimate', service: `Air freight ${kg} kg (chargeable)`, low: Math.round(lane.airKg[0] * kg), high: Math.round(lane.airKg[1] * kg), days: lane.days.Air });
  else quotes.push({ provider: 'Built-in estimate', service: `Express courier ${kg} kg`, low: Math.round(lane.expressKg[0] * kg), high: Math.round(lane.expressKg[1] * kg), days: lane.days.Express });
  const fees = destinationFees(dest, mode, value, lane);
  json(res, 200, { dest, mode, origin, quotes, fees, live: Object.entries(integrationStatus().rates).filter(([k, v]) => v === true && k !== 'builtin').map(([k]) => k), note: 'Built-in figures are market ranges for planning. Connect a rate API in .env for bookable quotes.' });
}
function destinationFees(dest, mode, value, lane) {
  const f = [];
  if (dest === 'US') { f.push(['Merchandise Processing Fee (0.3464%, min $32.71 / max $634.62)', Math.min(Math.max(value * 0.003464, 32.71), 634.62)]); if (mode === 'Ocean') f.push(['Harbor Maintenance Fee (0.125%)', value * 0.00125], ['ISF filing', 45]); f.push(['Customs broker entry', 150], ['Continuous bond (annual, prorated)', 45]); }
  if (dest === 'CA') { f.push(['Broker release + B3 accounting', 85], ['CARM RPP security (annual, prorated)', 40], ['GST 5% on duty-paid value (recoverable if registered)', value * 0.05]); }
  if (dest === 'EU') { f.push(['Customs declaration (broker)', 95], ['Import VAT (~19–21%, recoverable if registered)', value * 0.2], ['ICS2 ENS filing', 25]); }
  if (dest === 'UK') { f.push(['Customs declaration (broker)', 60], ['Import VAT 20% (recoverable if registered)', value * 0.2]); }
  if (mode === 'Ocean') f.push(['Destination terminal handling (THC)', lane.thc]); f.push(['Documentation / D.O. fee', lane.docs]);
  return f.map(([label, amount]) => ({ label, amount: Math.round(amount) }));
}

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
