/* ClearWay — Shipment Planner: a guided, five-step flow from "what is it" to "filed and reusable".
   Product → Shipping → Requirements → Documents → Submit & reuse.
   One set of fields feeds every document, so documents agree by construction. */
'use strict';

const PLAN_STEPS=[
  ['product','Product','What it is, so we know which certificates apply'],
  ['shipping','Shipping','Where, how much, and by when'],
  ['requirements','Requirements','What the destination needs, and who provides it'],
  ['documents','Documents','Filled in once, used everywhere'],
  ['submit','Submit & reuse','Who files what, where — then save for next time'],
];

/* ---------------- product questions (shown only when relevant) ---------------- */
const PLAN_QUESTIONS=[
  {id:'use',when:a=>a.plant||a.food,q:'What will it be used for at the destination?',why:'Food, seed and feed fall under different laws — this one answer changes the permits.',options:[['food','Human food','sold as food or made into food'],['processing','Industrial processing','e.g. crushing for oil or meal'],['seed','Seed for planting',''],['feed','Animal feed',''],['sample','Samples / personal use','small, not for resale']]},
  {id:'state',when:a=>a.plant||a.food,q:'What state is it in?',why:'Raw plant products need plant-health checks; processed food mostly doesn\'t.',options:[['raw','Raw, whole','as harvested'],['cleaned','Cleaned / dried / dehulled',''],['processed','Processed','flour, oil, roasted, cooked, canned']]},
  {id:'pack',when:a=>a.plant||a.food,q:'How is it packed?',why:'Retail packs need a consumer label in the destination\'s language(s).',options:[['bulk','Bulk','container, tote or silo'],['bags','Sacks','25–50 kg bags'],['retail','Retail packs','with a consumer label']]},
  {id:'gmo',when:a=>a.plant,q:'Is it genetically modified?',why:'GM varieties must be authorized in the destination.',options:[['no','No','non-GMO / identity preserved'],['yes','Yes',''],['unknown','Not sure','we\'ll flag it to check']]},
  {id:'organic',when:a=>a.food||a.plant||a.cosmetic,q:'Will you sell it as organic?',why:'Organic claims need certification recognised by the destination.',options:[['no','No',''],['yes','Yes','']]},
  {id:'power',when:a=>a.electrical||a.radio||a.battery,q:'How is it powered?',why:'Mains power, batteries and radios each bring their own certifications.',options:[['mains','Plugs into the wall',''],['battery','Built-in rechargeable battery',''],['coin','Replaceable / coin battery',''],['usb','USB powered only','']]},
  {id:'wireless',when:a=>a.electrical||a.radio,q:'Does it have Bluetooth, Wi-Fi or another radio?',why:'Any radio needs a radio-equipment approval.',options:[['yes','Yes',''],['no','No','']]},
  {id:'age',when:a=>a.children,q:'What age is it for?',why:'Children\'s products have their own safety testing and labels.',options:[['u3','Under 3',''],['3to12','3 to 12',''],['older','12+, but could appeal to children','']]},
  {id:'smallparts',when:a=>a.children,q:'Any small or detachable parts?',why:'Decides choking-hazard warnings and age grading.',options:[['yes','Yes',''],['no','No','']]},
  {id:'buyer',when:a=>!a.plant&&!a.food,q:'Who will buy it?',why:'Consumer products carry labelling and product-safety duties that B2B goods don\'t.',options:[['consumer','Consumers','shops, Amazon, your website'],['business','Businesses only','B2B, industrial']]},
];
const BOTANICAL={soy:'Glycine max',soybean:'Glycine max',rice:'Oryza sativa',wheat:'Triticum aestivum',corn:'Zea mays',maize:'Zea mays',coffee:'Coffea arabica',peanut:'Arachis hypogaea',sesame:'Sesamum indicum',bamboo:'Bambusa spp.',chickpea:'Cicer arietinum',lentil:'Lens culinaris',tea:'Camellia sinensis',cocoa:'Theobroma cacao',garlic:'Allium sativum',ginger:'Zingiber officinale'};
function botanicalOf(desc){const t=String(desc||'').toLowerCase();const k=Object.keys(BOTANICAL).find(k=>t.includes(k));return k?BOTANICAL[k]:'';}

/* ---------------- plan state ---------------- */
function plans(){S.plans=S.plans||[];return S.plans;}
function newPlan(seed){
  seed=seed||{};
  const p={id:uid('PL'),name:'',createdAt:new Date().toISOString(),step:0,template:false,
    product:{desc:seed.desc||'',answers:{}},
    ship:{origin:seed.origin||'CN',originCity:seed.originCity||'',dest:seed.dest||S.settings.market||'US',destCountry:seed.destCountry||'',destCity:seed.destCity||'',weightKg:seed.weightKg||'',units:seed.units||'',value:seed.value||'',currency:'USD',readyDate:'',needBy:'',mode:seed.mode||'',incoterm:'FOB',packages:''},
    req:{},fields:{},submitted:{},shipmentId:null};
  p.name=p.product.desc?cap(p.product.desc):'New shipment plan';
  plans().unshift(p);save();return p;
}
const cap=t=>String(t||'').charAt(0).toUpperCase()+String(t||'').slice(1);
function planAttrs(p){
  const a={...deriveAttrs(p.product.desc)}; const an=p.product.answers||{};
  if(an.use){a.humanFood=an.use==='food';a.seedPlanting=an.use==='seed';a.feed=an.use==='feed';if(an.use==='processing'){a.humanFood=false;}if(an.use==='sample'){a.humanFood=true;}}
  if(an.state==='processed'){a.plant=false;}else if(an.state&&(a.food||a.plant))a.plant=true;
  if(an.pack==='retail')a.consumer=true; else if(an.pack)a.consumer=false;
  if(an.gmo==='yes'||an.gmo==='unknown')a.gmo=true;
  if(an.organic==='yes')a.organic=true;
  if(an.power==='battery'||an.power==='coin')a.battery=true; if(an.power==='mains')a.electrical=true;
  if(an.wireless==='yes')a.radio=true; if(an.wireless==='no')a.radio=false;
  if(an.buyer==='business')a.consumer=false; if(an.buyer==='consumer')a.consumer=true;
  return a;
}
function planReqs(p){
  const a=planAttrs(p);const s=p.ship;const mode=s.mode||'Ocean';
  return requirementsFor({desc:p.product.desc,attrs:a},s.dest,mode).filter(r=>!(r.id==='us-uflpa'&&s.origin!=='CN'));
}
function planCls(p){return classify({desc:p.product.desc,dest:p.ship.dest});}
const WHEN_GROUP=r=>/classification|registration/.test(r.kind)&&/importer/i.test(r.owner)?'you':/label|cert/.test(r.kind)||/factory|exporter/i.test(r.owner)?'origin':/filing|isf/.test(r.kind)?'arrival':'you';
const GROUPS=[['origin','Before it ships','The factory or exporter prepares these at origin.'],['arrival','Before it arrives','Filings and data your forwarder or broker submits.'],['you','Your registrations','One-time set-up on your side; reused for every shipment.']];

