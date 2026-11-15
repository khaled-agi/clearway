/**
 * ClearWay knowledge base — official datasets per market, ingested to data/kb/ and searchable offline.
 * Zero dependencies. Run `npm run ingest` (all) or `npm run ingest -- us uk` to download.
 *
 * Honest scope: tariff schedules and border measures are machine-readable; most product-safety law is
 * text. We ingest what is machine-readable, link what is text, and let assessments (model + web search)
 * and broker review cover the rest. Each source below says which.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KB = path.join(__dirname, '..', 'data', 'kb');
fs.mkdirSync(KB, { recursive: true });

/* ---------- source registry: what exists, where, and how we use it ---------- */
const SOURCES = [
  // United States
  { market: 'US', id: 'us-hts', name: 'Harmonized Tariff Schedule (USITC)', type: 'dataset', format: 'JSON', cadence: 'revisions several times a year', url: 'https://hts.usitc.gov/', ingest: 'auto', use: 'Offline code search, duty rates, chapter notes; live API when online.' },
  { market: 'US', id: 'us-pga', name: 'ACE Appendix PGA — HTS to agency flag table (CBP)', type: 'dataset', format: 'XLSX → CSV', cadence: 'monthly-ish', url: 'https://www.cbp.gov/trade/ace/catair', ingest: 'manual', file: 'us-pga-flags.csv', use: 'Which agency (FDA, FCC, CPSC, EPA, APHIS…) flags each HTS line — the official "does an agency care?" answer.' },
  { market: 'US', id: 'us-cross', name: 'CBP CROSS rulings', type: 'api', url: 'https://rulings.cbp.gov/', ingest: 'live', use: 'Classification precedents, searched live.' },
  { market: 'US', id: 'us-adcvd', name: 'AD/CVD orders (Commerce / CBP ADCVD Search)', type: 'dataset', format: 'web', url: 'https://aceservices.cbp.dhs.gov/adcvdweb', ingest: 'link', use: 'Antidumping / countervailing duty scope checks.' },
  { market: 'US', id: 'us-ecfr', name: 'eCFR (16 CFR CPSC, 21 CFR FDA, 47 CFR FCC, 40 CFR EPA, 49 CFR DOT)', type: 'api', url: 'https://www.ecfr.gov/developers/documentation/api/v1', ingest: 'live', use: 'Regulation text by citation; assessments cite into it.' },
  { market: 'US', id: 'us-fda-codes', name: 'FDA Product Code Builder / Classification databases', type: 'dataset', url: 'https://www.accessdata.fda.gov/scripts/ora/pcb/', ingest: 'link', use: 'FDA product codes for entry lines.' },
  { market: 'US', id: 'us-cpsc', name: 'CPSC regulations & business guidance; Regulatory Robot', type: 'text', url: 'https://www.cpsc.gov/Business--Manufacturing/Business-Education/Regulatory-Robot/Safer-Products-Start-Here', ingest: 'link', use: 'Children\'s and consumer product rules.' },
  // Canada
  { market: 'CA', id: 'ca-tariff', name: 'Customs Tariff schedule (CBSA)', type: 'dataset', format: 'HTML/PDF (CSV via Open Government)', cadence: 'annual + amendments', url: 'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/menu-eng.html', ingest: 'manual', file: 'ca-tariff.csv', use: 'Tariff items, MFN and preferential rates.' },
  { market: 'CA', id: 'ca-ogd', name: 'Other Government Department requirements by commodity (CBSA D19 series, Single Window)', type: 'text', url: 'https://www.cbsa-asfc.gc.ca/publications/dm-md/d19-eng.html', ingest: 'link', use: 'Which department (Health Canada, CFIA, ISED, NRCan, Transport) regulates a commodity at import.' },
  { market: 'CA', id: 'ca-airs', name: 'CFIA Automated Import Reference System (AIRS)', type: 'api', url: 'https://airs-sari.inspection.gc.ca/', ingest: 'link', use: 'Food, plant and animal import conditions by HS code.' },
  { market: 'CA', id: 'ca-ccpsa', name: 'Canada Consumer Product Safety Act regulations (Justice Laws)', type: 'text', url: 'https://laws-lois.justice.gc.ca/eng/acts/C-1.68/', ingest: 'link', use: 'Toys, textiles flammability, phthalates, lead, cribs, etc.' },
  { market: 'CA', id: 'ca-cpla', name: 'Consumer Packaging and Labelling Act + Quebec Charter of the French Language', type: 'text', url: 'https://ised-isde.canada.ca/site/competition-bureau-canada/en/how-we-foster-competition/education-and-outreach/guide-consumer-packaging-and-labelling-act-and-regulations', ingest: 'link', use: 'Bilingual labelling, metric quantities, dealer identity.' },
  // European Union
  { market: 'EU', id: 'eu-taric', name: 'TARIC (DG TAXUD) — nomenclature, duties, measures, document conditions', type: 'dataset', format: 'XML (daily deltas; registration for bulk) / web', cadence: 'daily', url: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp', ingest: 'manual', file: 'eu-taric-measures.csv', use: 'The authoritative EU import conditions by CN code. Until bulk access is set up, UK measures are used as an approximation.' },
  { market: 'EU', id: 'eu-a2m', name: 'Access2Markets (My Trade Assistant)', type: 'web', url: 'https://trade.ec.europa.eu/access-to-markets/en/home', ingest: 'link', use: 'Per-product import requirements, VAT, procedures per member state.' },
  { market: 'EU', id: 'eu-legislation', name: 'EUR-Lex (directives/regulations) + harmonised standards (OJEU lists)', type: 'text', url: 'https://eur-lex.europa.eu/', ingest: 'link', use: 'Legal basis for CE directives, GPSR, REACH, RoHS, WEEE, PPWR, EUDR, CBAM.' },
  { market: 'EU', id: 'eu-echa', name: 'ECHA: REACH restrictions, SVHC candidate list, SCIP', type: 'dataset', format: 'XLSX/CSV', url: 'https://echa.europa.eu/candidate-list-table', ingest: 'link', use: 'Substance restrictions and notification duties.' },
  { market: 'EU', id: 'eu-safety-gate', name: 'Safety Gate (RAPEX) alerts', type: 'api', url: 'https://ec.europa.eu/safety-gate-alerts/screen/webReport', ingest: 'link', use: 'What is being recalled — early warning by product type.' },
  // United Kingdom
  { market: 'UK', id: 'uk-tariff', name: 'UK Trade Tariff (HMRC) — commodities, duties, import measures & document conditions', type: 'api', format: 'JSON', cadence: 'daily', url: 'https://www.trade-tariff.service.gov.uk/', ingest: 'auto', use: 'Live measures/conditions; offline nomenclature after ingest.' },
  { market: 'UK', id: 'uk-legislation', name: 'legislation.gov.uk + OPSS product safety guidance', type: 'text', url: 'https://www.gov.uk/guidance/product-safety-for-businesses-a-to-z-of-industry-guidance', ingest: 'link', use: 'UK product regulations after Brexit.' },
  // China (as destination)
  { market: 'CN', id: 'cn-tariff', name: 'China Import & Export Tariff (GACC) — 10-digit HS + CIQ codes', type: 'dataset', format: 'PDF / web query (no public bulk)', url: 'http://english.customs.gov.cn/', ingest: 'manual', file: 'cn-tariff.csv', use: 'Duty, VAT, consumption tax, inspection flags.' },
  { market: 'CN', id: 'cn-ccc', name: 'CCC catalogue (CNCA)', type: 'text', url: 'https://www.cnca.gov.cn/', ingest: 'link', use: 'Products requiring China Compulsory Certification.' },
  { market: 'CN', id: 'cn-gb', name: 'GB standards (SAC) — labelling and safety', type: 'text', url: 'https://openstd.samr.gov.cn/', ingest: 'link', use: 'GB 5296, GB 7718, GB 18401, GB 4806 etc.' },
  { market: 'CN', id: 'cn-gacc-food', name: 'GACC Decree 248/249 registration (Single Window)', type: 'web', url: 'https://www.singlewindow.cn/', ingest: 'link', use: 'Overseas food facility registration status.' },
  { market: 'CN', id: 'cn-nmpa', name: 'NMPA registration databases (cosmetics, devices)', type: 'web', url: 'https://www.nmpa.gov.cn/', ingest: 'link', use: 'Registration status lookups.' },
];

/* ---------- ingestion ---------- */
const INGEST = {
  async us() {
    // USITC full schedule export (current release)
    const url = 'https://hts.usitc.gov/reststop/file?release=currentRelease&format=JSON';
    const r = await fetch(url, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error('USITC ' + r.status);
    const rows = await r.json();
    const slim = (Array.isArray(rows) ? rows : []).filter(x => x.htsno).map(x => ({ code: x.htsno, indent: x.indent, description: x.description, general: x.general, special: x.special, other: x.other, units: x.units, footnotes: (x.footnotes || []).map(f => f.value || f).slice(0, 3) }));
    fs.writeFileSync(path.join(KB, 'us-hts.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), source: url, rows: slim }));
    return { rows: slim.length };
  },
  async uk() {
    // UK nomenclature by chapter (97 calls), descriptions + codes; measures stay live per commodity
    const out = []; let fetched = 0;
    for (let ch = 1; ch <= 97; ch++) {
      const c = String(ch).padStart(2, '0');
      try { const r = await fetch(`https://www.trade-tariff.service.gov.uk/api/v2/goods_nomenclatures/chapter/${c}`, { headers: { accept: 'application/json' } }); if (!r.ok) continue; const j = await r.json(); (j.data || []).forEach(d => { const a = d.attributes || {}; out.push({ code: a.goods_nomenclature_item_id, suffix: a.producline_suffix, indent: a.number_indents, description: (a.formatted_description || a.description || '').replace(/<[^>]+>/g, ''), href: a.href }); }); fetched++; } catch (e) { /* skip chapter */ }
    }
    fs.writeFileSync(path.join(KB, 'uk-nomenclature.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), chapters: fetched, rows: out }));
    return { rows: out.length, chapters: fetched };
  },
  async eu() { return { note: 'EU TARIC bulk requires registration for the data dissemination service; place an export as data/kb/eu-taric-measures.csv (columns: cn_code, measure_type, geo_area, duty, condition_code, requirement). UK nomenclature is used as an approximation meanwhile.' }; },
  async ca() { return { note: 'CBSA publishes the schedule as HTML/PDF; export to data/kb/ca-tariff.csv (columns: tariff_item, description, uom, mfn, preferential).' }; },
  async cn() { return { note: 'No public bulk export of the GACC tariff; place data/kb/cn-tariff.csv (columns: hs_code, ciq, description, mfn, vat, consumption_tax, inspection).' }; },
};

/* ---------- local datasets ---------- */
let cache = {};
function loadLocal(name) { if (cache[name] !== undefined) return cache[name]; const f = path.join(KB, name); cache[name] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; return cache[name]; }
function csvRows(name) { const f = path.join(KB, name); if (!fs.existsSync(f)) return null; const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean); const head = lines.shift().split(',').map(h => h.trim().toLowerCase()); return lines.map(l => { const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')); return Object.fromEntries(head.map((h, i) => [h, cells[i] || ''])); }); }
function localSearch(dest, q, code) {
  q = (q || '').toLowerCase(); code = (code || '').replace(/[^0-9]/g, '');
  const match = (c, d) => (code && String(c || '').replace(/[^0-9]/g, '').startsWith(code.slice(0, 6))) || (q && String(d || '').toLowerCase().includes(q));
  if (dest === 'US') { const d = loadLocal('us-hts.json'); if (!d) return null; return { source: 'USITC HTS (local copy, ' + d.fetchedAt.slice(0, 10) + ')', hits: d.rows.filter(r => match(r.code, r.description)).slice(0, 15) }; }
  if (dest === 'UK' || dest === 'EU') { const d = loadLocal('uk-nomenclature.json'); if (!d) return null; return { source: 'UK Trade Tariff nomenclature (local copy, ' + d.fetchedAt.slice(0, 10) + ')' + (dest === 'EU' ? ' — EU approximation' : ''), hits: d.rows.filter(r => match(r.code, r.description)).slice(0, 15).map(r => ({ code: r.code, description: r.description, general: '' })) }; }
  if (dest === 'CA') { const rows = csvRows('ca-tariff.csv'); if (!rows) return null; return { source: 'CBSA Customs Tariff (local CSV)', hits: rows.filter(r => match(r.tariff_item, r.description)).slice(0, 15).map(r => ({ code: r.tariff_item, description: r.description, general: r.mfn })) }; }
  if (dest === 'CN') { const rows = csvRows('cn-tariff.csv'); if (!rows) return null; return { source: 'GACC tariff (local CSV)', hits: rows.filter(r => match(r.hs_code, r.description)).slice(0, 15).map(r => ({ code: r.hs_code, description: r.description, general: r.mfn, other: 'VAT ' + r.vat })) }; }
  return null;
}
function pgaFlags(code) { const rows = csvRows('us-pga-flags.csv'); if (!rows) return null; const c = (code || '').replace(/[^0-9]/g, ''); return rows.filter(r => c && String(r.hts || r.hts_number || r.htsno || '').replace(/[^0-9]/g, '').startsWith(c.slice(0, 8))).slice(0, 20); }
function status() {
  const files = fs.existsSync(KB) ? fs.readdirSync(KB) : [];
  const info = f => { const p = path.join(KB, f); const st = fs.statSync(p); let rows = null, fetchedAt = null; try { if (f.endsWith('.json')) { const j = JSON.parse(fs.readFileSync(p, 'utf8')); rows = (j.rows || []).length; fetchedAt = j.fetchedAt; } else rows = fs.readFileSync(p, 'utf8').split(/\r?\n/).length - 1; } catch { } return { file: f, bytes: st.size, rows, fetchedAt: fetchedAt || st.mtime.toISOString() }; };
  return { dir: KB, datasets: files.map(info), sources: SOURCES };
}
module.exports = { SOURCES, INGEST, localSearch, pgaFlags, status, KB };

/* CLI: node server/knowledge.js [us uk eu ca cn] */
if (require.main === module) {
  const which = process.argv.slice(2).filter(a => INGEST[a]); const list = which.length ? which : Object.keys(INGEST);
  (async () => { for (const k of list) { process.stdout.write(`Ingesting ${k.toUpperCase()}… `); try { const r = await INGEST[k](); console.log(JSON.stringify(r)); } catch (e) { console.log('FAILED: ' + e.message); } } })();
}
