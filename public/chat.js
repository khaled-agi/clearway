/* ClearWay — Ask ClearWay: chat-first front door that drives everything else.
   Works offline with a rule-based intent parser; uses the model via /api/chat when a key is configured. */
'use strict';

/* ---------------- filing guide: official forms, who submits, where ---------------- */
const FILING={
  US:[
    {form:'ISF 10+2 (Importer Security Filing)',when:'24 h before the container is loaded (ocean only)',who:'Your customs broker, or you via an ACE account',portal:'https://ace.cbp.gov/',portalName:'CBP ACE Secure Data Portal',fields:['Seller','Buyer','Importer of record no. (EIN)','Consignee no.','Manufacturer name + address','Ship-to party','Country of origin','HTSUS (6+)','Container stuffing location','Consolidator','Bill of lading no.'],mode:'Ocean'},
    {form:'CBP Form 7501 — Entry Summary',when:'Within 10 working days of release (usually filed with entry)',who:'Licensed customs broker (or self-filer in ACE)',portal:'https://www.cbp.gov/document/forms/form-7501-entry-summary',portalName:'CBP Form 7501 + instructions',fields:['Entry type (01 consumption)','Importer no. + bond','Port of entry','Country of origin / export','HTSUS per line','Entered value','Duty, MPF, HMF','Manufacturer ID (MID)','AD/CVD case no. if any']},
    {form:'FDA Prior Notice (food) / FDA product code on entry lines',when:'Before arrival (2–8 h depending on mode) for food; at entry for other FDA goods',who:'Broker via ACE/PGA message set, or you via PNSI',portal:'https://www.access.fda.gov/',portalName:'FDA Prior Notice System Interface',fields:['FDA product code','Manufacturer FEI/registration','Shipper','Country of production','Quantity'],attrs:['food','cosmetic','foodContact','medical']},
    {form:'CPSC eFiling of Certificate of Conformity (CPC/GCC)',when:'At entry — mandatory eFiling since July 2026 for most regulated consumer products',who:'Broker files the certificate data in ACE; you register in the CPSC Product Registry',portal:'https://www.cpsc.gov/eFiling',portalName:'CPSC eFiling / Product Registry',fields:['Product identification','Citation of each rule tested','Importer name/address','Date & place of manufacture','Test lab name/address/date'],attrs:['children','consumer']},
    {form:'FCC / EPA / APHIS / FWS declarations',when:'At entry (PGA message set)',who:'Broker, from documents you supply',portal:'https://www.cbp.gov/trade/ace/features',portalName:'ACE PGA message set',fields:['FCC: equipment authorization info','EPA: TSCA certification','APHIS: Lacey Act PPQ 505','FWS: Form 3-177'],attrs:['radio','electrical','chemical','wood','textile']},
  ],
  CA:[
    {form:'CARM — Commercial Accounting Declaration (CAD) (replaced the B3)',when:'Before release (RPP) or at accounting',who:'Your broker, or you via the CARM Client Portal',portal:'https://ccp-pcc.cbsa-asfc.cloud-nuage.canada.ca/',portalName:'CARM Client Portal',fields:['BN15 importer no.','Tariff classification (10-digit)','Tariff treatment (02 MFN)','Country of origin','Value for duty + currency','Place of export','Cargo control no.','GST']},
    {form:'Canada Customs Invoice (CCI) data',when:'With entry when value > CAD 3,300',who:'Exporter/importer provides; broker files',portal:'https://www.cbsa-asfc.gc.ca/publications/forms-formulaires/ci1-eng.html',portalName:'CBSA CI1 form',fields:['Vendor','Purchaser','Consignee','Country of transhipment','Conditions of sale / terms of payment','Currency','Weights','Packaging & marks']},
    {form:'CFIA AIRS / Safe Food for Canadians licence',when:'Before import of food, plants, animals',who:'Importer (licence); broker references it',portal:'https://inspection.canada.ca/en/importing-food-plants-animals',portalName:'CFIA import portal (My CFIA)',fields:['SFC licence no.','HS code → AIRS requirements','Origin','End use'],attrs:['food','wood']},
    {form:'Health Canada / ISED / NRCan declarations',when:'Documents kept on file; some via Single Window IID',who:'Importer keeps; broker declares',portal:'https://www.cbsa-asfc.gc.ca/prog/sw-gu/menu-eng.html',portalName:'CBSA Single Window',fields:['Cosmetic Notification no.','ISED cert no.','Energy efficiency report no.'],attrs:['cosmetic','radio','electrical']},
  ],
  EU:[
    {form:'Import declaration (customs declaration / SAD data) in the member state\'s system',when:'At arrival (or pre-lodged)',who:'Customs representative/broker in that member state (DE: ATLAS, NL: DMS, FR: DELTA)',portal:'https://taxation-customs.ec.europa.eu/customs-4/customs-procedures-import-and-export-0_en',portalName:'DG TAXUD — import procedures',fields:['Importer EORI','Procedure 40 00','CN/TARIC code','Customs value (CIF) + currency','Origin / dispatch','Preference 100','VAT treatment (import VAT / Article 23 / IOSS)','Document codes required by TARIC conditions']},
    {form:'ICS2 Entry Summary Declaration (ENS)',when:'Before loading (air pre-loading) / before arrival (sea)',who:'Carrier / forwarder, from your goods description + HS',portal:'https://taxation-customs.ec.europa.eu/customs-4/customs-security/import-control-system-2-ics2-0_en',portalName:'ICS2',fields:['6-digit HS','Precise goods description','Seller/buyer EORI','Consignee']},
    {form:'EORI registration + VAT / IOSS',when:'Before first import',who:'You, with the national customs/tax authority',portal:'https://taxation-customs.ec.europa.eu/customs-4/customs-procedures-import-and-export-0/customs-procedures/economic-operators-registration-and-identification-number-eori_en',portalName:'EORI (national registration links)',fields:['Legal entity','VAT no.','Fiscal representative if non-EU']},
    {form:'Product registrations before sale: EPREL, WEEE, packaging EPR, SCIP, CPNP',when:'Before placing on the market',who:'Importer / EU Responsible Person',portal:'https://eprel.ec.europa.eu/',portalName:'EPREL (and national registers)',fields:['Energy label data','Producer registration no.','Packaging volumes','SVHC notifications','Cosmetic notification'],attrs:['electrical','consumer','cosmetic']},
  ],
  UK:[
    {form:'CDS import declaration',when:'At arrival (or pre-lodged, GVMS for RoRo)',who:'Broker/fast-parcel operator or you via CDS-compatible software',portal:'https://www.gov.uk/guidance/making-a-full-import-declaration',portalName:'HMRC CDS guidance',fields:['GB EORI','Commodity code (10-digit)','Customs value + currency','Origin','Procedure 40 00','VAT: PVA','Document codes from UK Trade Tariff conditions']},
    {form:'GB EORI + VAT (postponed VAT accounting)',when:'Before first import',who:'You, with HMRC',portal:'https://www.gov.uk/eori',portalName:'Get an EORI number',fields:['Legal entity','VAT no.']},
    {form:'IPAFFS pre-notification (food, plants, animal products)',when:'Before arrival',who:'Importer / agent',portal:'https://www.gov.uk/guidance/import-of-products-animals-food-and-feed-system',portalName:'IPAFFS',fields:['Commodity','Origin','Establishment','Quantity'],attrs:['food','wood']},
    {form:'Product registrations: pEPR, WEEE, batteries, SCPN (cosmetics)',when:'Before placing on the market',who:'Importer / UK Responsible Person',portal:'https://www.gov.uk/guidance/packaging-waste-prepare-for-extended-producer-responsibility',portalName:'DEFRA pEPR (and EA/OPSS registers)',fields:['Packaging data','Producer registration','Cosmetic notification'],attrs:['consumer','electrical','cosmetic']},
  ],
  CN:[
    {form:'Import declaration via China International Trade Single Window',when:'At arrival; legal-inspection goods before release',who:'Registered Chinese consignee / import agent / customs broker',portal:'https://www.singlewindow.cn/',portalName:'China Single Window (国际贸易单一窗口)',fields:['Consignee customs registration code','10-digit HS + CIQ code','Declared value + currency','Origin','VAT / consumption tax','Inspection & quarantine declaration','CCC / SRRC / NMPA certificate nos. where applicable']},
    {form:'GACC overseas manufacturer registration (Decree 248) + importer filing (249)',when:'Before shipping food',who:'Factory (registration) and importer (filing)',portal:'https://cifer.singlewindow.cn/',portalName:'CIFER (GACC)',fields:['Facility registration no.','Product category','Importer record'],attrs:['food']},
    {form:'CCC / SRRC / NMPA pre-approvals',when:'Before import',who:'Factory with a Chinese agent',portal:'https://www.cnca.gov.cn/',portalName:'CNCA / MIIT / NMPA',fields:['Certificate no.','Model coverage','Chinese label approval'],attrs:['electrical','radio','cosmetic','medical','children']},
  ],
};
function filingFor(dest,attrs,mode){return (FILING[dest]||[]).filter(f=>(!f.mode||f.mode===mode)&&(!f.attrs||f.attrs.some(a=>attrs[a])));}

