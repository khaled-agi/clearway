/* ClearWay map — dependency-free SVG route map (equirectangular). Ports, airports, arcs, progress dots. */
(function(root){
const PORTS={ // code: [name, country, lat, lon, kind]
  CNSHA:['Shanghai','CN',31.23,121.47,'sea'],CNNGB:['Ningbo','CN',29.87,121.55,'sea'],CNYTN:['Yantian (Shenzhen)','CN',22.58,114.27,'sea'],CNTAO:['Qingdao','CN',36.07,120.38,'sea'],CNXMN:['Xiamen','CN',24.48,118.09,'sea'],CNTSN:['Tianjin','CN',39.0,117.7,'sea'],HKHKG:['Hong Kong','HK',22.3,114.17,'sea'],
  VNSGN:['Ho Chi Minh (Cat Lai)','VN',10.76,106.7,'sea'],VNHPH:['Haiphong','VN',20.86,106.68,'sea'],THLCH:['Laem Chabang','TH',13.08,100.88,'sea'],IDJKT:['Jakarta (Tanjung Priok)','ID',-6.1,106.88,'sea'],MYPKG:['Port Klang','MY',3.0,101.4,'sea'],SGSIN:['Singapore','SG',1.26,103.84,'sea'],
  INNSA:['Nhava Sheva (Mumbai)','IN',18.95,72.95,'sea'],INMAA:['Chennai','IN',13.08,80.29,'sea'],BDCGP:['Chittagong','BD',22.33,91.83,'sea'],PKKHI:['Karachi','PK',24.85,66.99,'sea'],LKCMB:['Colombo','LK',6.93,79.85,'sea'],KHKOS:['Sihanoukville','KH',10.63,103.5,'sea'],
  KRPUS:['Busan','KR',35.1,129.04,'sea'],TWKHH:['Kaohsiung','TW',22.62,120.28,'sea'],JPTYO:['Tokyo','JP',35.65,139.77,'sea'],
  TRIST:['Istanbul (Ambarli)','TR',40.97,28.68,'sea'],TRMER:['Mersin','TR',36.8,34.63,'sea'],AEJEA:['Jebel Ali','AE',25.01,55.06,'sea'],EGPSD:['Port Said','EG',31.26,32.3,'sea'],
  DEHAM:['Hamburg','DE',53.55,9.99,'sea'],NLRTM:['Rotterdam','NL',51.92,4.48,'sea'],BEANR:['Antwerp','BE',51.22,4.4,'sea'],FRLEH:['Le Havre','FR',49.49,0.11,'sea'],ESVLC:['Valencia','ES',39.47,-0.33,'sea'],ITGOA:['Genoa','IT',44.41,8.93,'sea'],GRPIR:['Piraeus','GR',37.94,23.65,'sea'],PLGDN:['Gdansk','PL',54.35,18.65,'sea'],
  GBFXT:['Felixstowe','GB',51.96,1.35,'sea'],GBSOU:['Southampton','GB',50.9,-1.4,'sea'],GBLGP:['London Gateway','GB',51.5,0.47,'sea'],
  USLAX:['Los Angeles','US',33.74,-118.27,'sea'],USLGB:['Long Beach','US',33.75,-118.19,'sea'],USOAK:['Oakland','US',37.8,-122.32,'sea'],USSEA:['Seattle / Tacoma','US',47.6,-122.34,'sea'],USNYC:['New York / New Jersey','US',40.67,-74.15,'sea'],USSAV:['Savannah','US',32.08,-81.1,'sea'],USHOU:['Houston','US',29.73,-95.27,'sea'],USCHS:['Charleston','US',32.78,-79.93,'sea'],USMIA:['Miami','US',25.77,-80.17,'sea'],
  CAVAN:['Vancouver','CA',49.29,-123.11,'sea'],CAPRR:['Prince Rupert','CA',54.31,-130.32,'sea'],CAMTR:['Montreal','CA',45.5,-73.55,'sea'],CAHAL:['Halifax','CA',44.65,-63.57,'sea'],
  MXZLO:['Manzanillo','MX',19.05,-104.32,'sea'],BRSSZ:['Santos','BR',-23.96,-46.33,'sea'],AUSYD:['Sydney','AU',-33.86,151.2,'sea'],AUMEL:['Melbourne','AU',-37.82,144.95,'sea'],ZADUR:['Durban','ZA',-29.87,31.02,'sea'],NGLOS:['Lagos','NG',6.45,3.4,'sea'],
  // airports
  PVG:['Shanghai Pudong','CN',31.14,121.8,'air'],SZX:['Shenzhen Bao\'an','CN',22.64,113.81,'air'],CAN:['Guangzhou','CN',23.39,113.3,'air'],HKG:['Hong Kong','HK',22.31,113.91,'air'],ICN:['Seoul Incheon','KR',37.46,126.44,'air'],NRT:['Tokyo Narita','JP',35.77,140.39,'air'],SGN:['Ho Chi Minh','VN',10.82,106.65,'air'],HAN:['Hanoi','VN',21.22,105.81,'air'],BKK:['Bangkok','TH',13.69,100.75,'air'],DEL:['Delhi','IN',28.56,77.1,'air'],BOM:['Mumbai','IN',19.09,72.87,'air'],DAC:['Dhaka','BD',23.84,90.4,'air'],IST:['Istanbul','TR',41.26,28.74,'air'],DXB:['Dubai','AE',25.25,55.36,'air'],
  FRA:['Frankfurt','DE',50.04,8.56,'air'],AMS:['Amsterdam','NL',52.31,4.76,'air'],CDG:['Paris CDG','FR',49.01,2.55,'air'],LGG:['Liège','BE',50.64,5.44,'air'],LHR:['London Heathrow','GB',51.47,-0.45,'air'],EMA:['East Midlands','GB',52.83,-1.33,'air'],
  LAX:['Los Angeles','US',33.94,-118.41,'air'],ORD:['Chicago O\'Hare','US',41.97,-87.9,'air'],JFK:['New York JFK','US',40.64,-73.78,'air'],MIA:['Miami','US',25.79,-80.29,'air'],DFW:['Dallas','US',32.9,-97.04,'air'],YYZ:['Toronto','CA',43.68,-79.63,'air'],YVR:['Vancouver','CA',49.19,-123.18,'air'],MEX:['Mexico City','MX',19.44,-99.07,'air'],
};
const COUNTRIES={CN:'China',HK:'Hong Kong',VN:'Vietnam',TH:'Thailand',ID:'Indonesia',MY:'Malaysia',SG:'Singapore',IN:'India',BD:'Bangladesh',PK:'Pakistan',LK:'Sri Lanka',KH:'Cambodia',KR:'South Korea',TW:'Taiwan',JP:'Japan',TR:'Türkiye',AE:'UAE',EG:'Egypt',DE:'Germany',NL:'Netherlands',BE:'Belgium',FR:'France',ES:'Spain',IT:'Italy',GR:'Greece',PL:'Poland',GB:'United Kingdom',US:'United States',CA:'Canada',MX:'Mexico',BR:'Brazil',AU:'Australia',ZA:'South Africa',NG:'Nigeria'};
const MARKET_COUNTRIES={US:['US'],CA:['CA'],EU:['DE','NL','BE','FR','ES','IT','GR','PL'],UK:['GB']};
const DEFAULT_PORT={ // [origin country][market][mode]
  sea:{US:'USLAX',CA:'CAVAN',EU:'NLRTM',UK:'GBFXT'}, air:{US:'ORD',CA:'YYZ',EU:'FRA',UK:'LHR'},
  originSea:{CN:'CNYTN',HK:'HKHKG',VN:'VNSGN',TH:'THLCH',ID:'IDJKT',MY:'MYPKG',IN:'INNSA',BD:'BDCGP',PK:'PKKHI',KH:'KHKOS',KR:'KRPUS',TW:'TWKHH',JP:'JPTYO',TR:'TRIST',AE:'AEJEA',EG:'EGPSD',DE:'DEHAM',NL:'NLRTM',PL:'PLGDN',IT:'ITGOA',ES:'ESVLC',MX:'MXZLO',BR:'BRSSZ',US:'USLAX',GB:'GBFXT'},
  originAir:{CN:'PVG',HK:'HKG',VN:'SGN',TH:'BKK',IN:'DEL',BD:'DAC',KR:'ICN',JP:'NRT',TR:'IST',AE:'DXB',DE:'FRA',NL:'AMS',FR:'CDG',GB:'LHR',US:'ORD',MX:'MEX'},
};
function portsFor(country,mode){const kind=mode==='Ocean'?'sea':'air';return Object.entries(PORTS).filter(([,p])=>p[1]===country&&p[4]===kind).map(([c,p])=>[c,p[0]]);}
function portsForMarket(market,mode){const kind=mode==='Ocean'?'sea':'air';const cs=MARKET_COUNTRIES[market]||[market];return Object.entries(PORTS).filter(([,p])=>cs.includes(p[1])&&p[4]===kind).map(([c,p])=>[c,p[0]+' ('+p[1]+')']);}
function defaultOrigin(country,mode){return mode==='Ocean'?(DEFAULT_PORT.originSea[country]||'CNYTN'):(DEFAULT_PORT.originAir[country]||'PVG');}
function defaultDest(market,mode){return mode==='Ocean'?DEFAULT_PORT.sea[market]:DEFAULT_PORT.air[market];}

/* projection: equirectangular, lon shifted so the Pacific is in the middle when most routes cross it */
const LAT_MAX=72,LAT_MIN=-22;
function makeProj(W,H,center){const cx=center==null?-150:center;
  return function(lat,lon){let x=lon-cx;x=((x+540)%360)-180;return [ (x+180)/360*W, (LAT_MAX-lat)/(LAT_MAX-LAT_MIN)*H ];};}
/* great-circle-ish arc as a quadratic curve lifted toward the pole */
function arcPath(p1,p2,lift){const [x1,y1]=p1,[x2,y2]=p2;const mx=(x1+x2)/2,my=(y1+y2)/2;const d=Math.hypot(x2-x1,y2-y1);const cy=my-Math.min(d*0.28,120)*(lift==null?1:lift);return {d:`M${x1},${y1} Q${mx},${cy} ${x2},${y2}`,ctrl:[mx,cy]};}
function pointOnQuad(p1,c,p2,t){const x=(1-t)*(1-t)*p1[0]+2*(1-t)*t*c[0]+t*t*p2[0];const y=(1-t)*(1-t)*p1[1]+2*(1-t)*t*c[1]+t*t*p2[1];return [x,y];}

/* draw: routes = [{id,label,sub,from:'CNYTN',to:'USLAX',progress:0..1,status:'good|warn|crit|done'}] */
function drawMap(routes,opts){
  opts=opts||{};const W=opts.width||960,H=opts.height||440;
  // choose centre so that all points fit nicely: use mean of longitudes
  // centre on the circular mean of each route's short-arc midpoint, so trans-Pacific routes read west→east
  let sx=0,sy=0;routes.forEach(r=>{const a=PORTS[r.from],b=PORTS[r.to];if(!a||!b)return;const diff=((b[3]-a[3]+540)%360)-180;const mid=(a[3]+diff/2)*Math.PI/180;sx+=Math.cos(mid);sy+=Math.sin(mid);});
  const center=opts.center!=null?opts.center:(sx||sy?Math.atan2(sy,sx)*180/Math.PI:30);
  const proj=makeProj(W,H,center);
  let g=`<svg class="rmap" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Shipment routes">`;
  g+=`<defs><pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d9d8d0"/></pattern><filter id="glow"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  g+=`<rect width="${W}" height="${H}" fill="#f3f3ef"/><rect width="${W}" height="${H}" fill="url(#dots)"/>`;
  for(let lat=-15;lat<=60;lat+=15){const [,y]=proj(lat,0);g+=`<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="#e4e3dc" stroke-width="1"/>`;}
  for(let lon=-180;lon<180;lon+=30){const [x]=proj(0,lon);g+=`<line y1="0" y2="${H}" x1="${x}" x2="${x}" stroke="#e8e7e0" stroke-width="1"/>`;}
  const col={good:'#0ca30c',warn:'#fab219',crit:'#d03b3b',done:'#898781',plan:'#5b2d86'};
  const seen={};
  routes.forEach(r=>{const a=PORTS[r.from],b=PORTS[r.to];if(!a||!b)return;const p1=proj(a[2],a[3]),p2=proj(b[2],b[3]);
    // if the arc would wrap around the edge, skip the lift
    const {d,ctrl}=arcPath(p1,p2);const c=col[r.status]||col.plan;
    g+=`<path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" stroke-opacity=".55" stroke-dasharray="${r.status==='done'?'3 4':'none'}"/>`;
    seen[r.from]=p1;seen[r.to]=p2;
    if(r.progress!=null&&r.progress>0&&r.progress<1){const [x,y]=pointOnQuad(p1,ctrl,p2,r.progress);g+=`<g class="ship" data-id="${r.id}" transform="translate(${x} ${y})"><circle r="9" fill="${c}" fill-opacity=".18"/><circle r="4.5" fill="${c}" filter="url(#glow)"/></g>`;}
  });
  const placed=[];
  Object.entries(seen).sort((a,b)=>a[1][1]-b[1][1]).forEach(([code,[x,y]])=>{const p=PORTS[code];let ly=y+4;for(let i=0;i<6;i++){if(!placed.some(q=>Math.abs(q[0]-x)<110&&Math.abs(q[1]-ly)<12))break;ly+=12;}placed.push([x,ly]);
    g+=`<g class="port"><circle cx="${x}" cy="${y}" r="3.5" fill="#0b0b0b"/>${ly!==y+4?`<line x1="${x}" y1="${y}" x2="${x+6}" y2="${ly-4}" stroke="#b5b4ac"/>`:''}<text x="${x+8}" y="${ly}" font-size="11" fill="#52514e" font-family="system-ui,sans-serif" paint-order="stroke" stroke="#f3f3ef" stroke-width="3">${p[0].replace(/ \(.*\)/,'')}</text></g>`;});
  g+=`</svg>`;return g;
}
const api={PORTS,COUNTRIES,MARKET_COUNTRIES,portsFor,portsForMarket,defaultOrigin,defaultDest,drawMap};
if(typeof module!=='undefined'&&module.exports)module.exports=api;Object.assign(root,api);
})(typeof globalThis!=='undefined'?globalThis:this);