/* ---------------- shipping maths ---------------- */
const daysBetween=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5);
const MODE_INFO={Express:{label:'Courier',sub:'DHL / FedEx / UPS door-to-door',transit:[3,6],handling:1},Air:{label:'Air freight',sub:'airport to airport + clearance',transit:[5,9],handling:2},Ocean:{label:'Sea freight',sub:'port to port, LCL or container',transit:[28,42],handling:5}};
function recommendMode(p){
  const s=p.ship,kg=Number(s.weightKg)||0;const avail=s.needBy&&s.readyDate?daysBetween(s.readyDate,s.needBy):null;
  const fits=m=>avail==null||avail>=MODE_INFO[m].transit[1]+MODE_INFO[m].handling;
  if(kg&&kg<=70)return fits('Express')?'Express':'Express';
  if(kg&&kg<=500)return fits('Ocean')&&kg>300?'Ocean':fits('Air')?'Air':'Express';
  return fits('Ocean')?'Ocean':fits('Air')?'Air':'Air';
}

/* ---------------- shared fields → every document ---------------- */
function planDefaults(p){
  const s=p.ship,st=S.settings,cls=planCls(p),a=planAttrs(p),kg=Number(s.weightKg)||0;const mode=s.mode||recommendMode(p);
  const pol=s.originCity||portName(defaultOrigin(s.origin,mode)).replace(/ \(.*\)/,'');const pod=s.destCity||portName(defaultDest(s.dest,mode)||'').replace(/ \(.*\)/,'');
  const sup=S.partners.find(x=>x.type==='Factory'&&p.supplier&&x.name===p.supplier)||{};
  const units=Number(s.units)||'';const value=Number(s.value)||'';
  return {
    seller_name:p.supplier||'',seller_address:sup.address||'',seller_contact:sup.contact||'',
    buyer_name:st.company||'',buyer_address:st.address||'',importer_id:s.dest==='US'?st.ein:s.dest==='CA'?(st.bn||st.ein||''):st.eori,
    consignee_name:st.company||'',consignee_address:st.address||'',
    invoice_no:'INV-'+p.id.slice(-5),invoice_date:new Date().toISOString().slice(0,10),
    incoterm:(s.incoterm||'FOB')+' '+pol,currency:s.currency||'USD',
    product_desc:cap(p.product.desc),hs_code:cls.code,origin_country:COUNTRIES[s.origin]||s.origin,
    quantity:units||(kg?kg+' kg':''),unit:units?'units':'kg',net_kg:kg?String(Math.round(kg*0.97*10)/10):'',gross_kg:kg?String(kg):'',
    packages:s.packages||'',package_type:({bulk:'Bulk',bags:'Bags',retail:'Cartons'})[(p.product.answers||{}).pack]||'Cartons',
    unit_price:units&&value?(value/units).toFixed(2):'',total_value:value?String(value):'',
    port_loading:pol,port_discharge:pod,transport_mode:MODE_INFO[mode].label,carrier:'',ship_date:s.readyDate||'',eta:s.readyDate?new Date(new Date(s.readyDate+'T12:00:00').getTime()+(MODE_INFO[mode].transit[1]+MODE_INFO[mode].handling)*864e5).toISOString().slice(0,10):'',
    marks:`${(st.company||'IMPORTER').toUpperCase()} · ${p.id} · MADE IN ${(COUNTRIES[s.origin]||s.origin).toUpperCase()}`,
    end_use:({food:'Human consumption',processing:'Industrial processing',seed:'Planting',feed:'Animal feed',sample:'Sample / personal use'})[(p.product.answers||{}).use]||'',
    botanical_name:a.plant?botanicalOf(p.product.desc):'',gmo_status:({no:'Non-GMO',yes:'GM variety',unknown:'To be confirmed'})[(p.product.answers||{}).gmo]||'',
    treatment:'',phyto_no:'',airs_result:'',sfc_licence:'',carm_account:'',rpp:'',tariff_treatment:s.dest==='CA'?'02 — Most-Favoured-Nation':'',
    duty_rate:cls.duty,ccn:'',fda_code:'',bond:'',eori:st.eori||'',vat_treatment:s.dest==='EU'||s.dest==='UK'?'Postponed / import VAT':'',
  };
}
const FIELD_LABELS={seller_name:'Seller / exporter',seller_address:'Seller address',seller_contact:'Seller contact',buyer_name:'Buyer / importer of record',buyer_address:'Importer address',importer_id:'Importer ID',consignee_name:'Consignee',consignee_address:'Consignee address',invoice_no:'Invoice number',invoice_date:'Invoice date',incoterm:'Incoterm + place',currency:'Currency',product_desc:'Description of goods',hs_code:'HS / tariff code',origin_country:'Country of origin',quantity:'Quantity',unit:'Unit',net_kg:'Net weight (kg)',gross_kg:'Gross weight (kg)',packages:'Number of packages',package_type:'Package type',unit_price:'Unit price',total_value:'Total value',port_loading:'Place / port of loading',port_discharge:'Place / port of discharge',transport_mode:'Mode of transport',carrier:'Carrier',ship_date:'Ship date',eta:'Estimated arrival',marks:'Shipping marks',end_use:'Intended use',botanical_name:'Botanical name',gmo_status:'GM status',treatment:'Treatment (if any)',phyto_no:'Phytosanitary certificate no.',airs_result:'CFIA AIRS result',sfc_licence:'SFC licence no.',carm_account:'CARM account (BN15 RM)',rpp:'Release Prior to Payment security',tariff_treatment:'Tariff treatment',duty_rate:'Duty rate',ccn:'Cargo control number',fda_code:'FDA product code',bond:'Customs bond',eori:'EORI',vat_treatment:'VAT treatment'};
const fieldVal=(p,k)=>(p.fields&&p.fields[k]!=null)?p.fields[k]:(planDefaults(p)[k]||'');

