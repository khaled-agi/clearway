/**
 * ClearWay model layer — one interface over Claude (cloud) and local models.
 *
 *   LLM_PROVIDER=anthropic   Claude via ANTHROPIC_API_KEY (supports web search for assessments)
 *   LLM_PROVIDER=ollama      Local model via Ollama (http://localhost:11434), e.g. qwen2.5:14b
 *   LLM_PROVIDER=groq        Groq cloud (fast, free tier) via GROQ_API_KEY — OpenAI-compatible
 *   LLM_PROVIDER=openai      Any OpenAI-compatible server: LM Studio, llama.cpp server, vLLM, LocalAI
 *   LLM_PROVIDER=none        No model: the app runs on built-in rules and simulation
 * If LLM_PROVIDER is unset: anthropic, groq, ollama, openai — whichever is configured first — else none.
 *
 * complete({ system, content, maxTokens, json, fast, webSearch }) → { text, sources, searched, provider, model }
 *   content: array of blocks — {type:'text',text} | {type:'image',media_type,data} | {type:'pdf',data,name}
 * Local models never leave your machine; they also cannot search the web, so assessments made with them
 * are labelled "model knowledge only".
 */
'use strict';
const zlib = require('zlib');

function config() {
  const e = process.env;
  let provider = (e.LLM_PROVIDER || '').toLowerCase();
  if (!provider) provider = e.ANTHROPIC_API_KEY ? 'anthropic' : e.GROQ_API_KEY ? 'groq' : e.OLLAMA_MODEL ? 'ollama' : e.OPENAI_MODEL ? 'openai' : 'none';
  const c = { provider };
  if (provider === 'anthropic') Object.assign(c, { key: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL || 'claude-sonnet-5-5', fastModel: e.ANTHROPIC_FAST_MODEL || 'claude-haiku-5-5', vision: true, pdf: true, web: true, local: false });
  if (provider === 'ollama') Object.assign(c, { url: (e.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''), model: e.OLLAMA_MODEL || 'qwen2.5:7b', fastModel: e.OLLAMA_FAST_MODEL || e.OLLAMA_MODEL || 'qwen2.5:7b', visionModel: e.OLLAMA_VISION_MODEL || '', vision: !!e.OLLAMA_VISION_MODEL, pdf: false, web: false, local: true });
  if (provider === 'openai') { const url = (e.OPENAI_BASE_URL || 'http://localhost:1234/v1').replace(/\/$/, ''); Object.assign(c, { url, key: e.OPENAI_API_KEY || 'local', model: e.OPENAI_MODEL || 'local-model', fastModel: e.OPENAI_FAST_MODEL || e.OPENAI_MODEL || 'local-model', visionModel: e.OPENAI_VISION_MODEL || '', vision: !!e.OPENAI_VISION_MODEL, pdf: false, web: false, local: /\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/.test(url) }); }
  if (provider === 'groq') Object.assign(c, { url: process.env.GROQ_URL || 'https://api.groq.com/openai/v1', key: e.GROQ_API_KEY || '', model: e.GROQ_MODEL || 'openai/gpt-oss-120b', fastModel: e.GROQ_FAST_MODEL || 'openai/gpt-oss-20b', visionModel: e.GROQ_VISION_MODEL || '', vision: !!e.GROQ_VISION_MODEL, pdf: false, web: false, local: false, label: 'Groq' });
  if (provider === 'none') Object.assign(c, { model: null, local: false });
  return c;
}
const enabled = () => config().provider !== 'none';

