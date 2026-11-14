/* =========================================================
   Data model
   ========================================================= */
const STATUS = {good:{label:'Ready',css:'good',color:'var(--good)'},warn:{label:'Needs attention',css:'warn',color:'var(--warn)'},crit:{label:'Blocked',css:'crit',color:'var(--crit)'}};
const LEVEL = {good:['good','Strong'],warn:['warn','Moderate'],serious:['serious','Weak'],crit:['crit','Very weak'],na:['neutral','—']};

function daysFromNow(n){const d=new Date();d.setDate(d.getDate()+n);return d;}
const fmtD=d=>d.toLocaleDateString('en-US',{month:'short',day:'numeric'});

let shipments = [
  mk('SH-1042','Kids bamboo dinner set','Yiwu Hengda Houseware','US','Ocean',{docs:92,reg:70,hs:'good',regl:'good',match:'good',label:'good',duty:'8.6%',loadIn:9,eta:36,
    blockers:[]}),
  mk('SH-1047','Bluetooth kitchen scale','Shenzhen Luxin Electronics','US','Ocean',{docs:48,reg:82,hs:'warn',regl:'crit',match:'crit',label:'warn',duty:'27.5%',loadIn:4,eta:31,
    blockers:[['crit','Quantity mismatch','Invoice says 1,200 units; packing list says 1,150. CBP cross-checks these line by line.','Confirm count with supplier and reissue the packing list.'],['crit','FCC SDoC missing','Product contains a Bluetooth radio. A Supplier\'s Declaration of Conformity with test report is required at entry.','Request FCC test report + SDoC from factory; reference it on the invoice.'],['warn','HS code differs across documents','Invoice shows 8423.10; bill of lading draft shows 8423.81.','Align to 8423.10.00 (household scales) on all documents.'],['warn','Lithium cell declaration','Contains CR2032 cells → UN3091 declaration required on the shipper\'s declaration.','Add UN3091 / PI 970 statement to packing list.']]}),
  mk('SH-1051','Plush toy, 30 cm','Dongguan Meiwei Toys','US','Air',{docs:71,reg:90,hs:'good',regl:'crit',match:'warn',label:'crit',duty:'0% + 301',loadIn:2,eta:7,
    blockers:[['crit','Children\'s Product Certificate not on file','CPSC requires a CPC citing CPSIA lead/phthalate and ASTM F963 tests from a CPSC-accepted lab.','Upload CPC + lab reports (check lab accreditation number).'],['crit','Tracking label missing from artwork','Packaging artwork lacks the permanent tracking label (manufacturer, location, date, batch).','Send tracking-label spec to factory before print run.'],['warn','Weight mismatch','Packing list gross weight 412 kg vs AWB 398 kg.','Reconcile with forwarder before AWB is cut.']]}),
  mk('SH-1055','USB-C wall charger 65W','Shenzhen Luxin Electronics','EU','Ocean',{docs:64,reg:88,hs:'good',regl:'warn',match:'good',label:'crit',duty:'0% + VAT',loadIn:12,eta:44,
    blockers:[['crit','GPSR Responsible Person not on label','No EU-established economic operator named on product, packaging or accompanying document.','Appoint an EU RP and add name + address to packaging.'],['warn','CE Declaration of Conformity references expired standard','DoC cites EN 62368-1:2014; harmonised version now EN IEC 62368-1:2020+A11.','Ask factory for updated DoC + test report.'],['warn','WEEE registration','Producer registration required in destination member state (DE: stiftung ear).','Confirm registration number before shipping.']]}),
  mk('SH-1058','Stainless water bottles','Ningbo Ruiyi Metal','US','Ocean',{docs:88,reg:55,hs:'good',regl:'good',match:'good',label:'warn',duty:'3% + 232/301',loadIn:15,eta:42,
    blockers:[['warn','Country of origin marking','Invoice says "Made in China"; artwork shows marking on removable sleeve only — must be permanent and conspicuous.','Laser-mark origin on base.']]}),
  mk('SH-1060','Scented soy candles','Guangzhou Aroma Craft','UK','Express',{docs:80,reg:60,hs:'warn',regl:'warn',match:'good',label:'good',duty:'0%',loadIn:3,eta:8,
    blockers:[['warn','HS confidence low','3406.00 vs 3307.49 (room perfuming preparation) depends on primary function and marketing.','Add product spec + marketing copy to SKU record; request broker opinion.'],['warn','UK CLP labelling','Fragrance allergens above threshold require CLP hazard pictogram and allergen list.','Obtain SDS from supplier.']]}),
  mk('SH-1063','Wooden puzzle set','Dongguan Meiwei Toys','EU','Ocean',{docs:35,reg:92,hs:'warn',regl:'crit',match:'crit',label:'crit',duty:'0% + VAT',loadIn:6,eta:39,
    blockers:[['crit','Commercial invoice missing Incoterm and currency','Entry value cannot be determined.','Reissue invoice with FOB Ningbo, USD.'],['crit','EN 71 test reports not provided','Toy Safety Directive requires EN 71-1/-2/-3 and a technical file.','Request from factory; verify lab.'],['crit','Consignee differs','Invoice consignee "Nordic Play AB"; BL draft "Nordic Play Logistics AB".','Match legal entity + EORI across documents.'],['warn','Description inconsistency','"Educational toy" / "wooden blocks" / "puzzle" across three documents.','Standardise description from SKU record.']]}),
  mk('SH-1066','Yoga mats, TPE','Xiamen Sunrise Sports','US','Ocean',{docs:95,reg:40,hs:'good',regl:'good',match:'good',label:'good',duty:'4.6% + 301',loadIn:20,eta:48,blockers:[]}),
  mk('SH-1069','Vitamin C serum','Guangzhou Aroma Craft','US','Air',{docs:58,reg:95,hs:'good',regl:'crit',match:'warn',label:'warn',duty:'0%',loadIn:5,eta:9,
    blockers:[['crit','FDA facility registration (MoCRA) not confirmed','Cosmetic manufacturer must be FDA-registered and product listed.','Collect FEI number from factory and list product.'],['crit','Prior Notice / FDA product code missing','Entry will be flagged for FDA review without the product code on the invoice.','Add FDA product code 53-F-...-10 to invoice.'],['warn','Value mismatch','Invoice total $18,400 vs proforma on file $17,900.','Confirm which is transaction value.']]}),
];