/* document templates per destination: [id, title, who fills, where it goes, why, [[field,required]]] */
function planDocs(p){
  const s=p.ship,a=planAttrs(p),mode=s.mode||recommendMode(p);const D=[];
  const core=['seller_name','seller_address','buyer_name','buyer_address','importer_id','consignee_name','invoice_no','invoice_date','incoterm','currency','product_desc','hs_code','origin_country','quantity','unit_price','total_value','gross_kg','packages','marks'];
  D.push({id:'ci',title:'Commercial invoice',who:'Factory signs · you check',where:'Goes with the shipment and to your broker; customs values the goods from it.',fields:core.map(k=>[k,!['seller_address','buyer_address','marks'].includes(k)])});
  D.push({id:'pl',title:'Packing list',who:'Factory',where:'Goes with the shipment; customs and the carrier use it to inspect.',fields:['seller_name','consignee_name','invoice_no','product_desc','quantity','packages','package_type','net_kg','gross_kg','marks'].map(k=>[k,true])});
  D.push({id:'sli',title:'Shipper\'s letter of instruction',who:'You send to the factory before they make the documents',where:'Email / WeChat to the factory. Stops mismatches at the source.',fields:['product_desc','hs_code','consignee_name','importer_id','incoterm','currency','total_value','marks','ship_date'].map(k=>[k,true])});
  if(a.plant)D.push({id:'phyto',title:'Phytosanitary certificate — application data',who:'Exporter applies to the origin plant-protection authority'+(s.origin==='CN'?' (GACC)':''),where:'Issued at origin before loading; the original travels with the goods.',fields:['seller_name','consignee_name','product_desc','botanical_name','quantity','gross_kg','packages','origin_country','port_loading','port_discharge','transport_mode','treatment','end_use'].map(k=>[k,!['treatment'].includes(k)])});
  if(s.dest==='CA'){
    D.push({id:'cci',title:'Canada Customs Invoice (CI1) data',who:'Exporter provides · broker files',where:'Required with the entry when value is over CAD 3,300; your commercial invoice can carry these fields instead.',fields:['seller_name','seller_address','buyer_name','consignee_name','consignee_address','origin_country','transport_mode','port_loading','incoterm','currency','product_desc','hs_code','quantity','unit_price','total_value','net_kg','gross_kg','packages'].map(k=>[k,true])});
    D.push({id:'cad',title:'CARM Commercial Accounting Declaration — data sheet',who:'Your customs broker (or you in the CARM portal)',where:'CBSA CARM Client Portal.',fields:['importer_id','carm_account','rpp','hs_code','tariff_treatment','origin_country','total_value','currency','ccn','duty_rate'].map(k=>[k,!['ccn'].includes(k)])});
    if(a.food||a.plant)D.push({id:'cfia',title:'CFIA import record (AIRS + licence)',who:'You / your broker',where:'Check AIRS for this HS code, origin and end use; the result and your licence go on the entry.',fields:['hs_code','origin_country','end_use','airs_result','sfc_licence','phyto_no'].map(k=>[k,k!=='sfc_licence'||!!a.humanFood])});
  }
  if(s.dest==='US'){
    if(mode==='Ocean')D.push({id:'isf',title:'ISF 10+2 worksheet',who:'Broker files 24 h before loading · data from the factory',where:'CBP ACE.',fields:['seller_name','buyer_name','importer_id','consignee_name','origin_country','hs_code','port_loading'].map(k=>[k,true])});
    D.push({id:'7501',title:'CBP 7501 entry summary — data sheet',who:'Licensed customs broker',where:'CBP ACE.',fields:['importer_id','bond','origin_country','hs_code','total_value','duty_rate','transport_mode','port_discharge'].map(k=>[k,true])});
    if(a.humanFood||a.food)D.push({id:'fda',title:'FDA Prior Notice data',who:'Broker or you (PNSI)',where:'FDA Prior Notice System — before arrival.',fields:['fda_code','seller_name','origin_country','quantity','consignee_name','port_discharge','eta'].map(k=>[k,true])});
  }
  if(s.dest==='EU'||s.dest==='UK')D.push({id:'decl',title:(s.dest==='EU'?'EU':'UK CDS')+' import declaration — data sheet',who:'Customs representative',where:s.dest==='EU'?'National customs system of the member state of entry.':'HMRC CDS.',fields:['eori','hs_code','origin_country','total_value','currency','incoterm','vat_treatment','transport_mode'].map(k=>[k,true])});
  if(s.dest==='CN')D.push({id:'sw',title:'China Single Window import declaration — data sheet',who:'Registered consignee / import agent',where:'China International Trade Single Window.',fields:['consignee_name','importer_id','hs_code','origin_country','total_value','currency','quantity','gross_kg'].map(k=>[k,true])});
  return D;
}
function docCompletion(p,d){const req=d.fields.filter(f=>f[1]);const done=req.filter(([k])=>String(fieldVal(p,k)).trim()).length;return {done,total:req.length};}

/* ---------------- page ---------------- */
function pagePlanHome(){
  const list=plans().filter(p=>!p.template), tpl=plans().filter(p=>p.template);
  return `${pageHead('Plan a shipment','Five short steps: what it is, how it ships, what the destination needs, the documents — then file and reuse.')}
  <section class="card plan-start"><div class="card-h"><h2>What are you shipping?</h2></div>
    <form class="row" style="padding:0 18px 18px" onsubmit="event.preventDefault();const v=this.q.value.trim();if(!v)return;const p=newPlan(planSeedFrom(v));location.hash='plan-'+p.id;">
      <input class="in" name="q" style="flex:1;font-size:15px;padding:12px 14px" placeholder="e.g. 10 lbs of soybeans from Guangzhou, China to Toronto, Canada" autofocus>
      <button class="btn primary" style="padding:12px 18px">Start →</button></form></section>
  ${tpl.length?`<section class="card"><div class="card-h"><h2>Ship again</h2><span class="hint">saved templates — product answers, route and documents carried over</span></div>${tpl.map(p=>`<div class="li"><span class="ico good">↻</span><div class="li-b"><div class="li-t">${esc(p.name)}</div><div class="li-s">${esc(COUNTRIES[p.ship.origin]||p.ship.origin)} → ${esc(p.ship.destCity||p.ship.dest)} · ${esc(MODE_INFO[p.ship.mode||'Ocean'].label)}</div></div><button class="btn sm primary" data-act="pl_clone" data-id="${p.id}">Ship again</button></div>`).join('')}</section>`:''}
  <section class="card"><div class="card-h"><h2>In progress</h2></div>${list.length?list.map(p=>{const st=PLAN_STEPS[p.step||0];return `<div class="li" data-go="plan-${p.id}"><div class="li-b"><div class="li-t">${esc(p.name)}</div><div class="li-s">Step ${(p.step||0)+1} of 5 · ${esc(st[1])} · ${esc(COUNTRIES[p.ship.origin]||p.ship.origin)} → ${esc(p.ship.destCity||p.ship.dest)}</div></div><div class="mini-steps">${PLAN_STEPS.map((x,i)=>`<i class="${i<(p.step||0)?'d':i===(p.step||0)?'c':''}"></i>`).join('')}</div></div>`;}).join(''):empty('No plans yet','Describe what you\'re shipping above to start.')}</section>`;
}
function planSeedFrom(text){try{const x=parseLocal(text);return {desc:x.desc||text,origin:x.origin,originCity:x.originCity,dest:x.dest,destCountry:x.destCountry,destCity:x.destCity,weightKg:x.weightKg,units:x.units,value:x.value,mode:x.mode};}catch(e){return {desc:text};}}

