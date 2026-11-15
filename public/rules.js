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


/* ---------- product attributes: what rules key off ---------- */
const ATTRS=[
  ['electrical','Plugs in or has electronics',/electr|led|digital|usb|charger|plug|motor|heater|lamp|appliance|scale|speaker|camera|smart/i],
  ['radio','Has a radio (Bluetooth, Wi-Fi, cellular)',/bluetooth|wireless|wi-?fi|cellular|lte|zigbee|rf |remote|smart/i],
  ['battery','Contains a battery',/battery|batteries|cr2032|lithium|rechargeable|power bank|\bcells?\b/i],
  ['children','For children under 12 / could appeal to children',/kid|toy|plush|puzzle|children|baby|infant|crib|pacifier|stroller|school/i],
  ['foodContact','Touches food or drink',/dinner|plate|bowl|bottle|kitchen|food|cup|mug|utensil|lunch|tumbler|cookware|cutting board|straw/i],
  ['cosmetic','Cosmetic or applied to skin',/serum|cream|lotion|cosmetic|shampoo|soap|lipstick|skincare|skin care|perfume|makeup|sunscreen/i],
  ['textile','Textile, apparel or footwear',/t-?shirt|apparel|hoodie|garment|textile|cotton|polyester|fabric|sock|shoe|jacket|dress|towel|bedding/i],
  ['wood','Wood, bamboo or plant material',/bamboo|wood|wooden|rattan|paper|cork|cardboard/i],
  ['chemical','Chemical, fragrance or flammable',/candle|fragrance|scent|perfume|cleaner|detergent|glue|paint|aerosol|solvent|ink/i],
  ['medical','Medical, health or PPE claim',/medical|thermometer|mask|blood|pulse|glucose|bandage|first aid|massager|ppe/i],
  ['food','Food, drink, supplement or agricultural product',/snack|\btea\b|coffee|supplement|vitamin|candy|chocolate|spice|sauce|\bsoy|bean|rice|grain|wheat|corn|maize|seed|nut|peanut|almond|fruit|vegetable|garlic|ginger|mushroom|meat|fish|seafood|shrimp|honey|flour|noodle|oil\b|sugar|juice|wine|beer|milk|dairy|egg|herb|cocoa|cereal|lentil|pea\b|chickpea|sesame/i],
  ['plant','Raw plant / agricultural commodity (phytosanitary)',/^$/],
  ['supplement','Dietary supplement / natural health product',/supplement|vitamin|capsule|probiotic|protein powder|collagen|herbal extract|gummies/i],
  ['consumer','Sold to consumers (retail packaging)',/.*/],
];
function deriveAttrs(desc){const o={};ATTRS.forEach(([k,,re])=>{if(re.test(desc||''))o[k]=true;});if(o.cosmetic&&o.food&&!/supplement|snack|tea|coffee/i.test(desc||''))delete o.food;
  /* raw agricultural goods are plant products too (phytosanitary rules), and bulk commodities aren't retail-packaged consumer goods by default */
  if(o.food&&/\b(soy ?beans?|beans|grain|wheat|corn|maize|seeds?|rice|nuts|lentils|peas|chickpeas|sesame|raw|bulk|green coffee|cocoa beans)\b/i.test(desc||'')){o.plant=true;if(!/\b(packaged|retail|bag(ged)?|jar|bottle|box(ed)?|snack)\b/i.test(desc||''))o.consumer=false;}
  if(/\b(industrial|component|part|b2b|bulk)\b/i.test(desc||''))o.consumer=false;return o;}
const CATEGORIES=[
  ['Consumer electronics',{electrical:1,radio:1,battery:1,consumer:1}],['Small appliances',{electrical:1,consumer:1}],['Lighting',{electrical:1,consumer:1}],
  ['Toys & children\'s products',{children:1,consumer:1}],['Baby gear',{children:1,consumer:1}],['Apparel & footwear',{textile:1,consumer:1}],['Home textiles',{textile:1,consumer:1}],
  ['Kitchen & tableware',{foodContact:1,consumer:1}],['Drinkware',{foodContact:1,consumer:1}],['Cosmetics & personal care',{cosmetic:1,consumer:1}],['Candles & fragrance',{chemical:1,consumer:1}],
  ['Furniture & wood products',{wood:1,consumer:1}],['Sports & fitness',{consumer:1}],['Pet products',{consumer:1}],['Tools & hardware',{consumer:1}],['Health devices & PPE',{medical:1,consumer:1}],
  ['Food & supplements',{food:1,consumer:1}],['Packaging & paper',{wood:1}],['Industrial components (B2B)',{}],['Other',{consumer:1}],
];