/* ---------------- intent parsing ---------------- */
const DEST_WORDS=[[/\b(usa|u\.s\.a?|united states|america|states)\b/i,'US'],[/\bcanada|canadian|toronto|vancouver|montreal\b/i,'CA'],[/\b(eu|europe|european union|germany|france|netherlands|spain|italy|poland|belgium|greece|ireland|austria|sweden|denmark|portugal)\b/i,'EU'],[/\b(uk|u\.k\.|united kingdom|britain|england|london)\b/i,'UK'],[/\b(china|mainland china|prc|shanghai|beijing|shenzhen|guangzhou)\b/i,'CN']];
function parseLocal(text){
  const t=text.trim(); const low=t.toLowerCase(); const out={intent:'help'};
  if(/\b(block|blocked|stuck|at risk|attention|what changed|this week|status|overview|needs? (my )?attention)\b/.test(low))out.intent='status';
  else if(/\b(draft|follow[- ]?ups?|message|email|write to|chase|remind)\b/.test(low)&&/\b(suppliers?|factor(y|ies)|vendors?|partners?|brokers?|forwarders?|open items)\b/.test(low))out.intent='followups';
  else if(/\b(deadline|due|isf|cut-?off|when do i)\b/.test(low))out.intent='deadlines';
  else if(/\b(where|how)\b.*\b(file|submit|lodge|declare)\b|\b(forms?|7501|carm|ace|cds|single window|portal)\b/.test(low))out.intent='file';
  else if(/\b(cost|duty|tariff|landed|rate|freight|how much)\b/.test(low))out.intent='cost';
  else if(/^(which|how many|list|do (we|i) have|who|search)\b/.test(low))out.intent='search';
  else if(/\b(import\w*|export\w*|shipping|ship|bring\w*|send\w*|sell\w*|moving)\b/.test(low)||/\bwhat do i need\b|\brequirements?\b|\bcompliance\b|\bcertif/.test(low))out.intent='check';
  else if(/^(find|show|open|pull up|get)\b/.test(low))out.intent='find';
  else if(/^(start|create|add|new|invite|run|mark|advance|move)\b/.test(low)){out.intent='start';
    if(/\b(invite)\b/.test(low)){out.action='invite';const em=t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);if(em)out.email=em[0];const rl=['Factory','Forwarder','Broker','Importer'].find(r=>low.includes(r.toLowerCase()));if(rl)out.role=rl;}
    else if(/\b(assessment|assess)\b/.test(low))out.action='assess';
    else if(/\bmark\b.*\b(fixed|done|resolved)\b/.test(low)){out.action='markFixed';const bt=t.match(/mark\s+(?:the\s+)?(.+?)\s+(?:as\s+)?(?:fixed|done|resolved)/i);if(bt)out.blockerTitle=bt[1].replace(/\s+(on|for|in)\s+SH-\d+.*$/i,'').replace(/\bSH-\d+\b/i,'').trim();}
    else if(/\b(advance|move)\b/.test(low))out.action='advance';
    else if(/\bproduct\b/.test(low))out.action='addProduct';
    else if(/\bshipment\b|\bupload\b/.test(low))out.action='newShipment';}
  else if(/\b(which|what|who|how many|list|search|where is|do (we|i) have)\b/.test(low))out.intent='search';
  // entities
  const d=DEST_WORDS.find(([re])=>{const m=low.match(/\b(to|into|in|for)\s+(the\s+)?([a-z. ]{2,25})/);return m&&re.test(m[3]);});if(d)out.dest=d[1];
  if(!out.dest){const d2=DEST_WORDS.find(([re])=>re.test(low.replace(/\bfrom\s+[a-z. ]+/,'')));if(d2&&!/\bfrom\b/.test(low))out.dest=d2[1];}
  const fm=low.match(/\bfrom\s+(the\s+)?([a-z. ]{2,25}?)(\s+(to|into|by|via|,|\.)|$)/);
  if(fm){const name=fm[2].trim();const hit=Object.entries(COUNTRIES).find(([c,n])=>n.toLowerCase()===name||n.toLowerCase().startsWith(name)||name.startsWith(n.toLowerCase().slice(0,5)));if(hit)out.origin=hit[0];else{const dw=DEST_WORDS.find(([re])=>re.test(name));if(dw)out.origin=dw[1]==='EU'?'DE':dw[1]==='UK'?'GB':dw[1];}}
  const um=t.replace(/,/g,'').match(/(\d{2,7})\s*(units|pcs|pieces|sets|cartons|boxes|kg)/i);if(um)out.units=+um[1];
  const vm=t.replace(/,/g,'').match(/(?:\$|usd\s*)(\d+(?:\.\d+)?)\s*(k|m)?/i);if(vm)out.value=Math.round(+vm[1]*(vm[2]?(vm[2].toLowerCase()==='k'?1e3:1e6):1));
  if(/\bair\b|flight|fly/.test(low))out.mode='Air';else if(/express|courier|dhl|fedex|ups\b/.test(low))out.mode='Express';else if(/sea|ocean|container|fcl|lcl|vessel/.test(low))out.mode='Ocean';
  // product description: after import/export/ship verbs up to from/to
  let pm=t.match(/\b(?:import(?:ing)?|export(?:ing)?|ship(?:ping)?|bring(?:ing)?|send(?:ing)?|sell(?:ing)?|moving)\s+(?:some\s+|a\s+|an\s+|\d[\d,]*\s*(?:units|pcs|pieces|sets)?\s*(?:of\s+)?)?(.+?)(?=\s+\b(?:from|to|into|by|via|for sale|$))/i);
  if(!pm)pm=t.match(/\b(?:need|requirements?|compliance|certif\w*)\s+(?:for|to import|to ship)\s+(.+?)(?=\s+\b(?:from|to|into|by|via|$))/i);
  if(pm)out.desc=pm[1].replace(/\s+(to|into|from|by)$/i,'').trim();
  else if(out.intent==='check')out.desc=t.replace(/^(what do i need (to|for)|can i|how do i|i want to|i'm|i am)\s*/i,'').replace(/\b(import|export|ship|shipping)\b/ig,'').replace(/\b(to|into|from)\s+[a-z. ]+$/i,'').trim();
  // referenced records
  const prod=S.products.find(p=>low.includes(p.name.toLowerCase()));if(prod)out.productId=prod.id;
  const sh=(t.match(/\bSH-\d{3,5}\b/i)||[])[0];if(sh)out.shipmentId=sh.toUpperCase();
  return out;
}

/* ---------------- workspace context the assistant reasons over ---------------- */
function workspaceContext(){
  const ships=mine(S.shipments).map(s=>{const p=product(s);const dl=nextDeadline(s);return {id:s.id,product:p.name,supplier:p.supplier,origin:originOf(s),dest:s.dest,mode:s.mode,units:s.units,value:s.value,stage:STAGES[stageOf(s)].name,status:STATUS[status(s)][0],readiness:score(s),nextDeadline:dl.label+' '+fmtD(dl.date),eta:fmtD(s.eta),open:openB(s).map(b=>({title:b.title,sev:b.sev,owner:b.owner,fix:b.fix})),docs:s.docs,carrier:s.carrier||null,container:s.container||null};});
  const prods=S.products.map(p=>({id:p.id,name:p.name,supplier:p.supplier,markets:p.markets,category:p.category||null,attrs:Object.keys(attrsOf(p)).filter(k=>attrsOf(p)[k]),certs:(p.certs||[]).map(c=>c.name+' ('+c.status+')'),assessments:Object.entries(p.assess||{}).map(([m,a])=>({market:m,at:fmtD(a.at),reviewed:a.reviewed?a.reviewed.by:null,code:a.result&&a.result.classification&&a.result.classification.code,requirements:(a.result&&a.result.requirements||[]).length}))}));
  const partners=S.partners.map(x=>({name:x.name,type:x.type,country:x.country,contact:x.contact}));
  return {company:S.settings.company,role:myRole(),defaultMarket:S.settings.market,today:fmtD(new Date()),shipments:ships,products:prods,partners,members:(WS&&WS.members)||[],costModel:COSTS};
}
const ROLE_PROMPTS={
  Importer:[['What do I need to import Bluetooth kitchen scales from Shenzhen to the US? 1,200 units, $11,400, by sea.'],['What\'s blocking my shipments this week?'],['Draft follow-ups to suppliers with open items.'],['Where do I file the entry for a shipment to Canada?']],
  Factory:[['Which documents do I still owe, and for which shipments?'],['What must be on the label for the US shipment?'],['Upload the invoice and packing list for the next shipment.'],['What exactly does the importer want changed on the packing list?']],
  Forwarder:[['Which bookings have ISF or ENS data missing?'],['What are the next cut-offs across all shipments?'],['Which shipments have weight or HS mismatches between the documents and the BL?'],['Freight estimate for Ningbo to Los Angeles, 20 cbm.']],
  Broker:[['Which assessments are waiting for my review?'],['Show me the classification and rulings for the plush toy.'],['Which shipments can be entered this week, and what\'s missing on the rest?'],['Open the document pack for SH-1047.']],
};

/* ---------------- chat state ---------------- */
const chatOwner=()=>(ME&&ME.email)||'local';
function chats(){S.chats=S.chats||[];return S.chats.filter(c=>(c.owner||'local')===chatOwner()||(!c.owner&&!ME));}
function currentChat(){const id=window.__chatId;let c=chats().find(x=>x.id===id);if(!c){c={id:uid('C'),owner:chatOwner(),title:'New chat',at:new Date().toISOString(),messages:[]};S.chats=S.chats||[];S.chats.unshift(c);window.__chatId=c.id;}return c;}
function newChat(){window.__chatId=null;location.hash='#chat';route();}

/* ---------------- page ---------------- */
function pageChat(){
  const c=currentChat(); const first=(S.settings.company||'there').split(' ')[0];
  const recent=chats().filter(x=>x.messages.length).slice(0,8);
  const sugg=ROLE_PROMPTS[myRole()]||ROLE_PROMPTS.Importer;
  return `<div class="chat-wrap">
    <aside class="chat-side"><button class="btn primary" style="width:100%;justify-content:center" onclick="newChat()">+ New chat</button>
      <div class="cs-h">Recent</div>${recent.map(x=>`<a href="#chat" class="cs-item ${x.id===c.id?'active':''}" onclick="window.__chatId='${x.id}';setTimeout(route,0)">${esc(x.title)}</a>`).join('')||'<div class="muted" style="font-size:12px;padding:4px 8px">No conversations yet</div>'}
      <div class="cs-h">Pinned</div><a class="cs-item" href="#overview">Work queue <span class="muted">${mine(S.shipments).filter(s=>stageOf(s)<7&&openB(s).some(b=>myRole()==='Importer'||b.owner.toLowerCase().startsWith(myRole().toLowerCase()))).length}</span></a></aside>
    <section class="chat-main">
      <div class="chat-scroll" id="chatScroll">
      ${c.messages.length?c.messages.map(renderMsg).join(''):`<div class="chat-welcome"><h1>Welcome, ${esc(first)}.</h1><p>${myRole()==='Importer'?'Describe what you\'re importing or exporting. ClearWay works out the rules, the cost, the documents — and where each form gets filed.':myRole()==='Factory'?'Ask what documents and labels the importer needs from you, upload them here, and see what still needs fixing.':myRole()==='Forwarder'?'Ask which bookings are missing filing data, what the cut-offs are, and where documents disagree with the BL.':'Ask which assessments and classifications need your review, and open the document packs ready for entry.'}</p>
        <div class="cs-h" style="margin-top:28px">How about we start with…</div>${sugg.map(([q])=>`<button class="sugg" onclick="sendChat(${JSON.stringify(q).replace(/"/g,'&quot;')})">${esc(q)}</button>`).join('')}
        <div class="hint" style="margin-top:14px">Tip: mention a product or shipment by name (or type @ to pick one) to ask about it.</div></div>`}
      </div>
      <form class="composer" id="composer" onsubmit="event.preventDefault();sendChat(document.getElementById('chatIn').value)">
        <textarea id="chatIn" rows="1" placeholder="${({Importer:'e.g. I\'m importing kids wooden puzzles from Vietnam to Germany, 3,000 units…',Factory:'e.g. What do I still owe? · What must the US label say for the kitchen scale?',Forwarder:'e.g. Which bookings are missing ISF data? · Next cut-offs',Broker:'e.g. Which assessments need my review? · Open the pack for SH-1047'})[myRole()]}" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat(this.value);}" oninput="this.style.height='auto';this.style.height=Math.min(160,this.scrollHeight)+'px'"></textarea>
        <div class="comp-f"><button type="button" class="btn sm ghost" onclick="refPicker()" title="Reference a product or shipment">@</button><button type="button" class="btn sm ghost" onclick="ACTIONS.new({})" title="Upload documents">📎</button><span style="flex:1"></span><button class="btn primary sm" type="submit">↑</button></div>
      </form>
    </section></div>`;
}
function renderMsg(m){
  if(m.role==='user')return `<div class="msg user"><div class="bubble">${esc(m.text)}</div></div>`;
  return `<div class="msg bot"><div class="av" style="background:var(--accent)">CW</div><div class="bubble">${m.html||esc(m.text||'')}${m.actions&&m.actions.length?`<div class="chips" style="margin-top:12px">${m.actions.map(a=>`<button class="btn sm ${a.primary?'primary':''}" onclick="${a.onclick}">${esc(a.label)}</button>`).join('')}</div>`:''}</div></div>`;
}
function refPicker(){const items=[...S.products.map(p=>['product',p.name]),...mine(S.shipments).map(s=>['shipment',product(s).name+' ('+s.id+')'])];modal('Reference a record',`<div class="list" style="max-height:50vh;overflow:auto">${items.map(([k,n])=>`<div class="li" style="cursor:pointer" onclick="document.getElementById('chatIn').value+=' ${esc(n)} ';document.getElementById('modal').classList.remove('open');document.getElementById('chatIn').focus()"><span class="pill neutral" style="min-width:0">${k}</span><div class="li-b"><div class="li-t">${esc(n)}</div></div></div>`).join('')||'<div class="muted p" style="padding:12px">Nothing yet — add a product first.</div>'}</div>`,null);}
async function sendChat(text){
  text=(text||'').trim();if(!text)return;const c=currentChat();
  c.messages.push({role:'user',text});if(c.title==='New chat')c.title=text.slice(0,48);save();route();
  const thinking={role:'bot',html:'<span class="muted">Thinking…</span>'};c.messages.push(thinking);route();scrollChat();
  let parsed=null;
  if(window.__health&&window.__health.live){try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,role:myRole(),context:workspaceContext()})});const j=await r.json();if(j&&j.intent){parsed=j;if(j.productName){const pr=S.products.find(x=>x.name.toLowerCase()===String(j.productName).toLowerCase());if(pr)parsed.productId=pr.id;}}}catch(e){}}
  if(!parsed)parsed=parseLocal(text);
  const reply=await answer(parsed,text);
  c.messages.splice(c.messages.indexOf(thinking),1);c.messages.push({role:'bot',...reply});save();route();scrollChat();
}
function scrollChat(){const el=$('#chatScroll');if(el)el.scrollTop=el.scrollHeight;}

