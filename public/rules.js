/* ClearWay rules engine — shared by browser and server.
   Keyword-based prototype rules. In production: HTS/TARIC schedule + CBP CROSS / BTI rulings via API,
   with a licensed broker in the loop. */
(function(root){
const FIELDS=[['desc','Description'],['qty','Quantity (units)'],['cartons','Cartons'],['weight','Gross weight'],['value','Value / currency'],['incoterm','Incoterm'],['consignee','Consignee'],['origin','Country of origin'],['hs','HS code']];
const COMPARE=new Set(['desc','qty','cartons','weight','consignee']);
function norm(v){return (v||'').toLowerCase().replace(/[.,\s]/g,'');}

/* ---- classification + regulatory rules (keyword prototype) ---- */
function classify(w){
  const t=w.desc.toLowerCase(); const us=w.dest==='US';
  const pick=(code,text,why,duty,conf)=>({code,text,why,duty,conf});
  if(/scale/.test(t))return pick(us?'8423.10.00':'8423 10 10','Personal / household weighing machines','Heading 8423 covers weighing machinery; subheading .10 is household scales regardless of electronic features (cf. CBP ruling N303xxx on digital kitchen scales).', us?'0% + 25% Sec. 301 (List 3) + IEEPA':'1.7% + VAT',91);
  if(/charger|power adapter|adapter/.test(t))return pick(us?'8504.40.95':'8504 40 55','Static converters (power supplies)','USB-C chargers are rectifiers/static converters of heading 8504.', us?'0% + 25% Sec. 301':'0% + VAT',93);
  if(/plush|stuffed/.test(t))return pick(us?'9503.00.00':'9503 00 41','Toys — stuffed, representing animals','Heading 9503 covers toys; stuffed toys fall under the specific subheading.', us?'0% + 25% Sec. 301':'0% + VAT',95);
  if(/puzzle|wooden toy|blocks/.test(t))return pick(us?'9503.00.00':'9503 00 61','Toys — wooden puzzles','Puzzles of all kinds are classified in 9503 per Chapter 95 notes.', us?'0% + 25% Sec. 301':'0% + VAT',90);
  if(/serum|cream|lotion|cosmetic/.test(t))return pick(us?'3304.99.50':'3304 99 00','Beauty / skin-care preparations','Skin-care preparations other than medicaments → 3304.99.', us?'0%':'0% + VAT',92);
  if(/candle/.test(t))return pick(us?'3406.00.00':'3406 00 00','Candles, tapers and the like','Primary function is a candle; fragrance does not shift it to 3307 unless marketed as a room-perfuming preparation.', us?'0% (AD/CVD check: petroleum wax candles from China)':'0% + VAT',72);
  if(/bottle|tumbler/.test(t))return pick(us?'9617.00.10':'9617 00 00','Vacuum flasks / insulated vessels','Double-walled stainless bottles → 9617 if vacuum-insulated; otherwise 7323.93.', us?'7.2% + Sec. 232 steel derivative + 301':'6.7% + VAT',80);
  if(/mat|yoga/.test(t))return pick(us?'9506.91.00':'9506 91 90','Articles for general physical exercise','Yoga mats are exercise equipment of 9506.91 (cf. multiple NY rulings).', us?'4.6% + 25% Sec. 301':'2.7% + VAT',94);
  if(/bluetooth|speaker|headphone|earbud/.test(t))return pick(us?'8518.22.00':'8518 22 00','Loudspeakers / headphones','Reception apparatus with primary function of sound reproduction.', us?'0% + 25% Sec. 301':'0% + VAT',84);
  if(/dinner|plate|bowl|tableware/.test(t))return pick(us?'4419.19.90':'4419 19 00','Tableware and kitchenware of bamboo','Chapter 44 note: bamboo tableware → 4419.1x.', us?'3.2% + 25% Sec. 301':'0% + VAT',86);
  return pick(us?'—':'—','Needs classification review','Not enough detail in the description to classify confidently. Add material, function, and how it is marketed.','unknown',40);
}
function regFor(w){
  const t=w.desc.toLowerCase(); const out=[]; const haveCerts=!!(w.files.certs&&w.files.certs.length); const haveArt=!!(w.files.art&&w.files.art.length);
  const add=(name,why,have)=>out.push({name,why,have});
  const elec=/bluetooth|wireless|usb|charger|electronic|led|digital|battery|speaker|wifi/.test(t);
  const kids=/kid|toy|plush|puzzle|children|baby|infant/.test(t);
  const cosm=/serum|cream|lotion|cosmetic|shampoo|soap/.test(t);
  const food=/dinner|plate|bowl|bottle|kitchen|food|cup|utensil/.test(t);
  const batt=/battery|cr2032|lithium|rechargeable|bluetooth/.test(t);
  const wood=/bamboo|wood/.test(t);
  if(w.dest==='US'){
    if(elec)add('FCC SDoC + Part 15 test report','Any product with a radio or digital circuitry.',haveCerts);
    if(batt)add('Lithium battery declaration (UN3090/UN3091)','Required on the shipper\'s declaration; cells in equipment still need PI 970.',false);
    if(kids){add('CPSC Children\'s Product Certificate (CPC)','With third-party test reports from a CPSC-accepted lab.',haveCerts);add('Permanent tracking label on product & packaging','CPSIA §103.',haveArt);add('Small-parts / age-grade warning','If any small parts; packaging must not depict children under 3.',haveArt);}
    if(cosm){add('FDA facility registration + product listing (MoCRA)','',haveCerts);add('FDA product code on commercial invoice','Prevents automatic review hold.',false);}
    if(food)add('FDA food-contact declaration (21 CFR 175–178)','Supplier letter of guarantee.',haveCerts);
    if(wood)add('Lacey Act declaration (PPQ 505)','Genus/species + harvest country.',false);
    add('Country-of-origin marking, permanent & conspicuous','19 CFR 134.',haveArt);
    add('ISF (10+2) data from supplier','Manufacturer, ship-to, HTS, container stuffing location.',w.mode!=='Ocean');
    add('Importer of record + continuous bond','Who is the IOR? Required for formal entry since de minimis ended.',true);
    if(/cotton|polysilicon|tomato|xinjiang/.test(t))add('UFLPA supply-chain tracing documentation','High-risk commodity.',false);
  } else {
    if(elec){add('CE Declaration of Conformity + technical file','LVD / EMC / RED as applicable.',haveCerts);add('WEEE producer registration in destination state','',false);}
    if(kids)add('EN 71 test reports + CE marking','Toy Safety Directive.',haveCerts);
    if(cosm)add('CPNP notification + Responsible Person','EU Cosmetics Regulation 1223/2009.',false);
    if(w.dest==='EU'){add('GPSR Responsible Person named on product/packaging','Reg. (EU) 2023/988 Art. 16 — enforced by marketplaces and customs.',haveArt);add('Packaging EPR registration (e.g. LUCID DE)','',false);add('EORI + import VAT / IOSS arrangement','',true);add('ICS2 ENS data to carrier','Pre-arrival safety & security.',w.mode==='Express');}
    if(w.dest==='UK'){add('UKCA marking / UK Responsible Person','Where applicable.',haveCerts);add('GB EORI + import VAT','',true);}
    add('REACH / RoHS declarations','SVHC above 0.1% w/w.',haveCerts);
    if(/candle|fragrance|scent/.test(t))add('CLP hazard labelling + SDS','',false);
  }
  return out;
}
const api={FIELDS,COMPARE,norm,classify,regFor};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
Object.assign(root,api);
})(typeof globalThis!=='undefined'?globalThis:this);