/* ---------- requirements catalog ---------- */
/* each: id, market(s), name, plain, agency, trigger (regex on description) or always, kind, owner, link */
const CATALOG=[
  // ---- US
  {id:'us-hts',m:['US'],name:'HTS classification with rationale',plain:'The 10-digit tariff code that sets the duty rate and which agencies look at the goods.',agency:'CBP',when:null,kind:'classification',owner:'Importer / broker',link:'https://hts.usitc.gov/'},
  {id:'us-fcc',m:['US'],name:'FCC Supplier\'s Declaration of Conformity + Part 15 test report',plain:'Anything with a radio (Bluetooth, Wi-Fi) or digital circuitry must be tested for interference.',agency:'FCC',when:['radio','electrical'],kind:'cert',owner:'Factory',link:'https://www.fcc.gov/general/equipment-authorization-procedures'},
  {id:'us-lithium',m:['US','CA','EU','UK','CN'],name:'Lithium battery declaration (UN3090 / UN3091)',plain:'Batteries are dangerous goods. The shipper\'s declaration must say so, even for coin cells inside a product.',agency:'DOT / IATA',when:['battery'],kind:'filing',owner:'Factory + forwarder',link:'https://www.phmsa.dot.gov/lithiumbatteries'},
  {id:'us-cpc',m:['US'],name:'Children\'s Product Certificate (CPC) + third-party test reports',plain:'Products for children under 12 must be tested by a CPSC-accepted lab for lead, phthalates and toy safety (ASTM F963).',agency:'CPSC',when:['children'],kind:'cert',owner:'Importer (certifies) / factory (tests)',link:'https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/Childrens-Product-Certificate-CPC'},
  {id:'us-tracking',m:['US'],name:'Permanent tracking label on product and packaging',plain:'Manufacturer, location, date and batch must be on the product so a recall can be traced.',agency:'CPSC',when:['children'],kind:'label-tracking',owner:'Factory (artwork)',link:'https://www.cpsc.gov/Business--Manufacturing/Business-Education/tracking-label'},
  {id:'us-smallparts',m:['US'],name:'Small-parts / age-grade warning; no under-3 imagery if small parts',plain:'If the product has small parts, packaging must carry the choking warning and must not show children under three.',agency:'CPSC',when:['children'],kind:'label-warning',owner:'Factory (artwork)',link:'https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/Small-Parts-for-Toys-and-Childrens-Products'},
  {id:'us-mocra',m:['US'],name:'FDA facility registration + product listing (MoCRA)',plain:'Cosmetics factories must be registered with FDA and each product listed.',agency:'FDA',when:['cosmetic'],kind:'cert',owner:'Factory',link:'https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products'},
  {id:'us-fdacode',m:['US'],name:'FDA product code on the commercial invoice',plain:'Lets the broker file the FDA part of the entry without a manual review.',agency:'FDA',when:['cosmetic','foodContact','food','medical'],kind:'filing',owner:'Broker',link:'https://www.accessdata.fda.gov/scripts/ora/pcb/'},
  {id:'us-foodcontact',m:['US'],name:'Food-contact compliance letter (21 CFR 175–178)',plain:'Anything that touches food must be made of FDA-compliant materials; the factory provides a guarantee letter.',agency:'FDA',when:['foodContact'],kind:'cert',owner:'Factory',link:'https://www.fda.gov/food/food-ingredients-packaging/packaging-food-contact-substances-fcs'},
  {id:'us-lacey',m:['US'],name:'Lacey Act declaration (PPQ 505)',plain:'Wood and bamboo products must declare the plant species and country of harvest.',agency:'USDA APHIS',when:['wood'],kind:'filing',owner:'Importer / broker',link:'https://www.aphis.usda.gov/plant-imports/lacey-act'},
  {id:'us-origin',m:['US'],name:'Country-of-origin marking, permanent and conspicuous',plain:'"Made in China" must be on the product itself (not just the box) in a way that survives until it reaches the buyer.',agency:'CBP',when:null,kind:'label-origin',owner:'Factory (artwork)',link:'https://www.cbp.gov/trade/rulings/informed-compliance-publications/marking-country-origin-us-imports'},
  {id:'us-isf',m:['US'],name:'ISF (10+2) data from the supplier',plain:'Manufacturer, ship-to, container stuffing location, consolidator, HTS — filed 24 h before loading. Ocean only.',agency:'CBP',when:null,kind:'isf',owner:'Importer (via broker); data from factory',modes:['Ocean'],link:'https://www.cbp.gov/border-security/ports-entry/cargo-security/importer-security-filing-102'},
  {id:'us-ior',m:['US'],name:'Importer of record + customs bond',plain:'Someone with a US entity must be legally responsible for the entry. Since de minimis ended, every shipment needs this.',agency:'CBP',when:null,kind:'registration',owner:'Importer',link:'https://www.cbp.gov/trade/programs-administration/entry-summary/bonds'},
  {id:'us-uflpa',m:['US'],name:'UFLPA supply-chain tracing documentation',plain:'Cotton, polysilicon, tomato and other high-risk inputs need proof they are not from Xinjiang.',agency:'CBP',when:['textile'],kind:'cert',owner:'Factory',link:'https://www.cbp.gov/trade/forced-labor/UFLPA'},
  // ---- EU
  {id:'eu-taric',m:['EU'],name:'CN / TARIC classification',plain:'The 8–10 digit code used across the EU that sets duty and VAT treatment.',agency:'DG TAXUD',when:null,kind:'classification',owner:'Importer / broker',link:'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp'},
  {id:'eu-ce',m:['EU'],name:'CE Declaration of Conformity + technical file',plain:'Electrical and electronic goods need CE marking backed by test reports (LVD, EMC, RED for radios).',agency:'Market surveillance',when:['electrical','radio'],kind:'cert',owner:'Factory',link:'https://single-market-economy.ec.europa.eu/single-market/ce-marking_en'},
  {id:'eu-weee',m:['EU'],name:'WEEE producer registration (per member state)',plain:'Whoever first sells electronics in a country must be registered for e-waste take-back.',agency:'National registers',when:['electrical','radio'],kind:'registration',owner:'Importer',link:'https://environment.ec.europa.eu/topics/waste-and-recycling/waste-electrical-and-electronic-equipment-weee_en'},
  {id:'eu-en71',m:['EU'],name:'EN 71 test reports + CE (Toy Safety Directive)',plain:'Toys must be tested to EN 71 parts 1–3 and carry CE marking and a technical file.',agency:'Market surveillance',when:['children'],kind:'cert',owner:'Factory',link:'https://single-market-economy.ec.europa.eu/sectors/toys/toy-safety_en'},
  {id:'eu-cpnp',m:['EU'],name:'CPNP notification + Responsible Person',plain:'Cosmetics must be notified in the EU portal before sale.',agency:'European Commission',when:['cosmetic'],kind:'registration',owner:'Importer / RP',link:'https://ec.europa.eu/growth/tools-databases/cpnp/'},
  {id:'eu-gpsr',m:['EU'],name:'GPSR Responsible Person named on product / packaging',plain:'Every consumer product needs an EU-based contact printed on it. Marketplaces delist products without one.',agency:'GPSR (EU) 2023/988',when:null,kind:'label-rp',owner:'Importer (appoints RP); factory prints',link:'https://commission.europa.eu/business-economy-euro/product-safety-and-requirements/product-safety/general-product-safety-regulation_en'},
  {id:'eu-epr',m:['EU'],name:'Packaging EPR registration (e.g. LUCID in Germany)',plain:'Register and pay for the packaging you put on the market in each country.',agency:'National registers',when:null,kind:'registration',owner:'Importer',link:'https://www.verpackungsregister.org/en'},
  {id:'eu-eori',m:['EU'],name:'EORI number + import VAT / IOSS arrangement',plain:'Your customs ID and how VAT is paid.',agency:'National customs',when:null,kind:'registration',owner:'Importer',link:'https://taxation-customs.ec.europa.eu/customs-4/customs-procedures-import-and-export-0/customs-procedures/economic-operators-registration-and-identification-number-eori_en'},
  {id:'eu-ics2',m:['EU'],name:'ICS2 entry summary declaration (ENS) data to carrier',plain:'Pre-arrival safety data; the carrier needs a precise goods description and HS code from you.',agency:'DG TAXUD',when:null,kind:'filing',owner:'Forwarder',link:'https://taxation-customs.ec.europa.eu/customs-4/customs-security/import-control-system-2-ics2-0_en'},
  {id:'eu-reach',m:['EU','UK'],name:'REACH / RoHS declarations',plain:'No restricted substances above limits; the factory declares it.',agency:'ECHA',when:null,kind:'cert',owner:'Factory',link:'https://echa.europa.eu/regulations/reach/understanding-reach'},
  {id:'eu-clp',m:['EU','UK'],name:'CLP hazard labelling + safety data sheet',plain:'Scented and chemical products need hazard pictograms and allergen lists.',agency:'ECHA / HSE',when:['chemical'],kind:'label-warning',owner:'Factory',link:'https://echa.europa.eu/regulations/clp/understanding-clp'},
  // ---- UK
  {id:'uk-tariff',m:['UK'],name:'UK Global Tariff classification',plain:'The 10-digit UK code.',agency:'HMRC',when:null,kind:'classification',owner:'Importer / broker',link:'https://www.trade-tariff.service.gov.uk/'},
  {id:'uk-ukca',m:['UK'],name:'UKCA / CE marking + UK Responsible Person',plain:'The UK equivalent of CE; CE is still accepted for most goods.',agency:'OPSS',when:['electrical','radio','children'],kind:'cert',owner:'Factory / importer',link:'https://www.gov.uk/guidance/using-the-ukca-marking'},
  {id:'uk-eori',m:['UK'],name:'GB EORI + import VAT',plain:'Your customs ID and VAT arrangement.',agency:'HMRC',when:null,kind:'registration',owner:'Importer',link:'https://www.gov.uk/eori'},
  // ---- US consumer-facing extras
  {id:'us-prop65',m:['US'],name:'California Prop 65 warning (if listed chemicals present)',plain:'Products sold into California with listed chemicals (lead, phthalates, BPA…) need the specific warning on product or listing.',agency:'OEHHA (California)',when:['consumer'],kind:'label-warning',owner:'Importer (decides) / factory (prints)',link:'https://www.p65warnings.ca.gov/'},
  {id:'us-textile',m:['US'],name:'Textile & care label: fibre content, origin, RN number, care instructions',plain:'Every garment and home textile needs a permanent label with fibre %, country of origin, your RN or company name, and care instructions.',agency:'FTC / CBP',when:['textile'],kind:'label-warning',owner:'Factory (artwork)',link:'https://www.ftc.gov/business-guidance/resources/threading-your-way-through-labeling-requirements-under-textile-wool-acts'},
  {id:'us-flammable',m:['US'],name:'Flammable Fabrics Act compliance (16 CFR 1610)',plain:'Apparel textiles must pass the flammability test; children\'s sleepwear has stricter rules.',agency:'CPSC',when:['textile'],kind:'cert',owner:'Factory',link:'https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/Clothing-Textiles'},
  {id:'us-fda510',m:['US'],name:'FDA device listing / 510(k) status',plain:'Anything with a medical claim is a device: establishment registration, listing and possibly premarket clearance.',agency:'FDA CDRH',when:['medical'],kind:'cert',owner:'Factory / importer',link:'https://www.fda.gov/medical-devices/how-study-and-market-your-device/device-registration-and-listing'},
  {id:'us-fsvp',m:['US'],name:'FDA food facility registration + Prior Notice + FSVP',plain:'Food and supplements need a registered foreign facility, prior notice before arrival, and you as importer must run a Foreign Supplier Verification Program.',agency:'FDA',when:['food'],kind:'cert',owner:'Factory + importer',link:'https://www.fda.gov/food/importing-food-products-united-states'},
  {id:'us-energy',m:['US'],name:'DOE energy conservation / FTC EnergyGuide (if covered product)',plain:'Lamps, chargers (external power supplies), fans and many appliances must meet efficiency standards and carry the marking.',agency:'DOE / FTC',when:['electrical'],kind:'cert',owner:'Factory',link:'https://www.energy.gov/eere/buildings/appliance-and-equipment-standards-program'},
  // ---- EU consumer-facing extras
  {id:'eu-lang',m:['EU'],name:'Instructions and safety information in the official language of each country sold',plain:'Germany needs German, France French, etc. — on the product, packaging or leaflet. Marketplaces check this too.',agency:'GPSR / sector directives',when:['consumer'],kind:'label-warning',owner:'Importer (translations) / factory (prints)',link:'https://commission.europa.eu/business-economy-euro/product-safety-and-requirements/product-safety/general-product-safety-regulation_en'},
  {id:'eu-textile',m:['EU'],name:'Textile fibre-composition label (Reg. 1007/2011) in local language',plain:'Fibre names must use the official EU terms in the language of the country of sale.',agency:'European Commission',when:['textile'],kind:'label-warning',owner:'Factory (artwork)',link:'https://single-market-economy.ec.europa.eu/sectors/textiles-and-clothing-industries/legislation_en'},
  {id:'eu-batt',m:['EU'],name:'EU Battery Regulation: labelling, removability, registration',plain:'Batteries need the crossed-out bin symbol, capacity marking and producer registration; from 2027 removable/replaceable requirements.',agency:'Reg. (EU) 2023/1542',when:['battery'],kind:'registration',owner:'Importer',link:'https://environment.ec.europa.eu/topics/waste-and-recycling/batteries_en'},
  {id:'eu-mdr',m:['EU'],name:'MDR CE marking + EU authorised representative (medical)',plain:'Medical claims put the product under the Medical Device Regulation.',agency:'Notified bodies',when:['medical'],kind:'cert',owner:'Factory / importer',link:'https://health.ec.europa.eu/medical-devices-sector/new-regulations_en'},
  {id:'eu-food',m:['EU'],name:'Food labelling (FIC 1169/2011) + food-contact declaration (1935/2004)',plain:'Local-language ingredient and allergen labelling; a declaration of compliance for anything that touches food.',agency:'EFSA / national',when:['food','foodContact'],kind:'cert',owner:'Factory',link:'https://food.ec.europa.eu/safety/labelling-and-nutrition_en'},
  // ---- Canada
  {id:'ca-tariff',m:['CA'],name:'Canadian Customs Tariff classification (10-digit)',plain:'Sets duty and whether CUSMA/other preferences apply. China-origin goods pay MFN rates.',agency:'CBSA',when:null,kind:'classification',owner:'Importer / broker',link:'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/menu-eng.html'},
  {id:'ca-carm',m:['CA'],name:'CARM client portal account + import bond (RPP)',plain:'Since Oct 2024 every importer must be registered in CARM and post financial security to release goods before paying duty.',agency:'CBSA',when:null,kind:'registration',owner:'Importer',link:'https://www.cbsa-asfc.gc.ca/services/carm-gcra/menu-eng.html'},
  {id:'ca-bilingual',m:['CA'],name:'Bilingual (English + French) mandatory label information',plain:'Product identity, net quantity and dealer name/address must be in both languages on consumer packaging. Quebec (Bill 96) additionally requires French on the product, instructions and warranty, at least as prominent as any other language.',agency:'Competition Bureau (CPLA) / OQLF',when:['consumer'],kind:'label-warning',owner:'Importer (translations) / factory (prints)',link:'https://ised-isde.canada.ca/site/competition-bureau-canada/en/how-we-foster-competition/education-and-outreach/guide-consumer-packaging-and-labelling-act-and-regulations'},
  {id:'ca-metric',m:['CA'],name:'Net quantity in metric units',plain:'Declared in metric (g, mL, cm) on the principal display panel; imperial may be added.',agency:'Competition Bureau',when:['consumer'],kind:'label-warning',owner:'Factory (artwork)',link:'https://ised-isde.canada.ca/site/competition-bureau-canada/en/how-we-foster-competition/education-and-outreach/guide-consumer-packaging-and-labelling-act-and-regulations'},
  {id:'ca-ccpsa',m:['CA'],name:'Canada Consumer Product Safety Act requirements + test reports',plain:'Toys, cribs, children\'s jewellery, textiles (flammability), and others have specific Health Canada regulations; keep documents to show on request.',agency:'Health Canada',when:['children','textile','consumer'],kind:'cert',owner:'Factory',link:'https://www.canada.ca/en/health-canada/services/consumer-product-safety/legislation-guidelines/acts-regulations/canada-consumer-product-safety-act.html'},
  {id:'ca-cosmetic',m:['CA'],name:'Cosmetic Notification Form within 10 days of first sale',plain:'Ingredients must be listed in INCI; the notification goes to Health Canada.',agency:'Health Canada',when:['cosmetic'],kind:'registration',owner:'Importer',link:'https://www.canada.ca/en/health-canada/services/consumer-product-safety/cosmetics/notification.html'},
  {id:'ca-ised',m:['CA'],name:'ISED certification (radio) and ICES-003 (digital devices)',plain:'Radios need ISED certification and the IC number on the label; digital devices need the ICES-003 statement.',agency:'ISED Canada',when:['radio','electrical'],kind:'cert',owner:'Factory',link:'https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en/devices-and-equipment/radio-equipment-certification'},
  {id:'ca-electrical',m:['CA'],name:'Electrical safety certification mark (CSA / cUL / cETL)',plain:'Provincial law requires an accredited certification mark on anything that plugs in before it can be sold.',agency:'Provincial authorities (e.g. ESA Ontario)',when:['electrical'],kind:'cert',owner:'Factory',link:'https://esasafe.com/electrical-products/approved-products/'},
  {id:'ca-cfia',m:['CA'],name:'CFIA Safe Food for Canadians licence + bilingual food label',plain:'Importers of food need an SFC licence; labels need bilingual ingredients, allergens and nutrition facts.',agency:'CFIA',when:['food'],kind:'cert',owner:'Importer',link:'https://inspection.canada.ca/en/importing-food-plants-animals/food-imports'},
  {id:'ca-textile',m:['CA'],name:'Textile Labelling Act: fibre content, dealer identity (CA number), bilingual',plain:'Permanent label with generic fibre names in English and French and your CA identification number.',agency:'Competition Bureau',when:['textile'],kind:'label-warning',owner:'Factory (artwork)',link:'https://ised-isde.canada.ca/site/competition-bureau-canada/en/how-we-foster-competition/education-and-outreach/guide-textile-labelling-and-advertising-regulations'},
  {id:'ca-mdel',m:['CA'],name:'Medical Device Establishment Licence / device licence',plain:'Class I devices need an MDEL for the importer; Class II+ need a device licence.',agency:'Health Canada',when:['medical'],kind:'cert',owner:'Importer',link:'https://www.canada.ca/en/health-canada/services/drugs-health-products/medical-devices/licensing.html'},
  {id:'ca-emanifest',m:['CA'],name:'eManifest / ACI pre-arrival data (carrier) + PARS release',plain:'Carrier files advance cargo data; your broker files the release request (PARS) before arrival.',agency:'CBSA',when:null,kind:'filing',owner:'Forwarder + broker',link:'https://www.cbsa-asfc.gc.ca/prog/manif/menu-eng.html'},
  {id:'ca-origin',m:['CA'],name:'Country-of-origin marking (for listed goods)',plain:'Many consumer goods must be marked with the country of origin in English or French.',agency:'CBSA (D11-3-1)',when:null,kind:'label-origin',owner:'Factory (artwork)',link:'https://www.cbsa-asfc.gc.ca/publications/dm-md/d11/d11-3-1-eng.html'},
  // ---- UK consumer-facing extras
  {id:'uk-lang',m:['UK'],name:'Instructions and safety information in English',plain:'Required for consumer products; the UK Responsible Person details must be on the product or packaging.',agency:'OPSS',when:['consumer'],kind:'label-warning',owner:'Importer / factory',link:'https://www.gov.uk/guidance/product-safety-for-businesses-a-to-z-of-industry-guidance'},

  // ---- US: more sectors
  {id:'us-cpsc-general',m:['US'],name:'CPSC General Certificate of Conformity (GCC) for regulated non-children\'s products',plain:'Bicycle helmets, mattresses, lighters, ATVs, garage door openers, certain textiles and others need a GCC based on testing.',agency:'CPSC',when:['consumer'],kind:'cert',owner:'Importer (certifies)',link:'https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/General-Certificate-of-Conformity'},
  {id:'us-epa-tsca',m:['US'],name:'TSCA import certification (chemicals and articles containing regulated substances)',plain:'Chemical substances and many articles need a positive or negative TSCA certification at entry; PFAS and formaldehyde (composite wood, TSCA Title VI) have specific rules.',agency:'EPA / CBP',when:['chemical','wood'],kind:'filing',owner:'Importer / broker',link:'https://www.epa.gov/tsca-import-export-requirements'},
  {id:'us-formaldehyde',m:['US'],name:'TSCA Title VI formaldehyde label and certification (composite wood)',plain:'Plywood, MDF, particleboard and furniture containing them must be certified by an EPA-recognised TPC and labelled "TSCA Title VI compliant".',agency:'EPA',when:['wood'],kind:'cert',owner:'Factory',link:'https://www.epa.gov/formaldehyde/formaldehyde-emission-standards-composite-wood-products'},
  {id:'us-battery-dot',m:['US'],name:'UN 38.3 test summary for lithium batteries',plain:'Every lithium cell/battery shipped needs a UN 38.3 test summary available on request; packaging and marking per 49 CFR 173.185.',agency:'DOT PHMSA',when:['battery'],kind:'cert',owner:'Factory',link:'https://www.phmsa.dot.gov/lithiumbatteries'},
  {id:'us-fcc-id',m:['US'],name:'FCC ID certification and label (intentional radiators)',plain:'Bluetooth/Wi-Fi/cellular devices need FCC certification by a TCB and the FCC ID on the device (or e-label).',agency:'FCC',when:['radio'],kind:'cert',owner:'Factory',link:'https://www.fcc.gov/oet/ea/fccid'},
  {id:'us-ul',m:['US'],name:'Electrical safety listing (UL / ETL / CSA-US) — practical requirement',plain:'Not a federal import rule, but OSHA NRTL rules, retailers, marketplaces and insurers require a listing mark for mains-powered products.',agency:'OSHA NRTL / retailers',when:['electrical'],kind:'cert',owner:'Factory',link:'https://www.osha.gov/nationally-recognized-testing-laboratory-program'},
  {id:'us-ftc-madeinusa',m:['US'],name:'FTC marketing claims: no "Made in USA" or unsubstantiated "eco" claims',plain:'Country-of-origin and environmental marketing claims on packaging/listings must be truthful (Green Guides).',agency:'FTC',when:['consumer'],kind:'label-warning',owner:'Importer',link:'https://www.ftc.gov/business-guidance/advertising-marketing'},
  {id:'us-fda-dietary',m:['US'],name:'Dietary supplement labelling (Supplement Facts) + cGMP',plain:'Supplements need the Supplement Facts panel, structure/function disclaimers, and 21 CFR 111 manufacturing.',agency:'FDA',when:['supplement'],kind:'label-warning',owner:'Importer / factory',link:'https://www.fda.gov/food/dietary-supplements'},
  {id:'us-fda-nutrition',m:['US'],name:'Nutrition Facts, allergen and ingredient labelling (food)',plain:'21 CFR 101; FALCPA allergens; bioengineered disclosure.',agency:'FDA',when:['food'],kind:'label-warning',owner:'Importer / factory',link:'https://www.fda.gov/food/food-labeling-nutrition'},
  {id:'us-usda-aphis',m:['US'],name:'USDA APHIS permits for plant/animal materials (incl. untreated wood packaging ISPM-15)',plain:'Wood packaging must bear the ISPM-15 mark; plant and animal products may need permits or phytosanitary certificates.',agency:'USDA APHIS',when:['wood','food'],kind:'cert',owner:'Factory / forwarder',link:'https://www.aphis.usda.gov/'},
  {id:'us-fws',m:['US'],name:'Fish & Wildlife declaration (wildlife products, leather, feathers, shells)',plain:'Products with animal parts need a Form 3-177 declaration and may need CITES permits.',agency:'USFWS',when:['textile'],kind:'filing',owner:'Importer / broker',link:'https://www.fws.gov/program/office-of-law-enforcement/declaring-wildlife-import'},
  {id:'us-adcvd',m:['US'],name:'Antidumping / countervailing duty check',plain:'Many China-origin product groups carry AD/CVD orders (e.g. steel racks, wooden cabinets, mattresses, aluminium extrusions, candles). Rates can exceed 100%.',agency:'Commerce / CBP',when:null,kind:'classification',owner:'Importer / broker',link:'https://www.trade.gov/us-antidumping-and-countervailing-duties'},
  {id:'us-state',m:['US'],name:'State rules: Prop 65, state PFAS bans, toxics-in-packaging, state e-waste/battery EPR',plain:'Several states ban PFAS in textiles/cosmetics/food packaging and run battery and packaging EPR programs.',agency:'State agencies',when:['consumer'],kind:'registration',owner:'Importer',link:'https://www.p65warnings.ca.gov/'},
  // ---- Canada: more sectors
  {id:'ca-toys',m:['CA'],name:'Toys Regulations (SOR/2011-17) + Health Canada test reports',plain:'Mechanical, flammability, toxicity and small-parts requirements; keep reports to show on request.',agency:'Health Canada',when:['children'],kind:'cert',owner:'Factory',link:'https://laws-lois.justice.gc.ca/eng/regulations/SOR-2011-17/'},
  {id:'ca-flammability',m:['CA'],name:'Textile Flammability Regulations',plain:'Apparel and bedding must meet CCPSA flammability limits; children\'s sleepwear is stricter.',agency:'Health Canada',when:['textile'],kind:'cert',owner:'Factory',link:'https://www.canada.ca/en/health-canada/services/consumer-product-safety/reports-publications/industry-professionals/industry-guide-flammability-textile-products.html'},
  {id:'ca-phthalates',m:['CA'],name:'Phthalates & lead limits (children\'s products, surface coatings)',plain:'SOR/2016-188 and Surface Coating Materials Regulations.',agency:'Health Canada',when:['children'],kind:'cert',owner:'Factory',link:'https://www.canada.ca/en/health-canada/services/consumer-product-safety.html'},
  {id:'ca-energy',m:['CA'],name:'Energy Efficiency Regulations + EnerGuide (regulated products)',plain:'Lighting, external power supplies and appliances need NRCan energy efficiency reports and marking.',agency:'NRCan',when:['electrical'],kind:'cert',owner:'Factory / importer',link:'https://natural-resources.canada.ca/energy-efficiency/energy-efficiency-regulations/'},
  {id:'ca-battery',m:['CA'],name:'TDG lithium battery requirements (UN 38.3, marks)',plain:'Transportation of Dangerous Goods Regulations mirror UN/IATA rules.',agency:'Transport Canada',when:['battery'],kind:'cert',owner:'Factory',link:'https://tc.canada.ca/en/dangerous-goods/lithium-batteries'},
  {id:'ca-nhp',m:['CA'],name:'Natural Health Product licence (NPN) and site licence',plain:'Supplements/vitamins need an NPN before sale; the importer needs a site licence.',agency:'Health Canada',when:['supplement'],kind:'registration',owner:'Importer',link:'https://www.canada.ca/en/health-canada/services/drugs-health-products/natural-non-prescription.html'},
  {id:'ca-ccpr',m:['CA'],name:'Consumer Chemicals and Containers Regulations (CCCR 2001)',plain:'Hazard symbols, bilingual warnings and child-resistant packaging for consumer chemicals.',agency:'Health Canada',when:['chemical'],kind:'label-warning',owner:'Factory',link:'https://www.canada.ca/en/health-canada/services/consumer-product-safety/legislation-guidelines/acts-regulations/consumer-chemicals-containers-regulations-2001.html'},
  {id:'ca-epr',m:['CA'],name:'Provincial EPR: packaging & paper, electronics, batteries (ON, QC, BC…)',plain:'Register with the provincial producer-responsibility organizations before selling.',agency:'Provincial (RPRA, Éco Entreprises, Recycle BC)',when:['consumer'],kind:'registration',owner:'Importer',link:'https://rpra.ca/'},
  {id:'ca-wood',m:['CA'],name:'CFIA plant protection: ISPM-15 wood packaging, wood products import requirements',plain:'Wood packaging marked ISPM-15; some wood products need permits/AIRS checks.',agency:'CFIA',when:['wood'],kind:'cert',owner:'Factory / forwarder',link:'https://inspection.canada.ca/en/plant-health/forestry'},
  {id:'ca-quebec',m:['CA'],name:'Quebec: French on product, packaging, instructions, warranty, website (Bill 96)',plain:'Since June 2025 French must be at least as prominent; trademarks have narrow exceptions.',agency:'OQLF',when:['consumer'],kind:'label-warning',owner:'Importer / factory',link:'https://www.oqlf.gouv.qc.ca/'},
  // ---- EU: more sectors
  {id:'eu-lvd-emc',m:['EU'],name:'Low Voltage + EMC Directives (mains-powered goods)',plain:'EN 62368-1 / EN 60335 safety and EN 55032/55035 EMC test reports behind the CE mark.',agency:'Market surveillance',when:['electrical'],kind:'cert',owner:'Factory',link:'https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei_en'},
  {id:'eu-red',m:['EU'],name:'Radio Equipment Directive (RED) incl. cybersecurity (Art. 3.3 d/e/f from Aug 2025)',plain:'Radios need RED conformity; connected devices now need cyber-security essentials and USB-C common charger (Dec 2024).',agency:'Market surveillance',when:['radio'],kind:'cert',owner:'Factory',link:'https://single-market-economy.ec.europa.eu/sectors/electrical-and-electronic-engineering-industries-eei/radio-equipment-directive-red_en'},
  {id:'eu-usbc',m:['EU'],name:'Common charger: USB-C and pictogram (phones, tablets, headphones, speakers…)',plain:'From 28 Dec 2024 covered devices must charge via USB-C with the unbundled-charger pictogram.',agency:'RED amendment 2022/2380',when:['radio','battery'],kind:'label-warning',owner:'Factory',link:'https://digital-strategy.ec.europa.eu/en/policies/common-charger'},
  {id:'eu-erp',m:['EU'],name:'Ecodesign & Energy Label (lamps, power supplies, displays, appliances)',plain:'EU energy label + EPREL registration before placing on the market.',agency:'EPREL',when:['electrical'],kind:'registration',owner:'Importer',link:'https://eprel.ec.europa.eu/'},
  {id:'eu-pfas',m:['EU'],name:'REACH restrictions: PFAS (PFOA/PFHxS), lead, cadmium, phthalates, nickel',plain:'Material declarations and tests for restricted substances per Annex XVII.',agency:'ECHA',when:['textile','children','consumer'],kind:'cert',owner:'Factory',link:'https://echa.europa.eu/substances-restricted-under-reach'},
  {id:'eu-scip',m:['EU'],name:'SCIP notification (articles with SVHC > 0.1%)',plain:'Notify ECHA\'s SCIP database before placing on the market.',agency:'ECHA',when:['electrical','consumer'],kind:'registration',owner:'Importer',link:'https://echa.europa.eu/scip'},
  {id:'eu-ppwr',m:['EU'],name:'Packaging & Packaging Waste Regulation (PPWR): labelling, recyclability, minimisation',plain:'Applies from Aug 2026 with harmonised sorting labels and empty-space limits for e-commerce.',agency:'PPWR (EU) 2025/40',when:['consumer'],kind:'label-warning',owner:'Importer / factory',link:'https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-waste_en'},
  {id:'eu-cbam',m:['EU'],name:'CBAM reporting (iron/steel, aluminium, cement, fertiliser goods)',plain:'Importers of covered goods must report embedded emissions; definitive period from 2026 with certificates.',agency:'DG TAXUD',when:null,kind:'filing',owner:'Importer / broker',link:'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en'},
  {id:'eu-eudr',m:['EU'],name:'EU Deforestation Regulation (wood, rubber, coffee, cocoa, soy, palm, cattle)',plain:'Due-diligence statement with geolocation of plots before placing on the market.',agency:'EUDR (EU) 2023/1115',when:['wood','food'],kind:'filing',owner:'Importer',link:'https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en'},
  {id:'eu-cosm',m:['EU'],name:'Cosmetics: PIF, safety assessment, labelling (INCI, PAO, RP address)',plain:'Product Information File and a qualified safety assessor; label in local language.',agency:'Reg. 1223/2009',when:['cosmetic'],kind:'cert',owner:'Importer (RP)',link:'https://single-market-economy.ec.europa.eu/sectors/cosmetics_en'},
  {id:'eu-novel',m:['EU'],name:'Food: novel-food authorisation, additives, contaminants, health claims',plain:'Supplements and foods must comply with EU lists; many Asian ingredients are novel foods.',agency:'EFSA / DG SANTE',when:['food'],kind:'cert',owner:'Importer',link:'https://food.ec.europa.eu/safety/novel-food_en'},
  {id:'eu-ppe',m:['EU'],name:'PPE Regulation (masks, gloves, helmets, eyewear)',plain:'Category-based conformity assessment with notified body involvement for Cat II/III.',agency:'Reg. 2016/425',when:['medical'],kind:'cert',owner:'Factory',link:'https://single-market-economy.ec.europa.eu/sectors/mechanical-engineering/personal-protective-equipment-ppe_en'},
  {id:'eu-marketplace',m:['EU'],name:'Marketplace due diligence (DSA Art. 30/31): trader identity, product compliance info',plain:'Amazon, Temu, Zalando etc. must collect trader ID and compliance evidence; expect requests for RP, DoC and test reports.',agency:'DSA',when:['consumer'],kind:'registration',owner:'Importer',link:'https://digital-strategy.ec.europa.eu/en/policies/digital-services-act-package'},
  // ---- UK: more sectors
  {id:'uk-reach',m:['UK'],name:'UK REACH registration/restrictions (post-Brexit regime)',plain:'Separate from EU REACH; GB-based importer obligations.',agency:'HSE',when:['chemical','textile','consumer'],kind:'cert',owner:'Importer',link:'https://www.hse.gov.uk/reach/'},
  {id:'uk-toys',m:['UK'],name:'Toys (Safety) Regulations 2011 + UKCA/CE',plain:'EN 71 series accepted; UK importer name/address on toy.',agency:'OPSS',when:['children'],kind:'cert',owner:'Factory / importer',link:'https://www.gov.uk/guidance/toys-safety-regulations-2011'},
  {id:'uk-electrical',m:['UK'],name:'Electrical Equipment (Safety) Regs + EMC + Radio Equipment Regs',plain:'UK equivalents of LVD/EMC/RED; UK plug (BS 1363) for mains products.',agency:'OPSS / Ofcom',when:['electrical','radio'],kind:'cert',owner:'Factory',link:'https://www.gov.uk/guidance/electrical-equipment-safety-regulations-2016'},
  {id:'uk-ukca-plug',m:['UK'],name:'BS 1363 UK plug and fuse',plain:'Mains appliances must be fitted with a UK plug with the correct fuse (Plugs and Sockets Regs 1994).',agency:'OPSS',when:['electrical'],kind:'cert',owner:'Factory',link:'https://www.legislation.gov.uk/uksi/1994/1768/contents/made'},
  {id:'uk-epr',m:['UK'],name:'Packaging EPR (pEPR) registration and data reporting',plain:'Producers/importers above thresholds report packaging data and pay fees from 2025.',agency:'DEFRA',when:['consumer'],kind:'registration',owner:'Importer',link:'https://www.gov.uk/guidance/packaging-waste-prepare-for-extended-producer-responsibility'},
  {id:'uk-weee-batt',m:['UK'],name:'WEEE and Batteries producer registration',plain:'Register with a compliance scheme before placing EEE/batteries on the GB market.',agency:'Environment Agency',when:['electrical','battery'],kind:'registration',owner:'Importer',link:'https://www.gov.uk/guidance/electrical-and-electronic-equipment-eee-producer-responsibility'},
  {id:'uk-cosmetic',m:['UK'],name:'UK Cosmetics Regulation: SCPN notification + UK RP',plain:'Notify on the Submit Cosmetic Product Notification service; UK responsible person.',agency:'OPSS',when:['cosmetic'],kind:'registration',owner:'Importer',link:'https://www.gov.uk/guidance/submit-cosmetic-product-notifications'},
  {id:'uk-food',m:['UK'],name:'Food labelling (FIC retained) + FSA import controls',plain:'English labelling, allergens emphasised; some foods need pre-notification via IPAFFS.',agency:'FSA / DEFRA',when:['food'],kind:'label-warning',owner:'Importer',link:'https://www.food.gov.uk/business-guidance/imports-exports'},
  // ---- China as a DESTINATION market (importing into mainland China)
  {id:'cn-hs',m:['CN'],name:'China 13-digit commodity code + CIQ code, import VAT (13%/9%) and consumption tax',plain:'China\'s tariff uses 10-digit HS plus a 3-digit CIQ (inspection) code; VAT applies on duty-paid value.',agency:'GACC',when:null,kind:'classification',owner:'Importer / agent',link:'http://english.customs.gov.cn/'},
  {id:'cn-consignee',m:['CN'],name:'Registered consignee with customs (Customs Registration Code) + import/export rights',plain:'The Chinese buyer must be registered with GACC and hold foreign-trade rights; many foreign sellers use an import agent.',agency:'GACC',when:null,kind:'registration',owner:'Importer (China entity / agent)',link:'http://english.customs.gov.cn/'},
  {id:'cn-ccc',m:['CN'],name:'CCC (China Compulsory Certification) for listed products',plain:'Household electrical appliances, IT equipment, lighting, toys, vehicles parts etc. in the CCC catalogue must be certified and marked before import.',agency:'CNCA / SAMR',when:['electrical','radio','children'],kind:'cert',owner:'Factory / importer',link:'https://www.cnca.gov.cn/'},
  {id:'cn-srrc',m:['CN'],name:'SRRC radio type approval + CTA network access (if cellular)',plain:'Radio transmitters need State Radio Regulation Committee approval and a CMIIT ID on the label.',agency:'MIIT',when:['radio'],kind:'cert',owner:'Factory / importer',link:'https://www.miit.gov.cn/'},
  {id:'cn-label',m:['CN'],name:'Chinese-language label (GB 5296 series instructions, GB 7718 food, GB 18401 textiles)',plain:'Product name, manufacturer/importer, origin, specifications, warnings and instructions in Simplified Chinese per the applicable GB standard.',agency:'SAMR / GACC',when:['consumer'],kind:'label-warning',owner:'Importer / factory',link:'https://www.samr.gov.cn/'},
  {id:'cn-ciq',m:['CN'],name:'Legal inspection & quarantine (法检) for listed commodities',plain:'Goods in the inspection catalogue are examined at import; labels and test reports are checked.',agency:'GACC',when:['consumer','food','children','electrical'],kind:'filing',owner:'Importer / agent',link:'http://english.customs.gov.cn/'},
  {id:'cn-food248',m:['CN'],name:'Overseas food manufacturer registration (GACC Decree 248) + Decree 249 importer filing',plain:'Since 2022 every overseas food facility must be registered with GACC; importers file records and keep traceability.',agency:'GACC',when:['food'],kind:'registration',owner:'Factory + importer',link:'https://www.singlewindow.cn/'},
  {id:'cn-nmpa',m:['CN'],name:'NMPA cosmetics registration/notification (special vs ordinary cosmetics)',plain:'Ordinary cosmetics notified, special-use cosmetics registered; animal-testing exemptions require GMP certificates.',agency:'NMPA',when:['cosmetic'],kind:'registration',owner:'Importer (domestic responsible person)',link:'https://www.nmpa.gov.cn/'},
  {id:'cn-nmpa-device',m:['CN'],name:'NMPA medical device registration (Class I filing, Class II/III registration)',plain:'Medical devices need NMPA approval and a Chinese agent before import.',agency:'NMPA',when:['medical'],kind:'cert',owner:'Importer / agent',link:'https://www.nmpa.gov.cn/'},
  {id:'cn-energy',m:['CN'],name:'China Energy Label (CEL) and China RoHS (SJ/T 11364) marking',plain:'Listed appliances need the energy label; electronics need the RoHS environmental-protection-use-period mark.',agency:'CNIS / MIIT',when:['electrical'],kind:'label-warning',owner:'Factory',link:'https://www.cnis.ac.cn/'},
  {id:'cn-wood',m:['CN'],name:'Quarantine: ISPM-15 wood packaging, plant/animal product permits',plain:'Wood packaging marked; many agricultural products need an import quarantine permit before shipment.',agency:'GACC',when:['wood','food'],kind:'cert',owner:'Factory / importer',link:'http://english.customs.gov.cn/'},
  {id:'cn-cross-border',m:['CN'],name:'Cross-border e-commerce (CBEC) positive list & bonded import option',plain:'B2C sales via Tmall Global/JD Worldwide can use the CBEC regime (lower tax, no CCC/label in some cases) for goods on the positive list.',agency:'MOFCOM / GACC',when:['consumer'],kind:'classification',owner:'Importer / platform',link:'http://www.mofcom.gov.cn/'},
  // ---- agricultural / plant commodities
  {id:'ca-cfia-airs',m:['CA'],name:'CFIA import requirements via AIRS (by HS code, origin and end use)',plain:'AIRS tells you exactly what CFIA needs for this commodity from this country — e.g. phytosanitary certificate, permit, or "no requirements" for processed goods.',agency:'CFIA',when:['food','plant'],kind:'filing',owner:'Importer / broker',link:'https://airs-sari.inspection.gc.ca/'},
  {id:'ca-phyto',m:['CA'],name:'Phytosanitary certificate from origin (plant products, grains, seeds)',plain:'Issued by the exporting country\'s plant-protection organization (China: GACC) — required for many grains, oilseeds and seeds for planting; soybeans for planting need a permit.',agency:'CFIA (Plant Protection Act)',when:['plant'],kind:'cert',owner:'Factory / exporter',link:'https://inspection.canada.ca/en/plant-health/plant-protection-import-requirements'},
  {id:'ca-sfcr-grain',m:['CA'],name:'Safe Food for Canadians licence (if imported as food) + Canada Grain Act grading',plain:'Food-grade soybeans and grains need an SFC licence to import; grain moving into commercial channels is graded under the Canada Grain Act.',agency:'CFIA / CGC',when:['plant'],kind:'registration',owner:'Importer',link:'https://inspection.canada.ca/en/food-licences'},
  {id:'ca-gmo',m:['CA'],name:'Novel food / GM variety authorization (if genetically modified)',plain:'GM soybean varieties must be authorized by Health Canada and CFIA; documentation of variety status may be requested.',agency:'Health Canada / CFIA',when:['plant'],kind:'cert',owner:'Exporter',link:'https://inspection.canada.ca/en/plant-varieties/plants-novel-traits'},
  {id:'us-aphis-ppq',m:['US'],name:'USDA APHIS plant import requirements (ACIR) + phytosanitary certificate',plain:'Check the Agricultural Commodity Import Requirements database for this commodity and origin; many grains/seeds need a phytosanitary certificate or permit.',agency:'USDA APHIS',when:['plant'],kind:'cert',owner:'Exporter / importer',link:'https://acir.aphis.usda.gov/'},
  {id:'eu-phyto',m:['EU'],name:'EU plant health: phytosanitary certificate + TRACES/CHED-PP pre-notification',plain:'Regulation (EU) 2016/2031 — plants and plant products need a phytosanitary certificate and border-control-post checks.',agency:'DG SANTE / TRACES',when:['plant'],kind:'cert',owner:'Exporter / importer',link:'https://food.ec.europa.eu/plants/plant-health-and-biosecurity_en'},
  {id:'uk-phyto',m:['UK'],name:'UK plant health: phytosanitary certificate + IPAFFS notification',plain:'Regulated plant products need a certificate and pre-notification; checks at a border control post.',agency:'DEFRA / APHA',when:['plant'],kind:'cert',owner:'Exporter / importer',link:'https://www.gov.uk/guidance/import-plants-and-plant-products-from-non-eu-countries-to-great-britain'}
];