function mk(id,sku,supplier,dest,mode,o){
  const s = {id,sku,supplier,dest,mode,docs:o.docs,reg:o.reg,hs:o.hs,regl:o.regl,match:o.match,label:o.label,duty:o.duty,
    loadDate:daysFromNow(+o.loadIn),eta:daysFromNow(o.eta),blockers:o.blockers||[]};
  s.score = computeScore(s); s.status = statusOf(s.score, s.blockers);
  return s;
}
function computeScore(s){
  let sc=100; s.blockers.forEach(b=>{sc -= b[0]==='crit'?14:6;});
  if(s.hs==='warn')sc-=5; if(s.hs==='crit')sc-=10;
  sc = Math.round(Math.min(sc, 40+ s.docs*0.6));
  return Math.max(5,sc);
}
function statusOf(score,blockers){ if(blockers.some(b=>b[0]==='crit'))return 'crit'; if(score>=85)return 'good'; return 'warn'; }

/* =========================================================
   Rendering
   ========================================================= */
const $=s=>document.querySelector(s);
let selected=null, view='status';

function filtered(){
  const d=$('#fDest').value, m=$('#fMode').value, st=$('#fStatus').value, su=$('#fSup').value, q=$('#q').value.toLowerCase();
  return shipments.filter(s=>(!d||s.dest===d)&&(!m||s.mode===m)&&(!st||s.status===st)&&(!su||s.supplier===su)&&(!q||(s.id+s.sku+s.supplier).toLowerCase().includes(q)))
    .sort((a,b)=>b.score-a.score);
}
function supplierOptions(){
  const sel=$('#fSup'); const cur=sel.value; const sups=[...new Set(shipments.map(s=>s.supplier))].sort();
  sel.innerHTML='<option value="">All</option>'+sups.map(s=>`<option ${s===cur?'selected':''}>${s}</option>`).join('');
}

function renderKPIs(list){
  const n=list.length||1;
  const ready=list.filter(s=>s.status==='good').length, blocked=list.filter(s=>s.status==='crit').length, warn=list.length-ready-blocked;
  const avg=Math.round(list.reduce((a,s)=>a+s.score,0)/n);
  const flags={docs:0,reg:0,cls:0};
  list.forEach(s=>s.blockers.forEach(b=>{const t=b[1].toLowerCase(); if(/mismatch|differs|incoterm|description|consign/.test(t))flags.docs++; else if(/hs|classification/.test(t))flags.cls++; else flags.reg++;}));
  const exposure=list.reduce((a,s)=>a+(s.status==='crit'?4200:s.status==='warn'?900:0),0);
  $('#kpis').innerHTML=`
    <div class="kpi"><div class="l">Readiness Index <span class="hint">avg of ${list.length} shipments</span></div>
      <div class="v">${avg} <span class="d up">▲ 4 vs last 30d</span></div>
      <div class="bar"><i style="width:${ready/n*100}%;background:var(--good)"></i><i style="width:${warn/n*100}%;background:var(--warn)"></i><i style="width:${blocked/n*100}%;background:var(--crit)"></i></div>
      <div class="foot"><span><i class="dot" style="background:var(--good)"></i>${ready} ready</span><span><i class="dot" style="background:var(--warn)"></i>${warn} attention</span><span><i class="dot" style="background:var(--crit)"></i>${blocked} blocked</span></div></div>
    <div class="kpi"><div class="l">Open blockers <span class="hint">by cause</span></div>
      <div class="v">${flags.docs+flags.reg+flags.cls} <span class="d">${blocked} shipments can't book</span></div>
      <div class="bar"><i style="width:${flags.docs/(flags.docs+flags.reg+flags.cls||1)*100}%;background:#2a78d6"></i><i style="width:${flags.reg/(flags.docs+flags.reg+flags.cls||1)*100}%;background:#eb6834"></i><i style="width:${flags.cls/(flags.docs+flags.reg+flags.cls||1)*100}%;background:#1baf7a"></i></div>
      <div class="foot"><span><i class="dot" style="background:#2a78d6"></i>${flags.docs} document</span><span><i class="dot" style="background:#eb6834"></i>${flags.reg} regulatory</span><span><i class="dot" style="background:#1baf7a"></i>${flags.cls} classification</span></div></div>
    <div class="kpi"><div class="l">Hold exposure <span class="hint">est. if shipped as-is</span></div>
      <div class="v">$${exposure.toLocaleString()} <span class="d down">exam + demurrage risk</span></div>
      <div class="bar"><i style="width:100%;background:var(--hair)"></i></div>
      <div class="foot"><span>Based on $300–$1,000 exam, 3–7 days at $150–350/day per container, broker handling.</span></div></div>`;
}

function pill(level){const [css,txt]=LEVEL[level]||LEVEL.na;return `<span class="pill ${css}">${txt}</span>`;}
function pillStatus(s){const st=STATUS[s.status];const col=s.status==='good'?'var(--good)':s.status==='warn'?'var(--warn)':'var(--crit)';
  return `<span class="score"><span class="num">${s.score}</span><span class="meter"><i style="width:${s.score}%;background:${col}"></i></span><span class="pill ${st.css}" style="min-width:0">${st.label}</span></span>`;}
function initials(t){return t.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();}
function hue(str){let h=0;for(const c of str)h=(h*31+c.charCodeAt(0))%360;return `hsl(${h} 35% 45%)`;}