function pagePlan(id){
  const p=plans().find(x=>x.id===id);if(!p)return empty('Plan not found','',`<a class="btn" href="#plan">All plans</a>`);
  const step=p.step||0;
  const body=[stepProduct,stepShipping,stepRequirements,stepDocuments,stepSubmit][step](p);
  return `<a class="back" href="#plan">← All plans</a>
  <div class="plan-head"><div><h1>${esc(p.name)}</h1><div class="sub">${esc(p.ship.originCity?p.ship.originCity+', ':'')}${esc(COUNTRIES[p.ship.origin]||p.ship.origin)} → ${esc(p.ship.destCity?p.ship.destCity+', ':'')}${esc(destName(p))}</div></div></div>
  <div class="plan ${step===3?'wide':''}">
    <nav class="plan-rail">${PLAN_STEPS.map(([k,t,d],i)=>`<a class="ps ${i<step?'done':i===step?'cur':''} ${i>maxReach(p)?'locked':''}" ${i<=maxReach(p)?`data-act="pl_go" data-id="${p.id}" data-s="${i}"`:''}><span class="n">${i<step?'✓':i+1}</span><span><b>${t}</b><small>${d}</small></span></a>`).join('')}</nav>
    <section class="plan-main">${body}</section>
    ${step===3?'':`<aside class="plan-side">${planSummary(p)}</aside>`}
  </div>`;
}
const maxReach=p=>Math.max(p.step||0,p.reached||0);
const destName=p=>p.ship.destCountry&&p.ship.destCountry!==p.ship.dest&&COUNTRIES[p.ship.destCountry]?COUNTRIES[p.ship.destCountry]+' (EU)':(MARKETS.find(m=>m[0]===p.ship.dest)||[p.ship.dest,p.ship.dest])[1];

function planSummary(p){
  const s=p.ship,cls=planCls(p),reqs=planReqs(p);const have=reqs.filter(r=>p.req[r.id]==='have'||p.req[r.id]==='na').length;
  const docs=planDocs(p);const dc=docs.map(d=>docCompletion(p,d));const fd=dc.reduce((a,x)=>a+x.done,0),ft=dc.reduce((a,x)=>a+x.total,0);
  const mode=s.mode||recommendMode(p);const sub=Object.values(p.submitted||{}).filter(x=>x&&x.done).length;const filings=filingFor(s.dest,planAttrs(p),mode);
  const row=(k,v)=>`<div class="sm-row"><span>${k}</span><b>${v}</b></div>`;
  return `<div class="card sm"><div class="card-h"><h2>Shipment</h2></div>
    ${row('Product',esc(cap(p.product.desc)||'—'))}${row('Tariff code',`${esc(cls.code)} <span class="muted">${esc(cls.duty)}</span>`)}
    ${row('Route',`${esc(s.originCity||COUNTRIES[s.origin]||s.origin)} → ${esc(s.destCity||destName(p))}`)}
    ${row('Size',[s.weightKg?s.weightKg+' kg':'',s.units?s.units+' units':'',s.value?money(s.value):''].filter(Boolean).join(' · ')||'<span class="muted">step 2</span>')}
    ${row('Ships by',s.mode?`${MODE_INFO[s.mode].label}${s.readyDate?' · '+fmtD(s.readyDate):''}`:'<span class="muted">step 2</span>')}
    <div class="sm-prog"><div><span>Requirements</span><b>${have}/${reqs.length}</b></div><i><em style="width:${reqs.length?have/reqs.length*100:0}%"></em></i></div>
    <div class="sm-prog"><div><span>Document fields</span><b>${fd}/${ft}</b></div><i><em style="width:${ft?fd/ft*100:0}%"></em></i></div>
    <div class="sm-prog"><div><span>Filed</span><b>${sub}/${filings.length}</b></div><i><em style="width:${filings.length?sub/filings.length*100:0}%"></em></i></div>
    <div class="sm-foot"><button class="btn sm ghost" data-act="pl_ask" data-id="${p.id}">Ask ClearWay about this</button></div></div>`;
}
function navButtons(p,nextLabel,canNext,hint){
  const step=p.step||0;
  return `<div class="plan-nav">${step>0?`<button class="btn" data-act="pl_go" data-id="${p.id}" data-s="${step-1}">← Back</button>`:'<span></span>'}<div style="display:flex;gap:10px;align-items:center">${hint?`<span class="hint">${hint}</span>`:''}${nextLabel?`<button class="btn primary" data-act="pl_go" data-id="${p.id}" data-s="${step+1}" ${canNext?'':'disabled'}>${nextLabel} →</button>`:''}</div></div>`;
}