const MARKETS=[['US','United States'],['CA','Canada'],['EU','European Union'],['UK','United Kingdom'],['CN','China (importing into)']];
/* input: a description string, or {desc, attrs}. Attributes override keyword derivation. */
function requirementsFor(input, dest, mode){
  const desc=typeof input==='string'?input:(input&&input.desc)||'';
  const attrs={...deriveAttrs(desc),...((input&&input.attrs)||{})};
  return CATALOG.filter(r=>r.m.includes(dest)&&(!r.modes||r.modes.includes(mode))&&(!r.when||r.when.some(a=>attrs[a])))
    .map(r=>({...r,because:r.when?r.when.filter(a=>attrs[a]).map(a=>(ATTRS.find(x=>x[0]===a)||[a,a])[1]):['applies to every shipment']}));
}
/* how deep our rules go for a given product + market: an honest signal, not a guarantee */
function coverage(input, dest){
  const desc=typeof input==='string'?input:(input&&input.desc)||'';
  const attrs={...deriveAttrs(desc),...((input&&input.attrs)||{})};
  const deep={US:['electrical','radio','battery','children','foodContact','cosmetic','wood','consumer','textile','chemical','food'],EU:['electrical','radio','children','consumer','battery','textile','cosmetic','food','chemical','wood'],UK:['electrical','consumer','radio','children','battery','textile','cosmetic','chemical','food'],CA:['consumer','children','electrical','radio','textile','battery','chemical','food','cosmetic'],CN:['electrical','radio','consumer','food','cosmetic','medical']};
  const partial={US:['medical'],EU:['medical','foodContact'],UK:['medical','wood','foodContact'],CA:['medical','wood','foodContact'],CN:['children','battery','textile','wood','chemical','foodContact']};
  const on=Object.keys(attrs).filter(k=>attrs[k]&&k!=='consumer');
  if(!on.length)return {level:'partial',note:'No product attributes detected — add them on the product so the right rules apply.'};
  const thin=on.filter(a=>!(deep[dest]||[]).includes(a));
  if(!thin.length)return {level:'good',note:`Core rules for ${on.join(', ')} are covered for ${dest}. Sector-specific standards still need broker confirmation.`};
  return {level:thin.every(a=>(partial[dest]||[]).includes(a))?'partial':'thin',note:`Coverage for ${thin.join(', ')} in ${dest} is a starting point only — confirm with a broker or test lab.`};
}