/* ---------- best-effort PDF text (for local models, which cannot read PDF bytes) ---------- */
function pdfText(b64) {
  try {
    const buf = Buffer.from(b64, 'base64'); const bin = buf.toString('latin1'); const out = [];
    const re = /<<([\s\S]*?)>>\s*stream\r?\n/g; let m;
    while ((m = re.exec(bin))) {
      const start = m.index + m[0].length; const end = bin.indexOf('endstream', start); if (end < 0) break;
      let data = buf.subarray(start, end);
      if (/FlateDecode/.test(m[1])) { try { data = zlib.inflateSync(data); } catch { try { data = zlib.inflateRawSync(data); } catch { continue; } } }
      const s = data.toString('latin1'); if (!/\bBT\b/.test(s)) continue;
      const lines = []; const tj = /(\[(?:[^\]]*)\]\s*TJ|\((?:\\.|[^\\)])*\)\s*Tj|T\*|Td|TD|Tm)/g; let t; let line = '';
      while ((t = tj.exec(s))) {
        const tok = t[0];
        if (/^(T\*|Td|TD|Tm)$/.test(tok)) { if (line.trim()) lines.push(line.trim()); line = ''; continue; }
        const parts = tok.match(/\((?:\\.|[^\\)])*\)/g) || [];
        line += parts.map(p => p.slice(1, -1).replace(/\\n/g, ' ').replace(/\\([()\\])/g, '$1').replace(/\\\d{3}/g, ' ')).join('');
      }
      if (line.trim()) lines.push(line.trim());
      out.push(lines.join('\n'));
    }
    const text = out.join('\n').replace(/[^\x09\x0a\x20-\x7e -￿]/g, '').trim();
    return text.length > 20 ? text : '';
  } catch { return ''; }
}