/* ---- step 1: product ---- */
function stepProduct(p){
  const a=planAttrs(p);const qs=PLAN_QUESTIONS.filter(q=>q.when(a));const an=p.product.answers||{};
  const answered=qs.filter(q=>an[q.id]).length;const onAttrs=Object.keys(a).filter(k=>a[k]&&!['humanFood','consumer'].includes(k)).map(k=>(ATTRS.find(x=>x[0]===k)||[k,k])[1]);
  return `<div class="step-h"><div class="kicker">Step 1 of 5</div><h2>Tell us about the product</h2><p>These answers decide which certifications and permits apply — nothing else in the plan is guessed.</p></div>
  <div class="field-block"><label>What is it, in plain words?</label><input class="in big" data-pf="desc" data-id="${p.id}" value="${esc(p.product.desc)}" placeholder="e.g. soybeans, Bluetooth kitchen scale, kids wooden puzzle"><div class="hint" style="margin-top:6px">We read it as: ${onAttrs.length?onAttrs.map(x=>`<span class="pill neutral" style="min-width:0">${esc(x)}</span>`).join(' '):'<span class="muted">general merchandise</span>'}</div></div>
  <div class="field-block"><label>Supplier</label><input class="in" list="plSup" data-pf="supplier" data-id="${p.id}" value="${esc(p.supplier||'')}" placeholder="Factory or exporter name"><datalist id="plSup">${S.partners.filter(x=>x.type==='Factory').map(x=>`<option value="${esc(x.name)}">`).join('')}</datalist></div>
  ${qs.map(q=>`<div class="q"><div class="q-h"><b>${esc(q.q)}</b><span class="hint">${esc(q.why)}</span></div><div class="opts">${q.options.map(([v,l,sub])=>`<button class="opt ${an[q.id]===v?'on':''}" data-act="pl_ans" data-id="${p.id}" data-q="${q.id}" data-v="${v}"><b>${esc(l)}</b>${sub?`<small>${esc(sub)}</small>`:''}</button>`).join('')}</div></div>`).join('')}
  ${navButtons(p,'Shipping details',!!p.product.desc.trim()&&answered===qs.length,qs.length&&answered<qs.length?`${qs.length-answered} question${qs.length-answered>1?'s':''} left`:'')}`;
}

/* ---- step 2: shipping ---- */
function stepShipping(p){
  const s=p.ship;const rec=recommendMode(p);const avail=s.needBy&&s.readyDate?daysBetween(s.readyDate,s.needBy):null;
  setTimeout(()=>loadModeQuotes(p),0);
  const countryOpts=sel=>Object.entries(COUNTRIES).map(([c,n])=>`<option value="${c}" ${sel===c?'selected':''}>${n}</option>`).join('');
  return `<div class="step-h"><div class="kicker">Step 2 of 5</div><h2>How is it shipping?</h2><p>Tell us where, how much, and when you need it — we'll compare courier, air and sea against your deadline.</p></div>
  <div class="grid2">
    <div class="field-block"><label>From</label><div class="row"><select class="in" data-pf="ship.origin" data-id="${p.id}">${countryOpts(s.origin)}</select><input class="in" data-pf="ship.originCity" data-id="${p.id}" value="${esc(s.originCity)}" placeholder="City"></div></div>
    <div class="field-block"><label>To</label><div class="row"><select class="in" data-pf="ship.dest" data-id="${p.id}">${MARKETS.map(([m,n])=>`<option value="${m}" ${s.dest===m?'selected':''}>${n}</option>`).join('')}</select><input class="in" data-pf="ship.destCity" data-id="${p.id}" value="${esc(s.destCity)}" placeholder="City"></div></div>
    <div class="field-block"><label>Weight (kg)</label><input class="in" type="number" step="any" data-pf="ship.weightKg" data-id="${p.id}" value="${esc(s.weightKg)}" placeholder="e.g. 4.5"></div>
    <div class="field-block"><label>Quantity (units / bags) <span class="muted">optional</span></label><input class="in" type="number" data-pf="ship.units" data-id="${p.id}" value="${esc(s.units)}"></div>
    <div class="field-block"><label>Value of the goods (USD)</label><input class="in" type="number" step="any" data-pf="ship.value" data-id="${p.id}" value="${esc(s.value)}" placeholder="what you pay the supplier"></div>
    <div class="field-block"><label>Packages</label><input class="in" type="number" data-pf="ship.packages" data-id="${p.id}" value="${esc(s.packages)}" placeholder="e.g. 1"></div>
    <div class="field-block"><label>Ready to ship from</label><input class="in" type="date" data-pf="ship.readyDate" data-id="${p.id}" value="${esc(s.readyDate)}"></div>
    <div class="field-block"><label>Need it by</label><input class="in" type="date" data-pf="ship.needBy" data-id="${p.id}" value="${esc(s.needBy)}"></div>
  </div>
  <div class="field-block"><label>Who arranges transport? <span class="hint">(Incoterm)</span></label><div class="opts">${[['EXW','Ex Works','you collect from the factory'],['FOB','FOB','factory delivers to the port / airport'],['CIF','CIF','factory pays freight + insurance to destination'],['DDP','DDP','factory delivers duty-paid to your door']].map(([v,l,sub])=>`<button class="opt ${s.incoterm===v?'on':''}" data-act="pl_set" data-id="${p.id}" data-k="ship.incoterm" data-v="${v}"><b>${l}</b><small>${sub}</small></button>`).join('')}</div></div>
  <div class="q"><div class="q-h"><b>Choose how it ships</b><span class="hint">${avail!=null?`${avail} days between ready and need-by`:'add dates to check which options make your deadline'}</span></div>
    <div class="opts modes">${['Express','Air','Ocean'].map(m=>{const mi=MODE_INFO[m];const tot=[mi.transit[0]+mi.handling,mi.transit[1]+mi.handling];const ok=avail==null||avail>=tot[1];const tight=avail!=null&&!ok&&avail>=tot[0];
      return `<button class="opt mode ${s.mode===m?'on':''} ${avail!=null&&!ok&&!tight?'no':''}" data-act="pl_set" data-id="${p.id}" data-k="ship.mode" data-v="${m}">${m===rec?'<span class="rec">Recommended</span>':''}<b>${mi.label}</b><small>${mi.sub}</small><div class="mode-k"><span>${tot[0]}–${tot[1]} days</span><span id="mq-${m}">…</span></div>${avail!=null?`<div class="mode-fit ${ok?'ok':tight?'tight':'late'}">${ok?'Makes your deadline':tight?'Tight — may be late':'Misses your deadline'}</div>`:''}</button>`;}).join('')}</div></div>
  ${navButtons(p,'See requirements',!!(s.dest&&s.mode&&(s.weightKg||s.units)),!s.mode?'pick a shipping option':'')}`;
}
async function loadModeQuotes(p){
  const s=p.ship;const kg=Number(s.weightKg)||Math.max(1,(Number(s.units)||100)*0.5);const cbm=Math.max(0.05,kg/250);
  for(const m of ['Express','Air','Ocean']){const el=$('#mq-'+m);if(!el)continue;
    try{const r=await fetch(`/api/rates?origin=${s.origin}&dest=${s.dest}&mode=${m}&kg=${kg}&cbm=${cbm}&value=${Number(s.value)||kg*4}`);const j=await r.json();const q=j.quotes[0];
      let lo=q.low,hi=q.high; /* carrier minimum charges dominate small shipments */ if(m==='Express'){lo=Math.max(lo,45);hi=Math.max(hi,90);} if(m==='Air'&&kg<100){lo=Math.max(lo,150);hi=Math.max(hi,300);} if(m==='Ocean'&&kg<300){lo=Math.max(lo,250);hi=Math.max(hi,450);} el.textContent=`~${money(lo)}–${money(hi)}`;}
    catch(e){el.textContent='estimate offline';}}
}