function renderTable(list){
  const tb=$('#rows');
  if(!list.length){tb.innerHTML=`<tr><td colspan="9" class="empty">No shipments match these filters.</td></tr>`;return;}
  tb.innerHTML=list.map(s=>{
    const nextDl = s.loadDate; const days=Math.round((nextDl-new Date())/864e5);
    const dl = s.mode==='Ocean'?`ISF due ${fmtD(daysFromNow(days-1))}`:`Docs cut-off ${fmtD(daysFromNow(days-1))}`;
    const detail = view==='detail';
    return `<tr data-id="${s.id}" class="${selected===s.id?'sel':''}">
      <td class="first"><div class="brand"><span class="ic" style="background:${hue(s.supplier)}">${initials(s.supplier)}</span><div><div class="n">${s.sku}${s.isNew?'<span class="tag">New</span>':''}</div><div class="m">${s.id} · ${s.supplier} · ${s.mode}</div></div></div></td>
      <td><span class="pill neutral" style="min-width:0">${s.dest}</span></td>
      <td>${pillStatus(s)}</td>
      <td class="num">${s.duty}</td>
      <td>${detail?`<span class="num">${s.hs==='good'?'94%':s.hs==='warn'?'71%':'48%'}</span>`:pill(s.hs)}</td>
      <td>${detail?`<span class="num">${s.blockers.filter(b=>!/mismatch|differs|incoterm|description|consign|hs/i.test(b[1])).length} open</span>`:pill(s.regl)}</td>
      <td>${detail?`<span class="num">${s.docs}% consistent</span>`:pill(s.match)}</td>
      <td>${detail?`<span class="num">${s.label==='good'?'OK':s.label==='warn'?'1 issue':'2+ issues'}</span>`:pill(s.label)}</td>
      <td class="${days<=4?'num neg':'num'}">${dl}<div class="hint" style="font-weight:400">${days<=0?'today':days+'d'} · ETA ${fmtD(s.eta)}</div></td>
    </tr>`;}).join('');
  tb.querySelectorAll('tr').forEach(tr=>tr.onclick=()=>openDrawer(tr.dataset.id));
}

function renderPlot(list){
  const svg=$('#plot'); const W=520,H=440,P={l:48,r:18,t:22,b:46}; const iw=W-P.l-P.r, ih=H-P.t-P.b;
  const x=v=>P.l+v/100*iw, y=v=>P.t+ih-v/100*ih;
  let g=`<defs><linearGradient id="zone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe1e1" stop-opacity=".9"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient><linearGradient id="zone2" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e4f4e4" stop-opacity=".9"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
  g+=`<rect x="${P.l}" y="${P.t}" width="${iw}" height="${ih}" fill="url(#zone)"/><rect x="${P.l}" y="${P.t}" width="${iw}" height="${ih}" fill="url(#zone2)"/>`;
  g+='<g class="grid">'; [25,50,75].forEach(v=>{g+=`<line x1="${x(v)}" x2="${x(v)}" y1="${P.t}" y2="${P.t+ih}"/><line y1="${y(v)}" y2="${y(v)}" x1="${P.l}" x2="${P.l+iw}"/>`;}); g+='</g>';
  g+=`<line x1="${P.l}" y1="${P.t+ih}" x2="${P.l+iw}" y2="${P.t+ih}" stroke="#c3c2b7"/><line x1="${P.l}" y1="${P.t}" x2="${P.l}" y2="${P.t+ih}" stroke="#c3c2b7"/>`;
  g+=`<line x1="${x(0)}" y1="${y(0)}" x2="${x(100)}" y2="${y(100)}" stroke="#c3c2b7" stroke-dasharray="3 4"/>`;
  [0,25,50,75,100].forEach(v=>{g+=`<text class="axis" x="${x(v)}" y="${P.t+ih+16}" text-anchor="middle">${v}%</text><text class="axis" x="${P.l-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`;});
  g+=`<text class="axis" x="${P.l+iw/2}" y="${H-8}" text-anchor="middle">Document completeness →</text>`;
  g+=`<text class="axis" transform="translate(13 ${P.t+ih/2}) rotate(-90)" text-anchor="middle">Regulatory complexity →</text>`;
  g+=`<text class="zone-lab" x="${P.l}" y="${P.t-9}">Complex product, incomplete docs <tspan fill="#898781" font-size="10">— most likely to be held or seized</tspan></text>`;
  g+=`<text class="zone-lab" x="${x(97)}" y="${y(6)}" text-anchor="end">Simple product, clean docs</text>`;
  list.forEach(s=>{
    const col=s.status==='good'?'#0ca30c':s.status==='warn'?'#fab219':'#d03b3b';
    g+=`<g class="pt" data-id="${s.id}" transform="translate(${x(s.docs)} ${y(s.reg)})"><circle class="r" r="9"/><circle class="m" r="7" fill="${col}" stroke="${selected===s.id?'#0b0b0b':'none'}" stroke-width="1.5"/>${s.status==='crit'?'<text x="0" y="3.5" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">!</text>':s.status==='good'?'<path d="M-3 0l2 2 4-4" fill="none" stroke="#fff" stroke-width="1.6"/>':'<circle r="2" fill="#0b0b0b"/>'}</g>`;
  });
  svg.innerHTML=g; $('#plotCount').textContent=`${list.length} shipments`;
  const tip=$('#tip'), wrap=svg.parentElement;
  svg.querySelectorAll('.pt').forEach(p=>{
    const s=shipments.find(z=>z.id===p.dataset.id);
    p.onmousemove=e=>{const r=wrap.getBoundingClientRect();tip.style.left=(e.clientX-r.left)+'px';tip.style.top=(e.clientY-r.top)+'px';tip.style.opacity=1;
      tip.innerHTML=`<b>${s.sku}</b><span class="s">${s.id} · ${s.dest} · ${s.mode}</span><br>Readiness ${s.score} · ${STATUS[s.status].label}<br><span class="s">Docs ${s.docs}% · complexity ${s.reg} · ${s.blockers.length} open item${s.blockers.length===1?'':'s'}</span>`;};
    p.onmouseleave=()=>tip.style.opacity=0; p.onclick=()=>openDrawer(s.id);
  });
}

function renderAll(){supplierOptions();const l=filtered();renderKPIs(l);renderPlot(l);renderTable(l);}
['#fDest','#fMode','#fStatus','#fSup'].forEach(s=>$(s).onchange=renderAll); $('#q').oninput=renderAll;
$('#segView').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#segView .active').classList.remove('active');b.classList.add('active');view=b.dataset.v;renderTable(filtered());});

/* =========================================================
   Drawer
   ========================================================= */
