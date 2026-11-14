/*
 * Modul: kvaliteta zraka – postaje DHMZ Kopački rit, Osijek 1 i Osijek 2.
 * Podatke svaki sat preuzima .github/workflows/zrak.yml (scripts/zrak/meteo_hr.py)
 * i sprema na granu 'podaci-uzivo' (zrak.geojson). Izvorni, nekontrolirani podaci DHMZ-a.
 */
(function () {
  'use strict';
  const URL = 'https://raw.githubusercontent.com/iplascak/web-gis-bilje/podaci-uzivo/zrak.geojson';
  const BOJE = ['#3aa35b', '#8cc63e', '#e6c229', '#e3792b', '#c8322d', '#7d2a7e'];
  const NAZIVI = ['dobra', 'prihvatljiva', 'umjerena', 'loša', 'vrlo loša', 'izrazito loša'];
  const OPIS = { 'PM10': 'lebdeće čestice PM10', 'PM2.5': 'fine čestice PM2,5', 'O3': 'ozon', 'NO2': 'dušikov dioksid', 'SO2': 'sumporov dioksid' };

  function pripremi(konfig) {
    const vrijednosti = { nema: { boja: '#9aa0a6', oznaka: 'nema podataka' } };
    NAZIVI.forEach((n, i) => { vrijednosti[String(i)] = { boja: BOJE[i], oznaka: n }; });
    const i = konfig.slojevi.findIndex(s => s.grupa === 'svakodnevica');
    konfig.slojevi.splice(i < 0 ? 0 : i, 0, {
      id: 'kvaliteta_zraka', naziv: 'Kvaliteta zraka (DHMZ)', grupa: 'svakodnevica', podgrupa: 'Okoliš i vrijeme', tip: 'geojson',
      url: URL, vidljivo: false,
      stil: { geometrija: 'tocka', velicina: 9, natpis: 'naziv', natpisMinZoom: 10, kategorije: { polje: 'razred', vrijednosti } },
      skocniProzor: { naslov: 'naziv', polja: [{ polje: 'kvaliteta', oznaka: 'Kvaliteta zraka' }, { polje: 'vrijeme', oznaka: 'Mjereno' }] },
      skocniDodatak: 'zrak',
      opis: 'Mjerne postaje Kopački rit, Osijek 1 i Osijek 2 – zadnje satne vrijednosti.',
      detaljno: 'Automatske postaje za praćenje kvalitete zraka Državnog hidrometeorološkog zavoda. Portal svaki sat preuzima zadnje izmjerene vrijednosti lebdećih čestica (PM10, PM2,5), ozona, dušikova i sumporova dioksida.\n\nBoja postaje prikazuje najlošiji razred među izmjerenim tvarima, prema razredima europskog indeksa kvalitete zraka (satne vrijednosti). To su izvorni, nekontrolirani podaci – službene ocjene i upozorenja objavljuje DHMZ.',
      izvor: 'DHMZ, meteo.hr (izvorni podaci)', azurirano: 'svaki sat'
    });
  }

  function iskrica(niz) {
    if (!niz || niz.length < 2) return null;
    const max = Math.max(...niz), min = Math.min(...niz), s = 120, v = 24;
    const t = niz.map((x, i) => (i * s / (niz.length - 1)).toFixed(1) + ',' + (v - 2 - (max === min ? 0.5 : (x - min) / (max - min)) * (v - 4)).toFixed(1)).join(' ');
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${s} ${v}`); svg.setAttribute('class', 'iskrica');
    const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', t); svg.append(pl);
    return svg;
  }

  function pokreni(s) {
    const el = s.api.el;
    s.skocniDodaci.zrak = (f) => {
      let m = f.get('mjerenja') || {};
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (g) { m = {}; } }
      const tablica = el('table', { class: 'zrak-tablica' },
        el('tr', {}, el('th', {}, 'Tvar'), el('th', {}, 'µg/m³'), el('th', {}, 'Zadnja 24 h')),
        ...Object.entries(m).map(([k, v]) => el('tr', {},
          el('td', { title: OPIS[k] || k }, el('span', { class: 'zrak-tocka', style: 'background:' + (BOJE[v.razred] || '#9aa0a6') }), k),
          el('td', {}, String(v.vrijednost).replace('.', ',')),
          el('td', {}, iskrica(v.niz) || ''))));
      return [tablica,
        el('p', { class: 'sitno-siva' }, 'Izvorni, nekontrolirani podaci DHMZ-a. '),
        el('a', { class: 'gumb-mali', href: f.get('url'), target: '_blank', rel: 'noopener' }, 'Svi podaci na meteo.hr')];
    };
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'zrak', pripremi, pokreni });
})();