/* ---- step 3: requirements ---- */
function stepRequirements(p){
  const reqs=planReqs(p);const a=planAttrs(p);const mode=p.ship.mode||'Ocean';const cov=coverage({desc:p.product.desc,attrs:a},p.ship.dest);
  const ctx={units:Number(p.ship.units)||1,value:Number(p.ship.value)||100,mode,weightKg:Number(p.ship.weightKg)||0};
  const by=g=>reqs.filter(r=>WHEN_GROUP(r)===g);
  const open=reqs.filter(r=>!p.req[r.id]).length;
  return `<div class="step-h"><div class="kicker">Step 3 of 5</div><h2>What ${esc(destName(p))} requires</h2><p>${reqs.length} things apply to this product and route. Mark what you already have; anything you need goes on the supplier or broker's list.</p>
    <div class="cov ${cov.level}" style="padding:8px 0 0">${pill(cov.level==='good'?'good':cov.level==='partial'?'warn':'crit','Rule coverage: '+cov.level)} <span>${esc(cov.note)}</span> <button class="btn sm ghost" data-act="pl_explain" data-id="${p.id}">Explain in plain English</button></div><div id="plExplain"></div></div>
  ${GROUPS.map(([g,t,d])=>{const list=by(g);if(!list.length)return '';return `<div class="rq-group"><div class="rq-gh"><b>${t}</b><span class="hint">${d}</span></div>${list.map(r=>{const st=p.req[r.id]||'';const i=impact(r.kind,ctx);return `<div class="rq ${st}"><div class="rq-b"><b>${esc(r.name)}</b><p>${esc(r.plain)}</p><div class="rq-m"><span>${esc(r.owner)}</span><span>${esc(r.agency)}</span><span>if missing: ${impactRange(i)}${i.atRisk?' + goods at risk':''}</span><a href="${r.link}" target="_blank" rel="noopener">Official guidance ↗</a></div></div>
      <div class="rq-s">${[['have','I have it'],['need','I need it'],['na','Doesn\'t apply']].map(([v,l])=>`<button class="seg-b ${st===v?'on '+v:''}" data-act="pl_req" data-id="${p.id}" data-r="${r.id}" data-v="${v}">${l}</button>`).join('')}${st==='need'&&/factory|exporter/i.test(r.owner)?`<button class="btn sm" data-act="pl_askSup" data-id="${p.id}">Ask supplier</button>`:''}</div></div>`;}).join('')}</div>`;}).join('')}
  ${navButtons(p,'Prepare documents',true,open?`${open} not marked yet — you can come back`:'')}`;
}

/* ---- step 4: documents ---- */
function stepDocuments(p){
  const docs=planDocs(p);const sel=p.doc&&docs.find(d=>d.id===p.doc)?p.doc:docs[0].id;const d=docs.find(x=>x.id===sel);const c=docCompletion(p,d);
  return `<div class="step-h"><div class="kicker">Step 4 of 5</div><h2>Your documents</h2><p>Everything is pre-filled from steps 1–3. Change a value once — consignee, HS code, weight — and every document updates, so they always agree.</p></div>
  <div class="docs">
    <div class="doc-list">${docs.map(x=>{const cc=docCompletion(p,x);return `<button class="doc-i ${x.id===sel?'on':''}" data-act="pl_doc" data-id="${p.id}" data-d="${x.id}"><b>${esc(x.title)}</b><small>${cc.done}/${cc.total} required fields</small><i><em style="width:${cc.total?cc.done/cc.total*100:0}%"></em></i></button>`;}).join('')}</div>
    <div class="doc-form card"><div class="card-h"><div><h2>${esc(d.title)}</h2><div class="hint">${esc(d.who)} · ${esc(d.where)}</div></div>${c.done===c.total?pill('good','complete'):pill('warn',(c.total-c.done)+' to fill')}</div>
      <div class="ff">${d.fields.map(([k,req])=>{const v=fieldVal(p,k);const overridden=p.fields&&p.fields[k]!=null;return `<label class="ffi ${req&&!String(v).trim()?'miss':''}"><span>${esc(FIELD_LABELS[k]||k)}${req?' *':''}${overridden?' <em>edited</em>':''}</span><input class="in" data-pfield="${k}" data-id="${p.id}" value="${esc(v)}" placeholder="${req?'required':'optional'}"></label>`;}).join('')}</div>
      <div class="chips" style="padding-bottom:16px"><button class="btn sm" data-act="pl_print" data-id="${p.id}" data-d="${d.id}">Print / save as PDF</button><button class="btn sm" data-act="pl_csv" data-id="${p.id}" data-d="${d.id}">Download CSV</button><button class="btn sm ghost" data-act="pl_copy" data-id="${p.id}" data-d="${d.id}">Copy as text</button></div></div>
  </div>
  ${navButtons(p,'Submit & reuse',true)}`;
}

