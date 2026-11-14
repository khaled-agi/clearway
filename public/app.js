/* ClearWay — front end. Vanilla JS, hash-routed pages, localStorage persistence. */
'use strict';
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtD=d=>new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const daysUntil=d=>Math.round((new Date(d)-Date.now())/864e5);
const addDays=n=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString();};
const uid=p=>p+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
const STATUS={good:['Ready','good'],warn:['Needs attention','warn'],crit:['Blocked','crit']};
const DOCS=[['inv','Commercial invoice','What was sold, to whom, for how much. Customs values the shipment from this.'],['pl','Packing list','What is physically in each carton: counts, weights, dimensions.'],['bl','Bill of lading / air waybill','The carrier\'s receipt. Must describe the same goods as the invoice.']];
const OPT=[['certs','Certificates & test reports','FCC, CPC, CE, FDA letters, lab reports.'],['art','Label / packaging artwork','So we can check origin marking, warnings, Responsible Person.']];

/* =====================================================================
   State + persistence
   ===================================================================== */
const KEY='clearway.v3';
let MODE='local'; // 'local' (no server / file://), 'server' (signed in)
let ME=null, WS=null, saveTimer=null;
let S=emptyState();
function emptyState(){return {shipments:[],products:[],partners:[],settings:{company:'',ein:'',eori:'',market:'US',currency:'USD',role:'Importer'},costs:{},onboarding:{}};}
function loadLocal(){ try{const j=JSON.parse(localStorage.getItem(KEY)); if(j&&j.shipments)return j;}catch(e){} return emptyState(); }
function save(){ try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}
  if(MODE==='server'){clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:S,workspaceName:S.settings.company||undefined})});if(r.status===401){MODE='anon';showAuth();}}catch(e){}},600);} }
function reset(){ S=seed(); if(!S.settings.role)S.settings.role='Importer'; save(); route(); toast('Sample data loaded'); }
function clearAll(){ S=emptyState(); if(ME)S.settings.company=WS&&WS.name||''; save(); route(); toast('Workspace cleared'); }

function mkB(sev,kind,title,detail,fix,owner,reqId){return {id:uid('B'),sev,kind,title,detail,fix,owner:owner||'Factory',reqId:reqId||null,done:false};}
function seed(){
  const partners=[
    {id:'P1',name:'Shenzhen Luxin Electronics',type:'Factory',country:'CN',contact:'amy.luo@luxin-sz.com',lang:'zh'},
    {id:'P2',name:'Dongguan Meiwei Toys',type:'Factory',country:'CN',contact:'sales@meiweitoys.cn',lang:'zh'},
    {id:'P3',name:'Guangzhou Aroma Craft',type:'Factory',country:'CN',contact:'export@aromacraft.cn',lang:'zh'},
    {id:'P4',name:'Yiwu Hengda Houseware',type:'Factory',country:'CN',contact:'hengda@yiwu-hd.com',lang:'zh'},
    {id:'P5',name:'Ningbo Ruiyi Metal',type:'Factory',country:'CN',contact:'ruiyi@nbmetal.cn',lang:'zh'},
    {id:'P6',name:'Xiamen Sunrise Sports',type:'Factory',country:'CN',contact:'trade@sunrise-xm.com',lang:'zh'},
    {id:'P7',name:'Pacific Gate Customs Brokers',type:'Broker',country:'US',contact:'entries@pacificgate.us',lang:'en'},
    {id:'P8',name:'Nordic Clear ApS',type:'Broker',country:'DK',contact:'ops@nordicclear.dk',lang:'en'},
    {id:'P9',name:'Seaway Forwarding (Shenzhen)',type:'Forwarder',country:'CN',contact:'bookings@seaway-sz.com',lang:'zh'},
  ];
  const products=[
    {id:'PR1',name:'Smart kitchen scale',desc:'Bluetooth-enabled digital kitchen scale with LED display, CR2032 battery included',supplier:'Shenzhen Luxin Electronics',markets:['US','EU'],have:{'us-hts':1,'us-fdacode':1,'us-ior':1,'eu-taric':1,'eu-eori':1},certs:[{name:'FCC Part 15 report',status:'expired',expires:addDays(-40)},{name:'Food-contact letter',status:'ok',expires:addDays(300)}]},
    {id:'PR2',name:'Plush toy, 30 cm',desc:'Stuffed plush bear toy for children 3+, polyester fibre',supplier:'Dongguan Meiwei Toys',markets:['US'],have:{'us-hts':1,'us-ior':1,'us-origin':1},certs:[{name:'ASTM F963 report',status:'pending'}]},
    {id:'PR3',name:'USB-C wall charger 65W',desc:'GaN USB-C wall charger 65W with EU plug',supplier:'Shenzhen Luxin Electronics',markets:['EU','UK'],have:{'eu-taric':1,'eu-eori':1,'eu-reach':1,'uk-tariff':1,'uk-eori':1},certs:[{name:'CE DoC (LVD/EMC)',status:'outdated',expires:addDays(120)}]},
    {id:'PR4',name:'Kids bamboo dinner set',desc:'Bamboo fibre dinner set for children: plate, bowl, cup, spoon',supplier:'Yiwu Hengda Houseware',markets:['US'],have:{'us-hts':1,'us-ior':1,'us-origin':1,'us-foodcontact':1,'us-lacey':1,'us-cpc':1,'us-tracking':1,'us-smallparts':1,'us-fdacode':1,'us-isf':1},certs:[{name:'CPC + CPSIA report',status:'ok',expires:addDays(400)},{name:'FDA food-contact letter',status:'ok'}]},
    {id:'PR5',name:'Stainless water bottles',desc:'Double-wall vacuum insulated stainless steel water bottle 750 ml',supplier:'Ningbo Ruiyi Metal',markets:['US'],have:{'us-hts':1,'us-ior':1,'us-foodcontact':1,'us-fdacode':1,'us-isf':1},certs:[{name:'FDA food-contact letter',status:'ok'}]},
    {id:'PR6',name:'Scented soy candles',desc:'Soy wax scented candle in glass jar, 200 g',supplier:'Guangzhou Aroma Craft',markets:['UK'],have:{'uk-tariff':1,'uk-eori':1},certs:[]},
    {id:'PR7',name:'Wooden puzzle set',desc:'Wooden educational puzzle set for children 3+, painted beech',supplier:'Dongguan Meiwei Toys',markets:['EU'],have:{'eu-taric':1},certs:[]},
    {id:'PR8',name:'Yoga mats, TPE',desc:'TPE yoga mat 6 mm, 183×61 cm',supplier:'Xiamen Sunrise Sports',markets:['US'],have:{'us-hts':1,'us-ior':1,'us-origin':1,'us-isf':1},certs:[]},
    {id:'PR9',name:'Vitamin C serum',desc:'Vitamin C facial serum 30 ml, cosmetic',supplier:'Guangzhou Aroma Craft',markets:['US'],have:{'us-hts':1,'us-ior':1,'us-origin':1},certs:[]},
  ];
  const sh=(id,productId,dest,mode,units,value,loadIn,etaIn,blockers,extra)=>({id,productId,dest,mode,units,value,loadDate:addDays(loadIn),eta:addDays(etaIn),createdAt:addDays(-Math.abs(loadIn)-5),blockers,docs:{inv:'ok',pl:'ok',bl:'ok'},...(extra||{})});
  const shipments=[
    sh('SH-1047','PR1','US','Ocean',1200,11400,4,31,[
      mkB('crit','qty','Quantity mismatch','Invoice says 1,200 units; packing list says 1,150.','Confirm the count with the factory and have the packing list reissued.','Factory'),
      mkB('crit','cert','FCC test report expired','Product has a Bluetooth radio; the Part 15 report on file expired 40 days ago.','Ask the factory for the current report and SDoC; reference it on the invoice.','Factory','us-fcc'),
      mkB('warn','hs-mismatch','HS code differs across documents','Invoice shows 8423.10; bill of lading draft shows 8423.81.','Align to 8423.10.00 on all documents.','Forwarder'),
      mkB('warn','filing','Lithium cell declaration missing','Contains CR2032 cells → UN3091 statement required on the shipper\'s declaration.','Add UN3091 / PI 970 statement to the packing list and DG declaration.','Factory','us-lithium')],{docs:{inv:'mismatch',pl:'mismatch',bl:'mismatch'}}),
    sh('SH-1051','PR2','US','Air',5000,22500,2,7,[
      mkB('crit','cert','Children\'s Product Certificate not on file','CPSC requires a CPC citing CPSIA lead/phthalate and ASTM F963 tests from an accepted lab.','Upload CPC + lab reports (check the lab\'s accreditation number).','Factory','us-cpc'),
      mkB('crit','label-tracking','Tracking label missing from artwork','Packaging artwork lacks the permanent tracking label (manufacturer, location, date, batch).','Send the tracking-label spec to the factory before the print run.','Factory','us-tracking'),
      mkB('warn','weight','Weight mismatch','Packing list gross weight 412 kg vs AWB 398 kg.','Reconcile with the forwarder before the AWB is cut.','Forwarder')],{docs:{inv:'ok',pl:'mismatch',bl:'mismatch'}}),
    sh('SH-1055','PR3','EU','Ocean',3000,27000,12,44,[
      mkB('crit','label-rp','GPSR Responsible Person not on label','No EU-established economic operator named on product, packaging or accompanying document.','Appoint an EU RP and add name + address to the packaging.','Importer','eu-gpsr'),
      mkB('warn','cert','CE Declaration references a withdrawn standard','DoC cites EN 62368-1:2014; the harmonised version is now EN IEC 62368-1:2020+A11.','Ask the factory for an updated DoC and test report.','Factory','eu-ce'),
      mkB('warn','registration','WEEE registration missing for Germany','Producer registration required in the destination member state (stiftung ear).','Register or appoint an authorised representative; add the number to the SKU record.','Importer','eu-weee')]),
    sh('SH-1042','PR4','US','Ocean',2400,16800,-6,24,[],{stage:5,docs:{inv:'ok',pl:'ok',bl:'ok'},pol:'CNNGB',pod:'USLAX',carrier:'COSCO',vessel:'COSCO SHIPPING ARIES 071E',container:'CSNU6723481'}),
    sh('SH-1058','PR5','US','Ocean',6000,33000,15,42,[
      mkB('warn','label-origin','Origin marking only on removable sleeve','"Made in China" must be permanent and conspicuous on the bottle itself.','Laser-mark the origin on the base.','Factory','us-origin')]),
    sh('SH-1060','PR6','UK','Express',800,4800,3,8,[
      mkB('warn','hs-low','Classification confidence low','3406.00 vs 3307.49 (room-perfuming preparation) depends on primary function and marketing.','Add product spec + marketing copy to the SKU record; request a broker opinion.','Importer'),
      mkB('warn','label-warning','UK CLP labelling','Fragrance allergens above threshold require a hazard pictogram and allergen list.','Obtain the SDS from the supplier and update the label.','Factory','eu-clp')]),
    sh('SH-1063','PR7','EU','Ocean',1500,9000,6,39,[
      mkB('crit','incoterm','Commercial invoice missing Incoterm and currency','The entry value cannot be determined.','Reissue the invoice with FOB Ningbo, USD.','Factory'),
      mkB('crit','cert','EN 71 test reports not provided','Toy Safety Directive requires EN 71-1/-2/-3 and a technical file.','Request from the factory; verify the lab.','Factory','eu-en71'),
      mkB('crit','consignee','Consignee differs','Invoice: "Nordic Play AB"; BL draft: "Nordic Play Logistics AB".','Match the legal entity and EORI across all documents.','Forwarder'),
      mkB('warn','desc','Description inconsistency','"Educational toy" / "wooden blocks" / "puzzle" across three documents.','Use the standard description from the SKU record.','Factory')],{docs:{inv:'mismatch',pl:'mismatch',bl:'mismatch'}}),
    sh('SH-1066','PR8','US','Ocean',4000,18000,20,48,[],{origin:'VN',pol:'VNSGN',pod:'USLGB'}),
    sh('SH-1069','PR9','US','Air',2000,18400,5,9,[
      mkB('crit','cert','FDA facility registration (MoCRA) not confirmed','The cosmetic manufacturer must be FDA-registered and the product listed.','Collect the FEI number from the factory and list the product.','Factory','us-mocra'),
      mkB('crit','filing','FDA product code missing on invoice','Without it the entry is flagged for manual FDA review.','Add the FDA product code to the invoice.','Broker','us-fdacode'),
      mkB('warn','value','Value differs from proforma','Invoice total $18,400 vs proforma on file $17,900.','Confirm which is the transaction value.','Importer')]),
    sh('SH-1031','PR8','US','Ocean',4000,18000,-30,-4,[],{stage:7,released:addDays(-1),actual:{exam:false,demurrage:0},origin:'VN',pol:'VNSGN',pod:'USLGB',carrier:'Maersk',vessel:'MAERSK ESSEX 442N',container:'MRKU4418820'}),
    sh('SH-1036','PR1','US','Ocean',1000,9500,-28,-2,[],{stage:6,carrier:'ONE',vessel:'ONE APUS 042E',container:'ONEU1198230',notes:'Pulled for x-ray exam; released next day. Cost: $300 exam + 1 day demurrage.',actual:{exam:true,demurrage:1}}),
  ];
  return {shipments,products,partners,settings:{company:(S&&S.settings&&S.settings.company)||'Importer LLC',ein:'',eori:'',market:'US',currency:'USD',role:(S&&S.settings&&S.settings.role)||'Importer'},costs:{},onboarding:{sample:true}};
}

/* =====================================================================
   Derived values
   ===================================================================== */
const product=s=>S.products.find(p=>p.id===s.productId)||{name:s.sku||'Product',desc:s.desc||'',supplier:s.supplier||'—'};
const originOf=s=>s.origin||'CN';
const originName=s=>COUNTRIES[originOf(s)]||originOf(s);const ON_=originName;
const polOf=s=>s.pol||defaultOrigin(originOf(s),s.mode);
const podOf=s=>s.pod||defaultDest(s.dest,s.mode);
const portName=c=>(PORTS[c]||[c])[0];
function progressOf(s){const st=stageOf(s);if(st<5)return 0;if(st>=6)return 1;const a=new Date(s.loadDate).getTime(),b=new Date(s.eta).getTime();return Math.min(.95,Math.max(.05,(Date.now()-a)/Math.max(1,b-a)));}
/* classification text depends on origin: China-specific measures drop for other origins */
function clsFor(s){const p=product(s);const c={...(s.cls||classify({desc:p.desc,dest:s.dest}))};if(originOf(s)!=='CN'){c.duty=String(c.duty).replace(/\s*\+\s*25% Sec\. 301[^)]*\)?/,'').replace(/\s*\(AD\/CVD check:[^)]*\)/,'').replace(/\s*\+ IEEPA/,'').trim()||'see schedule';}return c;}
function reqsFor(s){const p=product(s);return requirementsFor(p,s.dest,s.mode).filter(r=>!(r.id==='us-uflpa'&&originOf(s)!=='CN'));}
/* effective attributes = derived from text, overridden by explicit choices */
function attrsOf(p){return {...deriveAttrs(p.desc),...(p.attrs||{})};}
const openB=s=>s.blockers.filter(b=>!b.done);
function score(s){let sc=100;openB(s).forEach(b=>sc-=b.sev==='crit'?12:5);return Math.max(5,sc);}
function status(s){const o=openB(s);if(o.some(b=>b.sev==='crit'))return 'crit';return o.length?'warn':'good';}
function exposure(s){ // total cost if shipped as-is
  const ctx={units:s.units,value:s.value}; let low=0,high=0,days=0,atRisk=0;
  openB(s).forEach(b=>{const i=impact(b.kind,ctx);low+=i.low;high+=i.high;days=Math.max(days,i.days);atRisk=Math.max(atRisk,i.atRisk);});
  return {low,high,days,atRisk};
}
const DOC_KINDS=new Set(['qty','consignee','weight','desc','hs-mismatch','incoterm','value','missing-doc']);
function stageOf(s){
  if(s.stage!=null)return s.stage;
  const o=openB(s);
  if(o.some(b=>DOC_KINDS.has(b.kind)))return 1;
  if(o.some(b=>b.kind==='hs-low'))return 2;
  if(o.length)return 3;
  const d=daysUntil(s.loadDate), e=daysUntil(s.eta);
  if(d>0)return 4; if(e>0)return 5; if(e>-3)return 6; return 7;
}
function nextDeadline(s){
  const st=stageOf(s); if(st>=5)return {label:st===5?'Arrival':st===6?'Last free day':'Released',date:st===7?s.released||s.eta:s.eta};
  const d=new Date(s.loadDate); d.setDate(d.getDate()-1);
  return {label:s.mode==='Ocean'&&s.dest==='US'?'ISF due':s.dest==='EU'?'ENS data due':'Docs cut-off',date:d.toISOString()};
}
function docIssues(s){return openB(s).filter(b=>DOC_KINDS.has(b.kind));}