/* ---------- classification (keyword prototype) ---------- */
function classify(w){
  const t=(w.desc||'').toLowerCase(); const us=w.dest==='US'||w.dest==='CA'; const cn=w.dest==='CN';
  const pick=(code,text,why,duty,conf)=>({code:cn?code.replace(/\.|\s/g,'').slice(0,8)+'00':code,text,why,duty:cn?'MFN rate + 13% VAT (check CBEC regime)':duty,conf});
  if(/soy ?beans?/.test(t))return pick(us?'1201.90.00':'1201 90 00','Soya beans, whether or not broken (other than seed)','Heading 1201 covers soya beans; .90 is other than for sowing. Seed for planting is 1201.10.',us?(w.dest==='CA'?'Free (MFN)':'Free (general rate); check Sec. 301 for China origin'):'0% + VAT',92);
  if(/\brice\b/.test(t))return pick(us?'1006.30':'1006 30','Rice, semi-milled or wholly milled','Heading 1006; subheading by degree of milling.',us?'see schedule':'TRQ / see TARIC',70);
  if(/\bgreen coffee|coffee beans\b/.test(t))return pick(us?'0901.11.00':'0901 11 00','Coffee, not roasted, not decaffeinated','Heading 0901.',us?'Free':'0%',88);
  if(/\btea\b/.test(t))return pick(us?'0902.30':'0902 30','Black tea, packages ≤ 3 kg','Heading 0902 by type and package size.',us?'Free':'0%',75);
  if(/peanut|groundnut/.test(t))return pick(us?'1202.42':'1202 42','Groundnuts, shelled','Heading 1202.',us?'TRQ — check':'0%',72);
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

const api={FIELDS,COMPARE,norm,COSTS,impact,impactRange,money,CATALOG,requirementsFor,coverage,classify,STAGES,ATTRS,CATEGORIES,deriveAttrs,MARKETS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
Object.assign(root,api);
})(typeof globalThis!=='undefined'?globalThis:this);