/* ---- step 5: submit & reuse ---- */
function stepSubmit(p){
  const mode=p.ship.mode||'Ocean';const filings=filingFor(p.ship.dest,planAttrs(p),mode);const reqs=planReqs(p);const need=reqs.filter(r=>p.req[r.id]==='need'||!p.req[r.id]);
  const docs=planDocs(p);const incomplete=docs.filter(d=>{const c=docCompletion(p,d);return c.done<c.total;});
  return `<div class="step-h"><div class="kicker">Step 5 of 5</div><h2>Submit, then save for next time</h2><p>Who files each item, where, and when. ClearWay prepares the data; the party named submits it — customs entries go through a licensed broker or your own government account.</p></div>
  ${need.length||incomplete.length?`<div class="warnbox"><b>Before you file:</b> ${need.length?`${need.length} requirement${need.length>1?'s are':' is'} not confirmed`:''}${need.length&&incomplete.length?' · ':''}${incomplete.length?`${incomplete.length} document${incomplete.length>1?'s have':' has'} empty required fields`:''}. <a href="#plan-${p.id}" data-act="pl_go" data-id="${p.id}" data-s="${need.length?2:3}">Fix →</a></div>`:`<div class="okbox"><b>Ready to file.</b> All requirements confirmed and every required document field is filled.</div>`}
  ${filings.map((f,i)=>{const k='f'+i;const sub=(p.submitted||{})[k]||{};return `<div class="fil ${sub.done?'done':''}"><label class="fil-c"><input type="checkbox" ${sub.done?'checked':''} data-act="pl_sub" data-id="${p.id}" data-k="${k}"></label><div class="fil-b"><b>${esc(f.form)}</b><div class="rq-m"><span>When: ${esc(f.when)}</span><span>Who: ${esc(f.who)}</span></div><div class="fil-a"><a class="btn sm" href="${f.portal}" target="_blank" rel="noopener">${esc(f.portalName)} ↗</a><input class="in sm" placeholder="Reference / confirmation no." value="${esc(sub.ref||'')}" data-psub="${k}" data-id="${p.id}"></div></div></div>`;}).join('')}
  <div class="reuse card"><div class="card-h"><h2>Track it and reuse it</h2></div>
    <div class="reuse-g">
      <div><b>Create the shipment</b><p>Adds it to Shipments with every unconfirmed requirement as an open item, so your team and supplier see what's left.</p>${p.shipmentId?`<a class="btn sm" href="#shipment-${p.shipmentId}">Open ${p.shipmentId}</a>`:`<button class="btn sm primary" data-act="pl_ship" data-id="${p.id}">Create shipment</button>`}</div>
      <div><b>Save as template</b><p>Keeps the product answers, route, transport choice and document fields. Next time: change the dates and quantity, done.</p><button class="btn sm ${p.template?'':'primary'}" data-act="pl_tpl" data-id="${p.id}">${p.template?'Saved ✓':'Save as template'}</button></div>
      <div><b>Product record</b><p>Saves the product and its answers so every future shipment of it starts at step 2.</p><button class="btn sm" data-act="pl_prod" data-id="${p.id}">${p.productId?'Saved ✓':'Save product'}</button></div>
    </div></div>
  ${navButtons(p,null,false)}`;
}