/* =====================================================================
   Routing + shell
   ===================================================================== */
const ROLES=[['Importer','You own the product record and the entry; you decide what ships.'],['Factory','You produce the goods, the documents and the labels.'],['Forwarder','You book the cargo, file ISF/ENS data, issue the BL.'],['Broker','You classify, file the entry and talk to customs.']];
const NAV=[['overview','Home',icon('home')],['shipments','Shipments',icon('box')],['products','Products',icon('grid')],['settings','Settings',icon('gear')]];
const NAV_MORE=[['partners','Partners',icon('people')],['documents','Documents',icon('doc')],['rules','Compliance rules',icon('shield')],['rates','Rates & fees',icon('rates')],['how','How it works',icon('help')]];
function icon(n){const p={home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',box:'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',doc:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',shield:'<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z"/><path d="M9 12l2 2 4-4"/>',people:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c3 0 5 2 5 5"/>',rates:'<path d="M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 3 5 3 5 1.1 5 3-2.2 3-5 3-5-1.1-5-3"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z"/>'}[n];
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;}

function renderNav(active){
  const link=([id,label,ic])=>`<a href="#${id}" class="${active===id||(active.startsWith('shipment-')&&id==='shipments')||(active.startsWith('product-')&&id==='products')||(active.startsWith('docs-')&&id==='shipments')||(active.startsWith('rates-')&&id==='rates')?'active':''}">${ic}<span>${label}</span></a>`;
  $('#nav').innerHTML=NAV.map(link).join('')+`<div class="nav-more">More</div>`+NAV_MORE.map(link).join('');
  $('#account').innerHTML=ME?`<div class="acct"><div class="av" style="background:${hue(ME.email)}">${initials(ME.email)}</div><div class="acct-b"><b>${esc(S.settings.company||(WS&&WS.name)||'My workspace')}</b><span>${esc(ME.email)}</span></div><button class="btn sm ghost" data-act="logout" title="Sign out">↪</button></div>`:(MODE==='local'?`<div class="acct"><div class="acct-b"><b>Local mode</b><span>Data stays in this browser</span></div></div>`:'');
  const role=S.settings.role||'Importer';$('#role').innerHTML=`<div class="role-l">I am the…</div><div class="seg vert">${ROLES.map(r=>`<button class="${role===r[0]?'active':''}" onclick="S.settings.role='${r[0]}';save();route()">${r[0]}</button>`).join('')}</div><div class="muted" style="font-size:11px;margin-top:6px">${esc(ROLES.find(r=>r[0]===role)[1])}</div>`;
}
function route(){
  const h=(location.hash||'#overview').slice(1);
  renderNav(h); window.scrollTo(0,0);
  const v=$('#view');
  if(h==='overview')v.innerHTML=pageOverview();
  else if(h==='shipments')v.innerHTML=pageShipments();
  else if(h.startsWith('shipment-'))v.innerHTML=pageShipment(h.slice(9));
  else if(h==='products')v.innerHTML=pageProducts();
  else if(h.startsWith('product-'))v.innerHTML=pageProduct(h.slice(8));
  else if(h==='documents')v.innerHTML=pageDocuments();
  else if(h==='rules')v.innerHTML=pageRules();
  else if(h==='partners')v.innerHTML=pagePartners();
  else if(h==='settings')v.innerHTML=pageSettings();
  else if(h.startsWith('docs-'))v.innerHTML=pageDocPack(h.slice(5));
  else if(h.startsWith('rates'))v.innerHTML=pageRates(h.startsWith('rates-')?h.slice(6):null);
  else if(h==='how')v.innerHTML=pageHow();
  else v.innerHTML=pageOverview();
  bind(v);
}
window.addEventListener('hashchange',route);
document.addEventListener('click',e=>{const el=e.target.closest('#account [data-act]');if(el&&ACTIONS[el.dataset.act])ACTIONS[el.dataset.act](el.dataset,el);});

/* generic binders: data-go, data-act */
function bind(root){
  root.querySelectorAll('[data-go]').forEach(el=>el.onclick=e=>{if(e.target.closest('button,a,input,select'))return;location.hash=el.dataset.go;});
  root.querySelectorAll('[data-act]').forEach(el=>el.onclick=e=>{e.stopPropagation();ACTIONS[el.dataset.act]&&ACTIONS[el.dataset.act](el.dataset,el);});
  root.querySelectorAll('[data-filter]').forEach(el=>el.oninput=()=>route());
  bindTracking(root);
  mountMaps(root);
  root.querySelectorAll('.rmap .ship').forEach(el=>{el.style.cursor='pointer';el.onclick=()=>location.hash='shipment-'+el.dataset.id;const s=S.shipments.find(x=>x.id===el.dataset.id);if(s){const t=document.createElementNS('http://www.w3.org/2000/svg','title');t.textContent=`${product(s).name} · ${s.id} · ${Math.round(progressOf(s)*100)}%`;el.appendChild(t);}});
}

/* =====================================================================
   Shared pieces
   ===================================================================== */
const because=r=>(r.because&&r.because[0]==='applies to every shipment')?'applies to every shipment':'applies because: '+((r.because||[]).join(', ')||'product attributes');
const pill=(cls,txt)=>`<span class="pill ${cls}">${txt}</span>`;
function statusPill(s){const [t,c]=STATUS[status(s)];return pill(c,t);}
function scoreBar(s){const sc=score(s),st=status(s);return `<span class="score"><b class="num">${sc}</b><span class="meter"><i style="width:${sc}%;background:var(--${st})"></i></span></span>`;}
function money2(e){return e.low===0&&e.high===0?'<span class="muted">—</span>':`${money(e.low)}–${money(e.high)}`;}
function sevIcon(sev){return `<span class="ico ${sev}">${sev==='crit'?'!':'•'}</span>`;}
function pageHead(title,sub,actions){return `<div class="page-head"><div><h1>${title}</h1>${sub?`<div class="sub">${sub}</div>`:''}</div><div class="actions">${actions||''}</div></div>`;}
function empty(t,sub,act){return `<div class="empty"><div class="t">${t}</div>${sub?`<p>${sub}</p>`:''}${act||''}</div>`;}
function stepper(s,compact){
  const cur=stageOf(s); const blocked=openB(s).some(b=>b.sev==='crit');
  return `<div class="stepper ${compact?'compact':''}">${STAGES.map((st,i)=>{
    const cls=i<cur?'done':i===cur?(blocked?'blocked':'current'):'';
    return `<div class="step ${cls}" title="${esc(st.desc)}"><span class="dotb">${i<cur?'✓':blocked&&i===cur?'!':i+1}</span><span class="lab">${compact?st.short:st.name}</span>${!compact?`<span class="who">${st.who}</span>`:''}</div>`;}).join('')}</div>`;
}

/* =====================================================================
   Pages
   ===================================================================== */
function pageWelcome(){
  const ob=S.onboarding||{}; const co=!!S.settings.company;
  return `<div class="welcome">
    <h1>Welcome to ClearWay${ME?', '+esc(ME.email.split('@')[0]):''}</h1>
    <p class="lead">Before you book a shipment from overseas, ClearWay checks three things: that your supplier's documents agree with each other, that the destination's certificates and labels are in place, and what it would cost you if they weren't. Three steps to your first check:</p>
    <div class="ob">
      <a class="ob-step ${co?'done':''}" href="#settings"><span class="n">${co?'✓':'1'}</span><div><b>Tell us who the importer is</b><span>Your company name and customs ID (EIN / EORI / BN). It goes on every document.</span></div><span class="go">Settings →</span></a>
      <a class="ob-step" href="#products" onclick="setTimeout(()=>ACTIONS.addProduct(),50)"><span class="n">2</span><div><b>Add your first product</b><span>Describe it in plain words, pick a category. We work out the rules and the tariff code.</span></div><span class="go">Add product →</span></a>
      <a class="ob-step" href="#overview" onclick="event.preventDefault();ACTIONS.new({})"><span class="n">3</span><div><b>Check a shipment</b><span>Drop the invoice, packing list and bill of lading. Get a readiness score and a fix list in a minute.</span></div><span class="go">New shipment →</span></a>
    </div>
    <div class="ob-alt">Just exploring? <button class="btn" data-act="reset">Load sample data</button> <span class="muted">— nine example shipments you can delete later.</span> &nbsp; <a href="#how">How ClearWay works →</a></div>
  </div>`;
}
function pageOverview(){
  if(!S.shipments.length&&!S.products.length)return pageWelcome();
  const active=S.shipments.filter(s=>stageOf(s)<7);
  const blocked=active.filter(s=>status(s)==='crit'), warn=active.filter(s=>status(s)==='warn'), ready=active.filter(s=>status(s)==='good');
  const ex=active.map(exposure); const low=ex.reduce((a,e)=>a+e.low,0), high=ex.reduce((a,e)=>a+e.high,0), atRisk=ex.reduce((a,e)=>a+e.atRisk,0);
  const hour=new Date().getHours(); const greet=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
  const items=[]; active.forEach(s=>openB(s).forEach(b=>items.push({s,b,i:impact(b.kind,{units:s.units,value:s.value}),dl:nextDeadline(s)})));
  const role=S.settings.role||'Importer'; const mine=items.filter(x=>x.b.owner.toLowerCase().startsWith(role.toLowerCase())); const showMine=role!=='Importer'&&mine.length;
  items.sort((a,b)=>(a.b.sev==='crit'?0:1)-(b.b.sev==='crit'?0:1)||daysUntil(a.dl.date)-daysUntil(b.dl.date)||b.i.high-a.i.high);
  mine.sort((a,b)=>(a.b.sev==='crit'?0:1)-(b.b.sev==='crit'?0:1)||daysUntil(a.dl.date)-daysUntil(b.dl.date));
  const lead=blocked.length?`<b>${blocked.length} shipment${blocked.length>1?'s':''} can't book</b> until something is fixed. Shipping everything as-is could cost <b>${money(low)}–${money(high)}</b> in exams, storage and penalties${atRisk?`, with <b>${money(atRisk)}</b> of goods at risk of refusal`:''}.`:
    `Nothing is blocked. ${warn.length?`${warn.length} shipment${warn.length>1?'s':''} ha${warn.length>1?'ve':'s'} items worth fixing before the deadline.`:'All active shipments are ready to book.'}`;
  return `
  ${pageHead(`${greet}, ${esc(S.settings.company.split(' ')[0])}`,lead,`<button class="btn" data-act="sample">Try a sample upload</button><button class="btn primary" data-act="new">+ New shipment</button>`)}
  <div class="tiles">
    <a href="#shipments" class="tile"><div class="l">Blocked</div><div class="v" style="color:var(--crit-ink)">${blocked.length}</div><div class="h">can't book until fixed</div></a>
    <a href="#shipments" class="tile"><div class="l">Needs attention</div><div class="v" style="color:var(--warn-ink)">${warn.length}</div><div class="h">fix before the deadline</div></a>
    <a href="#shipments" class="tile"><div class="l">Ready to book</div><div class="v" style="color:var(--good-ink)">${ready.length}</div><div class="h">documents agree, certificates on file</div></a>
    <div class="tile"><div class="l">Cost if nothing is fixed</div><div class="v">${money(high)}</div><div class="h">${money(low)} best case · ${money(atRisk)} goods at risk</div></div>
  </div>

  <section class="card">
    <div class="card-h"><h2>On the move</h2><span class="hint">${active.filter(s=>stageOf(s)===5).length} in transit · ${active.filter(s=>stageOf(s)<5).length} not yet departed · click a dot to open</span></div>
    ${mapBlock('home',S.shipments.filter(s=>stageOf(s)<=6).map(s=>({id:s.id,label:product(s).name,sub:s.id+' · '+s.dest+' · '+s.mode+'<br>',from:polOf(s),to:podOf(s),progress:progressOf(s),status:stageOf(s)>=6?'done':stageOf(s)>=5?status(s):'plan'})),{height:420,width:1100,svgH:330})}
    <div class="legend"><span><i class="dot" style="background:#5b2d86"></i>Planned route</span><span><i class="dot" style="background:var(--good)"></i>In transit, ready</span><span><i class="dot" style="background:var(--warn)"></i>In transit, items open</span><span><i class="dot" style="background:var(--crit)"></i>In transit, blocked</span><span><i class="dot" style="background:#898781"></i>Arrived</span></div>
  </section>

  <section class="card">
    <div class="card-h"><h2>Where your shipments are</h2><span class="hint">The journey every shipment takes. Click a shipment to open it.</span></div>
    <div class="board">${STAGES.map((st,i)=>{const list=S.shipments.filter(s=>stageOf(s)===i);return `<div class="col"><div class="col-h"><span class="n">${i+1}</span>${st.name}<span class="cnt">${list.length}</span></div><div class="col-who">${st.who}</div>${list.map(s=>`<a href="#shipment-${s.id}" class="chip ${status(s)}"><b>${esc(product(s).name)}</b><span>${s.id} · ${s.dest} ${s.mode}</span></a>`).join('')}</div>`;}).join('')}</div>
  </section>

  <div class="two">
    <section class="card">
      <div class="card-h"><h2>${showMine?`Your tasks as ${role}`:'Needs your attention'}</h2><span class="hint">${showMine?`${mine.length} of ${items.length} open items are yours`:items.length+' open items, most urgent first'}</span></div>
      ${(showMine?mine:items).length?`<div class="list">${(showMine?mine:items).slice(0,8).map(({s,b,i,dl})=>`<div class="li" data-go="shipment-${s.id}">${sevIcon(b.sev)}<div class="li-b"><div class="li-t">${esc(b.title)} <span class="muted">· ${esc(product(s).name)}</span></div><div class="li-s">${esc(b.owner)} to fix · ${dl.label} ${fmtD(dl.date)} (${daysUntil(dl.date)}d)</div></div><div class="li-r"><div class="num">${impactRange(i)}</div><div class="muted">if not fixed</div></div></div>`).join('')}</div>${items.length>8?`<a class="more" href="#shipments">See all ${items.length} →</a>`:''}`:empty('Nothing needs attention','New shipments will show their blockers here.')}
    </section>
    <section class="card">
      <div class="card-h"><h2>Next deadlines</h2></div>
      <div class="list">${active.map(s=>({s,dl:nextDeadline(s)})).sort((a,b)=>daysUntil(a.dl.date)-daysUntil(b.dl.date)).slice(0,7).map(({s,dl})=>`<div class="li" data-go="shipment-${s.id}"><div class="date ${daysUntil(dl.date)<=3?'urgent':''}"><b>${fmtD(dl.date)}</b><span>${daysUntil(dl.date)<=0?'today':daysUntil(dl.date)+' days'}</span></div><div class="li-b"><div class="li-t">${dl.label} · ${esc(product(s).name)}</div><div class="li-s">${s.id} · ${s.dest} · ${s.mode}</div></div>${statusPill(s)}</div>`).join('')}</div>
      <div class="card-h" style="margin-top:8px"><h2>Recently cleared</h2></div>
      <div class="list">${S.shipments.filter(s=>stageOf(s)>=6).map(s=>`<div class="li" data-go="shipment-${s.id}"><span class="ico good">✓</span><div class="li-b"><div class="li-t">${esc(product(s).name)}</div><div class="li-s">${s.id} · ${s.actual&&s.actual.exam?`Examined — ${money(300+250*s.actual.demurrage)} in exam + demurrage`:'Released without exam'}</div></div></div>`).join('')||'<div class="muted" style="padding:10px 16px">—</div>'}</div>
    </section>
  </div>`;
}

function pageShipments(){
  const f=window.__f||(window.__f={q:'',dest:'',st:'',stage:''});
  let list=S.shipments.slice();
  if(f.q)list=list.filter(s=>(s.id+product(s).name+product(s).supplier).toLowerCase().includes(f.q.toLowerCase()));
  if(f.dest)list=list.filter(s=>s.dest===f.dest); if(f.st)list=list.filter(s=>status(s)===f.st); if(f.stage!=='')list=list.filter(s=>String(stageOf(s))===f.stage);
  list.sort((a,b)=>(status(a)==='crit'?0:status(a)==='warn'?1:2)-(status(b)==='crit'?0:status(b)==='warn'?1:2)||daysUntil(nextDeadline(a).date)-daysUntil(nextDeadline(b).date));
  return `${pageHead('Shipments',`${S.shipments.length} shipments · sorted by what needs you first`,`<button class="btn primary" data-act="new">+ New shipment</button>`)}
  <div class="toolbar">
    <input class="in" placeholder="Search shipments, products, suppliers" value="${esc(f.q)}" oninput="__f.q=this.value;route()">
    <select class="in" onchange="__f.dest=this.value;route()"><option value="">All markets</option>${MARKETS.map(([m])=>`<option ${f.dest===m?'selected':''}>${m}</option>`).join('')}</select>
    <select class="in" onchange="__f.st=this.value;route()"><option value="">Any status</option><option value="crit" ${f.st==='crit'?'selected':''}>Blocked</option><option value="warn" ${f.st==='warn'?'selected':''}>Needs attention</option><option value="good" ${f.st==='good'?'selected':''}>Ready</option></select>
    <select class="in" onchange="__f.stage=this.value;route()"><option value="">Any stage</option>${STAGES.map((s,i)=>`<option value="${i}" ${f.stage===String(i)?'selected':''}>${i+1}. ${s.name}</option>`).join('')}</select>
  </div>
  <section class="card"><table class="tbl"><thead><tr><th>Shipment</th><th>Route</th><th>Stage</th><th>Readiness</th><th>Open items</th><th>Cost if not fixed</th><th>Next deadline</th></tr></thead><tbody>
  ${list.map(s=>{const dl=nextDeadline(s),e=exposure(s),st=stageOf(s);return `<tr data-go="shipment-${s.id}"><td><div class="brand"><span class="av" style="background:${hue(product(s).supplier)}">${initials(product(s).supplier)}</span><div><div class="n">${esc(product(s).name)}</div><div class="m">${s.id} · ${esc(product(s).supplier)}</div></div></div></td>
    <td>${originOf(s)} → ${s.dest} <span class="muted">· ${s.mode} · ${s.units.toLocaleString()} units</span></td>
    <td><span class="stage-chip s${st}">${st+1}. ${STAGES[st].short}</span></td>
    <td>${scoreBar(s)} ${statusPill(s)}</td>
    <td>${openB(s).length?`<b>${openB(s).filter(b=>b.sev==='crit').length}</b> blocking · ${openB(s).filter(b=>b.sev!=='crit').length} to review`:'<span class="muted">none</span>'}</td>
    <td class="num">${money2(e)}${e.atRisk?`<div class="muted">+ ${money(e.atRisk)} goods at risk</div>`:''}</td>
    <td class="${daysUntil(dl.date)<=3&&st<5?'num neg':'num'}">${dl.label} ${fmtD(dl.date)}<div class="muted">${st>=7?'done':daysUntil(dl.date)<=0?'today':daysUntil(dl.date)+'d'}</div></td></tr>`;}).join('')||`<tr><td colspan="7">${empty('No shipments match')}</td></tr>`}
  </tbody></table></section>`;
}

function pageShipment(id){
  const s=S.shipments.find(x=>x.id===id); if(!s)return empty('Shipment not found','',`<a class="btn" href="#shipments">Back to shipments</a>`);
  const p=product(s), st=stageOf(s), stage=STAGES[st], e=exposure(s), ctx={units:s.units,value:s.value};
  const open=openB(s), done=s.blockers.filter(b=>b.done);
  const reqs=reqsFor(s); const have=p.have||{}; const cov=coverage(p,s.dest);
  const dl=nextDeadline(s);
  const cls=clsFor(s);
  const duty=s.value*(parseFloat(cls.duty)||0)/100 + (/301/.test(cls.duty)&&s.dest==='US'?s.value*0.25:0);
  return `
  <a class="back" href="#shipments">← Shipments</a>
  <div class="page-head">
    <div><h1>${esc(p.name)} <span class="muted" style="font-weight:400;font-size:18px">${s.id}</span></h1>
      <div class="sub">${esc(p.supplier)} · ${esc(portName(polOf(s)))}, ${esc(originName(s))} → ${esc(portName(podOf(s)))} · ${s.mode} · ${s.units.toLocaleString()} units · ${money(s.value)} · ETA ${fmtD(s.eta)}</div></div>
    <div class="actions">${statusPill(s)} ${scoreBar(s)} <a class="btn" href="#docs-${s.id}">Document pack</a><a class="btn" href="#rates-${s.id}">Freight &amp; fees</a><button class="btn" data-act="ask" data-id="${s.id}">Ask supplier to fix</button><button class="btn" data-act="share" data-id="${s.id}">Share with broker</button></div>
  </div>

  <section class="card">
    <div class="card-h"><h2>Journey</h2><div class="chips"><span class="hint">Stage ${st+1} of 8 · ${esc(stage.who)} ${st===7?'— done':'is up'}</span>${st>0?`<button class="btn sm" data-act="stage" data-id="${s.id}" data-dir="-1">← Move back</button>`:''}${st<7?`<button class="btn sm primary" data-act="stage" data-id="${s.id}" data-dir="1">Advance to ${esc(STAGES[st+1].short)} →</button>`:''}${s.stage!=null?`<button class="btn sm ghost" data-act="stageAuto" data-id="${s.id}" title="Let blockers and dates decide the stage">Auto</button>`:''}</div></div>
    ${stepper(s)}
    <div class="stage-note"><b>${esc(stage.name)}:</b> ${esc(stage.desc)} ${open.length&&st<5?`<span class="crit-ink">${open.filter(b=>b.sev==='crit').length} item${open.filter(b=>b.sev==='crit').length===1?'':'s'} must be fixed before moving on.</span>`:''}${s.notes?`<div class="muted" style="margin-top:4px">${esc(s.notes)}</div>`:''}</div>
  </section>

  <div class="two wide-left">
    <div>
      <section class="card">
        <div class="card-h"><h2>What's stopping this shipment</h2><span class="hint">${open.length} open · ${done.length} fixed</span></div>
        ${open.length?open.map(b=>blockerCard(s,b,ctx)).join(''):empty('No open blockers','Documents agree, required certificates are on file, labels meet the destination rules.')}
        ${done.length?`<details class="done-list"><summary>${done.length} fixed</summary>${done.map(b=>`<div class="blk done"><span class="ico good">✓</span><div><b>${esc(b.title)}</b><p>${esc(b.fix)}</p></div><button class="btn sm ghost" data-act="undo" data-id="${s.id}" data-b="${b.id}">Undo</button></div>`).join('')}</details>`:''}
      </section>

      <section class="card">
        <div class="card-h"><h2>Tracking</h2><span class="hint">${st>=5?(st>=6?'arrived':'in transit · '+Math.round(progressOf(s)*100)+'% of the way'):'not yet departed'}</span></div>
        ${mapBlock('ship',[{id:s.id,label:p.name,sub:'',from:polOf(s),to:podOf(s),progress:progressOf(s),status:st>=6?'done':st>=5?status(s):'plan'}],{height:320,width:900,svgH:300,labels:true,maxZoom:4})}
        <div class="track">
          <div class="ms">${milestones(s).map(m=>`<div class="m ${m.state}"><span class="md"></span><div><b>${esc(m.name)}</b><span>${m.when?fmtD(m.when):'—'}${m.note?' · '+esc(m.note):''}</span></div></div>`).join('')}</div>
          <div class="trk-form">
            <label>Origin country<select class="in" data-trk="origin">${Object.entries(COUNTRIES).map(([c,n])=>`<option value="${c}" ${originOf(s)===c?'selected':''}>${n}</option>`).join('')}</select></label>
            <label>${s.mode==='Ocean'?'Port of loading':'Origin airport'}<select class="in" data-trk="pol">${portsFor(originOf(s),s.mode).map(([c,n])=>`<option value="${c}" ${polOf(s)===c?'selected':''}>${n}</option>`).join('')||`<option>${esc(portName(polOf(s)))}</option>`}</select></label>
            <label>${s.mode==='Ocean'?'Port of discharge':'Destination airport'}<select class="in" data-trk="pod">${portsForMarket(s.dest,s.mode).map(([c,n])=>`<option value="${c}" ${podOf(s)===c?'selected':''}>${n}</option>`).join('')}</select></label>
            <label>Carrier<input class="in" data-trk="carrier" value="${esc(s.carrier||'')}" placeholder="${s.mode==='Ocean'?'e.g. ONE, Maersk, COSCO':'e.g. Cathay Cargo, DHL'}"></label>
            <label>${s.mode==='Ocean'?'Vessel / voyage':'Flight'}<input class="in" data-trk="vessel" value="${esc(s.vessel||'')}" placeholder="${s.mode==='Ocean'?'e.g. ONE APUS 042E':'e.g. CX 086'}"></label>
            <label>${s.mode==='Ocean'?'Container / BL no.':'AWB no.'}<input class="in" data-trk="container" value="${esc(s.container||'')}" placeholder="${s.mode==='Ocean'?'e.g. ONEU1234567':'e.g. 160-12345675'}"></label>
            <div class="chips">${s.container?`<a class="btn sm" target="_blank" rel="noopener" href="https://www.searates.com/container/tracking/?container=${encodeURIComponent(s.container)}">Track on carrier ↗</a>`:'<span class="muted" style="font-size:12px">Add the container / AWB number to get a tracking link.</span>'}</div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-h"><h2>Documents</h2><button class="btn sm" data-act="new" data-id="${s.id}">Upload replacements</button></div>
        <div class="doc-row">${DOCS.map(([k,n])=>`<div class="doc ${s.docs[k]||'missing'}"><span class="ico ${s.docs[k]==='ok'?'good':s.docs[k]==='mismatch'?'crit':'warn'}">${s.docs[k]==='ok'?'✓':s.docs[k]==='mismatch'?'!':'?'}</span><div><b>${n}</b><span>${s.docs[k]==='ok'?'Matches the other documents':s.docs[k]==='mismatch'?'Disagrees with another document':'Not uploaded'}</span></div></div>`).join('')}</div>
        ${matrix(s)}
      </section>
    </div>
    <div>
      <section class="card cost">
        <div class="card-h"><h2>Cost of shipping as-is</h2></div>
        <div class="big">${e.high?`${money(e.low)}–${money(e.high)}`:'$0'}</div>
        <div class="muted">${e.high?`plus ~${e.days} days of delay${e.atRisk?` and <b>${money(e.atRisk)}</b> of goods at risk of refusal`:''}`:'No extra cost expected beyond normal duty and fees.'}</div>
        ${open.length?`<table class="mini"><tbody>${open.map(b=>{const i=impact(b.kind,ctx);return `<tr><td>${esc(b.title)}</td><td class="num">${impactRange(i)}</td></tr>`;}).join('')}</tbody></table>`:''}
        <div class="split"></div>
        <div class="kv"><span>Goods value</span><b>${money(s.value)}</b></div>
        <div class="kv"><span>Est. duty (${esc(cls.duty)})</span><b>${money(duty)}</b></div>
        <div class="kv"><span>Fees (MPF/HMF, broker, ISF)</span><b>${money(Math.min(Math.max(s.value*0.003464,32),634)+150+ (s.mode==='Ocean'?s.value*0.00125+45:0))}</b></div>
        <div class="kv total"><span>Landed cost (before freight)</span><b>${money(s.value+duty+Math.min(Math.max(s.value*0.003464,32),634)+150+(s.mode==='Ocean'?s.value*0.00125+45:0))}</b></div>
      </section>

      <section class="card">
        <div class="card-h"><h2>Classification</h2></div>
        <div class="kv"><span>Code</span><b>${esc(cls.code)} ${pill(cls.conf>=85?'good':cls.conf>=65?'warn':'crit',cls.conf+'%')}</b></div><div class="kv"><span>Duty · origin ${esc(ON_(s))}</span><b>${esc(cls.duty)}</b></div>
        <p class="p">${esc(cls.text)}</p><p class="p muted">${esc(cls.why)}</p>
        <div class="chips" style="padding-top:10px"><button class="btn sm" data-act="verify" data-id="${s.id}">Verify with official ${s.dest==='US'?'USITC':s.dest==='UK'?'UK Trade Tariff':s.dest==='CA'?'CBSA':'TARIC'} schedule</button></div><div id="verify"></div>
      </section>

      <section class="card">
        <div class="card-h"><h2>Required for ${s.dest}</h2><span class="hint">${reqs.filter(r=>have[r.id]).length}/${reqs.length} on file</span></div><div class="cov ${cov.level}">${pill(cov.level==='good'?'good':cov.level==='partial'?'warn':'crit','Rule coverage: '+cov.level)} <span>${esc(cov.note)}</span></div>
        ${reqs.map(r=>{const missingB=open.find(b=>b.reqId===r.id);const ok=have[r.id]&&!missingB;return `<label class="chk"><input type="checkbox" ${ok?'checked':''} data-act="toggleReq" data-p="${p.id}" data-r="${r.id}" data-s="${s.id}"><div><b>${esc(r.name)}</b><small>${esc(r.plain)} <em>— ${esc(because(r))}</em> · <a href="${r.link}" target="_blank" rel="noopener">${esc(r.agency)} ↗</a></small></div></label>`;}).join('')}
      </section>

      <section class="card">
        <div class="card-h"><h2>Dates</h2></div>
        <div class="tl">
          <span class="d">${fmtD(dl.date)}</span><span class="${daysUntil(dl.date)<=3&&st<5?'due':''}">${dl.label}</span>
          <span class="d">${fmtD(s.loadDate)}</span><span>Loads · ${esc(portName(polOf(s)))}</span>
          <span class="d">${fmtD(s.eta)}</span><span>Arrives ${esc(portName(podOf(s)))} · entry filed</span>
          <span class="d">${fmtD(new Date(new Date(s.eta).getTime()+4*864e5))}</span><span>Last free day — demurrage starts (${money(COSTS.demurragePerDay)}/day/container)</span>
        </div>${(s.log||[]).length?`<div class="card-h" style="padding-top:0"><h2 style="font-size:13px">Activity</h2></div><div class="tl">${s.log.slice().reverse().slice(0,8).map(l=>`<span class="d">${fmtD(l.at)}</span><span class="muted">${esc(l.note)}</span>`).join('')}</div>`:''}
      </section>
    </div>
  </div>`;
}
/* a real Leaflet map when available, the SVG sketch otherwise */
function mapBlock(key,routes,o){return `<div class="map-wrap"><div class="lmap" id="lmap-${key}" data-routes='${esc(JSON.stringify(routes))}' data-opts='${esc(JSON.stringify({labels:!!o.labels,maxZoom:o.maxZoom||5}))}' style="height:${o.height}px"></div><div class="lmap-fallback" id="lsvg-${key}" hidden>${drawMap(routes,{width:o.width,height:o.svgH})}</div></div>`;}
function mountMaps(root){root.querySelectorAll('.lmap').forEach(el=>{const routes=JSON.parse(el.dataset.routes||'[]'),o=JSON.parse(el.dataset.opts||'{}');const fb=el.nextElementSibling;const fail=()=>{el.hidden=true;if(fb)fb.hidden=false;};
  if(!navigator.onLine){fail();return;}
  const onClick=id=>location.hash='shipment-'+id;
  const leaflet=()=>{try{if(!window.L||!mountLeaflet(el,routes,{...o,onClick,onFail:fail}))fail();}catch(e){console.warn('leaflet',e);fail();}};
  try{if(!window.maplibregl||!mountMaplibre(el,routes,{...o,onClick,onFail:leaflet}))leaflet();}catch(e){console.warn('maplibre',e);leaflet();}});}
function milestones(s){
  const st=stageOf(s);const load=new Date(s.loadDate),eta=new Date(s.eta);const d=(x,n)=>{const y=new Date(x);y.setDate(y.getDate()+n);return y;};
  const items=[['Booking confirmed',d(load,-7),st>=4],['Cargo received at '+portName(polOf(s)),d(load,-2),st>=5],[(s.mode==='Ocean'?'Departed ':'Flown from ')+portName(polOf(s)),load,st>=5],...(s.mode==='Ocean'?[['Transshipment',d(load,Math.round((eta-load)/864e5/2)),st>=5&&progressOf(s)>0.5]]:[]),['Arrived '+portName(podOf(s)),eta,st>=6],['Customs release',d(eta,2),st>=7],['Delivered',d(eta,5),st>=7&&!!s.released]];
  let currentSet=false;return items.map(([name,when,done])=>{let state=done?'done':'todo';if(!done&&!currentSet){state='current';currentSet=true;}return {name,when,state,note:name.startsWith('Departed')&&s.vessel?s.vessel:''};});
}
function bindTracking(root){root.querySelectorAll('[data-trk]').forEach(el=>el.onchange=()=>{const id=location.hash.slice(10);const s=S.shipments.find(x=>x.id===id);if(!s)return;const k=el.dataset.trk;s[k]=el.value;if(k==='origin'){delete s.pol;}save();route();});}
function blockerCard(s,b,ctx){
  const i=impact(b.kind,ctx);
  return `<div class="blk">${sevIcon(b.sev)}<div class="blk-b">
    <b>${esc(b.title)}</b><p>${esc(b.detail)}</p>
    <div class="why"><span class="k">Why it matters</span>${esc(i.why)}</div>
    <div class="imp"><span class="k">If not fixed</span><b>${impactRange(i)}</b> · ~${i.days} days${i.atRisk?` · <span class="crit-ink">${money(i.atRisk)} goods at risk</span>`:''}<details><summary>breakdown</summary><table class="mini"><tbody>${i.items.map(x=>`<tr><td>${esc(x[0])}</td><td class="num">${money(x[1])}</td></tr>`).join('')}</tbody></table><div class="muted">Assumptions in Settings → Cost model.</div></details></div>
    <div class="fix">→ ${esc(b.fix)} <span class="muted">(${esc(b.owner)})</span></div>
    <div class="blk-a"><button class="btn sm primary" data-act="fixed" data-id="${s.id}" data-b="${b.id}">Mark fixed</button><button class="btn sm" data-act="ask" data-id="${s.id}" data-b="${b.id}">Ask ${esc(b.owner.toLowerCase())}</button></div>
  </div></div>`;
}
function matrix(s){
  if(s.ex){
    const docs=['inv','pl','bl'];
    const rows=FIELDS.map(([f,label])=>{const present=docs.filter(k=>s.ex[k]&&s.ex[k][f]).map(k=>norm(s.ex[k][f]));const bad=COMPARE.has(f)&&present.length>1&&new Set(present).size>1;
      return `<tr><td class="k">${label}</td>${docs.map(k=>`<td class="${bad&&s.ex[k]&&s.ex[k][f]?'bad':''}">${s.ex[k]?esc(s.ex[k][f]||'—'):'<span class="muted">not uploaded</span>'}</td>`).join('')}</tr>`;}).join('');
    return `<table class="matrix"><thead><tr><th></th><th>Commercial invoice</th><th>Packing list</th><th>${s.mode==='Air'?'Air waybill':'Bill of lading'}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  const o=openB(s); const bad=k=>o.some(b=>b.kind===k); const p=product(s);
  const rows=[['Description',p.name,bad('desc')?'wooden blocks':p.name,bad('desc')?'puzzle':p.name,bad('desc')],['Quantity',s.units.toLocaleString(),bad('qty')?(s.units-50).toLocaleString():s.units.toLocaleString(),bad('qty')?'—':s.units.toLocaleString(),bad('qty')],['Gross weight',bad('weight')?'412 kg':'640 kg',bad('weight')?'412 kg':'640 kg',bad('weight')?'398 kg':'640 kg',bad('weight')],['HS code',bad('hs-mismatch')?'8423.10':'—','—',bad('hs-mismatch')?'8423.81':'—',bad('hs-mismatch')],['Consignee',bad('consignee')?'Nordic Play AB':S.settings.company,bad('consignee')?'Nordic Play AB':S.settings.company,bad('consignee')?'Nordic Play Logistics AB':S.settings.company,bad('consignee')],['Value / Incoterm',bad('incoterm')?'(missing)':money(s.value)+' · FOB','—','—',bad('incoterm')]];
  return `<table class="matrix"><thead><tr><th></th><th>Commercial invoice</th><th>Packing list</th><th>${s.mode==='Air'?'Air waybill':'Bill of lading'}</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="k">${r[0]}</td>${[1,2,3].map(i=>`<td class="${r[4]&&(i===1||r[i]!==r[1])?'bad':''}">${r[i]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function pageProducts(){
  return `${pageHead('Products','Describe a product once. Every shipment of it inherits the classification, requirements and certificates.',`<button class="btn primary" data-act="addProduct">+ Add product</button>`)}
  <div class="cards">${S.products.map(p=>{const ships=S.shipments.filter(s=>s.productId===p.id);const reqs=p.markets.flatMap(m=>requirementsFor(p,m,'Ocean'));const onFile=reqs.filter(r=>(p.have||{})[r.id]).length;const expired=(p.certs||[]).filter(c=>c.status!=='ok').length;
    return `<a class="pcard" href="#product-${p.id}"><div class="pc-h"><span class="av" style="background:${hue(p.supplier)}">${initials(p.supplier)}</span><div><b>${esc(p.name)}</b><div class="muted">${esc(p.supplier)}</div></div></div><p class="muted">${esc(p.desc)}</p>
    <div class="pc-f"><span>${p.markets.map(m=>pill('neutral',m)).join(' ')}</span><span class="muted">${ships.length} shipment${ships.length===1?'':'s'}</span></div>
    <div class="pc-f"><span>${pill(onFile===reqs.length?'good':onFile>reqs.length/2?'warn':'crit',`${onFile}/${reqs.length} requirements on file`)}</span>${expired?pill('crit',`${expired} certificate issue${expired>1?'s':''}`):''}</div></a>`;}).join('')}</div>`;
}
function pageProduct(id){
  const p=S.products.find(x=>x.id===id); if(!p)return empty('Product not found');
  const ships=S.shipments.filter(s=>s.productId===p.id);
  return `<a class="back" href="#products">← Products</a>
  ${pageHead(esc(p.name),`${esc(p.supplier)} · ${p.markets.join(', ')}`,`<button class="btn" data-act="new" data-p="${p.id}">New shipment of this product</button>`)}
  <div class="two wide-left"><div>
    <section class="card"><div class="card-h"><h2>Description</h2><button class="btn sm" data-act="editDesc" data-p="${p.id}">Edit</button></div><p class="p">${esc(p.desc)}</p><p class="muted p">This text drives classification and the requirements list. Say what it is made of, what it does, who it is for, and whether it has a battery or radio.</p></section>
    ${p.markets.map(m=>{const reqs=requirementsFor(p,m,'Ocean');const cls=classify({desc:p.desc,dest:m});const cov=coverage(p,m);return `<section class="card"><div class="card-h"><h2>${m} requirements</h2><span class="hint">${reqs.filter(r=>(p.have||{})[r.id]).length}/${reqs.length} on file</span></div><div class="cov ${cov.level}">${pill(cov.level==='good'?'good':cov.level==='partial'?'warn':'crit','Rule coverage: '+cov.level)} <span>${esc(cov.note)}</span></div>
      <div class="kv"><span>Classification</span><b>${esc(cls.code)} ${pill(cls.conf>=85?'good':'warn',cls.conf+'%')} <span class="muted">${esc(cls.duty)}</span></b></div>
      ${reqs.map(r=>`<label class="chk"><input type="checkbox" ${(p.have||{})[r.id]?'checked':''} data-act="toggleReq" data-p="${p.id}" data-r="${r.id}"><div><b>${esc(r.name)}</b><small>${esc(r.plain)} · <em>${esc(because(r))}</em> · ${esc(r.owner)} · <a href="${r.link}" target="_blank" rel="noopener">${esc(r.agency)} ↗</a> · if missing: ${impactRange(impact(r.kind,{units:1000,value:10000}))}</small></div></label>`).join('')}</section>`;}).join('')}
  </div><div>
    <section class="card"><div class="card-h"><h2>Certificates on file</h2><button class="btn sm" data-act="addCert" data-p="${p.id}">+ Add</button></div>
      ${(p.certs||[]).length?(p.certs||[]).map((c,i)=>`<div class="li"><span class="ico ${c.status==='ok'?'good':c.status==='pending'?'warn':'crit'}">${c.status==='ok'?'✓':'!'}</span><div class="li-b"><div class="li-t">${esc(c.name)}</div><div class="li-s">${c.status==='ok'?'Valid':c.status==='pending'?'Requested, not received':c.status==='expired'?'Expired':'Outdated standard'}${c.expires?` · ${c.status==='expired'?'expired':'expires'} ${fmtD(c.expires)}`:''}</div></div><button class="btn sm ghost" data-act="delCert" data-p="${p.id}" data-i="${i}">Remove</button></div>`).join(''):empty('No certificates yet','Upload test reports and declarations so every shipment can reference them.')}
    </section>
    <section class="card"><div class="card-h"><h2>Markets</h2></div><div class="chips">${MARKETS.map(([m,name])=>`<button class="btn sm ${p.markets.includes(m)?'primary':''}" data-act="toggleMarket" data-p="${p.id}" data-m="${m}" title="${name}">${m}</button>`).join('')}</div></section>
    <section class="card"><div class="card-h"><h2>What this product is</h2><span class="hint">drives which rules apply</span></div>${p.category?`<div class="kv"><span>Category</span><b>${esc(p.category)}</b></div>`:''}${ATTRS.map(([k,label])=>{const auto=deriveAttrs(p.desc)[k];const on=(p.attrs&&k in p.attrs)?p.attrs[k]:!!auto;return `<label class="chk"><input type="checkbox" ${on?'checked':''} data-act="toggleAttr" data-p="${p.id}" data-k="${k}"><div><b>${esc(label)}</b>${auto&&!(p.attrs&&k in p.attrs)?'<small>detected from the description</small>':''}</div></label>`;}).join('')}</section>
    <section class="card"><div class="card-h"><h2>Shipments</h2></div>${ships.length?ships.map(s=>`<div class="li" data-go="shipment-${s.id}"><div class="li-b"><div class="li-t">${s.id} · ${s.dest} · ${s.mode}</div><div class="li-s">${STAGES[stageOf(s)].name} · ETA ${fmtD(s.eta)}</div></div>${statusPill(s)}</div>`).join(''):'<div class="muted p">None yet</div>'}</section>
  </div></div>`;
}

function pageDocuments(){
  const f=window.__fd||(window.__fd={st:''});
  const rows=[]; S.shipments.forEach(s=>DOCS.forEach(([k,n])=>{const st=s.docs[k]||'missing';const issues=docIssues(s);rows.push({s,k,n,st,issues});}));
  const list=f.st?rows.filter(r=>r.st===f.st):rows;
  const c={ok:rows.filter(r=>r.st==='ok').length,mismatch:rows.filter(r=>r.st==='mismatch').length,missing:rows.filter(r=>r.st==='missing').length};
  return `${pageHead('Documents','Every document we have seen, and whether it agrees with the others on the same shipment.',`<button class="btn primary" data-act="new">Upload documents</button>`)}
  <div class="toolbar"><div class="seg">${[['','All',rows.length],['mismatch','Disagree',c.mismatch],['missing','Missing',c.missing],['ok','Match',c.ok]].map(([v,l,n])=>`<button class="${f.st===v?'active':''}" onclick="__fd.st='${v}';route()">${l} <span class="muted">${n}</span></button>`).join('')}</div></div>
  <section class="card"><table class="tbl"><thead><tr><th>Document</th><th>Shipment</th><th>Supplier</th><th>Status</th><th>Issues</th><th></th></tr></thead><tbody>
  ${list.map(r=>`<tr data-go="shipment-${r.s.id}"><td><b>${r.n}</b></td><td>${esc(product(r.s).name)} <span class="muted">· ${r.s.id}</span></td><td>${esc(product(r.s).supplier)}</td><td>${pill(r.st==='ok'?'good':r.st==='mismatch'?'crit':'warn',r.st==='ok'?'Matches':r.st==='mismatch'?'Disagrees':'Missing')}</td><td>${r.st==='mismatch'?r.issues.map(b=>esc(b.title)).join(', '):'—'}</td><td><button class="btn sm">Open</button></td></tr>`).join('')}
  </tbody></table></section>
  <p class="muted p">Why this matters: ${pill('crit','Disagrees')} documents are the #1 reason containers get pulled for exam. Customs reads the invoice, packing list and bill of lading side by side; if the numbers or names differ, the importer pays for the exam and every day of storage.</p>`;
}

function pageRules(){
  const f=window.__fr||(window.__fr={m:'US',q:'',desc:'',dest:'US'});
  const list=CATALOG.filter(r=>r.m.includes(f.m)&&(!f.q||(r.name+r.plain+r.agency).toLowerCase().includes(f.q.toLowerCase())));
  const groups=[['classification','Classification'],['cert','Certificates & test reports'],['label-origin','Labels & markings'],['label-tracking',''],['label-warning',''],['label-rp',''],['filing','Filings & declarations'],['isf',''],['registration','Registrations']];
  const kindGroup=k=>k.startsWith('label')?'Labels & markings':k==='isf'?'Filings & declarations':(groups.find(g=>g[0]===k)||['','Other'])[1];
  const grouped={}; list.forEach(r=>{(grouped[kindGroup(r.kind)]=grouped[kindGroup(r.kind)]||[]).push(r);});
  const check=f.desc?{reqs:requirementsFor(f.desc,f.dest,'Ocean'),cls:classify({desc:f.desc,dest:f.dest})}:null;
  return `${pageHead('Compliance rules','What each market asks for, in plain language, with what it costs to get wrong.')}
  <section class="card checker"><div class="card-h"><h2>Check a product</h2><span class="hint">Describe it like you would to a friend</span></div>
    <div class="row"><input class="in" style="flex:1" placeholder="e.g. Bluetooth kids headphones with lithium battery" value="${esc(f.desc)}" onchange="__fr.desc=this.value;route()"><select class="in" onchange="__fr.dest=this.value;route()">${MARKETS.map(([m])=>`<option ${f.dest===m?'selected':''}>${m}</option>`).join('')}</select><button class="btn primary" onclick="__fr.desc=this.parentElement.querySelector('input').value;route()">Check</button></div>
    ${check?`<div class="kv" style="margin-top:12px"><span>Likely classification</span><b>${esc(check.cls.code)} ${pill(check.cls.conf>=85?'good':'warn',check.cls.conf+'%')} <span class="muted">${esc(check.cls.text)} · ${esc(check.cls.duty)}</span></b></div>
      <div class="muted p">${check.reqs.length} requirements for ${f.dest}:</div>${check.reqs.map(r=>ruleRow(r)).join('')}`:''}
  </section>
  <div class="toolbar"><div class="seg">${MARKETS.map(([m])=>`<button class="${f.m===m?'active':''}" onclick="__fr.m='${m}';route()">${m}</button>`).join('')}</div><input class="in" placeholder="Search rules" value="${esc(f.q)}" oninput="__fr.q=this.value;route()"></div>
  ${Object.entries(grouped).map(([g,rs])=>`<section class="card"><div class="card-h"><h2>${g}</h2><span class="hint">${rs.length}</span></div>${rs.map(r=>ruleRow(r)).join('')}</section>`).join('')}
  <p class="muted p">These are starting-point rules maintained in <code>public/rules.js</code>, not legal advice. Costs use the assumptions in Settings → Cost model. Always confirm with your licensed broker.</p>`;
}
function ruleRow(r){const i=impact(r.kind,{units:1000,value:10000});return `<div class="rule"><div class="rule-b"><b>${esc(r.name)}</b><p>${esc(r.plain)}</p><div class="muted">${esc(r.agency)} · ${esc(r.owner)} provides · ${r.trigger?'applies when the product matches':'applies to every shipment'} · <a href="${r.link}" target="_blank" rel="noopener">official guidance ↗</a></div></div><div class="rule-r"><div class="num">${impactRange(i)}</div><div class="muted">if missing${i.atRisk?' + goods at risk':''}</div></div></div>`;}

function pagePartners(){
  const types=['Factory','Forwarder','Broker'];
  return `${pageHead('Partners','The people who produce your documents. Document quality is the share of their shipments that arrived with documents agreeing.',`<button class="btn primary" data-act="addPartner">+ Add partner</button>`)}
  ${types.map(t=>{const list=S.partners.filter(p=>p.type===t);return `<section class="card"><div class="card-h"><h2>${t==='Factory'?'Factories / suppliers':t+'s'}</h2><span class="hint">${list.length}</span></div>
    ${list.map(p=>{const ships=S.shipments.filter(s=>product(s).supplier===p.name);const bad=ships.filter(s=>docIssues(s).length).length;const q=ships.length?Math.round((1-bad/ships.length)*100):null;const openItems=ships.reduce((a,s)=>a+openB(s).filter(b=>b.owner===t||(t==='Factory'&&b.owner==='Factory')).length,0);
      return `<div class="li"><span class="av" style="background:${hue(p.name)}">${initials(p.name)}</span><div class="li-b"><div class="li-t">${esc(p.name)} <span class="muted">· ${p.country}</span></div><div class="li-s">${esc(p.contact)}${ships.length?` · ${ships.length} shipment${ships.length>1?'s':''}`:''}${openItems?` · <span class="crit-ink">${openItems} item${openItems>1?'s':''} waiting on them</span>`:''}</div></div>
      ${q!=null?`<div class="li-r"><div class="num">${q}%</div><div class="muted">doc quality</div></div>`:''}<button class="btn sm" data-act="askPartner" data-p="${p.id}">Request documents</button></div>`;}).join('')||'<div class="muted p">None yet</div>'}</section>`;}).join('')}`;
}

function pageSettings(){
  const c={...COSTS,...(S.costs||{})};
  return `${pageHead('Settings','')}
  <div class="two"><div>
    <section class="card"><div class="card-h"><h2>Your company</h2></div>
      <div class="form"><label>Importer of record (legal name)<input class="in" value="${esc(S.settings.company)}" onchange="S.settings.company=this.value;save()"></label>
      <label>EIN / IRS number (US)<input class="in" value="${esc(S.settings.ein)}" onchange="S.settings.ein=this.value;save()"></label>
      <label>EORI (EU/UK)<input class="in" value="${esc(S.settings.eori)}" onchange="S.settings.eori=this.value;save()"></label>
      <label>Default market<select class="in" onchange="S.settings.market=this.value;save()">${MARKETS.map(([m])=>`<option ${S.settings.market===m?'selected':''}>${m}</option>`).join('')}</select></label></div></section>
    <section class="card"><div class="card-h"><h2>Document extraction</h2></div><div id="health" class="p muted">${window.__health?(window.__health.ok?(window.__health.live?`${pill('good','Live')} Claude reads uploaded documents (${esc(window.__health.model)}).`:`${pill('warn','Simulated')} Server running without an API key.`):`${pill('crit','No server')} Open the app through <code>npm start</code> to enable extraction.`):'Checking server…'}</div>
      <p class="p muted">With <code>ANTHROPIC_API_KEY</code> in <code>.env</code>, uploads are read by Claude on your own server. Without it the app simulates extraction so you can still see the flow.</p></section>
    ${ME?`<section class="card"><div class="card-h"><h2>Team</h2><button class="btn sm" data-act="invite">+ Invite</button></div>
      ${((WS&&WS.members)||[]).map(m=>`<div class="li"><span class="av" style="background:${hue(m.email)}">${initials(m.email)}</span><div class="li-b"><div class="li-t">${esc(m.email)}</div><div class="li-s">${esc(m.role)}</div></div></div>`).join('')}
      ${((WS&&WS.invites)||[]).map(i=>`<div class="li"><span class="av" style="background:var(--neutral-bg);color:var(--ink-2)">?</span><div class="li-b"><div class="li-t">${esc(i.email)}</div><div class="li-s">Invited as ${esc(i.role)} — they sign up with this email to join</div></div></div>`).join('')}
      <p class="muted p" style="padding:0 18px 16px">Invite your factory, forwarder and broker. Each sees the same shipments, with their own tasks first.</p></section>`:''}
    <section class="card"><div class="card-h"><h2>Data</h2></div><div class="chips"><button class="btn" data-act="export">Copy all data as JSON</button><button class="btn" data-act="reset">Load sample data</button><button class="btn" data-act="clearAll">Clear workspace</button></div><p class="muted p">${ME?'Saved to your workspace on the server, and cached in this browser.':'Stored in this browser only. Run the server and create an account to save on the server and work with your team.'}</p></section>
  </div><div>
    <section class="card"><div class="card-h"><h2>Cost model</h2><span class="hint">USD · used for every "if not fixed" estimate</span></div>
      <div class="form">${[['examXray','X-ray / VACIS exam, per container'],['examIntensive','Intensive exam incl. drayage, per container'],['demurragePerDay','Demurrage per container per day'],['brokerHandling','Broker handling for a hold or amendment'],['isfPenalty','ISF liquidated damages, per violation'],['markingDutyPct','Marking duty for unmarked goods (%)'],['relabelPerUnit','Relabel / rework per unit'],['storagePerDayPGA','Bonded storage during agency detention, per day'],['delayDaysDoc','Typical delay for a document hold (days)'],['delayDaysPGA','Typical delay for an agency detention (days)']].map(([k,l])=>`<label>${l}<input class="in" type="number" step="any" value="${c[k]}" onchange="S.costs=S.costs||{};S.costs['${k}']=+this.value;Object.assign(COSTS,S.costs);save()"></label>`).join('')}</div>
      <p class="muted p">Defaults reflect typical 2025–26 US West Coast figures reported by brokers and forwarders; adjust to your lanes.</p></section>
  </div></div>`;
}

/* =====================================================================
   Actions
   ===================================================================== */
const ACTIONS={
  stage:(d)=>{const s=S.shipments.find(x=>x.id===d.id);const cur=stageOf(s);const to=Math.max(0,Math.min(7,cur+Number(d.dir)));const crit=openB(s).filter(b=>b.sev==='crit');
    const go=(note)=>{s.stage=to;s.log=s.log||[];s.log.push({at:new Date().toISOString(),note:note||`Moved from ${STAGES[cur].name} to ${STAGES[to].name}`});save();route();toast(`Now at ${STAGES[to].name}`);};
    if(to>3&&crit.length&&to>cur)modal('Advance with blockers open?',`<p class="p">${crit.length} blocking item${crit.length>1?'s are':' is'} still open:</p><ul class="p">${crit.map(b=>`<li>${esc(b.title)}</li>`).join('')}</ul><p class="p muted">Moving on means you accept the risk (est. ${money(exposure(s).low)}–${money(exposure(s).high)}). We'll record that you overrode the gate.</p>`,'Advance anyway',()=>go(`Advanced to ${STAGES[to].name} with ${crit.length} blocker${crit.length>1?'s':''} open (override)`));
    else go();},
  stageAuto:(d)=>{const s=S.shipments.find(x=>x.id===d.id);delete s.stage;s.log=s.log||[];s.log.push({at:new Date().toISOString(),note:'Stage set back to automatic'});save();route();},
  toggleAttr:(d,el)=>{const p=S.products.find(x=>x.id===d.p);p.attrs=p.attrs||{};p.attrs[d.k]=!!el.checked;save();route();},
  verify:async(d,el)=>{const s=S.shipments.find(x=>x.id===d.id);const cls=s.cls||classify({desc:product(s).desc,dest:s.dest});const box=$('#verify');el.disabled=true;box.innerHTML='<div class="p muted" style="padding:0 18px 12px">Looking up the official schedule…</div>';
    try{const r=await fetch(`/api/tariff?dest=${s.dest}&code=${encodeURIComponent(cls.code)}&q=${encodeURIComponent(product(s).name)}`);const j=await r.json();
      if(j.error)box.innerHTML=`<div class="p" style="padding:0 18px 12px">${pill('warn','Could not reach')} <span class="muted">${esc(j.error)}. ${esc(j.hint||'')}</span></div>`;
      else if(!j.hits.length)box.innerHTML=`<div class="p" style="padding:0 18px 12px"><span class="muted">${esc(j.note||'No results')}</span> ${j.url?`<a href="${j.url}" target="_blank" rel="noopener">Open official lookup ↗</a>`:''}</div>`;
      else box.innerHTML=`<div style="padding:0 18px 12px"><div class="muted" style="font-size:12px;margin:6px 0">Source: ${esc(j.source)} · <a href="${j.url}" target="_blank" rel="noopener">open ↗</a></div><table class="mini" style="width:100%;margin:0"><tbody>${j.hits.slice(0,6).map(h=>`<tr><td><b>${esc(h.code)}</b><div class="muted">${esc(String(h.description||'').replace(/<[^>]+>/g,''))}</div></td><td class="num">${esc(h.general||'')}</td></tr>`).join('')}</tbody></table>${j.note?`<div class="muted" style="font-size:12px;margin-top:6px">${esc(j.note)}</div>`:''}</div>`;}
    catch(e){box.innerHTML=`<div class="p" style="padding:0 18px 12px">${pill('crit','No server')} <span class="muted">Run with <code>npm start</code> to look up official schedules.</span></div>`;}
    el.disabled=false;},
  new:(d)=>openWizard(d.p?{productId:d.p}:d.id?{shipmentId:d.id}:{}),
  sample:()=>openWizard({demo:true,productId:'PR1',desc:'Bluetooth-enabled digital kitchen scale with LED display, CR2032 battery included, 1,200 units in 100 cartons',dest:'US',mode:'Ocean',units:1200,value:11400,files:{inv:[{name:'CI-LX-2291.pdf'}],pl:[{name:'PL-LX-2291.xlsx'}],bl:[{name:'Draft-BL-ONEY.pdf'}],certs:[{name:'FCC_Part15_report.pdf'}]}}),
  fixed:(d)=>{const s=S.shipments.find(x=>x.id===d.id);const b=s.blockers.find(x=>x.id===d.b);b.done=true;if(DOC_KINDS.has(b.kind)&&!docIssues(s).length)s.docs={inv:'ok',pl:'ok',bl:'ok'};if(b.reqId){const p=product(s);p.have=p.have||{};p.have[b.reqId]=1;}save();route();toast(`Marked fixed — readiness now ${score(s)}`);},
  undo:(d)=>{const s=S.shipments.find(x=>x.id===d.id);const b=s.blockers.find(x=>x.id===d.b);b.done=false;save();route();},
  toggleReq:(d,el)=>{const p=S.products.find(x=>x.id===d.p);p.have=p.have||{};if(el.checked)p.have[d.r]=1;else delete p.have[d.r];
    if(d.s){const s=S.shipments.find(x=>x.id===d.s);s.blockers.filter(b=>b.reqId===d.r).forEach(b=>b.done=!!el.checked);
      if(!el.checked&&!s.blockers.some(b=>b.reqId===d.r)){const r=CATALOG.find(x=>x.id===d.r);s.blockers.push(mkB(/registration|filing|classification/.test(r.kind)?'warn':'crit',r.kind,`${r.name} not on file`,r.plain,`Obtain from ${r.owner.toLowerCase()} and add to the product record.`,r.owner.split(/[\/(]/)[0].trim(),r.id));}}
    else{S.shipments.filter(s=>s.productId===p.id).forEach(s=>s.blockers.filter(b=>b.reqId===d.r).forEach(b=>b.done=!!el.checked));}
    save();route();},
  toggleMarket:(d)=>{const p=S.products.find(x=>x.id===d.p);p.markets=p.markets.includes(d.m)?p.markets.filter(m=>m!==d.m):[...p.markets,d.m];save();route();},
  editDesc:(d)=>{const p=S.products.find(x=>x.id===d.p);modal('Edit description',`<textarea class="in" id="mDesc" rows="4">${esc(p.desc)}</textarea><p class="muted p">Changing this re-derives classification and requirements.</p>`,'Save',()=>{p.desc=$('#mDesc').value;save();route();});},
  addCert:(d)=>{const p=S.products.find(x=>x.id===d.p);modal('Add certificate',`<div class="form"><label>Name<input class="in" id="mName" placeholder="e.g. FCC Part 15 test report"></label><label>Status<select class="in" id="mSt"><option value="ok">Valid</option><option value="pending">Requested</option><option value="expired">Expired</option></select></label><label>Expires<input class="in" id="mExp" type="date"></label></div>`,'Add',()=>{p.certs=p.certs||[];p.certs.push({name:$('#mName').value||'Certificate',status:$('#mSt').value,expires:$('#mExp').value?new Date($('#mExp').value).toISOString():null});save();route();});},
  delCert:(d)=>{const p=S.products.find(x=>x.id===d.p);p.certs.splice(+d.i,1);save();route();},
  addProduct:()=>modal('Add product',`<div class="form"><label>Name<input class="in" id="mName" placeholder="e.g. Kids bamboo dinner set"></label><label>Category<select class="in" id="mCat">${CATEGORIES.map(c=>`<option>${c[0]}</option>`).join('')}</select></label><label>Describe it<textarea class="in" id="mDesc" rows="3" placeholder="What it is made of, what it does, who it is for, battery/radio yes or no"></textarea></label><div class="muted" style="font-size:12px">You can fine-tune the attributes (radio, children, food contact…) on the product page afterwards.</div><label>Supplier<input class="in" id="mSup" list="supList" placeholder="Factory name"><datalist id="supList">${S.partners.filter(p=>p.type==='Factory').map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></label><label>Market<select class="in" id="mMk">${MARKETS.map(([m,n])=>`<option value="${m}">${n}</option>`).join('')}</select></label></div>`,'Add product',()=>{const cat=$('#mCat').value;const defaults=(CATEGORIES.find(c=>c[0]===cat)||[,{}])[1];const p={id:uid('PR'),name:$('#mName').value||'New product',category:cat,desc:$('#mDesc').value,supplier:$('#mSup').value||'Unassigned supplier',markets:[$('#mMk').value],have:{},certs:[],attrs:Object.fromEntries(Object.keys(defaults).map(k=>[k,true]))};S.products.push(p);if(!S.partners.some(x=>x.name===p.supplier))S.partners.push({id:uid('P'),name:p.supplier,type:'Factory',country:'CN',contact:'',lang:'zh'});save();location.hash='product-'+p.id;}),
  addPartner:()=>modal('Add partner',`<div class="form"><label>Name<input class="in" id="mName"></label><label>Type<select class="in" id="mT"><option>Factory</option><option>Forwarder</option><option>Broker</option></select></label><label>Country<input class="in" id="mC" value="CN"></label><label>Contact email<input class="in" id="mE"></label></div>`,'Add',()=>{S.partners.push({id:uid('P'),name:$('#mName').value||'Partner',type:$('#mT').value,country:$('#mC').value,contact:$('#mE').value,lang:'en'});save();route();}),
  ask:(d)=>{const s=S.shipments.find(x=>x.id===d.id);const bs=d.b?[s.blockers.find(x=>x.id===d.b)]:openB(s);requestModal(product(s).supplier,s,bs);},
  askPartner:(d)=>{const p=S.partners.find(x=>x.id===d.p);const ships=S.shipments.filter(s=>product(s).supplier===p.name);const bs=ships.flatMap(s=>openB(s).map(b=>({...b,sid:s.id})));requestModal(p.name,ships[0],bs);},
  share:(d)=>{const s=S.shipments.find(x=>x.id===d.id);const txt=`ClearWay readiness — ${product(s).name} (${s.id})\n${originName(s)} → ${s.dest} · ${s.mode} · ETA ${fmtD(s.eta)}\nReadiness ${score(s)} — ${STATUS[status(s)][0]}\n\nOpen items:\n${openB(s).map(b=>`- [${b.sev==='crit'?'BLOCKING':'review'}] ${b.title} — ${b.fix} (${b.owner})`).join('\n')||'none'}\n\nClassification: ${(s.cls||classify({desc:product(s).desc,dest:s.dest})).code}`;modal('Share with broker',`<p class="muted p">Copy and paste into an email to your broker. (Read-only links come with accounts.)</p><textarea class="in" rows="10" id="mTxt">${esc(txt)}</textarea>`,'Copy',()=>copy($('#mTxt').value));},
  export:()=>copy(JSON.stringify(S,null,2)),
  reset:()=>{if(S.shipments.length||S.products.length)modal('Load sample data?','<p class="p">This replaces what is currently in the workspace with nine example shipments.</p>','Load',reset);else reset();},
  clearAll:()=>modal('Clear the workspace?','<p class="p">Removes all shipments, products and partners. Your company settings are kept.</p>','Clear',clearAll),
  logout:async()=>{try{await fetch('/api/auth/logout',{method:'POST'});}catch(e){}ME=null;WS=null;MODE='anon';S=emptyState();localStorage.removeItem(KEY);showAuth();},
  invite:()=>modal('Invite a teammate',`<div class="form"><label>Email<input class="in" id="mE" type="email" placeholder="name@factory.com"></label><label>Role<select class="in" id="mR"><option>Factory</option><option>Forwarder</option><option>Broker</option><option>Importer</option></select></label></div><p class="muted p">No email is sent in this version — share your ClearWay address with them; when they sign up with this email they join your workspace.</p>`,'Invite',async()=>{try{const r=await fetch('/api/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('#mE').value,role:$('#mR').value})});const j=await r.json();if(j.error)return toast(j.error);WS.invites=j.invites;route();toast('Invited');}catch(e){toast('Server not reachable');}}),
};
const confirmModal=true;
function requestModal(partner,s,bs){
  const pr=S.partners.find(p=>p.name===partner);
  const en=`Hi ${partner},\n\nBefore we book ${s?product(s).name+' ('+s.id+')':'the next shipment'}, we need the following fixed:\n\n${bs.map((b,i)=>`${i+1}. ${b.title}${b.sid?' ['+b.sid+']':''}\n   ${b.fix}`).join('\n')}\n\nPlease send corrected documents by ${s?fmtD(nextDeadline(s).date):'the cut-off'}. Thank you.\n${S.settings.company}`;
  const zh=`${partner} 您好：\n\n在订舱 ${s?product(s).name+'（'+s.id+'）':''} 之前，请协助处理以下事项：\n\n${bs.map((b,i)=>`${i+1}. ${b.title}\n   ${b.fix}`).join('\n')}\n\n请在 ${s?fmtD(nextDeadline(s).date):'截止日'} 前发送更正后的文件。谢谢！\n${S.settings.company}`;
  modal(`Request to ${partner}`,`<div class="seg" id="langSeg"><button class="active" data-l="en">English</button><button data-l="zh">中文</button></div><textarea class="in" rows="12" id="mTxt" style="margin-top:10px">${esc(en)}</textarea><p class="muted p">${pr&&pr.contact?`Send to ${esc(pr.contact)}. `:''}Copy and paste into email or WeChat.</p>`,'Copy message',()=>copy($('#mTxt').value));
  $('#langSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#langSeg .active').classList.remove('active');b.classList.add('active');$('#mTxt').value=b.dataset.l==='zh'?zh:en;});
}
function copy(t){navigator.clipboard&&navigator.clipboard.writeText(t).then(()=>toast('Copied'),()=>toast('Select the text and copy manually'));}

/* generic modal */
function modal(title,body,okLabel,onOk){
  $('#modal').innerHTML=`<div class="card dlg"><div class="mo-h"><h3>${title}</h3><button class="x" id="mClose">✕</button></div><div class="mo-b">${body}</div><div class="mo-f"><span></span><div><button class="btn" id="mCancel">Cancel</button>${okLabel?`<button class="btn primary" id="mOk">${okLabel}</button>`:''}</div></div></div>`;
  $('#modal').classList.add('open'); const close=()=>$('#modal').classList.remove('open');
  $('#mClose').onclick=close;$('#mCancel').onclick=close; if(okLabel)$('#mOk').onclick=()=>{onOk&&onOk();close();};
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2400);}
const initials=t=>String(t||'?').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function hue(str){let h=0;for(const c of String(str))h=(h*31+c.charCodeAt(0))%360;return `hsl(${h} 35% 45%)`;}

/* =====================================================================
   New shipment wizard (3 steps: Describe & upload → Review → Done)
   ===================================================================== */
let wiz=null; let apiMode='unknown';
function openWizard(pre){
  const p=pre.productId?S.products.find(x=>x.id===pre.productId):null;
  const s=pre.shipmentId?S.shipments.find(x=>x.id===pre.shipmentId):null;
  wiz={step:0,files:{},productId:p?p.id:'',desc:p?p.desc:'',dest:p?p.markets[0]:S.settings.market,mode:'Ocean',units:'',value:'',supplier:p?p.supplier:'',ex:null,replaceId:s?s.id:null,...(s?{productId:s.productId,desc:product(s).desc,dest:s.dest,mode:s.mode,units:s.units,value:s.value,supplier:product(s).supplier}:{}),...pre};
  $('#modal').innerHTML=`<div class="card wiz"><div class="mo-h"><h3>${s?'Upload replacement documents':'New shipment'}</h3><div class="steps" id="steps"><span><i>1</i>Describe &amp; upload</span><span><i>2</i>Review</span><span><i>3</i>Ready?</span></div><button class="x" id="wClose">✕</button></div><div class="mo-b" id="wBody"></div><div class="mo-f"><div class="hint" id="wHint"></div><div><button class="btn" id="wBack">Back</button><button class="btn primary" id="wNext">Continue</button></div></div></div>`;
  $('#modal').classList.add('open');
  $('#wClose').onclick=()=>$('#modal').classList.remove('open');
  $('#wBack').onclick=()=>{if(wiz.step>0){wiz.step--;renderWiz();}};
  $('#wNext').onclick=()=>{
    if(wiz.step===0){ if(!wiz.desc.trim()){toast('Tell us what is in the shipment first');return;} wiz.step=1;renderWiz();runExtraction();return;}
    if(wiz.step===1){ if(!wiz.ex){toast('Still reading documents…');return;} wiz.step=2;renderWiz();return;}
    commit();
  };
  renderWiz();
}
function renderWiz(){
  [...$('#steps').children].forEach((el,i)=>el.className=i<wiz.step?'done':i===wiz.step?'on':'');
  $('#wBack').style.visibility=wiz.step===0?'hidden':'visible';
  $('#wNext').textContent=wiz.step===2?'Save shipment':'Continue';
  const b=$('#wBody');
  if(wiz.step===0){
    $('#wHint').textContent='Takes about a minute. You can skip documents you don\'t have yet — we\'ll flag them.';
    b.innerHTML=`<div class="wz-grid"><div>
      <h4>1. What is shipping?</h4>
      <div class="form">
        <label>Product <select class="in" id="wProd"><option value="">New product…</option>${S.products.map(p=>`<option value="${p.id}" ${wiz.productId===p.id?'selected':''}>${esc(p.name)} — ${esc(p.supplier)}</option>`).join('')}</select></label>
        <label>Describe it in plain words <span class="muted">(material, function, who it's for, battery or radio?)</span><textarea class="in" id="wDesc" rows="3" placeholder="e.g. Bluetooth kitchen scale with LED display and a CR2032 battery, 1,200 units in 100 cartons">${esc(wiz.desc)}</textarea></label>
        <div class="row3"><label>Shipping from<select class="in" id="wOrigin">${Object.entries(COUNTRIES).map(([c,n])=>`<option value="${c}" ${(wiz.origin||'CN')===c?'selected':''}>${n}</option>`).join('')}</select></label><label>Going to<select class="in" id="wDest">${MARKETS.map(([m])=>`<option ${wiz.dest===m?'selected':''}>${m}</option>`).join('')}</select></label><label>By<select class="in" id="wMode">${['Ocean','Air','Express'].map(m=>`<option ${wiz.mode===m?'selected':''}>${m}</option>`).join('')}</select></label></div>
        <div class="row3"><label>Units<input class="in" id="wUnits" type="number" value="${esc(wiz.units)}" placeholder="1200"></label>
        <div class="row3"><label>Goods value (USD)<input class="in" id="wVal" type="number" value="${esc(wiz.value)}" placeholder="11400"></label><label style="grid-column:span 2">Supplier<input class="in" id="wSup" list="supList2" value="${esc(wiz.supplier)}" placeholder="Factory name"><datalist id="supList2">${S.partners.filter(p=>p.type==='Factory').map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist></label></div>
      </div></div>
      <div><h4>2. Drop the documents you have</h4>
      <div class="drops">${[...DOCS,...OPT].map(([k,t,h],i)=>`<div class="drop ${i>2?'opt':''} ${wiz.files[k]?'has':''}"><input type="file" multiple data-k="${k}" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt"><div class="t">${t}${i>2?' <span class="muted">optional</span>':''}</div><div class="h">${wiz.files[k]?`<span class="f">${wiz.files[k].map(f=>esc(f.name)).join(', ')}</span>`:h}</div></div>`).join('')}</div>
      <p class="muted" style="font-size:12px;margin:10px 0 0">${wiz.demo?'Sample mode: documents are simulated.':'Sent to your own ClearWay server for reading. PDF, images, CSV/TXT.'}</p></div></div>`;
    $('#wProd').onchange=e=>{const p=S.products.find(x=>x.id===e.target.value);wiz.productId=e.target.value;if(p){wiz.desc=p.desc;wiz.supplier=p.supplier;wiz.dest=p.markets[0]||wiz.dest;renderWiz();}};
    $('#wDesc').oninput=e=>wiz.desc=e.target.value;$('#wOrigin').onchange=e=>wiz.origin=e.target.value;$('#wDest').onchange=e=>wiz.dest=e.target.value;$('#wMode').onchange=e=>wiz.mode=e.target.value;$('#wUnits').oninput=e=>wiz.units=e.target.value;$('#wVal').oninput=e=>wiz.value=e.target.value;$('#wSup').oninput=e=>wiz.supplier=e.target.value;
    b.querySelectorAll('.drop input').forEach(inp=>{inp.onchange=e=>{wiz.files[inp.dataset.k]=[...e.target.files];renderWiz();};const d=inp.parentElement;d.ondragover=e=>{e.preventDefault();d.classList.add('over');};d.ondragleave=()=>d.classList.remove('over');d.ondrop=e=>{e.preventDefault();d.classList.remove('over');wiz.files[inp.dataset.k]=[...e.dataTransfer.files];renderWiz();};});
  }
  if(wiz.step===1){
    if(!wiz.ex){$('#wHint').textContent='Reading your documents…';b.innerHTML=`<div class="prog" id="prog">${DOCS.map(([k,t])=>`<div class="pr"><span style="width:200px">${t}</span><span class="bar"><i id="pb-${k}"></i></span><span class="st" id="ps-${k}">${wiz.files[k]||wiz.demo?'Queued':'Not uploaded'}</span></div>`).join('')}</div><p class="hint" id="progNote" style="margin-top:18px">Finding line items, normalising units, matching parties…</p>`;return;}
    $('#wHint').textContent=(apiMode==='live'?'Read by Claude from your files. ':apiMode==='offline'?'Server not reachable — simulated. ':'Simulated extraction (no API key). ')+'Fix any cell and the checks update.';
    b.innerHTML=renderReview(); bindReview();
  }
  if(wiz.step===2){
    const r=assess(); wiz.result=r; const st=r.status;
    $('#wHint').textContent='This is what you, your supplier and your broker will see.';
    b.innerHTML=`<div class="result"><div><div class="ring"><svg width="170" height="170"><circle cx="85" cy="85" r="70" fill="none" stroke="var(--hair)" stroke-width="12"/><circle cx="85" cy="85" r="70" fill="none" stroke="var(--${st})" stroke-width="12" stroke-linecap="round" stroke-dasharray="${2*Math.PI*70}" stroke-dashoffset="${2*Math.PI*70*(1-r.score/100)}"/></svg><div class="c"><div><b>${r.score}</b><br><span>Readiness</span></div></div></div><div style="text-align:center;margin-top:10px">${pill(STATUS[st][1],STATUS[st][0])}</div><p class="muted" style="text-align:center">${st==='crit'?'Don\'t book yet — the items marked ! must be fixed first.':st==='warn'?'You can book, but fix these before the cut-off.':'Clear to book.'}</p></div>
      <div>${r.blockers.length?`<div class="cost-line">Shipping as-is could cost <b>${money(r.e.low)}–${money(r.e.high)}</b> and ~${r.e.days} days${r.e.atRisk?`, with <b>${money(r.e.atRisk)}</b> of goods at risk`:''}.</div>`+r.blockers.map(bk=>`<div class="blk">${sevIcon(bk.sev)}<div class="blk-b"><b>${esc(bk.title)}</b><p>${esc(bk.detail)}</p><div class="fix">→ ${esc(bk.fix)} <span class="muted">(${esc(bk.owner)})</span></div></div><div class="li-r"><div class="num">${impactRange(impact(bk.kind,{units:wiz.units,value:wiz.value}))}</div></div></div>`).join(''):empty('No blockers found','All documents agree and every required certificate is on file.')}</div></div>`;
  }
}
function renderReview(){
  const ex=wiz.ex; const issues=compareIssues(ex); wiz.docIssues=issues; const cls=wiz.cls; const reqs=wiz.reqs;
  return `<h4>Documents side by side <span class="muted">— red cells disagree</span></h4>
  <div class="cmp"><div class="hh"></div><div class="hh">Commercial invoice</div><div class="hh">Packing list</div><div class="hh">${wiz.mode==='Air'?'Air waybill':'Bill of lading'}</div>
  ${FIELDS.map(([f,label])=>{const vals=['inv','pl','bl'].map(k=>ex[k]?ex[k][f]:null);const present=vals.filter(v=>v);const bad=COMPARE.has(f)&&present.length>1&&new Set(present.map(norm)).size>1;
    return `<div class="k">${label}</div>`+['inv','pl','bl'].map(k=>{if(!ex[k])return `<div class="miss"><span class="na">not uploaded</span></div>`;const v=ex[k][f];const req=k==='inv'&&['value','incoterm'].includes(f)&&!v;return `<div class="${bad&&v?'bad':req?'miss':''}"><input data-doc="${k}" data-f="${f}" value="${esc(v||'')}" placeholder="${req?'required':'—'}"></div>`;}).join('');}).join('')}</div>
  <div class="issues">${issues.length?issues.map(b=>`<div class="blk">${sevIcon(b.sev)}<div class="blk-b"><b>${esc(b.title)}</b><p>${esc(b.detail)}</p><div class="fix">→ ${esc(b.fix)}</div></div></div>`).join(''):`<div class="blk"><span class="ico good">✓</span><div><b>Documents agree</b></div></div>`}</div>
  <div class="two" style="margin-top:18px"><div><h4>Classification</h4><div class="blk" style="display:block"><b>${esc(cls.code)} ${pill(cls.conf>=85?'good':'warn',cls.conf+'% confidence')}</b><p>${esc(cls.text)} · est. duty ${esc(cls.duty)}</p><p class="muted">${esc(cls.why)}</p></div></div>
  <div><h4>Required for ${wiz.dest} <span class="muted">— tick what you already have</span></h4>${reqs.map((r,i)=>`<label class="chk"><input type="checkbox" data-i="${i}" ${r.have?'checked':''}><div><b>${esc(r.name)}</b><small>${esc(r.plain)} <em>— ${esc(because(r))}</em></small></div></label>`).join('')}</div></div>`;
}
function bindReview(){
  const b=$('#wBody');
  b.querySelectorAll('.cmp input').forEach(i=>i.onchange=()=>{wiz.ex[i.dataset.doc][i.dataset.f]=i.value;b.innerHTML=renderReview();bindReview();});
  b.querySelectorAll('input[type=checkbox]').forEach(c=>c.onchange=()=>{wiz.reqs[+c.dataset.i].have=c.checked;});
}

/* ---- extraction ---- */
const API_BASE=location.protocol==='file:'?null:'';
async function filesToPayload(){const out={};for(const [k] of [...DOCS,...OPT]){const fs=wiz.files[k];if(!fs||!fs.length)continue;out[k]=[];for(const f of fs){if(!(f instanceof Blob)){out[k].push({name:f.name,simulated:true});continue;}if(f.size>8*1024*1024){out[k].push({name:f.name,error:'too large'});continue;}const b64=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.readAsDataURL(f);});out[k].push({name:f.name,type:f.type||'application/octet-stream',data:b64});}}return out;}
function runExtraction(){
  const seq=DOCS.map(d=>d[0]); let i=0,serverDone=false,serverResult=null;
  const prodHave=()=>{const p=S.products.find(x=>x.id===wiz.productId);return p?(p.have||{}):{};};
  const finish=()=>{
    if(serverResult&&serverResult.ex){wiz.ex=mergeExtraction(serverResult.ex);wiz.cls=serverResult.classification||classify(wiz);apiMode='live';}
    else{wiz.ex=buildExtraction();wiz.cls=classify(wiz);if(apiMode==='unknown')apiMode='simulated';}
    const have=prodHave(); const haveCerts=!!(wiz.files.certs&&wiz.files.certs.length), haveArt=!!(wiz.files.art&&wiz.files.art.length);
    const wp=S.products.find(x=>x.id===wiz.productId);wiz.reqs=requirementsFor(wp||wiz.desc,wiz.dest,wiz.mode).filter(r=>!(r.id==='us-uflpa'&&(wiz.origin||'CN')!=='CN')).map(r=>({...r,have:!!have[r.id]||(r.kind==='cert'&&haveCerts&&wiz.demo)||(r.kind.startsWith('label')&&haveArt)||r.kind==='classification'||(r.id==='us-ior'&&!!S.settings.company)}));
    renderWiz();
  };
  const realFiles=Object.values(wiz.files).flat().some(f=>f instanceof Blob);
  if(API_BASE!==null&&realFiles&&!wiz.demo){filesToPayload().then(docs=>fetch(API_BASE+'/api/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({desc:wiz.desc,dest:wiz.dest,mode:wiz.mode,supplier:wiz.supplier,docs})})).then(r=>r.ok?r.json():Promise.reject(r.status)).then(j=>{serverResult=j;if(j.simulated)apiMode='simulated';}).catch(()=>{apiMode='offline';}).finally(()=>{serverDone=true;});}
  else{serverDone=true;apiMode=wiz.demo?'simulated':'offline';}
  const step=()=>{if(i>=seq.length){if(serverDone)finish();else{const n=$('#progNote');if(n)n.textContent='Waiting for document analysis…';setTimeout(step,300);}return;}
    const k=seq[i];const have=wiz.files[k]||wiz.demo;const bar=$('#pb-'+k),st=$('#ps-'+k);if(!bar){return;}
    if(!have){st.textContent='Not uploaded';bar.style.background='var(--line)';bar.style.width='100%';i++;setTimeout(step,250);return;}
    const stages=['Reading…','Finding line items…','Normalising units…','Matching parties…','Done'];let j=0;const t=setInterval(()=>{j++;bar.style.width=(j/4*100)+'%';st.textContent=stages[j];if(j>=4){clearInterval(t);i++;setTimeout(step,200);}},300);};
  setTimeout(step,300);
}
function mergeExtraction(ex){const out={};['inv','pl','bl'].forEach(k=>{if(!ex[k]||!wiz.files[k]){out[k]=null;return;}const o={};FIELDS.forEach(([f])=>o[f]=ex[k][f]==null?'':String(ex[k][f]));out[k]=o;});return out;}
function num(desc,re,def){const m=String(desc).replace(/,/g,'').match(re);return m?+m[1]:def;}
function buildExtraction(){
  const d=wiz.desc;const qty=Number(wiz.units)||num(d,/(\d{2,6})\s*(?:units|pcs|pieces|sets)/i,1200);const ctn=num(d,/(\d{1,5})\s*(?:cartons|ctns|boxes)/i,Math.round(qty/12));
  const p=S.products.find(x=>x.id===wiz.productId);const title=(p&&p.name)||d.split(/[,.]|\bwith\b/)[0].trim().replace(/^\d+\s*(units|pcs)?\s*(of)?\s*/i,'')||'Goods';
  const has=k=>!!(wiz.files[k]||wiz.demo);const kg=Math.round(qty*0.42+ctn*0.9);const val=Number(wiz.value)||qty*9.5;
  return {inv:has('inv')?{desc:title,qty:String(qty),cartons:String(ctn),weight:kg+' kg',value:'USD '+val.toLocaleString(),incoterm:'FOB '+portName(defaultOrigin(wiz.origin||'CN',wiz.mode)).replace(/ \(.*\)/,''),consignee:S.settings.company,origin:COUNTRIES[wiz.origin||'CN']||'China',hs:''}:null,
    pl:has('pl')?{desc:title.replace(/smart |digital /i,''),qty:String(qty-50),cartons:String(ctn),weight:kg+' kg',value:'',incoterm:'',consignee:S.settings.company,origin:COUNTRIES[wiz.origin||'CN']||'China',hs:''}:null,
    bl:has('bl')?{desc:title.split(' ').slice(-2).join(' '),qty:'',cartons:String(ctn),weight:(kg-14)+' kg',value:'',incoterm:'',consignee:S.settings.company+'.',origin:'',hs:''}:null};
}
function compareIssues(ex){
  const issues=[];const docs=['inv','pl','bl'];const names={inv:'invoice',pl:'packing list',bl:'BL/AWB'};
  docs.forEach(k=>{if(!ex[k])issues.push(mkB('crit','missing-doc',`${DOCS.find(d=>d[0]===k)[1]} missing`,'The entry cannot be prepared without it.','Upload it, or request it from the supplier / forwarder.',k==='bl'?'Forwarder':'Factory'));});
  FIELDS.forEach(([f,label])=>{if(!COMPARE.has(f))return;const vals=docs.filter(k=>ex[k]&&ex[k][f]).map(k=>[k,ex[k][f]]);if(vals.length<2)return;const base=norm(vals[0][1]);if(vals.some(v=>norm(v[1])!==base)){
    const kind=f==='hs'?'hs-mismatch':f;const sev=(f==='qty'||f==='consignee')?'crit':'warn';
    issues.push(mkB(sev,kind,`${label} mismatch`,vals.map(v=>`${names[v[0]]}: ${v[1]}`).join(' · '),f==='desc'?'Use one standard description from the product record on every document.':f==='consignee'?'Match the legal entity name exactly (and EIN/EORI) on all documents.':f==='hs'?'Put the same tariff code on every document.':'Confirm with the supplier and reissue the document.',f==='hs'||f==='weight'?'Forwarder':'Factory'));}});
  if(ex.inv&&!ex.inv.incoterm)issues.push(mkB('crit','incoterm','Incoterm missing on invoice','Customs value cannot be established.','Add the Incoterm (e.g. FOB Yantian).','Factory'));
  if(ex.inv&&!ex.inv.value)issues.push(mkB('crit','value','Value / currency missing on invoice','','Add the total value with currency.','Factory'));
  if(ex.inv&&!ex.inv.hs)issues.push(mkB('warn','hs-low','No HS code on invoice','Brokers will classify from the description; adding the code reduces queries.',`Add ${wiz.cls?wiz.cls.code:'the suggested code'} to each line.`,'Factory'));
  return issues;
}
function assess(){
  const blockers=[...(wiz.docIssues||[])];
  (wiz.reqs||[]).forEach(r=>{if(!r.have&&r.kind!=='classification')blockers.push(mkB(/registration|filing/.test(r.kind)?'warn':'crit',r.kind,`${r.name} not on file`,r.plain,`Obtain from ${r.owner.toLowerCase()} and add it to the product record.`,r.owner.split(/[\/(+]/)[0].trim(),r.id));});
  if(wiz.cls&&wiz.cls.conf<85&&!blockers.some(b=>b.kind==='hs-low'))blockers.push(mkB('warn','hs-low','Classification confidence below 85%',`${wiz.cls.code} — ${wiz.cls.text}`,'Add material/function details or request a broker opinion.','Importer'));
  let sc=100;blockers.forEach(b=>sc-=b.sev==='crit'?12:5);sc=Math.max(5,sc);
  const status=blockers.some(b=>b.sev==='crit')?'crit':blockers.length?'warn':'good';
  const ctx={units:Number(wiz.units)||1000,value:Number(wiz.value)||9000};let low=0,high=0,days=0,atRisk=0;blockers.forEach(b=>{const i=impact(b.kind,ctx);low+=i.low;high+=i.high;days=Math.max(days,i.days);atRisk=Math.max(atRisk,i.atRisk);});
  return {score:sc,status,blockers,e:{low,high,days,atRisk}};
}
function commit(){
  const r=wiz.result; let p=S.products.find(x=>x.id===wiz.productId);
  if(!p){p={id:uid('PR'),name:(wiz.desc.split(/[,.]|\bwith\b/)[0].trim().slice(0,40))||'New product',desc:wiz.desc,supplier:wiz.supplier||'Unassigned supplier',markets:[wiz.dest],have:{},certs:[]};S.products.push(p);if(!S.partners.some(x=>x.name===p.supplier))S.partners.push({id:uid('P'),name:p.supplier,type:'Factory',country:'CN',contact:'',lang:'zh'});}
  if(!p.markets.includes(wiz.dest))p.markets.push(wiz.dest);
  p.have=p.have||{};(wiz.reqs||[]).forEach(q=>{if(q.have)p.have[q.id]=1;});
  const hasDoc=k=>!!(wiz.files[k]||wiz.demo);const docs={};['inv','pl','bl'].forEach(k=>docs[k]=!hasDoc(k)?'missing':(wiz.docIssues||[]).some(b=>DOC_KINDS.has(b.kind)&&b.kind!=='missing-doc')?'mismatch':'ok');
  const units=Number(wiz.units)||num(wiz.desc,/(\d{2,6})\s*(?:units|pcs|pieces|sets)/i,1000),value=Number(wiz.value)||units*9;
  if(wiz.replaceId){const s=S.shipments.find(x=>x.id===wiz.replaceId);s.blockers=r.blockers;s.docs=docs;s.ex=wiz.ex;s.cls=wiz.cls;save();$('#modal').classList.remove('open');location.hash='shipment-'+s.id;route();toast(`${s.id} updated — readiness ${score(s)}`);return;}
  const id='SH-'+(1070+S.shipments.filter(s=>s.isNew).length);
  const s={id,productId:p.id,origin:wiz.origin||'CN',dest:wiz.dest,mode:wiz.mode,units,value,loadDate:addDays(wiz.mode==='Ocean'?8:3),eta:addDays(wiz.mode==='Ocean'?36:wiz.mode==='Air'?8:5),createdAt:new Date().toISOString(),blockers:r.blockers,docs,ex:wiz.ex,cls:wiz.cls,isNew:true};
  S.shipments.unshift(s);save();$('#modal').classList.remove('open');location.hash='shipment-'+id;toast(`${id} saved — readiness ${score(s)}`);
}

/* =====================================================================
   Boot
   ===================================================================== */
/* =====================================================================
   Auth screen + boot
   ===================================================================== */
function showAuth(tab){
  tab=tab||'login';
  $('#view').innerHTML=`<div class="auth"><div class="auth-card">
    <div class="logo" style="padding:0 0 14px"><span class="mark">CW</span><span class="name">ClearWay</span></div>
    <h1>${tab==='login'?'Sign in':'Create your account'}</h1>
    <p class="muted">${tab==='login'?'Your shipments, products and team are saved to your workspace.':'One account per person. Your company gets its own workspace; invite your factory, forwarder and broker later.'}</p>
    <form id="authForm" class="form">
      ${tab==='signup'?`<label>Company (importer of record)<input class="in" name="company" placeholder="e.g. Northwind Imports LLC" required></label>`:''}
      <label>Email<input class="in" name="email" type="email" autocomplete="username" required></label>
      <label>Password<input class="in" name="password" type="password" autocomplete="${tab==='login'?'current-password':'new-password'}" minlength="8" required>${tab==='signup'?'<small class="muted">At least 8 characters</small>':''}</label>
      <div class="auth-err" id="authErr"></div>
      <button class="btn primary" style="justify-content:center">${tab==='login'?'Sign in':'Create account'}</button>
    </form>
    <p class="muted" style="margin-top:14px">${tab==='login'?`New here? <a href="#" id="authSwap">Create an account</a>`:`Already have an account? <a href="#" id="authSwap">Sign in</a>`}</p>
    <p class="muted" style="font-size:12px;margin-top:18px"><a href="#" id="authLocal">Continue without an account</a> — data stays in this browser only.</p>
  </div></div>`;
  $('#nav').innerHTML='';$('#role').innerHTML='';$('#account').innerHTML='';
  $('#authSwap').onclick=e=>{e.preventDefault();showAuth(tab==='login'?'signup':'login');};
  $('#authLocal').onclick=e=>{e.preventDefault();MODE='local';S=loadLocal();Object.assign(COSTS,S.costs||{});route();};
  $('#authForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target).entries());const err=$('#authErr');err.textContent='';
    try{const r=await fetch('/api/auth/'+tab,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(f)});const j=await r.json();if(j.error){err.textContent=j.error;return;}
      await enterWorkspace(j.user,tab==='signup'?f.company:null);}
    catch(ex){err.textContent='Could not reach the server.';}};
}
async function enterWorkspace(user,company){
  ME=user;MODE='server';
  try{const r=await fetch('/api/state');const j=await r.json();WS=j.workspace;S=j.state||emptyState();if(!S.settings)S.settings=emptyState().settings;if(company&&!S.settings.company)S.settings.company=company;if(!S.settings.company&&WS&&WS.name)S.settings.company=WS.name;if(!S.settings.role)S.settings.role=user.role||'Importer';}
  catch(e){S=emptyState();}
  Object.assign(COSTS,S.costs||{});save();if(!location.hash||location.hash==='#')location.hash='#overview';route();
}
(async()=>{
  let health=null;try{const r=await fetch('/api/health');health=await r.json();}catch(e){}
  window.__health=health||{ok:false};
  if(health&&health.auth){
    try{const r=await fetch('/api/auth/me');const j=await r.json();if(j.user){await enterWorkspace(j.user);}else{MODE='anon';showAuth();}}catch(e){MODE='local';S=loadLocal();Object.assign(COSTS,S.costs||{});route();}
  } else { MODE='local';S=loadLocal();Object.assign(COSTS,S.costs||{});route(); }
  const el=$('#health');if(el)el.innerHTML=window.__health.ok?(window.__health.live?`${pill('good','Live')} Claude reads uploaded documents (${esc(window.__health.model)}).`:`${pill('warn','Simulated')} Server running without an API key.`):`${pill('crit','No server')} Open the app through <code>npm start</code> to enable extraction.`;})();
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#modal').classList.remove('open');});
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))$('#modal').classList.remove('open');});

/* =====================================================================
   Document pack — destination paperwork prefilled from product + shipment
   ===================================================================== */
function docField(label,value,required,hint){const miss=required&&(value==null||value==='');return `<tr class="${miss?'miss':''}"><td class="k">${esc(label)}${required?' *':''}</td><td>${miss?'<span class="missing">MISSING</span>':esc(value)}${hint?`<div class="muted">${esc(hint)}</div>`:''}</td></tr>`;}
function docPack(s){
  const p=product(s), ex=s.ex||{}, inv=ex.inv||{}, pl=ex.pl||{}, bl=ex.bl||{}, st=S.settings, cls=clsFor(s); const OC=originOf(s), ON=originName(s), POL=portName(polOf(s)).replace(/ \(.*\)/,'');
  const sup=S.partners.find(x=>x.name===p.supplier)||{}; const unit=(s.value/s.units)||0; const cartons=inv.cartons||pl.cartons||Math.ceil(s.units/12);
  const weight=inv.weight||pl.weight||bl.weight||''; const incoterm=inv.incoterm||('FOB '+POL); const consignee=st.company; const idNo=s.dest==='US'?st.ein:st.eori;
  const idLabel=s.dest==='US'?'EIN / IRS number':s.dest==='CA'?'Business Number (BN15) / CARM':'EORI number';
  const docs=[];
  docs.push({id:'ci',title:'Commercial invoice',who:'Factory issues · importer checks',why:'Customs values the shipment from this document. Every other document must agree with it.',
    rows:[['Seller / exporter',p.supplier,1],['Buyer / consignee',consignee,1],[idLabel+' of importer',idNo,1,'Needed on the invoice for '+s.dest],['Invoice number',inv.number||'',1],['Date',fmtD(new Date()),1],['Incoterm + named place',incoterm,1],['Currency',(inv.value||'USD').split(' ')[0]||'USD',1],
      ['Line 1 — description (as on product record)',p.name+' — '+p.desc,1,'Use this exact wording on the packing list and BL'],['HS / tariff code',cls.code,1],['Country of origin',ON,1],['Quantity (units)',String(s.units),1],['Unit price',unit?unit.toFixed(2):'',1],['Line total / invoice total',money(s.value),1],['Cartons',String(cartons),1],['Gross / net weight',weight,1],
      ...(s.dest==='US'?[['FDA product code (if FDA-regulated)',(p.have||{})['us-fdacode']?'on file':'' ,attrsOf(p).foodContact||attrsOf(p).cosmetic||attrsOf(p).food,'Required on the invoice for food-contact, cosmetic and food items']]:[]),
      ...(s.dest==='CA'?[['Canada Customs Invoice (CCI) fields','Required when value > CAD 3,300: purchaser, vendor, country of transhipment, conditions of sale',s.value>2400,'Your broker can complete the CCI from this invoice if these fields are present']]:[]),
      ...(s.dest==='EU'||s.dest==='UK'?[['Importer EORI on invoice',st.eori,1]]:[]),
      ['Signature + "I declare the information is true and correct"','',1]]});
  docs.push({id:'pl',title:'Packing list',who:'Factory issues',why:'Customs uses it to inspect without opening every carton. Counts and weights must match the invoice exactly.',
    rows:[['Invoice reference',inv.number||'',1],['Shipper',p.supplier,1],['Consignee',consignee,1],['Description (identical to invoice)',p.name,1],['Total cartons',String(cartons),1],['Units per carton / total units',`${Math.round(s.units/cartons)} / ${s.units}`,1],['Gross weight / net weight',weight,1],['Carton dimensions (cm) and total CBM','',1],['Shipping marks',`${consignee.toUpperCase()} · ${s.id} · C/No. 1–${cartons} · MADE IN ${ON.toUpperCase()}`,1,'Print on every carton'],...(s.mode==='Ocean'?[['Container / seal numbers','',0,'Added at stuffing']]:[])]});
  if(s.dest==='US'&&s.mode==='Ocean')docs.push({id:'isf',title:'ISF 10+2 worksheet (US ocean)',who:'Importer files via broker · 24 h before loading · data mostly from the factory',why:'Late or wrong ISF = $5,000 liquidated damages per violation and a flag for exam.',
    rows:[['1. Seller (owner of goods)',p.supplier,1],['2. Buyer',consignee,1],['3. Importer of record number (EIN)',st.ein,1],['4. Consignee number',st.ein,1],['5. Manufacturer / supplier name + address',p.supplier+(sup.country?', '+sup.country:''),1],['6. Ship-to party (final delivery address)','',1],['7. Country of origin',ON,1],['8. HTSUS number (6-digit minimum)',cls.code,1],['9. Container stuffing location','',1,'Factory or consolidator warehouse address'],['10. Consolidator (stuffer)','',1],['Carrier: vessel stow plan + container status messages','carrier files',0],['Bill of lading number (to link)',bl.number||'',1]]});
  if(s.dest==='CA')docs.push({id:'b3',title:'Canada release & accounting data (CBSA, B3 / CARM)',who:'Broker files · importer provides',why:'Since CARM, the importer must have a CARM account and security posted; otherwise goods wait at the border until duties are paid in full.',
    rows:[['Importer Business Number (BN15, RM account)',st.ein,1],['CARM account + Release Prior to Payment security','',1],['Tariff classification (10-digit)',cls.code,1],['Tariff treatment',OC==='CN'?'02 — MFN (China origin)':'02 — MFN (check CUSMA/CPTPP eligibility for '+ON+')',1],['Country of origin',OC,1],['Value for duty + currency',money(s.value)+' USD',1],['Place of export',ON,1],['Mode / cargo control number (from carrier)',bl.number||'',1],['GST 5% on duty-paid value','calculated',0],['Bilingual labelling confirmed on product',(p.have||{})['ca-bilingual']?'yes':'',1,'Required before sale in Canada']]});
  if(s.dest==='EU')docs.push({id:'sad',title:'EU import declaration data (customs declaration / SAD)',who:'Broker files · importer provides',why:'The declaration pulls together EORI, code, value, origin and VAT treatment. Pre-arrival ENS (ICS2) is separate and filed by the carrier from your data.',
    rows:[['Importer EORI',st.eori,1],['Procedure code','40 00 (release for free circulation)',1],['CN / TARIC code (10-digit)',cls.code,1],['Customs value (CIF) + currency','invoice value + freight + insurance',1],['Country of origin / dispatch',OC+' / '+OC,1],['Preference code',OC==='CN'?'100 (none — China)':'100 unless a preferential origin proof is held',1],['VAT: import VAT or IOSS / Article 23 deferment','',1],['GPSR Responsible Person (EU address)',(p.have||{})['eu-gpsr']?'on file':'',1,'Must appear on the product or packaging'],['Packaging EPR registration number (e.g. LUCID)','',0]]});
  if(s.dest==='UK')docs.push({id:'cds',title:'UK import declaration data (CDS)',who:'Broker files · importer provides',why:'HMRC\'s Customs Declaration Service needs the GB EORI, commodity code and VAT treatment.',
    rows:[['GB EORI',st.eori,1],['Commodity code (10-digit)',cls.code,1],['Customs value + currency','invoice value + freight + insurance',1],['Country of origin',OC,1],['Procedure code','40 00',1],['Import VAT: postponed VAT accounting?','',1],['UK Responsible Person / UKCA documentation','',attrsOf(p).electrical||attrsOf(p).children]]});
  docs.push({id:'coo',title:'Certificate of origin ('+ON+')',who:OC==='CN'?'Factory applies at CCPIT / China Customs':'Factory applies at the local chamber of commerce',why:`Not always mandatory for ${ON}-origin goods, but often requested by buyers, banks and for AD/CVD, quota or preferential-duty checks.`,
    rows:[['Exporter',p.supplier,1],['Consignee',consignee,1],['Means of transport and route',`${s.mode} · ${POL} → ${portName(podOf(s))}`,1],['Marks and numbers',`${s.id} · C/No. 1–${cartons}`,1],['Description + HS code',`${p.name} · ${cls.code}`,1],['Quantity + weight',`${s.units} units · ${weight}`,1],['Invoice number + date',inv.number||'',1]]});
  docs.push({id:'sli',title:'Shipper\'s letter of instruction (to the factory)',who:'Importer sends · factory follows',why:'The single most effective way to stop document mismatches: tell the factory exactly what every document must say before they produce them.',
    rows:[['Use this description on invoice, packing list and BL',p.name,1],['Use this HS code on every document',cls.code,1],['Consignee / notify party exactly as',consignee+(idNo?' · '+idLabel+' '+idNo:''),1],['Incoterm',incoterm,1],['Currency + value must equal the PO','USD · '+money(s.value),1],['Marks on cartons',`${consignee.toUpperCase()} · ${s.id} · MADE IN ${ON.toUpperCase()}`,1],['Labels required on product / packaging',reqsFor(s).filter(r=>r.kind.startsWith('label')).map(r=>r.name).join('; ')||'—',1],['Certificates to send with documents',reqsFor(s).filter(r=>r.kind==='cert').map(r=>r.name).join('; ')||'—',1],['Deadline for draft documents',fmtD(nextDeadline(s).date),1]]});
  return docs;
}
function pageDocPack(id){
  const s=S.shipments.find(x=>x.id===id); if(!s)return empty('Shipment not found');
  const p=product(s); const docs=docPack(s); const missing=docs.reduce((a,d)=>a+d.rows.filter(r=>r[2]&&!r[1]).length,0);
  return `<a class="back" href="#shipment-${s.id}">← ${esc(p.name)} · ${s.id}</a>
  ${pageHead('Document pack · '+s.dest,`Everything the destination needs, prefilled from the product record, your settings and the extracted documents. <b>${missing} required field${missing===1?'':'s'} still missing</b> — fill them in Settings or on the product, or send the pack to the factory to complete.`,`<button class="btn" data-act="copyPack" data-id="${s.id}">Copy all as text</button><button class="btn" onclick="window.print()">Print / save PDF</button>`)}
  <div class="docnav">${docs.map(d=>`<a href="#docs-${s.id}" onclick="event.preventDefault();document.getElementById('d-${d.id}').scrollIntoView({behavior:'smooth'})">${esc(d.title)}</a>`).join('')}</div>
  ${docs.map(d=>{const miss=d.rows.filter(r=>r[2]&&!r[1]).length;return `<section class="card sheet" id="d-${d.id}"><div class="card-h"><div><h2>${esc(d.title)}</h2><div class="muted" style="font-size:12px">${esc(d.who)}</div></div>${miss?pill('warn',miss+' missing'):pill('good','complete')}</div><p class="p muted" style="padding:0 18px">${esc(d.why)}</p><table class="matrix"><tbody>${d.rows.map(r=>docField(r[0],r[1],r[2],r[3])).join('')}</tbody></table></section>`;}).join('')}
  <p class="muted p">* required. These are data sheets your broker and factory can work from — they are not the official forms themselves. Your broker files the actual entry.</p>`;
}
ACTIONS.copyPack=(d)=>{const s=S.shipments.find(x=>x.id===d.id);const txt=docPack(s).map(doc=>`== ${doc.title} ==\n${doc.who}\n${doc.rows.map(r=>`${r[0]}${r[2]?' *':''}: ${r[1]||'MISSING'}`).join('\n')}`).join('\n\n');copy(txt);};

/* =====================================================================
   Rates & fees
   ===================================================================== */
function pageRates(shipId){
  const s=shipId?S.shipments.find(x=>x.id===shipId):null; const f=window.__rt||(window.__rt={origin:s?originOf(s):'CN',dest:s?s.dest:S.settings.market,mode:s?s.mode:'Ocean',cbm:s?Math.round(s.units/60):12,kg:s?Math.round(s.units*0.5):600,value:s?s.value:10000});
  if(s){f.origin=originOf(s);f.dest=s.dest;f.mode=s.mode;f.value=s.value;}
  setTimeout(loadRates,0);
  return `${s?`<a class="back" href="#shipment-${s.id}">← ${esc(product(s).name)} · ${s.id}</a>`:''}
  ${pageHead('Rates & fees','Freight estimate plus every destination fee and duty, so the landed cost has no surprises.')}
  <section class="card"><div class="card-h"><h2>Lane</h2><span class="hint">origin → destination</span></div>
    <div class="row" style="padding:0 18px 16px;flex-wrap:wrap"><select class="in" onchange="__rt.origin=this.value;route()">${Object.entries(COUNTRIES).map(([c,n])=>`<option value="${c}" ${f.origin===c?'selected':''}>${n}</option>`).join('')}</select><span class="muted">→</span><select class="in" onchange="__rt.dest=this.value;route()">${MARKETS.map(([m,n])=>`<option value="${m}" ${f.dest===m?'selected':''}>${n}</option>`).join('')}</select><select class="in" onchange="__rt.mode=this.value;route()">${['Ocean','Air','Express'].map(m=>`<option ${f.mode===m?'selected':''}>${m}</option>`).join('')}</select><label class="muted" style="font-size:12px">Volume (cbm) <input class="in" style="width:90px" type="number" value="${f.cbm}" onchange="__rt.cbm=+this.value;route()"></label><label class="muted" style="font-size:12px">Weight (kg) <input class="in" style="width:90px" type="number" value="${f.kg}" onchange="__rt.kg=+this.value;route()"></label><label class="muted" style="font-size:12px">Goods value (USD) <input class="in" style="width:110px" type="number" value="${f.value}" onchange="__rt.value=+this.value;route()"></label></div></section>
  <div class="two"><section class="card" id="ratesOut"><div class="card-h"><h2>Freight</h2></div><div class="p muted" style="padding:0 18px 16px">Loading…</div></section>
  <section class="card" id="feesOut"><div class="card-h"><h2>Destination fees & duty</h2></div><div class="p muted" style="padding:0 18px 16px">Loading…</div></section></div>
  <section class="card"><div class="card-h"><h2>Integrations</h2><span class="hint">what is live on your server</span></div><div id="integ" class="p muted" style="padding:0 18px 16px">Checking…</div>
    <div class="intg">
      ${[['USITC HTS API','Official US tariff schedule — duty rates by code or keyword','free, no key','usitc'],['UK Trade Tariff API','Official UK commodity codes and duty','free, no key','ukTradeTariff'],['EU TARIC / CBSA Tariff','Official lookups (no public JSON API) — linked','link','taric'],['Freightos WebCargo','Ocean & air spot rates from forwarders','API key','freightos'],['Maersk Spot','Instant bookable ocean rates','client ID + secret','maersk'],['Flexport API','Quotes, bookings, tracking','API key','flexport'],['Shippo / EasyPost','Parcel & express rates','API key','shippo']].map(([n,d,k,id])=>`<div class="li"><div class="li-b"><div class="li-t">${n}</div><div class="li-s">${d}</div></div><span class="pill neutral" id="int-${id}">${k}</span></div>`).join('')}
    </div><p class="muted p" style="padding:0 18px 16px">Add keys to <code>.env</code> and restart — the rates page switches from the built-in estimate to live quotes automatically. Carrier APIs typically require a commercial agreement.</p></section>`;
}
async function loadRates(){
  const f=window.__rt; const out=$('#ratesOut'), fo=$('#feesOut'), ig=$('#integ'); if(!out)return;
  try{const r=await fetch(`/api/rates?origin=${f.origin}&dest=${f.dest}&mode=${f.mode}&cbm=${f.cbm}&kg=${f.kg}&value=${f.value}`);const j=await r.json();
    out.innerHTML=`<div class="card-h"><h2>Freight</h2><span class="hint">${j.live.length?'live: '+j.live.join(', '):'built-in estimate'}</span></div>${j.quotes.map(q=>`<div class="li"><div class="li-b"><div class="li-t">${esc(q.service)}</div><div class="li-s">${esc(q.provider)} · ~${q.days} days port to port</div></div><div class="li-r"><div class="num">${money(q.low)}–${money(q.high)}</div></div></div>`).join('')}<p class="muted p" style="padding:0 18px 16px;font-size:12px">${esc(j.note)}</p>`;
    const total=j.fees.reduce((a,x)=>a+x.amount,0);
    fo.innerHTML=`<div class="card-h"><h2>Destination fees & duty</h2><span class="hint">${f.dest}</span></div>${j.fees.map(x=>`<div class="kv"><span>${esc(x.label)}</span><b>${money(x.amount)}</b></div>`).join('')}<div class="kv"><span>Duty</span><b>see classification on the shipment</b></div><div class="kv total"><span>Fees excl. duty & freight</span><b>${money(total)}</b></div>`;
  }catch(e){out.innerHTML=`<div class="card-h"><h2>Freight</h2></div><div class="p" style="padding:0 18px 16px">${pill('crit','No server')} <span class="muted">Run with <code>npm start</code> to get estimates.</span></div>`;fo.innerHTML='';}
  try{const r=await fetch('/api/integrations');const j=await r.json();ig.textContent='';const set=(id,on,label)=>{const el=$('#int-'+id);if(!el)return;el.className='pill '+(on===true?'good':on==='link-only'?'neutral':'warn');el.textContent=on===true?'live':on==='link-only'?'link':'not connected — '+label;};
    set('usitc',j.tariff.usitc,'');set('ukTradeTariff',j.tariff.ukTradeTariff,'');set('taric','link-only','');set('freightos',j.rates.freightos,'API key');set('maersk',j.rates.maersk,'credentials');set('flexport',j.rates.flexport,'API key');set('shippo',j.rates.shippo,'API key');}
  catch(e){ig.textContent='Server not reachable.';}
}

/* =====================================================================
   How it works — the operating model
   ===================================================================== */
function pageHow(){
  return `${pageHead('How ClearWay works','The problem, the flow, and who does what. Read this once; the rest of the app follows it.')}
  <section class="card"><div class="card-h"><h2>The problem we solve</h2></div><div class="prose">
    <p>Small importers — from China today, from anywhere tomorrow — get held at customs for boring reasons: the invoice and packing list disagree, a certificate is missing, a label lacks a required line. The factory that produced the documents never sees the destination's rules; the broker who knows the rules sees the documents only when the container is already on the water. Each hold costs an exam fee, days of storage and — for regulated products — sometimes the goods.</p>
    <p>ClearWay sits <b>before booking</b>, between the importer and the factory. It turns one product description into a list of what the destination needs, checks the factory's documents against each other and against that list, and puts a price on every gap so people fix the expensive ones first.</p></div></section>
  <section class="card"><div class="card-h"><h2>Who does what</h2><span class="hint">pick your role in the sidebar to see your tasks first</span></div>
    <table class="tbl"><thead><tr><th>Role</th><th>Owns</th><th>Uses ClearWay to</th></tr></thead><tbody>
    <tr><td><b>Importer</b> (ops / founder)</td><td>Product record, the decision to ship, the entry (legally)</td><td>Add products, run the readiness check, send fix requests, share the pack with the broker, approve advancing a stage.</td></tr>
    <tr><td><b>Factory</b> (export clerk)</td><td>Goods, invoice, packing list, labels, test reports</td><td>Receive the shipper's letter of instruction (EN/中文), upload documents, fix the items assigned to them.</td></tr>
    <tr><td><b>Forwarder</b></td><td>Booking, BL/AWB, ISF/ENS data transmission, DG declaration</td><td>See the agreed description/HS before cutting the BL; fix weight/HS mismatches; confirm filing deadlines.</td></tr>
    <tr><td><b>Customs broker</b></td><td>Classification opinion, entry filing, agency correspondence</td><td>Receive a clean, consistent pack; confirm or correct the classification; flag rules we don't cover.</td></tr></tbody></table></section>
  <section class="card"><div class="card-h"><h2>The journey, and the gate at each stage</h2></div>
    ${STAGES.map((st,i)=>`<div class="li"><span class="ico ${i<4?'warn':'good'}" style="background:var(--neutral-bg);color:var(--ink-2)">${i+1}</span><div class="li-b"><div class="li-t">${esc(st.name)} <span class="muted">· ${esc(st.who)}</span></div><div class="li-s">${esc(st.desc)}</div></div></div>`).join('')}
    <p class="p muted" style="padding:0 18px 16px">Stages move automatically: a document problem pins a shipment to <i>Supplier documents</i>; a missing certificate to <i>Compliance</i>; dates move it through transit and entry. You can advance or move back by hand on the shipment page — advancing past an open blocker is recorded as an override.</p></section>
  <section class="card"><div class="card-h"><h2>What we check — and what we don't yet</h2></div><div class="prose">
    <p><b>We check:</b> three-way document consistency (invoice / packing list / transport document), required certificates, filings and label elements per market based on the product's attributes, a classification suggestion with rationale, and the cost of each gap.</p>
    <p><b>Coverage is honest, not complete.</b> The rules catalog (${CATALOG.length} rules across ${MARKETS.map(m=>m[0]).join(', ')}) is deep for electronics, children's products, food-contact goods and general consumer labelling, and a starting point elsewhere. Every product shows a <i>rule coverage</i> badge per market. Sector standards (e.g. specific EN/ASTM test methods, energy labels, chemical limits per material) need a broker or test lab. We never replace them — we make sure they get clean inputs.</p>
    <p><b>Data sources:</b> USITC HTS and UK Trade Tariff (live, official), CBP CROSS rulings and EU TARIC / CBSA tariff (linked), the agency pages linked on every rule. Freight and fee figures are planning ranges until a rate API is connected.</p></div></section>
  <section class="card"><div class="card-h"><h2>Where this goes</h2></div><div class="prose"><p>Supplier intake links so the factory fills the product record once (no more retyping); server-side storage and accounts so links are real; broker-reviewed rules with versioning; certificate verification against issuing labs; and per-SKU alerts when a tariff or rule changes.</p></div></section>`;
}