/* ---------------- answers ---------------- */
async function answer(p,text){
  const dest=p.dest||S.settings.market||'US', origin=p.origin||'CN', mode=p.mode||'Ocean';
  if(p.intent==='check'||(p.intent==='help'&&p.desc&&p.desc.length>8)){
    let prod=p.productId?S.products.find(x=>x.id===p.productId):null;
    const desc=prod?prod.desc:(p.desc||text);
    const attrs=prod?attrsOf(prod):deriveAttrs(desc);
    const reqs=(prod?mergedRequirements(prod,dest,mode,origin):requirementsFor({desc,attrs},dest,mode)).filter(r=>!(r.id==='us-uflpa'&&origin!=='CN'));
    const cls=clsFor({productId:prod?prod.id:null,sku:desc,desc,dest,origin});
    const cov=coverage({desc,attrs},dest);
    const units=p.units||(prod&&1000)||1000, value=p.value||units*9;
    const missing=reqs.filter(r=>!(prod&&(prod.have||{})[r.id]));
    const worst=missing.filter(r=>r.kind==='cert').slice(0,3).map(r=>impact('cert',{units,value})).reduce((a,i)=>({low:a.low+i.low,high:a.high+i.high,atRisk:Math.max(a.atRisk,i.atRisk)}),{low:0,high:0,atRisk:0});
    const certs=reqs.filter(r=>r.kind==='cert'), labels=reqs.filter(r=>r.kind.startsWith('label')), filings=reqs.filter(r=>/filing|isf|registration/.test(r.kind));
    const onAttrs=Object.keys(attrs).filter(k=>attrs[k]&&k!=='consumer').map(k=>(ATTRS.find(a=>a[0]===k)||[k,k])[1]);
    const html=`<p><b>${esc(desc.charAt(0).toUpperCase()+desc.slice(1))}</b> — ${esc(COUNTRIES[origin]||origin)} → ${esc((MARKETS.find(m=>m[0]===dest)||[dest,dest])[1])}, ${mode.toLowerCase()}${p.units?`, ${p.units.toLocaleString()} units`:''}${p.value?`, ${money(p.value)}`:''}.</p>
      <p>I read it as: ${onAttrs.length?onAttrs.map(a=>`<span class="pill neutral" style="min-width:0">${esc(a)}</span>`).join(' '):'<span class="muted">no special attributes detected</span>'} — correct these on the product if I'm wrong, the rules follow from them.</p>
      <div class="kv" style="padding:6px 0"><span>Likely classification</span><b>${esc(cls.code)} ${pill(cls.conf>=85?'good':'warn',cls.conf+'%')} <span class="muted">${esc(cls.text)} · duty ${esc(cls.duty)}</span></b></div>
      <p><b>${reqs.length} requirements</b> for ${dest} — ${certs.length} certificates/test reports the factory must supply, ${labels.length} label elements, ${filings.length} filings/registrations on your side. ${pill(cov.level==='good'?'good':cov.level==='partial'?'warn':'crit','rule coverage: '+cov.level)}</p>
      <ul class="chat-list">${reqs.slice(0,7).map(r=>`<li><b>${esc(r.name)}</b> <span class="muted">· ${esc(r.owner||'')}${r.legal?' · '+esc(r.legal):''}</span></li>`).join('')}${reqs.length>7?`<li class="muted">…and ${reqs.length-7} more on the product page</li>`:''}</ul>
      ${certs.length?`<p class="muted" style="font-size:12.5px">If the top certificates are missing at the border: roughly <b>${money(worst.low)}–${money(worst.high)}</b> in exam, storage and broker time${worst.atRisk?`, with ${money(worst.atRisk)} of goods at risk of refusal`:''}.</p>`:''}
      <p>Next, I can ${prod?'':'save this as a product, '}run a sourced assessment (legal basis + sources, for your broker to review), start the shipment and check the factory's documents, or show you exactly which forms get filed where.</p>`;
    window.__pending={desc,dest,origin,mode,units:p.units||'',value:p.value||'',productId:prod?prod.id:null};
    const actions=[];
    if(!prod)actions.push({label:'Save as product',primary:true,onclick:"chatSaveProduct()"});
    actions.push({label:'Run sourced assessment',onclick:prod?`location.hash='product-${prod.id}'`:"chatSaveProduct(true)"});
    actions.push({label:'Start shipment & upload documents',onclick:"chatStartShipment()"});
    actions.push({label:'Where do I file?',onclick:`sendChat('Where do I file for ${dest}?')`});
    actions.push({label:'Freight & fees',onclick:`window.__rt={origin:'${origin}',dest:'${dest}',mode:'${mode}',cbm:${Math.max(1,Math.round(units/60))},kg:${Math.round(units*0.5)},value:${value}};location.hash='rates'`});
    return {html,actions};
  }
  if(p.intent==='status'){
    const active=mine(S.shipments).filter(s=>stageOf(s)<7);const blocked=active.filter(s=>status(s)==='crit'),warn=active.filter(s=>status(s)==='warn');
    const items=[];active.forEach(s=>openB(s).forEach(b=>items.push({s,b,i:impact(b.kind,{units:s.units,value:s.value}),dl:nextDeadline(s)})));items.sort((a,b)=>(a.b.sev==='crit'?0:1)-(b.b.sev==='crit'?0:1)||daysUntil(a.dl.date)-daysUntil(b.dl.date));
    const ex=active.map(exposure);const low=ex.reduce((a,e)=>a+e.low,0),high=ex.reduce((a,e)=>a+e.high,0);
    if(!active.length)return {html:'<p>No active shipments yet. Describe one and I\'ll set it up, or upload the factory\'s documents.</p>',actions:[{label:'New shipment',primary:true,onclick:'ACTIONS.new({})'}]};
    const html=`<p><b>${blocked.length} blocked</b>, ${warn.length} need attention, ${active.length-blocked.length-warn.length} ready. Shipping as-is could cost ${money(low)}–${money(high)}.</p><ul class="chat-list">${items.slice(0,6).map(x=>`<li><a href="#shipment-${x.s.id}"><b>${esc(x.b.title)}</b></a> <span class="muted">· ${esc(product(x.s).name)} · ${esc(x.b.owner)} to fix · ${x.dl.label} ${fmtD(x.dl.date)} · ${impactRange(x.i)}</span></li>`).join('')}</ul>${items.length>6?`<p class="muted">${items.length-6} more on the work queue.</p>`:''}`;
    return {html,actions:[{label:'Open work queue',primary:true,onclick:"location.hash='overview'"},{label:'Draft supplier follow-ups',onclick:"sendChat('Draft follow-ups to suppliers with open items')"}]};
  }
  if(p.intent==='followups'){
    const bySup={};mine(S.shipments).filter(s=>stageOf(s)<7).forEach(s=>openB(s).filter(b=>/factory/i.test(b.owner)).forEach(b=>{(bySup[product(s).supplier]=bySup[product(s).supplier]||[]).push({...b,sid:s.id,pname:product(s).name});}));
    const sups=Object.keys(bySup);if(!sups.length)return {html:'<p>Nothing is waiting on a supplier right now.</p>'};
    const html=`<p>${sups.length} supplier${sups.length>1?'s have':' has'} items waiting on them. Each message is pre-written in English and 中文 — open one to copy it.</p><ul class="chat-list">${sups.map(n=>`<li><b>${esc(n)}</b> <span class="muted">· ${bySup[n].length} item${bySup[n].length>1?'s':''}: ${bySup[n].slice(0,3).map(b=>esc(b.title)).join('; ')}</span></li>`).join('')}</ul>`;
    return {html,actions:sups.slice(0,4).map(n=>({label:'Message '+n.split(' ')[0],onclick:`(function(){const p=S.partners.find(x=>x.name===${JSON.stringify(n)});ACTIONS.askPartner({p:p?p.id:''});})()`}))};
  }
  if(p.intent==='deadlines'){
    const list=mine(S.shipments).filter(s=>stageOf(s)<6).map(s=>({s,dl:nextDeadline(s)})).sort((a,b)=>daysUntil(a.dl.date)-daysUntil(b.dl.date)).slice(0,8);
    return {html:list.length?`<ul class="chat-list">${list.map(({s,dl})=>`<li><b>${fmtD(dl.date)}</b> (${daysUntil(dl.date)<=0?'today':daysUntil(dl.date)+'d'}) — ${esc(dl.label)} · <a href="#shipment-${s.id}">${esc(product(s).name)}</a> ${statusPill(s)}</li>`).join('')}</ul><p class="muted" style="font-size:12.5px">ISF is due 24 h before loading for US ocean cargo; late filing is $5,000 per violation.</p>`:'<p>No upcoming deadlines.</p>'};
  }
  if(p.intent==='file'){
    const sh=p.shipmentId?S.shipments.find(s=>s.id===p.shipmentId):null;const prod=sh?product(sh):(p.productId?S.products.find(x=>x.id===p.productId):null);
    const attrs=prod?attrsOf(prod):{consumer:true,...(p.desc?deriveAttrs(p.desc):{})};const d=sh?sh.dest:dest;const md=sh?sh.mode:mode;
    const list=filingFor(d,attrs,md);
    const html=`<p><b>Filing for ${esc((MARKETS.find(m=>m[0]===d)||[d,d])[1])}${sh?' · '+esc(product(sh).name)+' ('+sh.id+')':''}.</b> ClearWay prepares every field; the submission itself goes through the party named — customs entries are filed by a licensed broker or your own account on the government system, never by a third-party app.</p>
      ${list.map(f=>`<div class="file-card"><b>${esc(f.form)}</b><div class="muted">When: ${esc(f.when)}<br>Who submits: ${esc(f.who)}</div><div style="margin-top:6px;font-size:12.5px">Fields: ${f.fields.map(esc).join(' · ')}</div><div style="margin-top:6px"><a class="btn sm" href="${f.portal}" target="_blank" rel="noopener">${esc(f.portalName)} ↗</a></div></div>`).join('')}`;
    return {html,actions:sh?[{label:'Open prefilled document pack',primary:true,onclick:`location.hash='docs-${sh.id}'`},{label:'Share with broker',onclick:`ACTIONS.share({id:'${sh.id}'})`}]:[{label:'Start a shipment to prefill these',primary:true,onclick:'ACTIONS.new({})'}]};
  }
  if(p.intent==='cost'){
    const units=p.units||1000,value=p.value||units*9;window.__rt={origin,dest,mode,cbm:Math.max(1,Math.round(units/60)),kg:Math.round(units*0.5),value};
    return {html:`<p>Opening the lane estimate for ${esc(COUNTRIES[origin]||origin)} → ${dest} by ${mode.toLowerCase()} on ${money(value)} of goods: freight range, every destination fee, and duty from the classification.</p>`,actions:[{label:'Open Rates & fees',primary:true,onclick:"location.hash='rates'"}]};
  }
  if(p.intent==='answer'&&p.answer){
    const rel=(p.related||[]).map(r=>r.type==='shipment'?S.shipments.find(s=>s.id===r.id):S.products.find(x=>x.id===r.id||x.name===r.id)).filter(Boolean);
    return {html:`<p>${esc(p.answer).replace(/\n/g,'<br>')}</p>`,actions:rel.slice(0,4).map(r=>r.productId!==undefined?{label:'Open '+r.id,onclick:`location.hash='shipment-${r.id}'`}:{label:'Open '+r.name,onclick:`location.hash='product-${r.id}'`})};
  }
  if(p.intent==='search'){
    const q=text.toLowerCase().replace(/[?.,!]/g,'');const words=q.split(/\s+/).filter(w=>w.length>3&&!/^(which|what|where|does|have|with|that|this|from|about|their|there|shipments?|products?|documents?)$/.test(w));
    const hit=str=>words.some(w=>String(str||'').toLowerCase().includes(w));
    const ships=mine(S.shipments).filter(s=>hit(product(s).name)||hit(product(s).supplier)||hit(s.id)||openB(s).some(b=>hit(b.title)||hit(b.detail))||hit(s.dest)||hit(s.carrier)||hit(s.container));
    const prods=S.products.filter(p=>hit(p.name)||hit(p.desc)||hit(p.supplier)||(p.certs||[]).some(c=>hit(c.name)));
    const partners=S.partners.filter(x=>hit(x.name)||hit(x.contact)||hit(x.type));
    const rules=CATALOG.filter(r=>hit(r.name)||hit(r.plain)||hit(r.agency)).slice(0,5);
    const blockers=[];mine(S.shipments).forEach(s=>openB(s).forEach(b=>{if(hit(b.title)||hit(b.detail))blockers.push({s,b});}));
    // role-specific "what do I owe"
    if(/\b(owe|owing|still need to (send|provide)|my (tasks|items)|waiting on (me|us))\b/.test(q)){const r=myRole();const items=[];mine(S.shipments).forEach(s=>openB(s).forEach(b=>{if(b.owner.toLowerCase().startsWith(r.toLowerCase()))items.push({s,b});}));return {html:items.length?`<p><b>${items.length} item${items.length>1?'s':''} waiting on you.</b></p><ul class="chat-list">${items.map(({s,b})=>`<li><a href="#shipment-${s.id}"><b>${esc(b.title)}</b></a> <span class="muted">· ${esc(product(s).name)} (${s.id}) · ${esc(fixFor(b))} · ${nextDeadline(s).label} ${fmtD(nextDeadline(s).date)}</span></li>`).join('')}</ul>`:'<p>Nothing is waiting on you right now.</p>',actions:items.slice(0,3).map(({s,b})=>({label:'Mark “'+(b.title.length>28?b.title.slice(0,26)+'…':b.title)+'” done',onclick:`ACTIONS.fixed({id:'${s.id}',b:'${b.id}'});sendChat('What is waiting on me?')`}))};}
    if(!ships.length&&!prods.length&&!partners.length&&!blockers.length&&!rules.length)return {html:`<p>I searched shipments, products, partners, open items and the rules catalog for “${esc(words.join(' '))}” and found nothing. ${window.__health&&window.__health.live?'':'With an API key configured I can answer free-form questions about the workspace too.'}</p>`};
    const html=`<p>Here\'s what matches across the workspace:</p>${blockers.length?`<div class="cs-h" style="margin:8px 0 4px">Open items</div><ul class="chat-list">${blockers.slice(0,6).map(({s,b})=>`<li><a href="#shipment-${s.id}"><b>${esc(b.title)}</b></a> <span class="muted">· ${esc(product(s).name)} · ${esc(b.owner)}</span></li>`).join('')}</ul>`:''}${ships.length?`<div class="cs-h" style="margin:8px 0 4px">Shipments</div><ul class="chat-list">${ships.slice(0,6).map(s=>`<li><a href="#shipment-${s.id}"><b>${esc(product(s).name)}</b> ${s.id}</a> <span class="muted">· ${STAGES[stageOf(s)].short} · ${STATUS[status(s)][0]} · ETA ${fmtD(s.eta)}</span></li>`).join('')}</ul>`:''}${prods.length?`<div class="cs-h" style="margin:8px 0 4px">Products</div><ul class="chat-list">${prods.slice(0,6).map(p=>`<li><a href="#product-${p.id}"><b>${esc(p.name)}</b></a> <span class="muted">· ${esc(p.supplier)} · ${p.markets.join(', ')}${Object.keys(p.assess||{}).length?' · assessed':''}</span></li>`).join('')}</ul>`:''}${partners.length?`<div class="cs-h" style="margin:8px 0 4px">Partners</div><ul class="chat-list">${partners.slice(0,4).map(x=>`<li><b>${esc(x.name)}</b> <span class="muted">· ${x.type} · ${esc(x.contact||'')}</span></li>`).join('')}</ul>`:''}${rules.length?`<div class="cs-h" style="margin:8px 0 4px">Rules</div><ul class="chat-list">${rules.map(r=>`<li><b>${esc(r.name)}</b> <span class="muted">· ${r.m.join('/')} · ${esc(r.agency)}</span></li>`).join('')}</ul>`:''}`;
    return {html,actions:[...ships.slice(0,2).map(s=>({label:'Open '+s.id,onclick:`location.hash='shipment-${s.id}'`})),...prods.slice(0,2).map(p=>({label:'Open '+p.name.slice(0,22),onclick:`location.hash='product-${p.id}'`}))]};
  }
  if(p.intent==='start'){
    const a=p.action||'';const prod=p.productId?S.products.find(x=>x.id===p.productId):(p.productName?S.products.find(x=>x.name.toLowerCase()===String(p.productName).toLowerCase()):null);const sh=p.shipmentId?S.shipments.find(s=>s.id===p.shipmentId):null;
    if(a==='newShipment'){setTimeout(()=>openWizard(prod?{productId:prod.id}:{}),50);return {html:`<p>Starting a new shipment${prod?' of <b>'+esc(prod.name)+'</b>':''} — drop the factory\'s documents in the window that just opened.</p>`};}
    if(a==='addProduct'){setTimeout(()=>ACTIONS.addProduct(),50);return {html:'<p>Opening the product form. Describe it plainly — materials, function, who it\'s for, battery or radio — and pick a category.</p>'};}
    if(a==='invite'){if(!ME)return {html:'<p>Invites need an account — sign in first (Settings → Team).</p>'};const role=p.role||'Factory';if(p.email){try{const r=await fetch('/api/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:p.email,role})});const j=await r.json();if(j.error)return {html:`<p>${esc(j.error)}</p>`};WS.invites=j.invites;save();return {html:`<p>Invited <b>${esc(p.email)}</b> as ${esc(role)}. When they sign up with that email they land in this workspace with the ${role} view.</p>`,actions:[{label:'Team settings',onclick:"location.hash='settings'"}]};}catch(e){return {html:'<p>Server not reachable.</p>'};}}setTimeout(()=>ACTIONS.invite(),50);return {html:'<p>Opening the invite form.</p>'};}
    if(a==='assess'){if(!prod)return {html:'<p>Which product? Say its name as it appears in Products, e.g. “run an assessment for Plush toy for the US”.</p>'};const m=p.dest||prod.markets[0]||S.settings.market;location.hash='product-'+prod.id;setTimeout(()=>{const b=document.querySelector(`[data-act="assess"][data-m="${m}"]`);if(b&&!b.disabled)b.click();else toast('Assessments need ANTHROPIC_API_KEY on the server');},400);return {html:`<p>Running the ${m} assessment for <b>${esc(prod.name)}</b> — opening the product page; it takes about a minute.</p>`};}
    if(a==='markFixed'){const cands=sh?[sh]:mine(S.shipments);let found=null;for(const s of cands){const b=openB(s).find(b=>p.blockerTitle&&b.title.toLowerCase().includes(String(p.blockerTitle).toLowerCase().slice(0,18)));if(b){found={s,b};break;}}if(!found)return {html:'<p>I couldn\'t find that open item. Say part of its title and the shipment id, e.g. “mark quantity mismatch on SH-1047 fixed”.</p>'};ACTIONS.fixed({id:found.s.id,b:found.b.id});return {html:`<p>Marked <b>${esc(found.b.title)}</b> fixed on ${found.s.id}. Readiness is now ${score(found.s)}.</p>`,actions:[{label:'Open '+found.s.id,onclick:`location.hash='shipment-${found.s.id}'`}]};}
    if(a==='advance'){if(!sh)return {html:'<p>Which shipment? Include its id, e.g. “advance SH-1047”.</p>'};const cur=stageOf(sh);if(cur>=7)return {html:`<p>${sh.id} is already released.</p>`};ACTIONS.stage({id:sh.id,dir:1});return {html:`<p>${openB(sh).some(b=>b.sev==='crit')?'That shipment has blocking items — I opened the override dialog so you can decide.':'Advanced <b>'+sh.id+'</b> to '+STAGES[Math.min(7,cur+1)].name+'.'}</p>`,actions:[{label:'Open '+sh.id,onclick:`location.hash='shipment-${sh.id}'`}]};}
    return {html:'<p>I can start a shipment, add a product, invite a partner, run an assessment, mark an item fixed, or advance a shipment. Which one?</p>'};
  }
  if(p.intent==='find'){
    const prod=p.productId?S.products.find(x=>x.id===p.productId):null;const sh=p.shipmentId?S.shipments.find(s=>s.id===p.shipmentId):null;
    if(sh)return {html:`<p><b>${esc(product(sh).name)}</b> (${sh.id}) — ${STAGES[stageOf(sh)].name}, readiness ${score(sh)}, ${openB(sh).length} open item${openB(sh).length===1?'':'s'}.</p>`,actions:[{label:'Open shipment',primary:true,onclick:`location.hash='shipment-${sh.id}'`},{label:'Document pack',onclick:`location.hash='docs-${sh.id}'`}]};
    if(prod){const ships=S.shipments.filter(s=>s.productId===prod.id);return {html:`<p><b>${esc(prod.name)}</b> — ${esc(prod.supplier)}, markets ${prod.markets.join(', ')}, ${ships.length} shipment${ships.length===1?'':'s'}${Object.keys(prod.assess||{}).length?', assessment on file':''}.</p>`,actions:[{label:'Open product',primary:true,onclick:`location.hash='product-${prod.id}'`},{label:'New shipment of it',onclick:`ACTIONS.new({p:'${prod.id}'})`}]};}
    return {html:'<p>I couldn\'t match that to a product or shipment. Try the name as it appears in Records, or type @ to pick one.</p>'};
  }
  return {html:`<p>I know everything in this workspace — ${mine(S.shipments).length} shipments, ${S.products.length} products, ${S.partners.length} partners, open items, assessments and deadlines — and I can start things. Try: <b>check a product</b> ("what do I need to import X from Y to Z"), <b>status</b> ("what's blocked this week"), <b>filing</b> ("where do I file for Canada"), and <b>messages</b> ("draft follow-ups to suppliers"). Mention a product or shipment by name to ask about it.</p>`,actions:[{label:'Check a product',onclick:"document.getElementById('chatIn').value='What do I need to import ';document.getElementById('chatIn').focus()"},{label:'What\'s blocked?',onclick:"sendChat('What is blocked this week?')"}]};
}
function chatSaveProduct(thenAssess){
  const w=window.__pending;if(!w)return;const defaults=deriveAttrs(w.desc);
  const p={id:uid('PR'),name:w.desc.split(/[,.]|\bwith\b/)[0].trim().slice(0,48),desc:w.desc,category:'Other',supplier:'Unassigned supplier',markets:[w.dest],have:{},certs:[],attrs:{}};
  S.products.push(p);w.productId=p.id;save();toast('Product saved');
  if(thenAssess){location.hash='product-'+p.id;setTimeout(()=>{const b=document.querySelector(`[data-act="assess"][data-m="${w.dest}"]`);if(b&&!b.disabled)b.click();},400);}
  else{const c=currentChat();c.messages.push({role:'bot',html:`<p>Saved <b>${esc(p.name)}</b> for ${w.dest}. Fine-tune its attributes and supplier on the product page — or start the shipment now.</p>`,actions:[{label:'Open product',onclick:`location.hash='product-${p.id}'`},{label:'Start shipment',primary:true,onclick:'chatStartShipment()'}]});save();route();scrollChat();}
}
function chatStartShipment(){const w=window.__pending||{};openWizard({productId:w.productId||'',desc:w.desc||'',dest:w.dest||S.settings.market,origin:w.origin||'CN',mode:w.mode||'Ocean',units:w.units||'',value:w.value||''});}
