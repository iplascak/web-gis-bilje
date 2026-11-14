/*
 * Modul: alati na karti (u stilu Felta) – mjerenje, usporedba snimaka (klizač) i bilješke
 * koje se dijele poveznicom (bez prijave i bez spremanja na poslužitelj: sve je u poveznici).
 */
(function () {
  'use strict';
  let stanje = null, el = null, karta = null;
  let aktivni = null;         // trenutno aktivan alat
  let crtanje = null;         // ol.interaction.Draw
  let izvorMjerenja, slojMjerenja, izvorBiljeski, slojBiljeski;
  let usporedba = null;       // { sloj, klizac, postotak }

  // ---------- pomoćno ----------
  const fmtDuljina = (m) => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2).replace('.', ',') + ' km';
  const fmtPovrsina = (m2) => m2 < 10000 ? Math.round(m2) + ' m²' : (m2 / 10000).toFixed(2).replace('.', ',') + ' ha' + (m2 > 1e6 ? ' (' + (m2 / 1e6).toFixed(2).replace('.', ',') + ' km²)' : '');
  function oznakaMjere(geom) {
    if (geom instanceof ol.geom.Polygon) return fmtPovrsina(ol.sphere.getArea(geom)) + ' · opseg ' + fmtDuljina(ol.sphere.getLength(new ol.geom.LineString(geom.getCoordinates()[0])));
    if (geom instanceof ol.geom.LineString) return fmtDuljina(ol.sphere.getLength(geom));
    return '';
  }
  const stilMjere = (f) => {
    const g = f.getGeometry();
    const tekst = oznakaMjere(g);
    return [
      new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#111', width: 2.5, lineDash: [8, 6] }), fill: new ol.style.Fill({ color: 'rgba(241,197,14,.18)' }) }),
      new ol.style.Style({
        geometry: g instanceof ol.geom.Polygon ? g.getInteriorPoint() : new ol.geom.Point(g.getLastCoordinate()),
        text: new ol.style.Text({ text: tekst, font: '600 13px "Libre Franklin", sans-serif', fill: new ol.style.Fill({ color: '#111' }),
          backgroundFill: new ol.style.Fill({ color: 'rgba(255,255,255,.92)' }), padding: [3, 6, 3, 6], offsetY: -14 })
      })];
  };
  const BOJE_BILJESKI = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed'];
  const stilBiljeske = (f) => {
    const boja = f.get('boja') || BOJE_BILJESKI[0];
    const g = f.getGeometry();
    return new ol.style.Style({
      image: stanje.api.ikonaSimbola(null, boja, 28),
      stroke: new ol.style.Stroke({ color: boja, width: 3 }), fill: new ol.style.Fill({ color: boja + '33' }),
      text: f.get('tekst') ? new ol.style.Text({ text: f.get('tekst'), font: '600 13px "Libre Franklin", sans-serif', overflow: true,
        fill: new ol.style.Fill({ color: '#111' }), backgroundFill: new ol.style.Fill({ color: 'rgba(255,255,255,.92)' }),
        backgroundStroke: new ol.style.Stroke({ color: boja, width: 1.5 }), padding: [3, 6, 3, 6], offsetY: g instanceof ol.geom.Point ? -18 : 0 }) : undefined
    });
  };

  function zaustavi() {
    if (crtanje) { karta.removeInteraction(crtanje); crtanje = null; }
    if (aktivni === 'usporedba') ukloniUsporedbu();
    aktivni = null;
    for (const b of document.querySelectorAll('.alat-gumb')) b.classList.remove('aktivan');
    const t = document.getElementById('alatTraka'); if (t) t.remove();
    stanje.alatAktivan = false;
  }

  function traka(...sadrzaj) {
    let t = document.getElementById('alatTraka');
    if (!t) { t = el('div', { id: 'alatTraka', class: 'traka-odabira traka-alata' }); document.body.append(t); }
    t.replaceChildren(...sadrzaj, el('button', { onclick: zaustavi }, 'Gotovo'));
  }

  // ---------- mjerenje ----------
  function mjeri(vrsta) {
    zaustavi();
    aktivni = vrsta;
    stanje.alatAktivan = true;
    document.querySelector('[data-alat="' + vrsta + '"]').classList.add('aktivan');
    crtanje = new ol.interaction.Draw({ source: izvorMjerenja, type: vrsta === 'povrsina' ? 'Polygon' : 'LineString', style: stilMjere });
    karta.addInteraction(crtanje);
    traka(el('span', {}, vrsta === 'povrsina' ? 'Kliknite točke površine, dvoklik za kraj' : 'Kliknite točke puta, dvoklik za kraj'),
      el('button', { onclick: () => izvorMjerenja.clear() }, 'Obriši mjerenja'));
  }

  // ---------- usporedba snimaka (klizač) ----------
  function ukloniUsporedbu() {
    if (!usporedba) return;
    karta.removeLayer(usporedba.sloj);
    usporedba.klizac.remove();
    usporedba = null;
    karta.render();
  }

  function usporedi(idDesno) {
    ukloniUsporedbu();
    const sve = [...stanje.portal.podloge, ...(stanje.portal.preklopi || [])];
    const def = sve.find(p => p.id === idDesno);
    if (!def) return;
    const sloj = stanje.portal.podloge.includes(def) ? stanje.api.napraviPodlogu(def) : stanje.api.napraviOlSloj(Object.assign({ tip: 'xyz' }, def));
    sloj.setVisible(true); sloj.setOpacity(1); sloj.setZIndex(-40);
    const omotac = sloj.getLayers ? sloj.getLayers().getArray() : [sloj];
    const klizac = el('div', { class: 'usporedba-klizac', role: 'slider', 'aria-label': 'Klizač usporedbe', tabindex: '0' },
      el('div', { class: 'usporedba-rucka' }, '⟷'));
    usporedba = { sloj, klizac, postotak: 0.5 };
    for (const l of omotac) {
      l.on('prerender', (e) => {
        const ctx = e.context; if (!ctx || !ctx.save) return;
        const w = ctx.canvas.width, h = ctx.canvas.height;
        const x = w * usporedba.postotak;
        ctx.save(); ctx.beginPath(); ctx.rect(x, 0, w - x, h); ctx.clip();
      });
      l.on('postrender', (e) => { if (e.context && e.context.restore) e.context.restore(); });
    }
    karta.addLayer(sloj);
    document.getElementById('karta').append(klizac);
    const postavi = (p) => { usporedba.postotak = Math.min(0.98, Math.max(0.02, p)); klizac.style.left = (usporedba.postotak * 100) + '%'; karta.render(); };
    postavi(0.5);
    let vuci = false;
    klizac.addEventListener('pointerdown', (e) => { vuci = true; klizac.setPointerCapture(e.pointerId); e.stopPropagation(); });
    klizac.addEventListener('pointermove', (e) => { if (!vuci) return; const r = karta.getTargetElement().getBoundingClientRect(); postavi((e.clientX - r.left) / r.width); });
    klizac.addEventListener('pointerup', () => { vuci = false; });
    klizac.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') postavi(usporedba.postotak - 0.05); if (e.key === 'ArrowRight') postavi(usporedba.postotak + 0.05); });
  }

  function alatUsporedbe() {
    zaustavi();
    aktivni = 'usporedba';
    document.querySelector('[data-alat="usporedba"]').classList.add('aktivan');
    const sve = [...stanje.portal.podloge.filter(p => p.tip !== 'prazno'), ...(stanje.portal.preklopi || [])];
    const odabir = el('select', { onchange: (e) => usporedi(e.target.value) },
      ...sve.filter(p => p.id !== stanje.podloga).map(p => el('option', { value: p.id }, p.kratkiNaziv || p.naziv)));
    traka(el('span', {}, 'Lijevo: trenutna podloga · desno:'), odabir);
    // zadano: ortofoto 2021 ↔ snimka dronom 2020, ili prvi drugi izbor
    const zadano = sve.find(p => p.id === 'dof_bilje_2020' && stanje.podloga !== p.id) || sve.find(p => p.id !== stanje.podloga);
    if (zadano) { odabir.value = zadano.id; usporedi(zadano.id); }
  }

  // ---------- bilješke ----------
  function kodirajBiljeske() {
    const fmt = new ol.format.GeoJSON();
    const fs = izvorBiljeski.getFeatures().map(f => {
      const o = fmt.writeFeatureObject(f, { featureProjection: 'EPSG:3857', decimals: 5 });
      return [{ Point: 'T', LineString: 'L', Polygon: 'P' }[o.geometry.type], o.geometry.coordinates, f.get('tekst') || '', BOJE_BILJESKI.indexOf(f.get('boja'))];
    });
    if (!fs.length) return '';
    const json = JSON.stringify(fs);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function dekodirajBiljeske(niz) {
    try {
      const json = decodeURIComponent(escape(atob(niz.replace(/-/g, '+').replace(/_/g, '/'))));
      const tip = { T: 'Point', L: 'LineString', P: 'Polygon' };
      for (const [t, k, tekst, b] of JSON.parse(json)) {
        const vrsta = tip[t];
        const g = new ol.format.GeoJSON().readGeometry({ type: vrsta, coordinates: k }, { featureProjection: 'EPSG:3857' });
        izvorBiljeski.addFeature(new ol.Feature({ geometry: g, tekst, boja: BOJE_BILJESKI[b] || BOJE_BILJESKI[0] }));
      }
    } catch (g) { console.warn('Bilješke iz poveznice nisu ispravne', g); }
  }

  function biljeske() {
    zaustavi();
    aktivni = 'biljeske';
    stanje.alatAktivan = true;
    document.querySelector('[data-alat="biljeske"]').classList.add('aktivan');
    let boja = BOJE_BILJESKI[0], vrsta = 'Point';
    const pokreniCrtanje = () => {
      if (crtanje) karta.removeInteraction(crtanje);
      crtanje = new ol.interaction.Draw({ source: izvorBiljeski, type: vrsta });
      crtanje.on('drawend', (e) => {
        const tekst = window.prompt('Tekst bilješke (može ostati prazno):', '') || '';
        e.feature.setProperties({ tekst: tekst.slice(0, 140), boja });
      });
      karta.addInteraction(crtanje);
    };
    const gumbVrste = (v, naziv) => el('button', { class: v === vrsta ? 'aktivan' : '', onclick: (e) => {
      vrsta = v; for (const b of e.target.parentElement.querySelectorAll('.vrsta-btn')) b.classList.remove('aktivan'); e.target.classList.add('aktivan'); pokreniCrtanje();
    }, 'data-v': v }, naziv);
    const vrste = el('span', { class: 'vrste' }, ...[['Point', 'Točka'], ['LineString', 'Linija'], ['Polygon', 'Površina']].map(([v, n]) => { const b = gumbVrste(v, n); b.classList.add('vrsta-btn'); return b; }));
    const boje = el('span', { class: 'boje' }, ...BOJE_BILJESKI.map(b => el('button', { class: 'boja' + (b === boja ? ' aktivan' : ''), style: 'background:' + b, 'aria-label': 'Boja',
      onclick: (e) => { boja = b; for (const x of boje.children) x.classList.remove('aktivan'); e.target.classList.add('aktivan'); } })));
    traka(vrste, boje,
      el('button', { onclick: () => {
        const kod = kodirajBiljeske();
        const h = new URLSearchParams(location.hash.slice(1));
        if (kod) h.set('b', kod); else h.delete('b');
        const url = location.origin + location.pathname + '#' + h.toString().replace(/%2F/g, '/').replace(/%2C/g, ',');
        if (url.length > 7500) { alert('Bilješki je previše za jednu poveznicu – pojednostavite crtež.'); return; }
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => tost('Poveznica s bilješkama kopirana'), () => prompt('Poveznica', url));
      } }, 'Podijeli'),
      el('button', { onclick: () => {
        const json = new ol.format.GeoJSON().writeFeatures(izvorBiljeski.getFeatures(), { featureProjection: 'EPSG:3857', decimals: 6 });
        const a = el('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/geo+json' })), download: 'biljeske.geojson' }); a.click();
      } }, 'Preuzmi'),
      el('button', { onclick: () => izvorBiljeski.clear() }, 'Obriši'));
    pokreniCrtanje();
  }

  function tost(t) { const p = el('div', { class: 'tost' }, t); document.body.append(p); setTimeout(() => p.remove(), 1800); }

  function pokreni(s) {
    stanje = s; el = s.api.el; karta = s.karta;
    izvorMjerenja = new ol.source.Vector();
    slojMjerenja = new ol.layer.Vector({ source: izvorMjerenja, style: stilMjere, zIndex: 1100 });
    izvorBiljeski = new ol.source.Vector();
    slojBiljeski = new ol.layer.Vector({ source: izvorBiljeski, style: stilBiljeske, zIndex: 1090 });
    karta.addLayer(slojMjerenja); karta.addLayer(slojBiljeski);
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('b')) dekodirajBiljeske(h.get('b'));

    const ikona = s.api.ikona;
    const g = (alat, naslov, ik, fn) => el('button', { class: 'alat-gumb', 'data-alat': alat, title: naslov, 'aria-label': naslov,
      onclick: () => (aktivni === alat ? zaustavi() : fn()) }, ikona(ik, 18));
    const okvir = el('div', { class: 'alati' },
      g('udaljenost', 'Izmjeri udaljenost', 'ravnalo', () => mjeri('udaljenost')),
      g('povrsina', 'Izmjeri površinu', 'povrsina', () => mjeri('povrsina')),
      g('usporedba', 'Usporedi snimke (klizač)', 'usporedba', alatUsporedbe),
      g('biljeske', 'Bilješke na karti (podijeli poveznicom)', 'olovka', biljeske));
    document.getElementById('karta').append(okvir);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aktivni) zaustavi(); });
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'alati', pokreni });
})();
