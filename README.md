# ClearWay

**Know before you ship.** ClearWay is a shipment-readiness dashboard for small and mid-size importers and their suppliers. Upload the commercial invoice, packing list and bill of lading for a shipment and ClearWay:

1. **Extracts** the key fields from each document (with Claude, reading the real PDF/image/CSV),
2. **Cross-checks** them against each other — quantity, weight, description, consignee, HS code, Incoterm, value — and highlights every mismatch (the #1 cause of customs holds),
3. **Flags regulatory requirements** for the destination market from the product description (FCC, CPSC/CPC, FDA/MoCRA, lithium batteries, GPSR Responsible Person, CE/WEEE, UKCA, Lacey, origin marking, ISF…),
4. **Suggests a tariff classification** with a rationale and confidence,
5. Produces a **Readiness score** with a list of blockers and the fix for each, and plots every shipment on a risk map so the ones most likely to be held stand out.

It is built for the moment *before booking*, when problems are cheap to fix — not after the container is at the port.

![dashboard](docs/screenshot.png)

## Quick start

Requires Node 18+. No dependencies to install.

```bash
git clone https://github.com/khaled-agi/clearway.git
cd clearway
cp .env.example .env        # add ANTHROPIC_API_KEY to enable real extraction
npm start                   # http://localhost:3000
```

Without an API key the app runs in **simulated mode**: the whole UI works, extraction results are generated from your product description so you can demo the flow. With `ANTHROPIC_API_KEY` set, uploads are sent to your own server, which asks Claude to read the documents and return structured fields plus a classification.

Try it with the files in `samples/` (they contain deliberate mismatches: 1,200 vs 1,150 units, 594 vs 580 kg, two different HS codes, a trailing dot on the consignee).

## How it works

```
browser (public/)                      server (server/server.js)              Anthropic API
───────────────────                    ─────────────────────────              ─────────────
New shipment wizard
  ├─ describe goods, destination, mode
  ├─ drop invoice / packing list / BL ──▶ POST /api/analyze ──────────────────▶ Claude reads the
  │                                        (base64 docs + context)               documents, returns
  │◀──────────────────────────────────── { ex:{inv,pl,bl}, classification } ◀── JSON fields
  ├─ three-way comparison (rules.js)   ── mismatches, missing fields
  ├─ regulatory checklist (rules.js)   ── derived from description + market
  └─ readiness score ──▶ dashboard table + risk map + shipment drawer
```

- `public/index.html`, `styles.css`, `app.js` — the dashboard, wizard and shipment drawer. Vanilla JS, no build step.
- `public/rules.js` — the rules engine (classification keywords, regulatory requirements per market, document field comparison). Shared by browser and server.
- `server/server.js` — static file server + `/api/analyze`. Zero dependencies.
- `samples/` — example documents with known discrepancies.

### API

`POST /api/analyze`

```json
{ "desc": "Bluetooth kitchen scale, 1200 units", "dest": "US", "mode": "Ocean",
  "docs": { "inv": [{ "name": "ci.pdf", "type": "application/pdf", "data": "<base64>" }],
            "pl":  [ … ], "bl": [ … ], "certs": [ … ], "art": [ … ] } }
```

Returns `{ simulated: false, ex: { inv, pl, bl }, classification: { code, text, why, duty, conf }, certificates: [], notes: [] }`, or `{ simulated: true }` when no key is configured. Supported inputs: PDF, PNG/JPG/WebP, CSV/TXT. (XLSX/DOCX: export to PDF or CSV first — on the roadmap.)

`GET /api/health` → `{ ok, live, model }`

## What is real and what is a prototype

| Piece | Status |
|---|---|
| Document extraction | Real when an API key is set (Claude reads the files). Simulated otherwise. |
| Three-way cross-check | Real logic, runs on whatever was extracted. |
| Regulatory checklist | Keyword rules in `rules.js` — a starting point, **not legal advice**. Needs a maintained rules table per market. |
| HS classification | Claude's suggestion when live; keyword lookup otherwise. Production should call the HTS/TARIC schedule + CBP CROSS / BTI rulings and keep a broker in the loop. |
| Readiness score, risk map, KPIs | Real, computed from blockers. The dollar exposure is a rough heuristic. |
| Seed shipments | Demo data in `app.js`. |
| Persistence, auth, supplier portal, broker sharing | Not yet — see roadmap. |

## Roadmap

- [ ] Persist shipments and SKU records (SQLite) so a product is classified once and every shipment inherits it
- [ ] Supplier intake link (zh-CN) — factory fills in facts once; invoice/packing list/label spec generated from the record
- [ ] Live tariff data: USITC HTS API, EU TARIC, UK Trade Tariff; CBP CROSS ruling links; per-SKU change alerts
- [ ] Certificate verification (lab accreditation, report number lookup)
- [ ] Broker/forwarder read-only share links and fix requests
- [ ] XLSX/DOCX input, multi-page scans
- [ ] EU-specific checks: ICS2 ENS, IOSS, packaging EPR registration

## Disclaimer

ClearWay helps you prepare; it does not replace a licensed customs broker. Rules change often. Verify classification and regulatory requirements with your broker before filing.

## License

MIT
