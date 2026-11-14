/* Godišnje izvješće iz podataka portala – za općinsko vijeće i mještane.
   Sve se računa u pregledniku iz otvorenih podataka portala; osobni podaci se ne koriste
   (prijave stižu iz baze samo kao zbirni brojevi, funkcija izvjesce_godine). */
(function () {
  'use strict';
  const SAT = 'https://raw.githubusercontent.com/iplascak/web-gis-bilje/satelit/';
  const ZRAK = 'https://raw.githubusercontent.com/iplascak/web-gis-bilje/podaci-uzivo/zrak_arhiva.json';
  const MJ = ['sij', 'velj', 'ožu', 'tra', 'svi', 'lip', 'srp', 'kol', 'ruj', 'lis', 'stu', 'pro'];
  const KAT_PRIJAVE = { cesta: 'Ceste i nogostupi', rasvjeta: 'Javna rasvjeta', otpad: 'Otpad', zelenilo: 'Zelenilo', odvodnja: 'Odvodnja i kanali', komunalna_oprema: 'Komunalna oprema', promet: 'Promet i signalizacija', ostalo: 'Ostalo' };
  const STATUS_PRIJAVE = { zaprimljeno: 'Zaprimljeno', u_obradi: 'U obradi', rijeseno: 'Riješeno', odbijeno: 'Odbijeno' };
  const STATUS_PROJ = { planirano: 'Planirano', u_pripremi: 'U pripremi', u_provedbi: 'U provedbi', provedeno: 'Provedeno', odustalo: 'Odustalo' };
  const RAZREDI = ['dobra', 'prihvatljiva', 'umjerena', 'loša', 'vrlo loša', 'iznimno loša'];
  const BOJE_RAZ = ['#50b848', '#9ccb3b', '#f4c20d', '#f08a24', '#d7263d', '#7e0023'];
  const KAT_DOG = { manifestacija: 'Manifestacije', kultura: 'Kultura', sport: 'Sport', turizam: 'Turizam', edukacija: 'Edukacija', sajam: 'Sajmovi', vjerski: 'Vjerska događanja', radovi: 'Radovi i zatvorene ceste', ostalo: 'Ostalo' };
  const VRSTE_OBJ = { svjetiljka: 'Svjetiljke javne rasvjete', klupa: 'Klupe', kos: 'Koševi', igralo: 'Igrala', hidrant: 'Hidranti', znak: 'Prometni znakovi', stajaliste: 'Stajališta', zeleni_otok: 'Zeleni otoci', aed: 'Defibrilatori (AED)', slavina: 'Javne slavine', punionica: 'Punionice', ostalo: 'Ostalo' };

  const $ = (s) => document.querySelector(s);
  const br = (n, d = 0) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString('hr-HR', { maximumFractionDigits: d, minimumFractionDigits: d }));
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const json = async (url, opc) => { const o = await fetch(url, opc); if (!o.ok) throw new Error(o.status); return o.json(); };
  const kartica = (v, t) => `<div class="kartica"><b>${v}</b><span>${t}</span></div>`;
  function trake(parovi, oznake, jed = '', boja) {
    const max = Math.max(1, ...parovi.map((p) => p[1]));
    return parovi.map(([k, v], i) => `<div class="traka"><span>${esc(oznake ? (oznake[k] || k) : k)}</span><i style="width:${Math.max(1, v / max * 100)}%${boja ? ';background:' + boja(k, i) : ''}"></i><span class="br">${br(v, v < 10 && v % 1 ? 1 : 0)}${jed}</span></div>`).join('');
  }
  function stupci(vrijednosti, oznake, visina = 120, jed = '') {
    const w = 640, n = vrijednosti.length, sir = w / n, max = Math.max(1, ...vrijednosti.filter((v) => v != null));
    return `<svg viewBox="0 0 ${w} ${visina + 34}" width="100%" role="img">` + vrijednosti.map((v, i) => {
      const h = v == null ? 0 : v / max * visina;
      return `<rect x="${i * sir + 4}" y="${visina - h + 14}" width="${sir - 8}" height="${h}" rx="3" fill="#1F7A3D"/>` +
        (v != null ? `<text x="${i * sir + sir / 2}" y="${visina - h + 10}" font-size="11" text-anchor="middle" fill="#333">${br(v)}${jed}</text>` : '') +
        `<text x="${i * sir + sir / 2}" y="${visina + 30}" font-size="11" text-anchor="middle" fill="#555">${oznake[i]}</text>`;
    }).join('') + '</svg>';
  }

  let konfig, podaci = {};
  async function ucitajSve() {
    konfig = (await json('config/portal.json')).prijave || {};
    const [ark, sat, sazSat, zrak, proj] = await Promise.allSettled([
      json('data/poljoprivreda/arkod/sazetak.json'), json(SAT + 'stanje.geojson'), json(SAT + 'sazetak.json'), json(ZRAK),
      json(konfig.supabaseUrl + '/rest/v1/rpc/projekti_geojson', { method: 'POST', headers: { apikey: konfig.supabaseKljuc, 'Content-Type': 'application/json' }, body: '{}' })
        .then((d) => (d.features && d.features.length ? d : json('data/projekti/nacrt.geojson')))
        .catch(() => json('data/projekti/nacrt.geojson'))]);
    podaci = { ark: ark.value, sat: sat.value, sazSat: sazSat.value, zrak: zrak.value, proj: proj.value };
  }

  async function prikazi(g) {
    const tekuca = new Date().getFullYear();
    let baza = null;
    try {
      baza = await json(konfig.supabaseUrl + '/rest/v1/rpc/izvjesce_godine', { method: 'POST', headers: { apikey: konfig.supabaseKljuc, 'Content-Type': 'application/json' }, body: JSON.stringify({ godina: g }) });
    } catch (e) { baza = null; }
    const dijelovi = [];
    const danas = new Date().toLocaleDateString('hr-HR');
    dijelovi.push(`<h1>Općina Bilje u ${g}. godini – što kažu podaci</h1>
      <p class="sitno">Izvješće je izrađeno automatski ${danas} iz otvorenih podataka portala Web GIS Općine Bilje${g === tekuca ? ' (godina još traje – brojke su do danas)' : ''}. Ne sadrži osobne podatke: prijave mještana prikazane su samo kao zbirni brojevi.</p>`);
    const kljucno = [];

    // 1. Prijave mještana
    let s = '<section><h2>1. Prijave mještana</h2>';
    if (!baza) s += '<div class="napomena">Zbirni podaci o prijavama prikazat će se nakon što se u bazi pokrene <code>supabase/migracija_4.sql</code>.</div>';
    else {
      const p = baza.prijave || {}, st = p.po_statusu || {};
      const rij = st.rijeseno || 0, uk = p.ukupno || 0;
      s += `<div class="kartice">${kartica(br(uk), 'zaprimljenih prijava')}${kartica(br(rij), 'riješeno')}${kartica(uk ? br(rij / uk * 100) + ' %' : '–', 'udio riješenih')}${kartica(p.rijeseno_medijan_dana != null ? br(p.rijeseno_medijan_dana, 1) + ' d' : '–', 'tipično vrijeme do rješenja (medijan)')}</div>`;
      if (uk) {
        s += '<h3 class="sitno">Po vrsti problema</h3>' + trake(Object.entries(p.po_kategoriji || {}).sort((a, b) => b[1] - a[1]), KAT_PRIJAVE);
        s += '<h3 class="sitno">Po stanju</h3>' + trake(Object.entries(st).sort((a, b) => b[1] - a[1]), STATUS_PRIJAVE);
        s += '<h3 class="sitno">Po mjesecima</h3>' + stupci(MJ.map((_, i) => (p.po_mjesecu || {})[i + 1] || 0), MJ);
        const top = Object.entries(p.po_kategoriji || {}).sort((a, b) => b[1] - a[1])[0];
        if (top) kljucno.push(`Mještani su prijavili <b>${br(uk)}</b> problema, najčešće: ${esc(KAT_PRIJAVE[top[0]] || top[0]).toLowerCase()}; riješeno ${br(rij / uk * 100)} %${p.rijeseno_medijan_dana != null ? ', tipično za ' + br(p.rijeseno_medijan_dana, 0) + ' dana' : ''}.`);
      } else s += '<p class="sitno">U ovoj godini nema zaprimljenih prijava.</p>';
    }
    dijelovi.push(s + '</section>');

    // 2. Projekti
    s = '<section><h2>2. Projekti općine</h2>';
    const pf = (podaci.proj && podaci.proj.features || []).map((f) => f.properties);
    const uGodini = pf.filter((p) => {
      const od = p.godina_pocetka || parseInt(String(p.razdoblje || '').slice(0, 4)) || null;
      const doo = p.godina_zavrsetka || parseInt(String(p.razdoblje || '').split(/[–-]/)[1]) || od;
      return od && od <= g && (doo || g) >= g;
    });
    if (!pf.length) s += '<p class="sitno">Popis projekata još nije unesen.</p>';
    else {
      const nacrt = pf.some((p) => p.nacrt);
      const vr = uGodini.reduce((a, p) => a + (+p.vrijednost_eur || 0), 0);
      const poStat = {}; uGodini.forEach((p) => { poStat[p.status] = (poStat[p.status] || 0) + 1; });
      s += `<div class="kartice">${kartica(br(uGodini.length), 'projekata aktivnih u godini')}${kartica(br(vr / 1e6, 2) + ' mil. €', 'ukupna vrijednost')}${kartica(br(poStat.provedeno || 0), 'provedeno')}</div>`;
      s += trake(Object.entries(poStat).sort((a, b) => b[1] - a[1]), STATUS_PROJ);
      s += '<table><tr><th>Projekt</th><th>Naselje</th><th>Stanje</th><th class="br">Vrijednost (€)</th></tr>' +
        uGodini.sort((a, b) => (b.vrijednost_eur || 0) - (a.vrijednost_eur || 0)).slice(0, 15).map((p) =>
          `<tr><td>${esc(p.naziv)}</td><td>${esc(p.naselje || p.naselja || '')}</td><td>${esc(STATUS_PROJ[p.status] || p.status || '')}</td><td class="br">${p.vrijednost_eur ? br(p.vrijednost_eur) : '–'}</td></tr>`).join('') + '</table>';
      if (uGodini.length > 15) s += `<p class="sitno">…i još ${uGodini.length - 15} projekata (svi su na karti, sloj Projekti općine).</p>`;
      if (nacrt) s += '<div class="napomena">Popis projekata je radni nacrt iz službenih glasnika – brojke će biti točne kada općina unese potvrđeni popis.</div>';
      if (uGodini.length) kljucno.push(`Aktivno je bilo <b>${br(uGodini.length)}</b> projekata ukupne vrijednosti oko <b>${br(vr / 1e6, 1)} mil. €</b>.`);
    }
    dijelovi.push(s + '</section>');

    // 3. Poljoprivreda
    s = '<section><h2>3. Poljoprivreda</h2>';
    const ark = podaci.ark || {};
    const kljucArk = ark[String(g)] ? String(g) : (g >= tekuca && ark.trenutno ? 'trenutno' : null);
    if (kljucArk) {
      const a = ark[kljucArk], ukHa = Object.values(a.ha).reduce((x, y) => x + y, 0);
      s += `<div class="kartice">${kartica(br(ukHa) + ' ha', 'u sustavu potpora (ARKOD)')}${kartica(br(a.parcela), 'ARKOD parcela')}${kartica(br(a.ha.oranica || 0) + ' ha', 'oranica')}${a.navodnjavano_ha ? kartica(br(a.navodnjavano_ha) + ' ha', 'navodnjavano') : ''}</div>`;
      s += trake(Object.entries(a.ha).filter((x) => x[1] >= 1), null, ' ha');
      const god = Object.keys(ark).filter((k) => /^\d{4}$/.test(k)).sort();
      s += '<h3 class="sitno">Površina u sustavu potpora kroz godine (ha)</h3>' + stupci(god.map((k) => Math.round(Object.values(ark[k].ha).reduce((x, y) => x + y, 0))), god.map((k) => "'" + k.slice(2)), 100);
    } else s += '<p class="sitno">ARKOD podaci za ovu godinu nisu dostupni.</p>';
    const sat = podaci.sat && podaci.sat.features;
    if (sat && g >= 2018) {
      const kul = (podaci.sazSat || {}).kulture || {}, poKul = {}; let uk = 0;
      sat.forEach((f) => {
        const p = f.properties, m = String(p.plodored || '').match(new RegExp(g + ':(\\w)'));
        if (!m) return; const ha = +p.povrsina_ha || 0; poKul[m[1]] = (poKul[m[1]] || 0) + ha; uk += ha;
      });
      if (uk) {
        s += `<h3 class="sitno">Što je raslo na poljima – procjena iz satelitskih snimaka Sentinel-2 (${g}.)</h3>` +
          trake(Object.entries(poKul).sort((a, b) => b[1] - a[1]), kul, ' ha');
        const top = Object.entries(poKul).filter((x) => !'XNP'.includes(x[0])).sort((a, b) => b[1] - a[1])[0];
        if (top) kljucno.push(`Na poljima je prevladavala kultura „${esc((kul[top[0]] || top[0]).split(' (')[0])}” (oko ${br(top[1] / uk * 100)} % površine, procjena sa satelita).`);
      }
      if (g === tekuca) {
        const stanja = {}; sat.forEach((f) => { const st = f.properties.stanje; if (st) stanja[st] = (stanja[st] || 0) + (+f.properties.povrsina_ha || 0); });
        s += '<h3 class="sitno">Stanje usjeva u odnosu na uobičajeno za istu parcelu (ha)</h3>' + trake(Object.entries(stanja).sort((a, b) => b[1] - a[1]), null, ' ha');
      }
      s += '<p class="sitno">Procjena kulture iz satelita nije službeni podatak – služi za opći pregled, a ne za pojedinačne odluke.</p>';
    }
    dijelovi.push(s + '</section>');

    // 4. Kvaliteta zraka
    s = '<section><h2>4. Kvaliteta zraka</h2>';
    const z = podaci.zrak || {};
    const redovi = [];
    for (const [postaja, tvari] of Object.entries(z)) {
      const dani = {};
      for (const niz of Object.values(tvari)) for (const [d, v] of Object.entries(niz)) {
        if (!d.startsWith(g + '-')) continue; dani[d] = Math.max(dani[d] ?? 0, v[3]);
      }
      const n = Object.keys(dani).length; if (!n) continue;
      const raz = [0, 0, 0, 0, 0, 0]; Object.values(dani).forEach((r) => raz[Math.min(5, r)]++);
      const pm = tvari.PM10 ? Object.entries(tvari.PM10).filter(([d]) => d.startsWith(g + '-')).map(([, v]) => v[0] / v[1]) : [];
      redovi.push({ postaja, n, raz, pm10: pm.length ? pm.reduce((a, b) => a + b, 0) / pm.length : null });
    }
    if (!redovi.length) s += '<div class="napomena">Dnevna arhiva mjerenja (DHMZ: Kopački rit, Osijek 1, Osijek 2) vodi se od studenoga 2026. – za ovu godinu još nema podataka.</div>';
    else {
      s += '<table><tr><th>Postaja</th><th class="br">Dana s mjerenjem</th><th>Raspodjela dana po kvaliteti (najlošiji sat u danu)</th><th class="br">Prosjek PM10</th></tr>' +
        redovi.map((r) => `<tr><td>${esc(r.postaja)}</td><td class="br">${r.n}</td><td><div style="display:flex;height:14px;border-radius:3px;overflow:hidden">${r.raz.map((c, i) => c ? `<i title="${RAZREDI[i]}: ${c} d" style="flex:${c};background:${BOJE_RAZ[i]};-webkit-print-color-adjust:exact;print-color-adjust:exact"></i>` : '').join('')}</div><span class="sitno">${r.raz.map((c, i) => c ? RAZREDI[i] + ' ' + c : '').filter(Boolean).join(' · ')}</span></td><td class="br">${r.pm10 != null ? br(r.pm10, 1) + ' µg/m³' : '–'}</td></tr>`).join('') + '</table>';
      s += '<p class="sitno">Izvor: DHMZ, satni nekontrolirani podaci; razredi prema pojednostavljenom europskom indeksu. Granična godišnja vrijednost PM10 je 40 µg/m³.</p>';
      const kr = redovi.find((r) => /Kopa/.test(r.postaja));
      if (kr) kljucno.push(`Zrak u Kopačkom ritu bio je dobar ili prihvatljiv <b>${br((kr.raz[0] + kr.raz[1]) / kr.n * 100)} %</b> dana s mjerenjem.`);
    }
    dijelovi.push(s + '</section>');

    // 5. Zajednica
    s = '<section><h2>5. Život zajednice</h2>';
    if (!baza) s += '<div class="napomena">Prikazat će se nakon pokretanja <code>supabase/migracija_4.sql</code>.</div>';
    else {
      const dog = baza.dogadjanja || {}, ukDog = Object.values(dog).reduce((a, b) => a + b, 0);
      s += `<div class="kartice">${kartica(br(ukDog), 'događanja u kalendaru')}${kartica(br(baza.doprinosi || 0), 'objavljenih sjećanja mještana (fotografije, priče, nazivi)')}</div>`;
      if (ukDog) s += trake(Object.entries(dog).sort((a, b) => b[1] - a[1]), KAT_DOG);
      const obj = baza.komunalni_objekti || {};
      if (Object.keys(obj).length) s += '<h3 class="sitno">Evidentirana komunalna oprema (stanje danas)</h3>' + trake(Object.entries(obj).sort((a, b) => b[1] - a[1]), VRSTE_OBJ);
      if (ukDog) kljucno.push(`U kalendaru je bilo <b>${br(ukDog)}</b> događanja${baza.doprinosi ? ', a mještani su podijelili ' + br(baza.doprinosi) + ' sjećanja' : ''}.`);
    }
    dijelovi.push(s + '</section>');

    const sazetak = `<div class="zakljucak"><b>Ukratko</b><ul style="margin:6px 0 0;padding-left:20px">${kljucno.length ? kljucno.map((k) => '<li>' + k + '</li>').join('') : '<li>Za ovu godinu još nema dovoljno podataka.</li>'}</ul></div>`;
    dijelovi.splice(1, 0, sazetak);
    dijelovi.push('<p class="sitno" style="margin-top:30px">Izvori: prijave i događanja s portala (Supabase), ARKOD – APPRRR (registri.nipp.hr), Copernicus Sentinel-2 (ESA), DHMZ, službeni glasnici Općine Bilje. Izvješće se može ispisati ili spremiti kao PDF gumbom „Ispis / PDF”.</p>');
    $('#sadrzaj').innerHTML = dijelovi.join('');
    document.title = `Općina Bilje ${g}. – godišnje izvješće iz podataka`;
  }

  (async () => {
    const tekuca = new Date().getFullYear();
    const sel = $('#godina');
    for (let g = tekuca; g >= 2018; g--) sel.append(new Option(g + '.', g));
    const izUrl = parseInt(new URLSearchParams(location.search).get('godina'));
    if (izUrl) sel.value = izUrl;
    sel.addEventListener('change', () => { history.replaceState(null, '', '?godina=' + sel.value); prikazi(+sel.value); });
    try { await ucitajSve(); } catch (e) { $('#sadrzaj').innerHTML = '<p>Greška pri učitavanju: ' + esc(e.message) + '</p>'; return; }
    prikazi(+sel.value);
  })();
})();