/* ---------- providers ---------- */
async function anthropic(c, { system, content, maxTokens, fast, webSearch }) {
  const blocks = content.map(b => b.type === 'text' ? { type: 'text', text: b.text } : b.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: b.media_type, data: b.data } } : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b.data } });
  const body = { model: fast ? c.fastModel : c.model, max_tokens: maxTokens || 2000, temperature: 0, system, messages: [{ role: 'user', content: blocks }] };
  if (webSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }];
  const call = () => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  let r = await call();
  if (!r.ok && r.status === 400 && body.tools) { delete body.tools; r = await call(); }
  if (!r.ok) throw new Error(`Claude request failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const text = (data.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
  const sources = []; (data.content || []).forEach(x => { if (x.type === 'web_search_tool_result' && Array.isArray(x.content)) x.content.forEach(y => y.url && sources.push({ title: y.title || y.url, url: y.url })); (x.citations || []).forEach(ci => ci.url && sources.push({ title: ci.title || ci.url, url: ci.url })); });
  return { text, sources, searched: !!body.tools, model: body.model };
}
function flattenForLocal(c, content) {
  const texts = [], images = [], notes = [];
  for (const b of content) {
    if (b.type === 'text') texts.push(b.text);
    else if (b.type === 'pdf') { const t = pdfText(b.data); if (t) texts.push(`[Text extracted from PDF ${b.name || ''}]\n${t.slice(0, 40000)}`); else notes.push(`${b.name || 'PDF'}: no extractable text (scanned?) — export as CSV/TXT or an image${c.vision ? '' : ' and configure a vision model'}`); }
    else if (b.type === 'image') { if (c.vision) images.push(b.data); else notes.push('image skipped — set OLLAMA_VISION_MODEL / OPENAI_VISION_MODEL to read images'); }
  }
  return { text: texts.join('\n\n'), images, notes };
}
async function ollama(c, { system, content, maxTokens, json, fast }) {
  const { text, images, notes } = flattenForLocal(c, content);
  const model = images.length ? c.visionModel : (fast ? c.fastModel : c.model);
  const body = { model, stream: false, options: { temperature: 0, num_predict: maxTokens || 2000, num_ctx: 16384 }, messages: [{ role: 'system', content: system || '' }, { role: 'user', content: text, ...(images.length ? { images } : {}) }] };
  if (json) body.format = 'json';
  let r; try { r = await fetch(c.url + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (e) { throw new Error(`Cannot reach Ollama at ${c.url} — is it running? (ollama serve)`); }
  if (!r.ok) { const t = await r.text(); throw new Error(/not found/i.test(t) ? `Model "${model}" is not pulled — run: ollama pull ${model}` : `Ollama error ${r.status}: ${t.slice(0, 200)}`); }
  const data = await r.json();
  return { text: (data.message && data.message.content) || '', sources: [], searched: false, model, notes };
}
async function openai(c, { system, content, maxTokens, json, fast }) {
  const { text, images, notes } = flattenForLocal(c, content);
  const model = images.length ? c.visionModel : (fast ? c.fastModel : c.model);
  const user = images.length ? [{ type: 'text', text }, ...images.map(d => ({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + d } }))] : text;
  const reasoning = /gpt-oss/i.test(model);
  // reasoning models spend tokens thinking before answering: give them headroom
  const body = { model, temperature: reasoning ? 1 : 0, max_tokens: (maxTokens || 2000) * (reasoning ? 2 : 1), messages: [{ role: 'system', content: system || '' }, { role: 'user', content: user }] };
  if (json) body.response_format = { type: 'json_object' };
  if (reasoning) body.reasoning_effort = fast ? 'low' : 'medium';
  const send = () => fetch(c.url + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key }, body: JSON.stringify(body) });
  let r; try { r = await send(); } catch (e) { throw new Error(c.provider === 'groq' ? 'Cannot reach Groq — check your internet connection' : `Cannot reach the model server at ${c.url}`); }
  if (r.status === 400 && (body.response_format || body.reasoning_effort)) { delete body.response_format; delete body.reasoning_effort; r = await send(); }
  if (r.status === 401) throw new Error(`${c.label || 'Model server'} rejected the API key — check ${c.provider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'} in .env`);
  if (r.status === 429) throw new Error(`${c.label || 'Model server'} rate limit reached (free tiers have per-minute limits) — wait a moment and retry`);
  if (r.status === 404) throw new Error(`Model "${model}" is not available — pick one from ${c.provider === 'groq' ? 'console.groq.com/docs/models' : c.url + '/models'}`);
  if (!r.ok) throw new Error(`${c.label || 'Model server'} error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return { text: (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '', sources: [], searched: false, model, notes };
}

async function complete(opts) {
  const c = config();
  if (c.provider === 'none') throw new Error('No model configured');
  const fn = { anthropic, ollama, openai, groq: openai }[c.provider];
  const r = await fn(c, { ...opts, content: opts.content || [{ type: 'text', text: opts.user || '' }] });
  return { ...r, provider: c.provider, local: c.local };
}

/* health: is the configured model reachable, and is the model pulled? */
async function health() {
  const c = config();
  const base = { provider: c.provider, model: c.model || null, local: !!c.local, vision: !!c.vision, web: !!c.web };
  if (c.provider === 'none') return { ...base, live: false };
  if (c.provider === 'anthropic') return { ...base, live: !!c.key };
  try {
    if (c.provider === 'ollama') {
      const r = await fetch(c.url + '/api/tags', { signal: AbortSignal.timeout(2500) }); const j = await r.json();
      const names = (j.models || []).map(m => m.name); const has = n => names.some(x => x === n || x.split(':')[0] === n.split(':')[0] && (n.includes(':') ? x === n : true));
      return { ...base, live: has(c.model), reachable: true, installed: names, missing: [c.model, c.visionModel].filter(Boolean).filter(n => !has(n)) };
    }
    if (c.provider === 'groq' && !c.key) return { ...base, live: false, error: 'GROQ_API_KEY is empty — create one at console.groq.com/keys' };
    const r = await fetch(c.url + '/models', { headers: { authorization: 'Bearer ' + c.key }, signal: AbortSignal.timeout(4000) });
    if (r.status === 401) return { ...base, live: false, reachable: true, error: `${c.label || 'Server'} rejected the API key` };
    const j = await r.json(); const ids = (j.data || []).map(m => m.id);
    const missing = [c.model, c.fastModel, c.visionModel].filter(Boolean).filter(n => ids.length && !ids.includes(n));
    return { ...base, live: r.ok && !missing.includes(c.model), reachable: true, installed: ids, missing, error: missing.length ? `Not offered by ${c.label || 'the server'}: ${missing.join(', ')} — available: ${ids.filter(x => !/whisper|guard|tts|orpheus/i.test(x)).slice(0, 8).join(', ')}` : undefined };
  } catch (e) { return { ...base, live: false, reachable: false, error: c.provider === 'ollama' ? `Ollama not reachable at ${c.url}` : c.provider === 'groq' ? 'Groq not reachable — check your internet connection' : `Model server not reachable at ${c.url}` }; }
}

module.exports = { config, enabled, complete, health, pdfText };
