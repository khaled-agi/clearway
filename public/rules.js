/* ClearWay rules engine — shared by browser and server.
   Keyword-based prototype rules with a cost model. In production: HTS/TARIC schedule + CBP CROSS / BTI
   rulings via API, a maintained requirements table per market, and a licensed broker in the loop.
   Nothing here is legal advice. */
(function(root){

/* ---------- document fields ---------- */
const FIELDS=[['desc','Description'],['qty','Quantity (units)'],['cartons','Cartons'],['weight','Gross weight'],['value','Value / currency'],['incoterm','Incoterm'],['consignee','Consignee'],['origin','Country of origin'],['hs','HS code']];
const COMPARE=new Set(['desc','qty','cartons','weight','consignee','hs']);
function norm(v){return (v||'').toLowerCase().replace(/[.,\s]/g,'');}

/* ---------- cost assumptions (USD) — shown to the user on the Settings/Rules pages ---------- */
const COSTS={
  examXray:300,        // VACIS / x-ray exam, per container
  examIntensive:1200,  // intensive exam incl. drayage to CES, per container (often more)
  demurragePerDay:250, // terminal storage after free time, per container per day
  brokerHandling:400,  // broker time for a hold / amendment
  isfPenalty:5000,     // CBP liquidated damages per ISF violation
  markingDutyPct:10,   // 19 USC 1304: additional duty for goods not marked with origin
  relabelPerUnit:0.6,  // relabel/rework at destination, per unit
  storagePerDayPGA:120,// bonded storage during an FDA/CPSC detention, per day
  delayDaysDoc:4, delayDaysPGA:14,
};

/* ---------- impact model: what a blocker costs if NOT fixed ---------- */
/* returns {low, high, days, atRisk, why, items:[[label,amount]]}  */
function impact(kind, ctx){
  const units=Number(ctx.units)||1000, value=Number(ctx.value)||units*9, containers=Math.max(1,Math.ceil(units/6000));
  const C=COSTS; const line=(l,a)=>[l,Math.round(a)];
  switch(kind){
    case 'qty': case 'consignee': case 'weight': case 'desc': case 'hs-mismatch': {
      const items=[line('Exam (x-ray → tailgate)',C.examXray*containers),line(`Demurrage ~${C.delayDaysDoc} days`,C.demurragePerDay*containers*C.delayDaysDoc),line('Broker handling / amendment',C.brokerHandling)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:Math.round(sum*0.6),high:Math.round(sum*1.6),days:C.delayDaysDoc,atRisk:0,items,
        why:'CBP cross-checks invoice, packing list and transport document line by line. Numbers that disagree are the single most common reason a container is pulled for exam, and the importer pays for the exam and every day of storage.'};
    }
    case 'incoterm': case 'value': {
      const items=[line('Entry cannot be filed — late entry',C.brokerHandling),line(`Demurrage ~${C.delayDaysDoc} days`,C.demurragePerDay*containers*C.delayDaysDoc),line('Valuation query (CF-28)',C.brokerHandling)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:sum,high:Math.round(sum*2),days:C.delayDaysDoc,atRisk:0,items,why:'Without a value and terms of sale customs cannot establish the dutiable value. Expect a valuation query and a hold until it is answered.'};
    }
    case 'missing-doc': {
      const items=[line(`Demurrage ~${C.delayDaysDoc} days`,C.demurragePerDay*containers*C.delayDaysDoc),line('Broker handling',C.brokerHandling)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:sum,high:Math.round(sum*2),days:C.delayDaysDoc,atRisk:0,items,why:'The broker cannot prepare the entry without the full document set, so the clock starts the day the vessel arrives.'};
    }
    case 'cert': { // FCC / CPSC / FDA / CE / EN71
      const items=[line('Intensive exam + PGA review',C.examIntensive*containers),line(`Bonded storage ~${C.delayDaysPGA} days`,C.storagePerDayPGA*C.delayDaysPGA),line('Broker + agency correspondence',C.brokerHandling*2)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:sum,high:Math.round(sum*1.5),days:C.delayDaysPGA,atRisk:value,items,why:'Regulated products without the certificate are detained by the agency (FDA, CPSC, FCC…). If the product cannot be brought into compliance it is refused, re-exported or destroyed at your cost — the whole shipment value is at risk.'};
    }
    case 'label-origin': {
      const items=[line(`Marking duty ${C.markingDutyPct}% of value`,value*C.markingDutyPct/100),line('Relabel at bonded warehouse',units*C.relabelPerUnit),line('Storage while relabelling',C.storagePerDayPGA*5)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:Math.round(units*C.relabelPerUnit+C.storagePerDayPGA*5),high:sum,days:7,atRisk:0,items,why:'Goods not marked with their country of origin are assessed an additional 10% duty (19 USC 1304) or must be marked under CBP supervision before release.'};
    }
    case 'label-tracking': case 'label-rp': case 'label-warning': {
      const items=[line('Relabel / rework at destination',units*C.relabelPerUnit),line('Storage while relabelling',C.storagePerDayPGA*5),line('Marketplace listing suppressed (lost sales)',value*0.15)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:Math.round(units*C.relabelPerUnit),high:sum,days:7,atRisk:kind==='label-rp'?value:0,items,why:kind==='label-rp'?'Since GPSR (Dec 2024) products without an EU Responsible Person on the label can be stopped at the border and are delisted by Amazon, bol.com, Otto and others.':'Missing mandatory label elements mean rework before the goods can be sold — and for children\'s products CPSC can refuse entry outright.'};
    }
    case 'isf': {
      const items=[line('CBP liquidated damages (per violation)',C.isfPenalty),line('Hold for exam',C.examXray*containers),line(`Demurrage ~${C.delayDaysDoc} days`,C.demurragePerDay*containers*C.delayDaysDoc)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:C.isfPenalty,high:sum,days:C.delayDaysDoc,atRisk:0,items,why:'The Importer Security Filing must be on file 24 hours before the container is loaded in China. Late or missing ISF is penalised at $5,000 per violation and the shipment is routinely flagged for exam.'};
    }
    case 'hs-low': {
      const items=[line('Duty under/over-payment on this entry',value*0.05),line('CF-28/29 response + possible penalty (negligence: up to 2× duty loss)',value*0.05*2),line('Broker time',C.brokerHandling)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:C.brokerHandling,high:sum,days:0,atRisk:0,items,why:'A wrong tariff code changes the duty rate and which agency reviews the goods. Underpaid duty is collected later with penalties; an audit looks back five years.'};
    }
    case 'filing': {
      const items=[line('Carrier refuses / re-books the cargo (DG or data incomplete)',C.brokerHandling),line('Missed sailing — ~7 days delay, storage at origin',350*containers),line('Manual agency review at entry',C.brokerHandling)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:C.brokerHandling,high:sum,days:7,atRisk:0,items,why:'Declarations (dangerous goods, agency product codes, pre-arrival data) are checked before loading and again at entry. A missing one usually means the carrier will not load the cargo until it is corrected, or the entry is diverted to manual review.'};
    }
    case 'registration': default: {
      const items=[line('Entry held pending registration',C.demurragePerDay*containers*3),line('Broker handling',C.brokerHandling)];
      const sum=items.reduce((a,b)=>a+b[1],0);
      return {low:C.brokerHandling,high:sum,days:3,atRisk:0,items,why:'Registrations (producer, EORI, facility) are checked at entry; a missing number is a hold until it is supplied.'};
    }
  }
}
const money=n=>'$'+Math.round(n).toLocaleString();
function impactRange(i){return i.low===i.high?money(i.low):`${money(i.low)}–${money(i.high)}`;}

/* ---------- requirements catalog ---------- */
/* each: id, market(s), name, plain, agency, trigger (regex on description) or always, kind, owner, link */
const CATALOG=[
  // ---- US
  {id:'us-hts',m:['US'],name:'HTS classification with rationale',plain:'The 10-digit tariff code that sets the duty rate and which agencies look at the goods.',agency:'CBP',trigger:null,kind:'classification',owner:'Importer / broker',link:'https://hts.usitc.gov/'},
  {id:'us-fcc',m:['US'],name:'FCC Supplier\'s Declaration of Conformity + Part 15 test report',plain:'Anything with a radio (Bluetooth, Wi-Fi) or digital circuitry must be tested for interference.',agency:'FCC',trigger:/bluetooth|wireless|wi-?fi|usb|charger|electronic|led|digital|battery|speaker|smart/i,kind:'cert',owner:'Factory',link:'https://www.fcc.gov/general/equipment-authorization-procedures'},
  {id:'us-lithium',m:['US','EU','UK'],name:'Lithium battery declaration (UN3090 / UN3091)',plain:'Batteries are dangerous goods. The shipper\'s declaration must say so, even for coin cells inside a product.',agency:'DOT / IATA',trigger:/battery|cr2032|lithium|rechargeable|bluetooth|power bank/i,kind:'filing',owner:'Factory + forwarder',link:'https://www.phmsa.dot.gov/lithiumbatteries'},
  {id:'us-cpc',m:['US'],name:'Children\'s Product Certificate (CPC) + third-party test reports',plain:'Products for children under 12 must be tested by a CPSC-accepted lab for lead, phthalates and toy safety (ASTM F963).',agency:'CPSC',trigger:/kid|toy|plush|puzzle|children|baby|infant|crib|pacifier/i,kind:'cert',owner:'Importer (certifies) / factory (tests)',link:'https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/Childrens-Product-Certificate-CPC'},
  {id:'us-tracking',m:['US'],name:'Permanent tracking label on product and packaging',plain:'Manufacturer, location, date and batch must be on the product so a recall can be traced.',agency:'CPSC',trigger:/kid|toy|plush|puzzle|children|baby|infant/i,kind:'label-tracking',owner:'Factory (artwork)',link:'https://www.cpsc.gov/Business--Manufacturing/Business-Education/tracking-label'},
  {id:'us-smallparts',m:['US'],name:'Small-parts / age-grade warning; no under-3 imagery if small parts',plain:'If the product has small parts, packaging must carry the choking warning and must not show children under three.',agency:'CPSC',trigger:/kid|toy|plush|puzzle|children|baby/i,kind:'label-warning',owner:'Factory (artwork)',link:'https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/Small-Parts-for-Toys-and-Childrens-Products'},
  {id:'us-mocra',m:['US'],name:'FDA facility registration + product listing (MoCRA)',plain:'Cosmetics factories must be registered with FDA and each product listed.',agency:'FDA',trigger:/serum|cream|lotion|cosmetic|shampoo|soap|lipstick|skincare|skin care/i,kind:'cert',owner:'Factory',link:'https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products'},
  {id:'us-fdacode',m:['US'],name:'FDA product code on the commercial invoice',plain:'Lets the broker file the FDA part of the entry without a manual review.',agency:'FDA',trigger:/serum|cream|lotion|cosmetic|food|supplement|kitchen|bottle|dinner|plate|bowl|cup|utensil|medical|thermometer/i,kind:'filing',owner:'Broker',link:'https://www.accessdata.fda.gov/scripts/ora/pcb/'},
  {id:'us-foodcontact',m:['US'],name:'Food-contact compliance letter (21 CFR 175–178)',plain:'Anything that touches food must be made of FDA-compliant materials; the factory provides a guarantee letter.',agency:'FDA',trigger:/dinner|plate|bowl|bottle|kitchen|food|cup|utensil|lunch box|tumbler|scale/i,kind:'cert',owner:'Factory',link:'https://www.fda.gov/food/food-ingredients-packaging/packaging-food-contact-substances-fcs'},
  {id:'us-lacey',m:['US'],name:'Lacey Act declaration (PPQ 505)',plain:'Wood and bamboo products must declare the plant species and country of harvest.',agency:'USDA APHIS',trigger:/bamboo|wood|wooden|rattan|paper/i,kind:'filing',owner:'Importer / broker',link:'https://www.aphis.usda.gov/plant-imports/lacey-act'},
  {id:'us-origin',m:['US'],name:'Country-of-origin marking, permanent and conspicuous',plain:'"Made in China" must be on the product itself (not just the box) in a way that survives until it reaches the buyer.',agency:'CBP',trigger:null,kind:'label-origin',owner:'Factory (artwork)',link:'https://www.cbp.gov/trade/rulings/informed-compliance-publications/marking-country-origin-us-imports'},
  {id:'us-isf',m:['US'],name:'ISF (10+2) data from the supplier',plain:'Manufacturer, ship-to, container stuffing location, consolidator, HTS — filed 24 h before loading. Ocean only.',agency:'CBP',trigger:null,kind:'isf',owner:'Importer (via broker); data from factory',modes:['Ocean'],link:'https://www.cbp.gov/border-security/ports-entry/cargo-security/importer-security-filing-102'},
  {id:'us-ior',m:['US'],name:'Importer of record + customs bond',plain:'Someone with a US entity must be legally responsible for the entry. Since de minimis ended, every shipment needs this.',agency:'CBP',trigger:null,kind:'registration',owner:'Importer',link:'https://www.cbp.gov/trade/programs-administration/entry-summary/bonds'},
  {id:'us-uflpa',m:['US'],name:'UFLPA supply-chain tracing documentation',plain:'Cotton, polysilicon, tomato and other high-risk inputs need proof they are not from Xinjiang.',agency:'CBP',trigger:/cotton|polysilicon|solar|tomato|xinjiang|apparel|textile/i,kind:'cert',owner:'Factory',link:'https://www.cbp.gov/trade/forced-labor/UFLPA'},
  // ---- EU
  {id:'eu-taric',m:['EU'],name:'CN / TARIC classification',plain:'The 8–10 digit code used across the EU that sets duty and VAT treatment.',agency:'DG TAXUD',trigger:null,kind:'classification',owner:'Importer / broker',link:'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp'},
  {id:'eu-ce',m:['EU'],name:'CE Declaration of Conformity + technical file',plain:'Electrical and electronic goods need CE marking backed by test reports (LVD, EMC, RED for radios).',agency:'Market surveillance',trigger:/bluetooth|wireless|usb|charger|electronic|led|digital|battery|speaker|smart|scale/i,kind:'cert',owner:'Factory',link:'https://single-market-economy.ec.europa.eu/single-market/ce-marking_en'},
  {id:'eu-weee',m:['EU'],name:'WEEE producer registration (per member state)',plain:'Whoever first sells electronics in a country must be registered for e-waste take-back.',agency:'National registers',trigger:/bluetooth|wireless|usb|charger|electronic|led|digital|battery|speaker|smart|scale/i,kind:'registration',owner:'Importer',link:'https://environment.ec.europa.eu/topics/waste-and-recycling/waste-electrical-and-electronic-equipment-weee_en'},
  {id:'eu-en71',m:['EU'],name:'EN 71 test reports + CE (Toy Safety Directive)',plain:'Toys must be tested to EN 71 parts 1–3 and carry CE marking and a technical file.',agency:'Market surveillance',trigger:/kid|toy|plush|puzzle|children|baby|infant/i,kind:'cert',owner:'Factory',link:'https://single-market-economy.ec.europa.eu/sectors/toys/toy-safety_en'},
  {id:'eu-cpnp',m:['EU'],name:'CPNP notification + Responsible Person',plain:'Cosmetics must be notified in the EU portal before sale.',agency:'European Commission',trigger:/serum|cream|lotion|cosmetic|shampoo|soap|lipstick|skincare/i,kind:'registration',owner:'Importer / RP',link:'https://ec.europa.eu/growth/tools-databases/cpnp/'},
  {id:'eu-gpsr',m:['EU'],name:'GPSR Responsible Person named on product / packaging',plain:'Every consumer product needs an EU-based contact printed on it. Marketplaces delist products without one.',agency:'GPSR (EU) 2023/988',trigger:null,kind:'label-rp',owner:'Importer (appoints RP); factory prints',link:'https://commission.europa.eu/business-economy-euro/product-safety-and-requirements/product-safety/general-product-safety-regulation_en'},
  {id:'eu-epr',m:['EU'],name:'Packaging EPR registration (e.g. LUCID in Germany)',plain:'Register and pay for the packaging you put on the market in each country.',agency:'National registers',trigger:null,kind:'registration',owner:'Importer',link:'https://www.verpackungsregister.org/en'},
  {id:'eu-eori',m:['EU'],name:'EORI number + import VAT / IOSS arrangement',plain:'Your customs ID and how VAT is paid.',agency:'National customs',trigger:null,kind:'registration',owner:'Importer',link:'https://taxation-customs.ec.europa.eu/customs-4/customs-procedures-import-and-export-0/customs-procedures/economic-operators-registration-and-identification-number-eori_en'},
  {id:'eu-ics2',m:['EU'],name:'ICS2 entry summary declaration (ENS) data to carrier',plain:'Pre-arrival safety data; the carrier needs a precise goods description and HS code from you.',agency:'DG TAXUD',trigger:null,kind:'filing',owner:'Forwarder',link:'https://taxation-customs.ec.europa.eu/customs-4/customs-security/import-control-system-2-ics2-0_en'},
  {id:'eu-reach',m:['EU','UK'],name:'REACH / RoHS declarations',plain:'No restricted substances above limits; the factory declares it.',agency:'ECHA',trigger:null,kind:'cert',owner:'Factory',link:'https://echa.europa.eu/regulations/reach/understanding-reach'},
  {id:'eu-clp',m:['EU','UK'],name:'CLP hazard labelling + safety data sheet',plain:'Scented and chemical products need hazard pictograms and allergen lists.',agency:'ECHA / HSE',trigger:/candle|fragrance|scent|perfume|cleaner|detergent|glue|paint/i,kind:'label-warning',owner:'Factory',link:'https://echa.europa.eu/regulations/clp/understanding-clp'},
  // ---- UK
  {id:'uk-tariff',m:['UK'],name:'UK Global Tariff classification',plain:'The 10-digit UK code.',agency:'HMRC',trigger:null,kind:'classification',owner:'Importer / broker',link:'https://www.trade-tariff.service.gov.uk/'},
  {id:'uk-ukca',m:['UK'],name:'UKCA / CE marking + UK Responsible Person',plain:'The UK equivalent of CE; CE is still accepted for most goods.',agency:'OPSS',trigger:/bluetooth|wireless|usb|charger|electronic|led|digital|toy|puzzle|plush|battery|scale/i,kind:'cert',owner:'Factory / importer',link:'https://www.gov.uk/guidance/using-the-ukca-marking'},
  {id:'uk-eori',m:['UK'],name:'GB EORI + import VAT',plain:'Your customs ID and VAT arrangement.',agency:'HMRC',trigger:null,kind:'registration',owner:'Importer',link:'https://www.gov.uk/eori'},
];

function requirementsFor(desc, dest, mode){
  return CATALOG.filter(r=>r.m.includes(dest)&&(!r.modes||r.modes.includes(mode))&&(!r.trigger||r.trigger.test(desc||'')));
}

/* ---------- classification (keyword prototype) ---------- */
function classify(w){
  const t=(w.desc||'').toLowerCase(); const us=w.dest==='US';
  const pick=(code,text,why,duty,conf)=>({code,text,why,duty,conf});
  if(/scale/.test(t))return pick(us?'8423.10.00':'8423 10 10','Personal / household weighing machines','Heading 8423 covers weighing machinery; subheading .10 is household scales regardless of electronic features (cf. CBP rulings on digital kitchen scales).', us?'0% + 25% Sec. 301 (List 3)':'1.7% + VAT',91);
  if(/charger|power adapter|adapter/.test(t))return pick(us?'8504.40.95':'8504 40 55','Static converters (power supplies)','USB-C chargers are rectifiers/static converters of heading 8504.', us?'0% + 25% Sec. 301':'0% + VAT',93);
  if(/plush|stuffed/.test(t))return pick(us?'9503.00.00':'9503 00 41','Toys — stuffed, representing animals','Heading 9503 covers toys; stuffed toys fall under the specific subheading.', us?'0% + 25% Sec. 301':'0% + VAT',95);
  if(/puzzle|wooden toy|blocks/.test(t))return pick(us?'9503.00.00':'9503 00 61','Toys — wooden puzzles','Puzzles of all kinds are classified in 9503 per Chapter 95 notes.', us?'0% + 25% Sec. 301':'0% + VAT',90);
  if(/serum|cream|lotion|cosmetic/.test(t))return pick(us?'3304.99.50':'3304 99 00','Beauty / skin-care preparations','Skin-care preparations other than medicaments → 3304.99.', us?'0%':'0% + VAT',92);
  if(/candle/.test(t))return pick(us?'3406.00.00':'3406 00 00','Candles, tapers and the like','Primary function is a candle; fragrance does not shift it to 3307 unless marketed as a room-perfuming preparation.', us?'0% (AD/CVD check: petroleum wax candles from China)':'0% + VAT',72);
  if(/bottle|tumbler/.test(t))return pick(us?'9617.00.10':'9617 00 00','Vacuum flasks / insulated vessels','Double-walled stainless bottles → 9617 if vacuum-insulated; otherwise 7323.93.', us?'7.2% + Sec. 232 steel derivative + 301':'6.7% + VAT',80);
  if(/mat|yoga/.test(t))return pick(us?'9506.91.00':'9506 91 90','Articles for general physical exercise','Yoga mats are exercise equipment of 9506.91 (cf. multiple NY rulings).', us?'4.6% + 25% Sec. 301':'2.7% + VAT',94);
  if(/bluetooth|speaker|headphone|earbud/.test(t))return pick(us?'8518.22.00':'8518 22 00','Loudspeakers / headphones','Reception apparatus with primary function of sound reproduction.', us?'0% + 25% Sec. 301':'0% + VAT',84);
  if(/dinner|plate|bowl|tableware/.test(t))return pick(us?'4419.19.90':'4419 19 00','Tableware and kitchenware of bamboo','Chapter 44 note: bamboo tableware → 4419.1x.', us?'3.2% + 25% Sec. 301':'0% + VAT',86);
  if(/t-?shirt|apparel|hoodie|garment/.test(t))return pick(us?'6109.10.00':'6109 10 00','T-shirts, knitted, of cotton','Knitted cotton tops → 6109.10. Check UFLPA exposure for cotton.', us?'16.5% + 25% Sec. 301':'12% + VAT',88);
  return pick('—','Needs classification review','Not enough detail in the description to classify confidently. Add material, function, and how it is marketed.','unknown',40);
}

/* ---------- journey stages ---------- */
const STAGES=[
  {id:'product',name:'Product record',short:'Product',who:'Importer',desc:'Describe the product once: materials, function, who it is for. Everything else derives from this.'},
  {id:'supplier',name:'Supplier documents',short:'Supplier docs',who:'Factory',desc:'Invoice, packing list and label artwork from the factory — checked against each other before anything ships.'},
  {id:'classify',name:'Classification',short:'Classify',who:'Importer / broker',desc:'Tariff code, duty rate and which agencies care.'},
  {id:'comply',name:'Compliance',short:'Comply',who:'Factory + importer',desc:'Certificates, test reports, registrations and label elements the destination requires.'},
  {id:'book',name:'Booking & filings',short:'Book',who:'Forwarder + broker',desc:'Space booked; ISF (US) or ENS (EU) filed before loading.'},
  {id:'transit',name:'In transit',short:'Transit',who:'Carrier',desc:'On the water or in the air. Documents are final; the entry is prepared.'},
  {id:'entry',name:'Arrival & entry',short:'Entry',who:'Broker + customs',desc:'Entry filed, duties paid, agency review if flagged.'},
  {id:'released',name:'Released',short:'Released',who:'—',desc:'Cleared, delivered, costs reconciled. Lessons go back into the product record.'},
];

const api={FIELDS,COMPARE,norm,COSTS,impact,impactRange,money,CATALOG,requirementsFor,classify,STAGES};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
Object.assign(root,api);
})(typeof globalThis!=='undefined'?globalThis:this);
