/*
 * Modul: "Moja adresa" – nakon odabira adrese u tražilici prikazuje karticu sa svime
 * što se tiče te adrese: odvoz otpada, najbliže usluge i stajalište, prijave u blizini,
 * vrijeme i poveznicu na puni izvještaj o lokaciji (prostorni plan, poplave, zaštita…).
 */
(function () {
  'use strict';
  let stanje = null, el = null;
  const cache = {};

  async function geojson(url) {
    if (!cache[url]) cache[url] = fetch(url).then(o => o.ok ? o.json() : { features: [] }).catch(() => ({ features: [] }));
    return cache[url];
  }
  // udaljenost u metrima (haversine)
  function udaljenost(a, b) {
    const R = 6371000, r = Math.PI / 180;
    const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  const tocka = (f) => f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.type === 'MultiPoint' ? f.geometry.coordinates[0] : null;
  // pješice: zračna udaljenost × 1,3 (zaobilaženje ulicama), 4,8 km/h
  function opisUdaljenosti(m) {
    const min = Math.max(1, Math.round(m * 1.3 / 80));
    const d = m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
    return d + (m < 4000 ? ' · ~' + min + ' min pješice' : '');
  }

  async function najblize(lonlat) {
    const izvori = (stanje.portal.mojaAdresa && stanje.portal.mojaAdresa.najblize) || [];
    const rez = [];
    for (const iz of izvori) {
      const j = await geojson(iz.url);
      let najbolji = null;
      for (const f of j.features || []) {
        if (iz.filtar && String(f.properties[iz.filtar.polje]) !== String(iz.filtar.vrijednost)) continue;
        const t = tocka(f); if (!t) continue;
        const d = udaljenost(lonlat, t);
        if (!najbolji || d < najbolji.d) najbolji = { d, f, t };
      }
      if (najbolji) rez.push({ iz, ...najbolji });
    }
    return rez;
  }

  async function prikazi(a) {
    const lonlat = [a.lon, a.lat];
    let okvir = document.getElementById('karticaAdrese');
    if (!okvir) {
      okvir = el('aside', { id: 'karticaAdrese', class: 'kartica-adrese', 'aria-label': 'Moja adresa' });
      document.body.append(okvir);
    }
    const tijelo = el('div', { class: 'adresa-tijelo' }, el('p', { class: 'sitno-siva' }, 'Prikupljam podatke…'));
    okvir.replaceChildren(
      el('div', { class: 'adresa-zaglavlje' },
        el('div', {}, el('div', { class: 'adresa-oznaka' }, 'Moja adresa'), el('h3', {}, a.ulica + ' ' + a.broj), el('div', { class: 'sitno-siva' }, a.naselje)),
        el('button', { class: 'zatvori', 'aria-label': 'Zatvori', onclick: () => okvir.remove() }, '×')),
      tijelo);

    const sekcije = [];
    // odvoz otpada
    if (stanje.otpad) {
      const zona = await stanje.otpad.zonaUlice(a.ulica, a.naselje);
      sekcije.push(el('section', {}, el('h4', {}, '🗑️ Odvoz otpada'), stanje.otpad.prikazOdvoza(zona)));
    }
    // najbliže
    const bl = await najblize(lonlat);
    if (bl.length) sekcije.push(el('section', {}, el('h4', {}, '📍 U blizini'),
      el('ul', { class: 'adresa-popis' }, ...bl.sort((x, y) => x.d - y.d).map(b => el('li', {},
        el('span', {}, b.iz.oznaka + ': ', el('strong', {}, b.f.properties[b.iz.naziv || 'naziv'] || '')),
        el('span', { class: 'sitno-siva' }, opisUdaljenosti(b.d)))))));
    // prijave u blizini (javne, otvorene)
    const sp = stanje.slojevi.prijave;
    if (sp) {
      const blizu = sp.olSloj.getSource().getFeatures().filter(f => {
        const c = ol.proj.toLonLat(f.getGeometry().getCoordinates());
        return udaljenost(lonlat, c) < 400 && ['zaprimljeno', 'u_obradi'].includes(f.get('status'));
      });
      sekcije.push(el('section', {}, el('h4', {}, '🛠️ Prijavljeni problemi u blizini (400 m)'),
        blizu.length ? el('ul', { class: 'adresa-popis' }, ...blizu.slice(0, 5).map(f => el('li', {}, f.get('kategorija_naziv') + ' – ' + (f.get('status') === 'u_obradi' ? 'u obradi' : 'zaprimljeno'))))
          : el('p', { class: 'sitno-siva' }, 'Nema otvorenih prijava.')));
    }
    // gumbi
    const koord = ol.proj.fromLonLat(lonlat);
    sekcije.push(el('div', { class: 'adresa-gumbi' },
      el('button', { class: 'gumb-primarni', onclick: () => stanje.api.izvjestajLokacije && stanje.api.izvjestajLokacije(koord) }, 'Sve o ovoj lokaciji'),
      stanje.vrijeme ? el('button', { class: 'gumb-sekundarni', onclick: () => stanje.vrijeme.otvori() }, 'Vrijeme') : '',
      el('button', { class: 'gumb-sekundarni', onclick: () => {
        const url = location.origin + location.pathname + '#v=18/' + a.lon.toFixed(5) + '/' + a.lat.toFixed(5) + '&a=' + encodeURIComponent(a.ulica + '|' + a.broj + '|' + a.naselje);
        navigator.clipboard ? navigator.clipboard.writeText(url).then(() => alertKratko('Poveznica kopirana')) : prompt('Poveznica', url);
      } }, 'Spremi poveznicu')));
    tijelo.replaceChildren(...sekcije,
      el('p', { class: 'sitno-siva' }, 'Udaljenosti su procjena (zračna linija × 1,3). Prostorni plan, poplave i zaštitu provjerite pod "Sve o ovoj lokaciji".'));

    function alertKratko(t) {
      const p = el('div', { class: 'tost' }, t); document.body.append(p); setTimeout(() => p.remove(), 1800);
    }
  }

  function pokreni(s) {
    stanje = s; el = s.api.el;
    s.mojaAdresa = prikazi;
    // otvaranje iz poveznice: #...&a=ulica|broj|naselje
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('a') && s.adrese) {
      const [ul, br, na] = h.get('a').split('|');
      const r = s.adrese.find(x => x[0] === ul && String(x[1]) === br && x[2] === na);
      if (r) prikazi({ ulica: r[0], broj: r[1], naselje: r[2], lon: r[3], lat: r[4] });
    }
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'adresa', pokreni });
})();