function openDrawer(id){
  const s=shipments.find(z=>z.id===id); if(!s)return; selected=id; renderTable(filtered()); renderPlot(filtered());
  $('#drTitle').textContent=s.sku; $('#drMeta').textContent=`${s.id} · ${s.supplier} · China → ${s.dest} · ${s.mode} · ETA ${fmtD(s.eta)}`;
  const st=STATUS[s.status];
  const isfDue=daysFromNow(Math.round((s.loadDate-new Date())/864e5)-1);
  const cert=regChecklist(s);
  $('#drBody').innerHTML=`
    <div class="sec" style="display:flex;align-items:center;gap:14px">${pillStatus(s)}<span class="hint">${s.blockers.filter(b=>b[0]==='crit').length} blocking · ${s.blockers.filter(b=>b[0]!=='crit').length} to review</span></div>
    <div class="sec"><h4>What's stopping this shipment</h4>
      ${s.blockers.length?s.blockers.map(b=>`<div class="blk"><span class="ico ${b[0]}">${b[0]==='crit'?'!':'•'}</span><div><b>${b[1]}</b><p>${b[2]}</p><div class="fix">→ ${b[3]}</div></div></div>`).join(''):'<div class="blk"><span class="ico good">✓</span><div><b>No open blockers</b><p>Documents agree, required certificates on file, labels meet destination rules.</p></div></div>'}
    </div>
    <div class="sec"><h4>Three-way document check</h4>${matrix(s)}</div>
    <div class="sec"><h4>Regulatory checklist · ${s.dest}</h4>${cert.map(c=>`<div class="chk"><span class="box ${c[0]}">${c[0]==='ok'?'✓':c[0]==='miss'?'!':''}</span><div>${c[1]}<small>${c[2]}</small></div></div>`).join('')}</div>
    <div class="sec"><h4>Deadlines</h4><div class="tl">
      ${s.mode==='Ocean'?`<span class="d">${fmtD(isfDue)}</span><span class="${isfDue-new Date()<4*864e5?'due':''}">ISF (10+2) must be filed — 24 h before loading</span>`:`<span class="d">${fmtD(isfDue)}</span><span class="${isfDue-new Date()<3*864e5?'due':''}">Forwarder document cut-off</span>`}
      <span class="d">${fmtD(s.loadDate)}</span><span>Cargo loads · ${s.mode==='Ocean'?'Ningbo / Yantian':'PVG / SZX'}</span>
      ${s.dest==='EU'?`<span class="d">${fmtD(daysFromNow(Math.round((s.eta-new Date())/864e5)-3))}</span><span>ICS2 entry summary declaration (ENS)</span>`:''}
      <span class="d">${fmtD(s.eta)}</span><span>Arrival · entry filed by broker</span>
      <span class="d">${fmtD(daysFromNow(Math.round((s.eta-new Date())/864e5)+4))}</span><span>Last free day at terminal — demurrage starts</span>
    </div></div>
    <div class="sec"><h4>Share</h4><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="toast('Request sent to ${s.supplier} (zh-CN)')">Request fixes from supplier</button><button class="btn" onclick="toast('Read-only link copied for your broker')">Share with broker</button><button class="btn ghost" onclick="toast('Readiness report exported')">Export report</button></div></div>`;
  $('#drawer').classList.add('open'); $('#scrim').classList.add('open');
}
function closeDrawer(){$('#drawer').classList.remove('open');$('#scrim').classList.remove('open');selected=null;renderTable(filtered());renderPlot(filtered());}
$('#drClose').onclick=closeDrawer; $('#scrim').onclick=closeDrawer;