/* ---------------- actions & inputs ---------------- */
const P=id=>plans().find(x=>x.id===id);
function setPath(o,path,v){const ks=path.split('.');let t=o;ks.slice(0,-1).forEach(k=>t=t[k]);t[ks[ks.length-1]]=v;}
Object.assign(ACTIONS,{
  pl_go:(d)=>{const p=P(d.id);p.step=Math.max(0,Math.min(4,+d.s));p.reached=Math.max(p.reached||0,p.step);save();route();window.scrollTo(0,0);},
  pl_ans:(d)=>{const p=P(d.id);p.product.answers[d.q]=d.v;save();route();},
  pl_set:(d)=>{const p=P(d.id);setPath(p,d.k,d.v);save();route();},
  pl_req:(d)=>{const p=P(d.id);p.req[d.r]=p.req[d.r]===d.v?'':d.v;save();route();},
  pl_doc:(d)=>{const p=P(d.id);p.doc=d.d;save();route();},
  pl_sub:(d,el)=>{const p=P(d.id);p.submitted=p.submitted||{};p.submitted[d.k]={...(p.submitted[d.k]||{}),done:el.checked,at:new Date().toISOString()};save();route();},
  pl_clone:(d)=>{const t=P(d.id);const c=JSON.parse(JSON.stringify(t));c.id=uid('PL');c.template=false;c.createdAt=new Date().toISOString();c.step=1;c.reached=4;c.ship.readyDate='';c.ship.needBy='';c.submitted={};c.shipmentId=null;['invoice_no','invoice_date','ship_date','eta','phyto_no','ccn'].forEach(k=>{if(c.fields)delete c.fields[k];});plans().unshift(c);save();location.hash='plan-'+c.id;toast('Copied from template — update dates and quantity');},
  pl_tpl:(d)=>{const p=P(d.id);p.template=!p.template;save();route();toast(p.template?'Saved as template — find it under Plan a shipment → Ship again':'Template removed');},
  pl_prod:(d)=>{const p=P(d.id);if(p.productId)return;const pr={id:uid('PR'),name:cap(p.product.desc).slice(0,48),desc:p.product.desc,category:'Other',supplier:p.supplier||'Unassigned supplier',markets:[p.ship.dest],have:{},certs:[],attrs:planAttrs(p),answers:p.product.answers};planReqs(p).forEach(r=>{if(p.req[r.id]==='have')pr.have[r.id]=1;});S.products.push(pr);p.productId=pr.id;save();route();toast('Product saved');},
  pl_ship:(d)=>{const p=P(d.id);if(!p.productId)ACTIONS.pl_prod(d);const s=p.ship;const mode=s.mode||'Ocean';const id='SH-'+(1070+S.shipments.filter(x=>x.isNew).length);
    const blockers=planReqs(p).filter(r=>p.req[r.id]!=='have'&&p.req[r.id]!=='na').map(r=>mkB(/registration|filing|classification/.test(r.kind)?'warn':'crit',r.kind,r.name+(p.req[r.id]==='need'?' — needed':' — not confirmed'),r.plain,'Obtain from '+r.owner.toLowerCase()+' and mark it in the plan.',r.owner.split(/[\/(+]/)[0].trim(),r.id));
    const ready=s.readyDate?new Date(s.readyDate):new Date(Date.now()+7*864e5);const mi=MODE_INFO[mode];
    S.shipments.unshift({id,productId:p.productId,origin:s.origin,dest:s.dest,mode,units:Number(s.units)||Math.max(1,Math.round(Number(s.weightKg)||1)),value:Number(s.value)||100,loadDate:ready.toISOString(),eta:new Date(ready.getTime()+(mi.transit[1]+mi.handling)*864e5).toISOString(),createdAt:new Date().toISOString(),blockers,docs:{inv:'ok',pl:'ok',bl:'missing'},isNew:true,planId:p.id,cls:planCls(p)});
    p.shipmentId=id;save();route();toast(id+' created');},
  pl_print:(d)=>{const p=P(d.id);const doc=planDocs(p).find(x=>x.id===d.d);const html=`<div class="print-doc"><h1>${esc(doc.title)}</h1><div class="pd-meta">${esc(S.settings.company||'')} · ${esc(p.id)} · prepared ${fmtD(new Date())}</div><table>${doc.fields.map(([k])=>`<tr><th>${esc(FIELD_LABELS[k]||k)}</th><td>${esc(fieldVal(p,k))||'&nbsp;'}</td></tr>`).join('')}</table><div class="pd-foot">${esc(doc.who)} · ${esc(doc.where)}</div><div class="pd-sign">Signature ____________________ &nbsp; Date ____________</div></div>`;
    let el=$('#printArea');if(!el){el=document.createElement('div');el.id='printArea';document.body.appendChild(el);}el.innerHTML=html;document.body.classList.add('printing');setTimeout(()=>{try{window.print();}catch(e){}setTimeout(()=>document.body.classList.remove('printing'),300);},50);},
  pl_csv:(d)=>{const p=P(d.id);const doc=planDocs(p).find(x=>x.id===d.d);const q=v=>'"'+String(v).replace(/"/g,'""')+'"';const csv='Field,Value\n'+doc.fields.map(([k])=>q(FIELD_LABELS[k]||k)+','+q(fieldVal(p,k))).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`${doc.id}-${p.id}.csv`;document.body.appendChild(a);a.click();a.remove();},
  pl_copy:(d)=>{const p=P(d.id);const doc=planDocs(p).find(x=>x.id===d.d);copy(`${doc.title}\n`+doc.fields.map(([k])=>`${FIELD_LABELS[k]||k}: ${fieldVal(p,k)}`).join('\n'));},
  pl_askSup:(d)=>{const p=P(d.id);const items=planReqs(p).filter(r=>p.req[r.id]==='need'&&/factory|exporter/i.test(r.owner));const sup=p.supplier||'Supplier';
    const en=`Hi ${sup},\n\nFor our ${cap(p.product.desc)} shipment to ${destName(p)}, please provide:\n\n${items.map((r,i)=>`${i+1}. ${r.name}\n   ${r.plain}`).join('\n')}\n\nAlso please prepare the commercial invoice and packing list with exactly these details:\n- Description: ${fieldVal(p,'product_desc')}\n- HS code: ${fieldVal(p,'hs_code')}\n- Consignee: ${fieldVal(p,'consignee_name')}\n- Incoterm: ${fieldVal(p,'incoterm')}\n\nThank you,\n${S.settings.company||''}`;
    const zh=`${sup} 您好：\n\n关于发往${destName(p)}的${cap(p.product.desc)}，请提供：\n\n${items.map((r,i)=>`${i+1}. ${r.name}`).join('\n')}\n\n商业发票和装箱单请严格按以下信息填写：\n- 品名：${fieldVal(p,'product_desc')}\n- HS编码：${fieldVal(p,'hs_code')}\n- 收货人：${fieldVal(p,'consignee_name')}\n- 贸易术语：${fieldVal(p,'incoterm')}\n\n谢谢！\n${S.settings.company||''}`;
    modal(`Request to ${esc(sup)}`,`<div class="seg" id="langSeg"><button class="active" data-l="en">English</button><button data-l="zh">中文</button></div><textarea class="in" rows="14" id="mTxt" style="margin-top:10px">${esc(en)}</textarea>`,'Copy message',()=>copy($('#mTxt').value));
    $('#langSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('#langSeg .active').classList.remove('active');b.classList.add('active');$('#mTxt').value=b.dataset.l==='zh'?zh:en;});},
  pl_explain:async(d,el)=>{const p=P(d.id);const box=$('#plExplain');if(!(window.__health&&window.__health.live)){box.innerHTML='<p class="muted" style="margin-top:8px">Connect a model in Settings → AI model to get a plain-English explanation.</p>';return;}
    el.disabled=true;box.innerHTML='<p class="muted" style="margin-top:8px">Thinking…</p>';const reqs=planReqs(p);
    const facts=`Product: ${p.product.desc}; answers: ${JSON.stringify(p.product.answers)}; route ${COUNTRIES[p.ship.origin]} → ${destName(p)} by ${p.ship.mode}; ${p.ship.weightKg||'?'} kg; value ${p.ship.value||'?'} USD.\nClassification: ${planCls(p).code} (${planCls(p).duty}).\nRequirements:\n${reqs.map(r=>`- ${r.name} [${r.owner}; ${r.agency}] ${r.plain}${p.req[r.id]?' — user says: '+p.req[r.id]:''}`).join('\n')}`;
    try{const r=await fetch('/api/chat/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Explain in plain English what I need to do for this shipment, in what order, and what matters most.',role:myRole(),facts})});const j=await r.json();box.innerHTML=j.text?`<div class="explain">${md(j.text)}<div class="ai-src">${esc(modelLabel(j))}</div></div>`:`<p class="muted">${esc(j.error||'No answer')}</p>`;}catch(e){box.innerHTML='<p class="muted">Server not reachable.</p>';}el.disabled=false;},
  pl_ask:(d)=>{const p=P(d.id);window.__chatId=null;location.hash='chat';setTimeout(()=>{const i=$('#chatIn');if(i){i.value=`About my ${p.product.desc} shipment from ${COUNTRIES[p.ship.origin]} to ${destName(p)}: `;i.focus();}},100);},
});
/* field inputs: update on change without losing focus mid-typing */
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset&&el.dataset.pf){const p=P(el.dataset.id);if(!p)return;const k=el.dataset.pf;let v=el.value;if(k==='desc'){p.product.desc=v;p.name=cap(v)||p.name;}else if(k==='supplier'){p.supplier=v;}else{setPath(p,k,v);if(k==='ship.origin')p.ship.originCity='';if(k==='ship.dest'){p.ship.destCity='';p.ship.destCountry='';}}save();route();}
  if(el.dataset&&el.dataset.pfield){const p=P(el.dataset.id);if(!p)return;p.fields=p.fields||{};const def=planDefaults(p)[el.dataset.pfield]||'';if(el.value===def)delete p.fields[el.dataset.pfield];else p.fields[el.dataset.pfield]=el.value;save();route();}
  if(el.dataset&&el.dataset.psub){const p=P(el.dataset.id);if(!p)return;p.submitted=p.submitted||{};p.submitted[el.dataset.psub]={...(p.submitted[el.dataset.psub]||{}),ref:el.value};save();}
});
/* start a plan from a chat answer */
function startPlanFromChat(){const w=window.__pending||{};const p=newPlan({desc:w.desc,origin:w.origin,originCity:w.originCity,dest:w.dest,destCountry:w.destCountry,destCity:w.destCity,weightKg:w.weightKg,units:w.units,value:w.value,mode:w.mode});location.hash='plan-'+p.id;}
