/*
 * Modul: satelitsko praćenje usjeva (Sentinel-2, Copernicus) po poljoprivrednim parcelama.
 * Podatke priprema .github/workflows/satelit.yml i sprema ih na granu 'satelit':
 *   stanje.geojson (sažetak tekuće sezone), p/<k>.json (nizovi po parceli), zone.png/.json (zone unutar parcela).
 * Preporuke se izvode automatski iz NDVI (bujnost) i NDMI (voda u biljci), jezikom poljoprivrednika.
 */
(function () {
  'use strict';
  const BAZA = 'https://raw.githubusercontent.com/iplascak/web-gis-bilje/satelit/';
  const MJ = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
  let stanje = null, el = null, sazetak = null;
  const paketi = {};

  // CRC32 (isti ključ kao u scripts/satelit/zbroj.py)
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (s) => { let c = 0xFFFFFFFF; for (const b of new TextEncoder().encode(s)) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const datumIzDoy = (g, d) => { const x = new Date(Date.UTC(g, 0, d)); return x.getUTCDate() + '. ' + MJ[x.getUTCMonth()] + '.'; };
  const zaok = (x, n = 2) => (x == null || isNaN(x)) ? '–' : Number(x).toFixed(n).replace('.', ',');

  async function nizParcele(id) {
    const k = crc32(id) % 64;
    if (!paketi[k]) paketi[k] = fetch(BAZA + 'p/' + k + '.json').then(o => o.json()).catch(() => ({}));
    return (await paketi[k])[id] || {};
  }

  function interp(obs, d) {
    if (!obs || !obs.length || d < obs[0][0] - 15 || d > obs[obs.length - 1][0] + 15) return null;
    for (let i = 1; i < obs.length; i++) if (obs[i][0] >= d) { const [x0, y0] = obs[i - 1], [x1, y1] = obs[i]; return x1 === x0 ? y1 : y0 + (y1 - y0) * (d - x0) / (x1 - x0); }
    return obs[obs.length - 1][1];
  }
  const medijan = (a) => { const b = a.filter(x => x != null).sort((p, q) => p - q); return b.length ? b[Math.floor(b.length / 2)] : null; };

  // ---------- automatsko tumačenje ----------
  function tumacenje(niz, p) {
    const god = Object.keys(niz).map(Number).sort();
    const tek = sazetak ? sazetak.tekuca : god[god.length - 1];
    const obs = niz[tek] || [];
    const proslo = god.filter(g => g !== tek);
    const s = [];
    // tipični vrh sezone
    const vrhovi = proslo.map(g => niz[g].filter(o => o[0] > 60 && o[0] < 300).reduce((m, o) => o[1] > m[1] ? o : m, [0, -1])).filter(v => v[1] > 0.3);
    const vrhDoy = medijan(vrhovi.map(v => v[0])), vrhVr = medijan(vrhovi.map(v => v[1]));
    if (!obs.length) {
      s.push(['info', 'Nema čiste snimke ove sezone', 'Parcela je na snimkama ove godine bila pod oblacima ili snimke još nisu obrađene.']);
      return { s, vrhDoy, vrhVr, tek };
    }
    const [d, nd, nm, sd] = obs[obs.length - 1];
    const mj = new Date(Date.UTC(tek, 0, d)).getUTCMonth() + 1;
    const uobicajeno = medijan(proslo.map(g => interp(niz[g], d)));
    const vegetacija = mj >= 4 && mj <= 9;
    if (uobicajeno != null && vegetacija) {
      const r = nd - uobicajeno;
      if (nd < 0.3 && uobicajeno < 0.3) s.push(['info', 'Tlo je trenutno bez usjeva ili usjev tek niče', 'Zelene mase gotovo nema – uobičajeno nakon žetve, prije nicanja ili kod golog tla.']);
      else if (r <= -0.15) s.push(['upozorenje', 'Usjev je osjetno slabiji nego obično u ovo doba', 'Bujnost ' + zaok(nd) + ' prema uobičajenih ' + zaok(uobicajeno) + ' za ovaj datum. Mogući uzroci: kasnija sjetva ili druga kultura nego prethodnih godina, manjak vode ili dušika, bolest ili šteta. Obiđite parcelu i usporedite slabije i jače dijelove.']);
      else if (r <= -0.07) s.push(['oprez', 'Usjev je nešto slabiji nego obično', 'Bujnost ' + zaok(nd) + ' prema uobičajenih ' + zaok(uobicajeno) + '. Ako je sjetva bila kasnija, to je očekivano; inače provjerite ishranu i vlagu.']);
      else if (r >= 0.07) s.push(['dobro', 'Usjev je bujniji nego obično', 'Bujnost ' + zaok(nd) + ' prema uobičajenih ' + zaok(uobicajeno) + '. Dobar znak; u gustom sklopu pazite na polijeganje i bolesti lista.']);
      else s.push(['dobro', 'Usjev je u uobičajenom stanju za ovo doba godine', 'Bujnost ' + zaok(nd) + ', što odgovara prosjeku prethodnih sezona na ovoj parceli.']);
    } else if (!vegetacija) {
      const ovaj = obs.filter(o => o[0] >= 90 && o[0] <= 280).reduce((m, o) => o[1] > m[1] ? o : m, [0, -1]);
      if (ovaj[1] > 0 && vrhVr != null) {
        const r = ovaj[1] - vrhVr;
        const ocjena = r <= -0.15 ? ['upozorenje', 'Ova sezona bila je osjetno slabija nego inače'] : r <= -0.07 ? ['oprez', 'Ova sezona bila je nešto slabija nego inače'] :
          r >= 0.07 ? ['dobro', 'Ova sezona bila je bolja nego inače'] : ['dobro', 'Ova sezona bila je uobičajena'];
        s.push([ocjena[0], ocjena[1], 'Najveća bujnost ' + zaok(ovaj[1]) + ' (' + datumIzDoy(tek, ovaj[0]) + ') prema uobičajenih ' + zaok(vrhVr) +
          ' u prethodnim sezonama. Razlika može biti i zbog druge kulture u plodoredu – usporedite s onim što ste sijali.']);
      }
      s.push(['info', 'Izvan glavne vegetacije', 'Zadnja čista snimka ' + datumIzDoy(tek, d) + ' – bujnost ' + zaok(nd) + (nd >= 0.35 ? ' (ozimi usjev ili pokrov je nikao).' : ' (tlo uglavnom bez zelenog pokrova).')]);
    }
    // voda u biljci
    if (mj >= 5 && mj <= 8 && nd > 0.45) {
      if (nm < 0.05) s.push(['upozorenje', 'Biljke pokazuju manjak vode', 'Pokazatelj vode u listu (NDMI ' + zaok(nm) + ') je nizak uz razvijen usjev. Ako navodnjavate, ova parcela je kandidat; provjerite i bilancu vode u vremenskoj prognozi.']);
      else if (nm < 0.15) s.push(['oprez', 'Voda u biljci je na granici', 'NDMI ' + zaok(nm) + ' – usjev još nije u stresu, ali bez kiše u sljedećim danima mogao bi biti.']);
    }
    // nagli pad
    if (obs.length >= 2) {
      const [d0, n0] = obs[obs.length - 2];
      if (d - d0 <= 25 && n0 - nd >= 0.25 && mj >= 5 && mj <= 9) s.push(['oprez', 'Nagli pad zelene mase', 'Između ' + datumIzDoy(tek, d0) + ' i ' + datumIzDoy(tek, d) + ' bujnost je pala s ' + zaok(n0) + ' na ' + zaok(nd) + '. Ako niste kosili ili žanjeli, moguća je šteta (tuča, poplava, bolest) – dokumentirajte stanje fotografijama.']);
    }
    // neujednačenost i zone
    if (vegetacija && nd > 0.4 && sd / nd > 0.2) s.push(['oprez', 'Parcela je neujednačena', 'Zelena masa se jako razlikuje unutar parcele. Uključite sloj „Zone unutar parcela” i obiđite slabije dijelove.']);
    if (p.zona_slabija_pct >= 15) s.push(['info', 'Dio parcele godinama daje slabiji usjev', 'Oko ' + p.zona_slabija_pct + ' % parcele je u svim sezonama slabiji od ostatka (crveno na sloju „Zone unutar parcela”). Analiza tla na tom dijelu i prilagođena gnojidba ili sjetva mogu smanjiti troškove i izjednačiti prinos.']);
    // golo tlo zimi
    const zima = (niz[tek] || []).filter(o => o[0] < 60).concat((niz[tek - 1] || []).filter(o => o[0] > 335));
    if (zima.length >= 2 && zima.filter(o => o[1] < 0.25).length / zima.length > 0.7) s.push(['info', 'Zimi je tlo bilo bez pokrova', 'Pokrovni usjevi ili ozimi usjevi štite tlo od erozije i ispiranja dušika. Provjerite mogućnosti u eko-shemama Zajedničke poljoprivredne politike.']);
    // usporedba s parcelama iste (procijenjene) kulture
    if (p.kultura_sat && p.percentil_kulture != null && p.kultura_kod !== 'N' && p.kultura_kod !== 'X') {
      const pc = p.percentil_kulture, k = p.kultura_sat.replace(' (vjerojatno)', '');
      if (pc <= 25) s.push(['oprez', 'Slabija od većine parcela s istom kulturom', 'Ove sezone procijenjena kultura je ' + k + '. Među ' + p.n_iste_kulture + ' takvih parcela u općini ova je po najvećoj bujnosti u donjih ' + Math.max(pc, 1) + ' %. Usporedite sortu, rok sjetve, gnojidbu i vodu s boljim susjedima.']);
      else if (pc >= 75) s.push(['dobro', 'Među boljim parcelama s istom kulturom', 'Ove sezone procijenjena kultura je ' + k + '. Po najvećoj bujnosti ova je parcela u gornjih ' + (100 - pc) + ' % od ' + p.n_iste_kulture + ' takvih parcela u općini.']);
    }
    // što očekivati
    if (vrhDoy && d < vrhDoy - 7 && vegetacija) s.push(['info', 'Što očekivati', 'Prethodnih sezona ova je parcela vrhunac zelene mase dosezala oko ' + datumIzDoy(tek, vrhDoy) + ' (bujnost oko ' + zaok(vrhVr) + '). To je razdoblje najveće potrebe za vodom.']);
    const red = { upozorenje: 0, oprez: 1, dobro: 2, info: 3 };
    s.sort((a, b) => red[a[0]] - red[b[0]]);
    return { s, vrhDoy, vrhVr, tek, d, nd, nm, uobicajeno };
  }


  const BOJE_KULTURA = { O: '#d4a017', S: '#f2c14e', K: '#2e7d32', R: '#7b1fa2', T: '#7cb342', N: '#bcaaa4', X: '#90a4ae', P: '#6d4c41' };
  const KRATKO = { O: 'ozima', S: 'suncokret', K: 'kukuruz/soja', R: 'repa', T: 'travnjak', N: 'bez usjeva', X: 'ostalo', P: 'trajni nasad' };
  function plodored(p) {
    if (!p.plodored) return '';
    const st = p.plodored.split('|').map(x => x.split(':'));
    return el('div', { class: 'plodored' },
      el('div', { class: 'sat-naslov' }, 'Plodored – procjena sa satelita'),
      el('div', { class: 'plodored-niz' }, ...st.map(([g, k]) => el('span', { class: 'plodored-god', title: g + ': ' + (KRATKO[k] || k) },
        el('span', { class: 'plodored-boja', style: 'background:' + (BOJE_KULTURA[k] || '#999') }), el('b', {}, "'" + g.slice(2)), ' ' + (KRATKO[k] || k)))),
      el('p', { class: 'sitno-siva' }, 'Kultura je procijenjena iz oblika krivulje bujnosti (kad niče, kad je vrhunac, kad se žanje). Nije službeni podatak i može biti pogrešna – posebno kukuruz i soja te dvostruki usjevi.'));
  }

  // ---------- graf sezona ----------
  function graf(niz, tek, indeks) {
    const ns = 'http://www.w3.org/2000/svg', W = 320, H = 150, L = 26, B = 18;
    const X = (d) => L + (d - 1) / 365 * (W - L - 4), Y = (v) => H - B - Math.max(0, Math.min(1, v)) * (H - B - 6);
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'sat-graf');
    const dodaj = (ime, a) => { const e = document.createElementNS(ns, ime); for (const k in a) e.setAttribute(k, a[k]); svg.append(e); return e; };
    for (const v of [0, 0.25, 0.5, 0.75, 1]) { dodaj('line', { x1: L, x2: W - 4, y1: Y(v), y2: Y(v), class: 'mreza' }); const t = dodaj('text', { x: 2, y: Y(v) + 3, class: 'oznaka' }); t.textContent = String(v).replace('.', ','); }
    [1, 91, 182, 274].forEach((d, i) => { const t = dodaj('text', { x: X(d) + 2, y: H - 4, class: 'oznaka' }); t.textContent = ['sij', 'tra', 'srp', 'lis'][i]; });
    const god = Object.keys(niz).map(Number).sort();
    for (const g of god) {
      const o = niz[g].filter(x => x[indeks] != null);
      if (!o.length) continue;
      dodaj('polyline', { points: o.map(x => X(x[0]).toFixed(1) + ',' + Y(x[indeks]).toFixed(1)).join(' '), class: g === tek ? 'tekuca' : 'prosla' });
      if (g === tek) for (const x of o) dodaj('circle', { cx: X(x[0]), cy: Y(x[indeks]), r: 2.4, class: 'tocka' });
    }
    return svg;
  }

  async function dodatak(f) {
    const okvir = el('div', { class: 'sat' }, el('p', { class: 'sitno-siva' }, 'Učitavam satelitske sezone…'));
    const p = f.getProperties();
    nizParcele(p.id).then(niz => {
      const god = Object.keys(niz).map(Number).sort();
      if (!god.length) { okvir.replaceChildren(el('p', { class: 'sitno-siva' }, 'Za ovu parcelu još nema obrađenih snimki.')); return; }
      const t = tumacenje(niz, p);
      let indeks = 1;
      const grafMjesto = el('div');
      const crtaj = () => grafMjesto.replaceChildren(graf(niz, t.tek, indeks));
      const prekidac = el('div', { class: 'kartice-dijaloga sat-kartice' },
        el('button', { class: 'aktivna', onclick: (e) => { indeks = 1; crtaj(); oznaci(e.target); } }, 'Bujnost (NDVI)'),
        el('button', { onclick: (e) => { indeks = 2; crtaj(); oznaci(e.target); } }, 'Voda u biljci (NDMI)'));
      const oznaci = (g) => { for (const b of prekidac.children) b.classList.toggle('aktivna', b === g); };
      crtaj();
      const vrhovi = god.map(g => { const v = niz[g].reduce((m, o) => o[1] > m[1] ? o : m, [0, -1]); return [g, v]; });
      okvir.replaceChildren(
        el('div', { class: 'sat-naslov' }, 'Satelit: sezone ' + god[0] + '.–' + god[god.length - 1] + '.'),
        el('div', { class: 'savjeti' }, ...t.s.map(([r, n, o]) => el('div', { class: 'savjet ' + r },
          el('span', { class: 'savjet-oznaka' }, { upozorenje: '!', oprez: '•', dobro: '✓', info: 'i' }[r]), el('div', {}, el('strong', {}, n), el('p', {}, o))))),
        plodored(p),
        gumbPrati(f),
        prekidac, grafMjesto,
        el('div', { class: 'gdd-legenda' }, el('span', { class: 'l-tekuca' }, String(t.tek) + '.'), el('span', { class: 'l-prosjek' }, 'prethodne sezone')),
        el('details', { class: 'sat-detalji' }, el('summary', {}, 'Vrhunci po sezonama'),
          el('table', { class: 'zrak-tablica' }, el('tr', {}, el('th', {}, 'Sezona'), el('th', {}, 'Najveća bujnost'), el('th', {}, 'Kada')),
            ...vrhovi.reverse().map(([g, v]) => el('tr', {}, el('td', {}, g + '.'), el('td', {}, v[1] > 0 ? zaok(v[1]) : '–'), el('td', {}, v[1] > 0 ? datumIzDoy(g, v[0]) : '–'))))),
        el('details', { class: 'sat-detalji' }, el('summary', {}, 'Što znače ove vrijednosti?'),
          el('p', {}, 'NDVI (bujnost) pokazuje koliko je zelene, žive biljne mase: ispod 0,2 golo tlo, 0,2–0,5 mlad ili rijedak usjev, iznad 0,6 gust, zdrav usjev.'),
          el('p', {}, 'NDMI (voda u biljci) pokazuje sadržaj vode u lišću: niske vrijednosti kod razvijenog usjeva znače sušni stres.'),
          el('p', {}, 'Podaci: Sentinel-2 (Copernicus, EU), razlučivost 10 m, snimanje svakih 2–5 dana; računaju se samo dani kad je parcela bez oblaka. Satelit pokazuje gdje treba pogledati – na terenu se utvrđuje zašto.')));
    });
    return okvir;
  }


  // ---------- moje parcele: praćenje i upozorenja (sprema se samo u ovom pregledniku) ----------
  const KLJUC = 'webgis.moje_parcele';
  const moje = () => { try { return JSON.parse(localStorage.getItem(KLJUC) || '[]'); } catch (g) { return []; } };
  const spremi = (l) => { try { localStorage.setItem(KLJUC, JSON.stringify(l)); } catch (g) { /* */ } osvjeziGumbMoje(); };

  function gumbPrati(f) {
    const p = f.getProperties();
    const prati = () => moje().some(x => x.id === p.id);
    const g = el('button', { class: 'gumb-mali gumb-prati' });
    const crtaj = () => { g.textContent = prati() ? '★ Pratim ovu parcelu' : '☆ Prati ovu parcelu'; g.classList.toggle('aktivan', prati()); };
    g.onclick = () => {
      let l = moje();
      if (prati()) l = l.filter(x => x.id !== p.id);
      else {
        const c = ol.proj.toLonLat(ol.extent.getCenter(f.getGeometry().getExtent()));
        l.push({ id: p.id, naziv: (p.kultura || 'parcela') + ', ' + (p.povrsina_ha ? String(p.povrsina_ha).replace('.', ',') + ' ha' : ''), lon: +c[0].toFixed(5), lat: +c[1].toFixed(5) });
      }
      spremi(l); crtaj();
    };
    crtaj();
    return el('div', { class: 'prati-okvir' }, g, el('p', { class: 'sitno-siva' }, 'Praćene parcele i njihova upozorenja vidite gumbom „Moje parcele” na karti. Popis se čuva samo u ovom pregledniku.'));
  }

  async function vremenskaUpozorenja(lat, lon) {
    const p = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lon.toFixed(3), timezone: 'Europe/Zagreb', forecast_days: 4,
      daily: 'temperature_2m_min,temperature_2m_max,precipitation_sum,wind_gusts_10m_max', hourly: 'wind_speed_10m,precipitation,temperature_2m' });
    const j = await (await fetch('https://api.open-meteo.com/v1/forecast?' + p)).json();
    const u = [], d = j.daily, mj = new Date().getMonth() + 1;
    d.time.forEach((t, i) => {
      const dan = new Date(t + 'T12:00:00').toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'numeric' });
      if (d.temperature_2m_min[i] <= (mj >= 3 && mj <= 5 ? 0 : -8)) u.push(['upozorenje', 'Mraz: ' + dan, 'Najniža temperatura ' + Math.round(d.temperature_2m_min[i]) + ' °C.']);
      if (d.precipitation_sum[i] >= 20) u.push(['oprez', 'Obilna kiša: ' + dan, Math.round(d.precipitation_sum[i]) + ' mm – teški strojevi ne na polje dan-dva nakon kiše; gnojidbu odgodite.']);
      if (d.wind_gusts_10m_max[i] >= 60) u.push(['oprez', 'Olujni vjetar: ' + dan, 'Udari do ' + Math.round(d.wind_gusts_10m_max[i]) + ' km/h.']);
    });
    // prvi povoljan termin za prskanje u sljedećih 48 h
    const h = j.hourly; const sad = new Date().toISOString().slice(0, 13);
    const i0 = Math.max(0, h.time.findIndex(t => t >= sad.replace('T', 'T')));
    for (let i = i0; i < Math.min(i0 + 48, h.time.length - 3); i++) {
      const suho = [0, 1, 2, 3].every(k => (h.precipitation[i + k] || 0) < 0.1);
      if (suho && h.wind_speed_10m[i] >= 3 && h.wind_speed_10m[i] <= 15 && h.temperature_2m[i] >= 8 && h.temperature_2m[i] <= 25) {
        u.push(['dobro', 'Povoljan termin za prskanje', new Date(h.time[i]).toLocaleString('hr-HR', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + ' (vjetar ' + Math.round(h.wind_speed_10m[i]) + ' km/h, bez kiše 3 sata).']);
        break;
      }
    }
    return u;
  }

  let upozorenjaMoje = null;
  async function izracunajMoje() {
    const l = moje();
    if (!l.length) return [];
    let st = {};
    try { const j = await (await fetch(BAZA + 'stanje.geojson')).json(); for (const f of j.features) st[f.properties.id] = f.properties; } catch (g) { /* */ }
    const rez = [];
    for (const x of l) {
      const niz = await nizParcele(x.id);
      const t = Object.keys(niz).length ? tumacenje(niz, st[x.id] || {}) : { s: [] };
      rez.push({ x, sat: t.s.filter(a => a[0] === 'upozorenje' || a[0] === 'oprez') });
    }
    let vrijeme = [];
    try { vrijeme = await vremenskaUpozorenja(l[0].lat, l[0].lon); } catch (g) { /* */ }
    return { rez, vrijeme };
  }

  async function osvjeziGumbMoje() {
    const okvir = document.querySelector('.gumbi-karte');
    if (!okvir) return;
    let g = document.getElementById('gumbMoje');
    if (!moje().length) { if (g) g.remove(); return; }
    if (!g) { g = el('button', { id: 'gumbMoje', class: 'gumb-karte', title: 'Moje parcele – upozorenja', onclick: prikaziMoje }); okvir.prepend(g); }
    g.replaceChildren(el('span', {}, '★'), el('span', {}, 'Moje parcele'));
    upozorenjaMoje = await izracunajMoje();
    const n = upozorenjaMoje.rez.reduce((a, r) => a + r.sat.length, 0) + upozorenjaMoje.vrijeme.filter(v => v[0] !== 'dobro').length;
    if (n) g.append(el('span', { class: 'znacka' }, String(n)));
  }

  async function prikaziMoje() {
    const sadrzaj = el('div', {}, el('p', {}, 'Učitavam…'));
    stanje.api.otvoriDijalog(el('h3', {}, 'Moje parcele'), sadrzaj);
    const u = upozorenjaMoje || await izracunajMoje();
    const savjet = ([r, n, o]) => el('div', { class: 'savjet ' + r }, el('span', { class: 'savjet-oznaka' }, { upozorenje: '!', oprez: '•', dobro: '✓', info: 'i' }[r]), el('div', {}, el('strong', {}, n), el('p', {}, o)));
    sadrzaj.replaceChildren(
      el('div', { class: 'sat-naslov' }, 'Vrijeme na mojim parcelama (sljedeća 4 dana)'),
      el('div', { class: 'savjeti' }, ...(u.vrijeme.length ? u.vrijeme.map(savjet) : [el('p', { class: 'sitno-siva' }, 'Nema vremenskih upozorenja.')])),
      ...u.rez.map(({ x, sat }) => el('div', { class: 'moja-parcela' },
        el('div', { class: 'moja-zaglavlje' }, el('strong', {}, x.naziv),
          el('button', { class: 'gumb-mali', onclick: () => { document.getElementById('dijalog').close(); stanje.karta.getView().animate({ center: ol.proj.fromLonLat([x.lon, x.lat]), zoom: 16, duration: 600 });
            const z = stanje.slojevi.stanje_usjeva; if (z && z.postaviVidljivost) z.postaviVidljivost(true); } }, 'Na karti'),
          el('button', { class: 'gumb-mali', onclick: () => { spremi(moje().filter(y => y.id !== x.id)); prikaziMoje(); } }, 'Ukloni')),
        el('div', { class: 'savjeti' }, ...(sat.length ? sat.map(savjet) : [el('p', { class: 'sitno-siva' }, 'Satelit ne pokazuje ništa zabrinjavajuće.')])))),
      el('p', { class: 'sitno-siva' }, 'Upozorenja se računaju pri svakom otvaranju portala. Obavijesti e-poštom bit će moguće kad općina uključi slanje pošte.'));
  }

  function pripremi(konfig) {
    const vr = {
      'znatno slabije': { boja: '#c0392b', oznaka: 'znatno slabije nego obično' }, 'slabije': { boja: '#f39c12', oznaka: 'nešto slabije' },
      'uobičajeno': { boja: '#a3c95b', oznaka: 'uobičajeno' }, 'bujnije': { boja: '#1e7b34', oznaka: 'bujnije nego obično' },
      'golo tlo / mirovanje': { boja: '#bcaaa4', oznaka: 'golo tlo / mirovanje' }, 'nema usporedbe': { boja: '#cfd8dc', oznaka: 'nema usporedbe' },
      'nema snimke': { boja: '#eceff1', oznaka: 'nema čiste snimke' } };
    const i = konfig.slojevi.findIndex(s => s.id === 'arkod_uporaba');
    const ext = ol.proj.transformExtent([18.69, 45.54, 18.98, 45.73], 'EPSG:4326', 'EPSG:3857');
    konfig.slojevi.splice(i < 0 ? konfig.slojevi.length : i, 0, {
      id: 'stanje_usjeva', naziv: 'Stanje usjeva sa satelita', grupa: 'poljoprivreda', podgrupa: 'Satelit', tip: 'geojson',
      url: BAZA + 'stanje.geojson', vidljivo: false, minZoom: 11,
      stil: { geometrija: 'poligon', debljina: 0.6, ispunaProzirnost: 0.55, kategorije: { polje: 'stanje', vrijednosti: vr } },
      skocniProzor: { naslov: 'kultura', polja: [{ polje: 'povrsina_ha', oznaka: 'Površina (ha)' }, { polje: 'zadnji_datum', oznaka: 'Zadnja čista snimka', format: 'datum' },
        { polje: 'usporedba', oznaka: 'Uspoređuje se' }, { polje: 'vrijednost', oznaka: 'Bujnost (NDVI)' }, { polje: 'ndvi_uobicajeno', oznaka: 'Uobičajeno' }] },
      skocniDodatak: 'satelit',
      opis: 'Je li usjev bujniji ili slabiji nego prethodnih godina u isto doba – po parceli, sa satelita.',
      detaljno: 'Svaka poljoprivredna parcela uspoređuje se sama sa sobom. Od travnja do rujna zadnja čista snimka Sentinel-2 satelita uspoređuje se s istim dobom godine u prethodnim sezonama (od 2018.), a izvan vegetacije vrhunac ove sezone s vrhuncima prethodnih. Klikom na parcelu vidite krivulje svih sezona, vodu u biljci i preporuke.\n\nPodaci se osvježavaju dvaput tjedno. Satelit pokazuje gdje treba pogledati – razlog (sjetva, kultura, voda, šteta) utvrđuje se na terenu.',
      izvor: 'Copernicus Sentinel-2 (ESA/EU), obrada: portal (Earth Search STAC)', licenca: 'Copernicus – slobodno korištenje uz navođenje izvora', azurirano: 'dvaput tjedno'
    }, {
      id: 'kulture_satelit', naziv: 'Kulture sa satelita (procjena)', grupa: 'poljoprivreda', podgrupa: 'Satelit', tip: 'geojson',
      url: BAZA + 'stanje.geojson', vidljivo: false, minZoom: 11,
      stil: { geometrija: 'poligon', debljina: 0.5, ispunaProzirnost: 0.6, kategorije: { polje: 'kultura_kod', vrijednosti: {
        O: { boja: '#d4a017', oznaka: 'ozima kultura (pšenica, ječam, repica)' }, S: { boja: '#f2c14e', oznaka: 'suncokret (vjerojatno)' },
        K: { boja: '#2e7d32', oznaka: 'kukuruz ili soja' }, R: { boja: '#7b1fa2', oznaka: 'šećerna repa (vjerojatno)' },
        T: { boja: '#7cb342', oznaka: 'travnjak, djetelina, lucerna' }, P: { boja: '#6d4c41', oznaka: 'trajni nasad' },
        X: { boja: '#90a4ae', oznaka: 'ostalo / mješovito' }, N: { boja: '#bcaaa4', oznaka: 'bez razvijenog usjeva' } } } },
      skocniProzor: { naslov: 'kultura_sat', polja: [{ polje: 'povrsina_ha', oznaka: 'Površina (ha)' }] },
      skocniDodatak: 'satelit',
      opis: 'Što se ove sezone uzgajalo na kojoj parceli – procjena iz krivulje bujnosti.',
      detaljno: 'Satelit ne vidi kulturu izravno, ali svaka kultura ima svoj ritam: ozimi usjevi zelene se u proljeće i žanju u srpnju, suncokret je najbujniji početkom srpnja i brzo suši, kukuruz i soja vrhunac imaju krajem srpnja i u kolovozu, šećerna repa ostaje zelena do jeseni. Po tom ritmu portal procjenjuje kulturu i plodored po godinama.\n\nTo je procjena bez terenske provjere – kukuruz i soju satelit teško razlikuje, a dvostruki usjevi i mješovite parcele mogu biti pogrešno svrstani. Služi za pregled i usporedbu s parcelama iste kulture.',
      izvor: 'Copernicus Sentinel-2, obrada: portal', azurirano: 'dvaput tjedno'
    }, {
      id: 'zone_parcela', naziv: 'Zone unutar parcela (višegodišnje)', grupa: 'poljoprivreda', podgrupa: 'Satelit', tip: 'slika',
      url: BAZA + 'zone.png', extent: ext, vidljivo: false, minZoom: 12, neprozirnost: 0.85,
      stil: { geometrija: 'poligon', kategorije: { polje: '_', vrijednosti: {
        slabija: { boja: '#d6604d', oznaka: 'slabiji dio parcele (< 90 % prosjeka parcele)' }, prosjek: { boja: '#faf0b4', oznaka: 'prosječno' },
        jaca: { boja: '#1a9850', oznaka: 'jači dio parcele (> 110 %)' } } } },
      opis: 'Dijelovi parcele koji su kroz više sezona redovito slabiji ili jači od ostatka parcele.',
      detaljno: 'Za svaki piksel od 10 m izračunat je prosječni NDVI svibanj–kolovoz kroz sve obrađene sezone i uspoređen s prosjekom vlastite parcele. Crveni dijelovi godinama daju slabiji usjev (tlo, voda, zbijenost, rub parcele), zeleni jači.\n\nTo je podloga za analizu tla po zonama i diferenciranu gnojidbu ili sjetvu.',
      izvor: 'Copernicus Sentinel-2, obrada: portal', azurirano: 'dvaput tjedno'
    });
  }

  async function pokreni(s) {
    stanje = s; el = s.api.el;
    s.skocniDodaci.satelit = (f) => { const o = el('div'); dodatak(f).then(x => o.replaceChildren(x)); return o; };
    try { sazetak = await (await fetch(BAZA + 'sazetak.json')).json(); } catch (g) { /* još nema podataka */ }
    osvjeziGumbMoje();
    try {
      const z = await (await fetch(BAZA + 'zone.json')).json();
      const zap = s.slojevi.zone_parcela;
      if (zap && z.obuhvat) zap.olSloj.setSource(new ol.source.ImageStatic({ url: BAZA + 'zone.png', imageExtent: z.obuhvat, projection: 'EPSG:3857' }));
    } catch (g) { /* */ }
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'satelit', pripremi, pokreni });
})();