function matrix(s){
  if(s.ex){ // real extracted values from the upload flow
    const docs=['inv','pl','bl'];
    const rows=FIELDS.map(([f,label])=>{const vals=docs.map(k=>s.ex[k]?(s.ex[k][f]||'—'):'not uploaded'); const present=docs.filter(k=>s.ex[k]&&s.ex[k][f]).map(k=>norm(s.ex[k][f])); const bad=COMPARE.has(f)&&present.length>1&&new Set(present).size>1;
      return `<tr><td class="k">${label}</td>${vals.map((v,i)=>`<td class="${bad&&s.ex[docs[i]]&&s.ex[docs[i]][f]?'bad':''}">${v}</td>`).join('')}</tr>`;}).join('');
    return `<table class="matrix"><thead><tr><th></th><th>Commercial invoice</th><th>Packing list</th><th>${s.mode==='Air'?'Air waybill':'Bill of lading'}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  const bad=t=>s.blockers.some(b=>b[1].toLowerCase().includes(t));
  const rows=[
    ['Description', s.sku, bad('description')?'wooden blocks':s.sku, bad('description')?'puzzle':s.sku, bad('description')],
    ['Quantity', bad('quantity')?'1,200':'1,200', bad('quantity')?'1,150':'1,200', '1,200', bad('quantity')],
    ['Gross weight', bad('weight')?'412 kg':'640 kg', bad('weight')?'412 kg':'640 kg', bad('weight')?'398 kg':'640 kg', bad('weight')],
    ['HS code', bad('hs code differs')?'8423.10':'—', '—', bad('hs code differs')?'8423.81':'—', bad('hs code differs')],
    ['Consignee', bad('consignee')?'Nordic Play AB':'Importer LLC', bad('consignee')?'Nordic Play AB':'Importer LLC', bad('consignee')?'Nordic Play Logistics AB':'Importer LLC', bad('consignee')],
    ['Value / Incoterm', bad('incoterm')?'€—  (missing)':'USD · FOB', '—', '—', bad('incoterm')],
  ];
  return `<table class="matrix"><thead><tr><th></th><th>Commercial invoice</th><th>Packing list</th><th>${s.mode==='Air'?'Air waybill':'Bill of lading'}</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="k">${r[0]}</td>${[1,2,3].map(i=>`<td class="${r[4]&&r[i]!==r[1]&&i!==1?'bad':(r[4]&&i===1?'bad':'')}">${r[i]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function regChecklist(s){
  const t=s.sku.toLowerCase(); const out=[];
  const has=re=>re.test(t); const miss=re=>s.blockers.some(b=>re.test(b[1].toLowerCase()));
  if(s.dest==='US'){
    out.push(['ok','HTS classification with rationale','Suggested from CROSS rulings; confidence shown in table']);
    if(has(/bluetooth|wireless|usb|charger|electronic|scale|led/))out.push([miss(/fcc/)?'miss':'ok','FCC SDoC + test report','47 CFR Part 15 — any intentional/unintentional radiator']);
    if(has(/battery|bluetooth|scale|lithium/))out.push([miss(/lithium/)?'miss':'ok','Lithium battery declaration (UN3090/3091)','DOT/IATA packing instruction on shipper\'s declaration']);
    if(has(/kid|toy|plush|puzzle|children|baby/))out.push([miss(/cpc|certificate/)?'miss':'ok','CPSC Children\'s Product Certificate','CPSIA lead/phthalates + ASTM F963 from accepted lab'],[miss(/tracking/)?'miss':'ok','Permanent tracking label','Manufacturer, location, date, batch']);
    if(has(/serum|cosmetic|lotion|cream/))out.push([miss(/mocra|registration/)?'miss':'ok','FDA facility registration + product listing (MoCRA)',''],[miss(/prior notice|product code/)?'miss':'ok','FDA product code on invoice','Avoids automatic FDA review hold']);
    if(has(/dinner|bottle|kitchen|food/))out.push(['ok','FDA food-contact compliance','21 CFR 175–178 declaration from supplier']);
    if(has(/bamboo|wood/))out.push(['ok','Lacey Act declaration','Plant genus/species + country of harvest']);
    out.push([miss(/origin/)?'miss':'ok','Country-of-origin marking','19 CFR 134 — permanent, conspicuous'],['ok','UFLPA / forced-labor screening','Supplier not on entity list; cotton/polysilicon/tomato check n/a']);
    out.push(['na','Section 301 / 232 / IEEPA duty stack','Reflected in estimated duty; alerts on when rates change']);
  } else {
    out.push(['ok','TARIC / UK Global Tariff classification','']);
    if(has(/charger|usb|electronic|scale|bluetooth|led/))out.push([miss(/ce|doc/)?'miss':'ok','CE Declaration of Conformity + technical file','LVD / EMC / RED as applicable'],[miss(/weee/)?'miss':'ok','WEEE producer registration','Per member state']);
    if(has(/toy|puzzle|plush|kid/))out.push([miss(/en 71/)?'miss':'ok','EN 71 test reports + CE','Toy Safety Directive 2009/48/EC']);
    if(has(/candle|scent|fragrance/))out.push([miss(/clp/)?'miss':'ok','CLP hazard labelling','Allergen declaration above threshold']);
    if(s.dest==='EU')out.push([miss(/responsible person|gpsr/)?'miss':'ok','GPSR Responsible Person on product/packaging','Reg. (EU) 2023/988 Art. 16'],['ok','Packaging EPR registration','e.g. LUCID (DE), Citeo (FR)'],['ok','EORI + import VAT / IOSS handling','']);
    if(s.dest==='UK')out.push(['ok','UKCA / UK Responsible Person','Where applicable'],['ok','EORI (GB) + import VAT','']);
    out.push(['ok','REACH / RoHS declarations','Substances of very high concern']);
  }
  return out;
}

/* =========================================================
   Toast
   ========================================================= */
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2200);}

/* =========================================================
   New shipment wizard
   ========================================================= */
let wiz = null;
const DOCS=[['inv','Commercial invoice'],['pl','Packing list'],['bl','Bill of lading / AWB']];
const OPT=[['certs','Certificates & test reports'],['art','Label / packaging artwork']];

function openWizard(prefill){
  wiz={step:0,files:{},desc:'',dest:'US',mode:'Ocean',supplier:'',sku:'',qty:'',ex:null,...(prefill||{})};
  $('#modal').classList.add('open'); renderWiz();
}
$('#btnNew').onclick=()=>openWizard();
$('#btnDemo').onclick=()=>openWizard({desc:'Bluetooth-enabled digital kitchen scale with LED display, CR2032 battery included, 1,200 units in 100 cartons',dest:'US',mode:'Ocean',supplier:'Shenzhen Luxin Electronics',sku:'Smart kitchen scale',demo:true,files:{inv:[{name:'CI-LX-2291.pdf'}],pl:[{name:'PL-LX-2291.xlsx'}],bl:[{name:'Draft-BL-ONEY.pdf'}],certs:[{name:'FCC_Part15_report.pdf'}]}});
$('#moClose').onclick=()=>$('#modal').classList.remove('open');
$('#moBack').onclick=()=>{if(wiz.step>0){wiz.step--;renderWiz();}};
$('#moNext').onclick=()=>{
  if(wiz.step===0){ if(!wiz.desc.trim()){toast('Describe what is in the shipment first');return;} wiz.step=1; renderWiz(); runExtraction(); return;}
  if(wiz.step===1){ wiz.step=2; renderWiz(); return;}
  if(wiz.step===2){ wiz.step=3; renderWiz(); return;}
  if(wiz.step===3){ commitShipment(); return;}
};

function renderWiz(){
  const steps=$('#steps').children; [...steps].forEach((s,i)=>{s.className=i<wiz.step?'done':i===wiz.step?'on':'';});
  $('#moBack').style.visibility=wiz.step===0?'hidden':'visible';
  $('#moNext').textContent=wiz.step===3?'Add to shipments':'Continue';
  const b=$('#moBody');
  if(wiz.step===0){
    $('#moHint').textContent='PDF, image, Excel or CSV. We extract the fields and compare the documents to each other and to the destination\'s rules.';
    b.innerHTML=`
      <div class="row">
        <div class="field full"><label>What is in the shipment? <span class="hint">(plain language — this drives classification and regulatory flags)</span></label><textarea id="wDesc" rows="2" placeholder="e.g. Bluetooth kitchen scale with LED display and CR2032 battery, 1,200 units in 100 cartons">${wiz.desc}</textarea></div>
        <div class="field"><label>Destination market</label><select id="wDest"><option ${wiz.dest==='US'?'selected':''}>US</option><option ${wiz.dest==='EU'?'selected':''}>EU</option><option ${wiz.dest==='UK'?'selected':''}>UK</option></select></div>
        <div class="field"><label>Mode</label><select id="wMode"><option ${wiz.mode==='Ocean'?'selected':''}>Ocean</option><option ${wiz.mode==='Air'?'selected':''}>Air</option><option ${wiz.mode==='Express'?'selected':''}>Express</option></select></div>
        <div class="field"><label>Supplier</label><input id="wSup" value="${wiz.supplier}" placeholder="Factory / trading company"></div>
      </div>
      <div class="drops" id="drops">
        ${[...DOCS,...OPT].map(([k,t],i)=>`<div class="drop ${i>2?'opt':''} ${wiz.files[k]?'has':''}" data-k="${k}">
          <input type="file" multiple data-k="${k}">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="color:var(--muted)"><path d="M12 16V4m0 0l-4 4m4-4l4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
          <div class="t">${t}</div>
          <div class="h">Drop file or click to browse</div>
          ${wiz.files[k]?`<div class="f">${wiz.files[k].map(f=>f.name).join(', ')}</div>`:''}
        </div>`).join('')}
      </div>
      <div class="note">${wiz.demo?'Sample mode: documents are simulated so you can see the flow without uploading anything.':'Uploads are sent to your own ClearWay server for extraction (see README). Supported: PDF, PNG/JPG, CSV/TXT.'} You can continue without all three documents; missing ones are flagged as blockers.</div>`;
    $('#wDesc').oninput=e=>wiz.desc=e.target.value; $('#wDest').onchange=e=>wiz.dest=e.target.value; $('#wMode').onchange=e=>wiz.mode=e.target.value; $('#wSup').oninput=e=>wiz.supplier=e.target.value;
    b.querySelectorAll('.drop input').forEach(inp=>{
      inp.onchange=e=>{wiz.files[inp.dataset.k]=[...e.target.files];renderWiz();};
      const d=inp.parentElement; d.ondragover=e=>{e.preventDefault();d.classList.add('over');}; d.ondragleave=()=>d.classList.remove('over');
      d.ondrop=e=>{e.preventDefault();d.classList.remove('over');wiz.files[inp.dataset.k]=[...e.dataTransfer.files];renderWiz();};
    });
  }
  if(wiz.step===1){
    $('#moHint').textContent=(apiMode==='live'?'Extracted by Claude from your documents. ':apiMode==='offline'?'Server not reachable — showing simulated extraction. ':'Simulated extraction (no API key configured). ')+'Fields are editable — fix a value and the cross-check updates.';
    if(!wiz.ex){ b.innerHTML=`<div class="prog" id="prog">${DOCS.map(([k,t])=>`<div class="pr"><span style="width:180px">${t}</span><span class="bar"><i id="pb-${k}"></i></span><span class="st" id="ps-${k}">${wiz.files[k]||wiz.demo?'Queued':'Not uploaded'}</span></div>`).join('')}</div><p class="hint" style="margin-top:18px">Reading documents, locating line items, normalising units and matching parties…</p>`; return; }
    b.innerHTML=renderCompare();
    b.querySelectorAll('.cmp input').forEach(i=>i.oninput=()=>{wiz.ex[i.dataset.doc][i.dataset.f]=i.value; const scroll=b.scrollTop; b.innerHTML=renderCompare(); b.scrollTop=scroll; b.querySelectorAll('.cmp input').forEach(j=>j.oninput=i.oninput); const again=b.querySelector(`input[data-doc="${i.dataset.doc}"][data-f="${i.dataset.f}"]`); if(again){again.focus();again.setSelectionRange(again.value.length,again.value.length);} });
  }
  if(wiz.step===2){
    $('#moHint').textContent='Derived from the product description, destination and uploaded certificates. Tick what you have; missing items become blockers.';
    const reqs=regFor(wiz);
    b.innerHTML=`<div class="twoc"><div><h4 style="margin:0 0 10px;font-size:13px">Required for ${wiz.dest} · ${wiz.desc.slice(0,60)}${wiz.desc.length>60?'…':''}</h4>
      ${reqs.map((r,i)=>`<label class="chk" style="cursor:pointer"><input type="checkbox" data-i="${i}" ${r.have?'checked':''} style="width:18px;height:18px;margin:0;flex:none"><div><b style="font-weight:500">${r.name}</b><small>${r.why}</small></div></label>`).join('')}
      </div><div><h4 style="margin:0 0 10px;font-size:13px">Classification</h4>
      <div class="blk" style="display:block"><b>${wiz.cls.code} <span class="pill ${wiz.cls.conf>=85?'good':'warn'}" style="min-width:0;margin-left:6px">${wiz.cls.conf}% confidence</span></b><p>${wiz.cls.text}</p><div class="fix">Est. duty: ${wiz.cls.duty}</div></div>
      <div class="blk" style="display:block"><b>Why this code</b><p>${wiz.cls.why}</p><p class="hint" style="margin-top:6px">In production: pulled from the HTS/TARIC schedule and matching CBP CROSS / BTI rulings via API, with the ruling linked.</p></div>
      </div></div>`;
    b.querySelectorAll('input[type=checkbox]').forEach(c=>c.onchange=()=>{wiz.reqs[+c.dataset.i].have=c.checked;});
  }
  if(wiz.step===3){
    const r=assess(wiz); wiz.result=r;
    $('#moHint').textContent='This is what your broker and your supplier will see.';
    const col=r.status==='good'?'var(--good)':r.status==='warn'?'var(--warn)':'var(--crit)';
    const circ=2*Math.PI*70;
    b.innerHTML=`<div class="result">
      <div><div class="ring"><svg width="170" height="170"><circle cx="85" cy="85" r="70" fill="none" stroke="var(--hair)" stroke-width="12"/><circle cx="85" cy="85" r="70" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-r.score/100)}"/></svg><div class="c"><div><b>${r.score}</b><br><span>Readiness</span></div></div></div>
        <div style="text-align:center;margin-top:10px"><span class="pill ${STATUS[r.status].css}">${STATUS[r.status].label}</span></div>
        <div class="hint" style="text-align:center;margin-top:10px">${r.status==='crit'?'Do not book until blocking items are cleared.':r.status==='warn'?'Bookable, but fix items before ISF/cut-off.':'Clear to book.'}</div></div>
      <div>
        ${r.blockers.length?r.blockers.map(bk=>`<div class="blk"><span class="ico ${bk[0]}">${bk[0]==='crit'?'!':'•'}</span><div><b>${bk[1]}</b><p>${bk[2]}</p><div class="fix">→ ${bk[3]}</div></div></div>`).join(''):'<div class="blk"><span class="ico good">✓</span><div><b>No blockers found</b><p>All three documents agree and every required certificate is on file.</p></div></div>'}
        <div class="hint" style="margin-top:10px">Estimated exposure if shipped as-is: <b>$${r.exposure.toLocaleString()}</b> (exam fees, broker handling, ${r.status==='crit'?'3–7':'0–2'} days of demurrage).</div>
      </div></div>`;
  }
}

/* ---- extraction simulation ---- */
/* ---- extraction: real (server + Claude) with simulated fallback ---- */
const API_BASE = (location.protocol==='file:') ? null : '';
let apiMode = 'unknown'; // 'live' | 'simulated' | 'offline'

async function filesToPayload(){
  const out={};
  for(const [k] of [...DOCS,...OPT]){
    const fs=wiz.files[k]; if(!fs||!fs.length)continue;
    out[k]=[];
    for(const f of fs){
      if(!(f instanceof Blob)){ out[k].push({name:f.name,simulated:true}); continue; }
      if(f.size>8*1024*1024){ out[k].push({name:f.name,error:'too large (8 MB max)'}); continue; }
      const b64=await new Promise(res=>{const r=new FileReader(); r.onload=()=>res(String(r.result).split(',')[1]); r.readAsDataURL(f);});
      out[k].push({name:f.name,type:f.type||'application/octet-stream',data:b64});
    }
  }
  return out;
}

function runExtraction(){
  const seq=DOCS.map(d=>d[0]); let i=0, serverDone=false, serverResult=null;
  const finish=()=>{
    if(serverResult&&serverResult.ex){ wiz.ex=mergeExtraction(serverResult.ex); wiz.cls=serverResult.classification||classify(wiz); apiMode='live'; }
    else { wiz.ex=buildExtraction(); wiz.cls=classify(wiz); if(apiMode==='unknown')apiMode='simulated'; }
    wiz.reqs=regFor(wiz); renderWiz();
  };
  // kick off the real call in parallel with the progress animation
  const realFiles=Object.values(wiz.files).flat().some(f=>f instanceof Blob);
  if(API_BASE!==null && realFiles && !wiz.demo){
    filesToPayload().then(docs=>fetch(API_BASE+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({desc:wiz.desc,dest:wiz.dest,mode:wiz.mode,supplier:wiz.supplier,docs})}))
      .then(r=>r.ok?r.json():Promise.reject(r.status))
      .then(j=>{serverResult=j; if(j.simulated)apiMode='simulated';})
      .catch(()=>{apiMode='offline';})
      .finally(()=>{serverDone=true;});
  } else { serverDone=true; apiMode= wiz.demo?'simulated':'offline'; }
  const step=()=>{ if(i>=seq.length){ if(serverDone)finish(); else { const st=document.querySelector('#prog + p'); if(st)st.textContent='Waiting for document analysis…'; setTimeout(step,300);} return;}
    const k=seq[i]; const have=wiz.files[k]||wiz.demo; const bar=$('#pb-'+k), st=$('#ps-'+k);
    if(!have){ st.textContent='Not uploaded'; bar.style.background='var(--line)'; bar.style.width='100%'; i++; setTimeout(step,250); return;}
    const stages=['Reading…','Finding line items…','Normalising units…','Matching parties…','Done'];
    let j=0; const t=setInterval(()=>{ j++; bar.style.width=(j/4*100)+'%'; st.textContent=stages[j]; if(j>=4){clearInterval(t); i++; setTimeout(step,200);} },320);
  }; setTimeout(step,300);
}
/* server returns {inv:{...}|null, pl:{...}|null, bl:{...}|null}; keep only known fields, null for docs not uploaded */
function mergeExtraction(ex){
  const out={};
  ['inv','pl','bl'].forEach(k=>{ if(!ex[k]||!wiz.files[k]){out[k]=null;return;} const o={}; FIELDS.forEach(([f])=>o[f]=ex[k][f]==null?'':String(ex[k][f])); out[k]=o; });
  return out;
}
function num(desc,re,def){const m=desc.replace(/,/g,'').match(re);return m?+m[1]:def;}
function buildExtraction(){
  const d=wiz.desc; const qty=num(d,/(\d{2,6})\s*(?:units|pcs|pieces|sets)/i,1200); const ctn=num(d,/(\d{1,5})\s*(?:cartons|ctns|boxes)/i,Math.round(qty/12));
  const title=wiz.sku||d.split(/[,.]|\bwith\b/)[0].trim().replace(/^\d+\s*(units|pcs)?\s*(of)?\s*/i,'')||'Goods';
  const has=k=>!!(wiz.files[k]||wiz.demo);
  const kg=Math.round(qty*0.42+ctn*0.9);
  const ex={
    inv: has('inv')?{desc:title,qty:String(qty),cartons:String(ctn),weight:kg+' kg',value:'USD '+(qty*9.5).toLocaleString(),incoterm:'FOB Yantian',consignee:'Importer LLC',origin:'China',hs:''}:null,
    pl:  has('pl') ?{desc:title.replace(/smart |digital /i,''),qty:String(qty-50),cartons:String(ctn),weight:kg+' kg',value:'',incoterm:'',consignee:'Importer LLC',origin:'China',hs:''}:null,
    bl:  has('bl') ?{desc:(title.split(' ').slice(-2).join(' ')),qty:'',cartons:String(ctn),weight:(kg-14)+' kg',value:'',incoterm:'',consignee:'Importer LLC.',origin:'',hs:''}:null,
  };
  return ex;
}
function compareIssues(ex){
  const issues=[]; const docs=['inv','pl','bl']; const names={inv:'invoice',pl:'packing list',bl:'BL/AWB'};
  docs.forEach(k=>{if(!ex[k])issues.push(['crit',`${DOCS.find(d=>d[0]===k)[1]} missing`,'Entry cannot be prepared without it.','Upload or request from supplier/forwarder.']);});
  FIELDS.forEach(([f,label])=>{
    if(!COMPARE.has(f))return;
    const vals=docs.filter(k=>ex[k]&&ex[k][f]).map(k=>[k,ex[k][f]]);
    if(vals.length<2)return;
    const base=norm(vals[0][1]); const diff=vals.filter(v=>norm(v[1])!==base);
    if(diff.length){
      const sev=(f==='qty'||f==='consignee')?'crit':'warn';
      const text=vals.map(v=>`${names[v[0]]}: ${v[1]}`).join(' · ');
      issues.push([sev,`${label} mismatch`,text, f==='desc'?'Use one standard description from the SKU record on every document.':f==='consignee'?'Match the legal entity name exactly (and EORI/EIN) on all documents.':'Confirm with supplier and reissue the document.']);
    }
  });
  if(ex.inv&&!ex.inv.incoterm)issues.push(['crit','Incoterm missing on invoice','Customs value cannot be established.','Add Incoterm (e.g. FOB Yantian).']);
  if(ex.inv&&!ex.inv.value)issues.push(['crit','Value / currency missing on invoice','','Add total value with currency.']);
  if(ex.inv&&!ex.inv.hs)issues.push(['warn','No HS code on invoice','Brokers will classify from description; adding the code reduces queries.',`Add ${wiz.cls?wiz.cls.code:'the suggested code'} to each line.`]);
  return issues;
}
function renderCompare(){
  const ex=wiz.ex; const issues=compareIssues(ex); wiz.docIssues=issues;
  const cells=FIELDS.map(([f,label])=>{
    const vals=['inv','pl','bl'].map(k=>ex[k]?ex[k][f]:null);
    const present=vals.filter(v=>v); const bad=COMPARE.has(f)&&present.length>1&&new Set(present.map(norm)).size>1;
    return `<div class="k">${label}</div>`+['inv','pl','bl'].map((k,i)=>{
      if(!ex[k])return `<div class="miss"><span class="na">not uploaded</span></div>`;
      const v=ex[k][f]; const isBad=bad&&norm(v)!==norm(present[0]) || (bad&&i===0);
      const required=(k==='inv'&&['value','incoterm'].includes(f)&&!v);
      return `<div class="${isBad?'bad':required?'miss':''}"><input data-doc="${k}" data-f="${f}" value="${v||''}" placeholder="${required?'required':'—'}"></div>`;}).join('');
  }).join('');
  return `<div class="cmp"><div class="hh"></div><div class="hh">Commercial invoice</div><div class="hh">Packing list</div><div class="hh">${wiz.mode==='Air'?'Air waybill':'Bill of lading'}</div>${cells}</div>
    <div class="issues"><h4 style="font-size:13px;margin:0 0 8px">${issues.length} issue${issues.length===1?'':'s'} found</h4>
    ${issues.length?issues.map(b=>`<div class="blk"><span class="ico ${b[0]}">${b[0]==='crit'?'!':'•'}</span><div><b>${b[1]}</b><p>${b[2]}</p><div class="fix">→ ${b[3]}</div></div></div>`).join(''):'<div class="blk"><span class="ico good">✓</span><div><b>Documents agree</b></div></div>'}</div>`;
}

function assess(w){
  const blockers=[...(w.docIssues||[])];
  (w.reqs||[]).forEach(r=>{if(!r.have)blockers.push([/marking|registration|epr|eori|hs code|weee|reach/i.test(r.name)?'warn':'crit',`${r.name} not on file`,r.why,'Request from supplier / upload to SKU record.']);});
  if(w.cls&&w.cls.conf<85)blockers.push(['warn','Classification confidence below 85%',`${w.cls.code} — ${w.cls.text}`,'Add material/function details or request a broker opinion.']);
  let score=100; blockers.forEach(b=>score-=b[0]==='crit'?10:4); score=Math.max(5,score);
  const status=statusOf(score,blockers);
  const exposure=blockers.filter(b=>b[0]==='crit').length*1400+blockers.filter(b=>b[0]==='warn').length*350;
  return {score,status,blockers,exposure};
}
function commitShipment(){
  const r=wiz.result; const id='SH-'+(1070+shipments.filter(s=>s.isNew).length);
  const docsPct=Math.round(100-(wiz.docIssues||[]).reduce((a,b)=>a+(b[0]==='crit'?18:8),0));
  const regC=Math.min(98,40+(wiz.reqs||[]).length*9);
  const lvl=n=>n===0?'good':n===1?'warn':n===2?'serious':'crit';
  const docCrit=(wiz.docIssues||[]).filter(b=>b[0]==='crit').length, docWarn=(wiz.docIssues||[]).length-docCrit;
  const regMiss=(wiz.reqs||[]).filter(x=>!x.have).length;
  const s={id,sku:wiz.sku||wiz.desc.split(/[,.]|\bwith\b/)[0].trim().slice(0,40),supplier:wiz.supplier||'Unassigned supplier',dest:wiz.dest,mode:wiz.mode,
    docs:Math.max(10,docsPct),reg:regC,hs:wiz.cls.conf>=85?'good':wiz.cls.conf>=65?'warn':'crit',regl:lvl(Math.min(3,regMiss)),match:lvl(Math.min(3,docCrit+Math.ceil(docWarn/2))),
    label:(wiz.reqs||[]).some(x=>!x.have&&/label|marking|responsible person/i.test(x.name))?'crit':'good',duty:wiz.cls.duty,
    loadDate:daysFromNow(wiz.mode==='Ocean'?8:3),eta:daysFromNow(wiz.mode==='Ocean'?36:wiz.mode==='Air'?8:5),blockers:r.blockers,score:r.score,status:r.status,isNew:true,ex:wiz.ex};
  shipments.unshift(s); $('#modal').classList.remove('open'); renderAll(); toast(`${s.id} added — readiness ${s.score}`); setTimeout(()=>openDrawer(s.id),250);
}

renderAll();
