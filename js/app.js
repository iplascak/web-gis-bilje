/*
 * Web GIS Općine Bilje – glavna aplikacija
 * ----------------------------------------
 * Sve što portal prikazuje opisano je u dvije datoteke:
 *   config/portal.json – naslov, početni prikaz, podloge
 *   config/layers.json – grupe i slojevi (moduli)
 * Novi sloj se dodaje u layers.json, bez mijenjanja ovog koda.
 *
 * Podržani tipovi slojeva: "geojson", "wms".
 * (Kasnije: "pmtiles" za velike skupove podataka.)
 */
(function () {
  'use strict';

  const stanje = {
    karta: null,
    portal: null,
    konfig: null,
    slojevi: {},      // id -> { def, olSloj }
    podloge: {},      // id -> olSloj
    granicaExtent: null,
    odabranaKoordinata: null
  };

  // ---------- pomoćne funkcije ----------

  function el(tag, attrs, ...djeca) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const d of djeca.flat()) {
      if (d === null || d === undefined) continue;
      e.append(d instanceof Node ? d : document.createTextNode(String(d)));
    }
    return e;
  }

  async function ucitajJSON(url) {
    const odg = await fetch(url, { cache: 'no-cache' });
    if (!odg.ok) throw new Error('Ne mogu učitati ' + url + ' (' + odg.status + ')');
    return odg.json();
  }

  const fmtEur = new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  function formatiraj(vrijednost, format, def) {
    if (vrijednost === undefined || vrijednost === null || vrijednost === '') return null;
    switch (format) {
      case 'eur':
        return typeof vrijednost === 'number' ? fmtEur.format(vrijednost) : String(vrijednost);
      case 'datum': {
        const d = new Date(vrijednost);
        return isNaN(d) ? String(vrijednost) : d.toLocaleDateString('hr-HR');
      }
      case 'postotak':
        return vrijednost + ' %';
      case 'kategorija': {
        const kat = def.stil && def.stil.kategorije && def.stil.kategorije.vrijednosti[vrijednost];
        return kat ? kat.oznaka : String(vrijednost);
      }
      case 'poveznica':
        return el('a', { href: vrijednost, target: '_blank', rel: 'noopener' }, 'Otvori');
      default:
        return String(vrijednost);
    }
  }

  // ---------- stilovi ----------

  function napraviStil(stil) {
    stil = stil || {};
    const geom = stil.geometrija || 'poligon';
    const kesh = {};

    function osnovniStil(boja) {
      if (kesh[boja]) return kesh[boja];
      let s;
      if (geom === 'tocka') {
        s = new ol.style.Style({
          image: new ol.style.Circle({
            radius: stil.velicina || 7,
            fill: new ol.style.Fill({ color: boja }),
            stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
          })
        });
      } else if (geom === 'linija') {
        s = new ol.style.Style({ stroke: new ol.style.Stroke({ color: boja, width: stil.debljina || 3 }) });
      } else {
        s = new ol.style.Style({
          stroke: new ol.style.Stroke({ color: stil.rub || boja, width: stil.debljina || 2 }),
          fill: new ol.style.Fill({ color: stil.ispuna || 'rgba(0,0,0,0)' })
        });
      }
      kesh[boja] = s;
      return s;
    }

    // natpis (npr. naziv naselja ili ulice) – prikazuje se tek od zadanog zooma
    const natpisMaxRez = stil.natpisMinZoom !== undefined ? zoomURezoluciju(stil.natpisMinZoom) : Infinity;
    const natpisStil = stil.natpis ? new ol.style.Style({
      text: new ol.style.Text({
        font: (geom === 'poligon' ? '600 13px' : '12px') + ' system-ui, sans-serif',
        fill: new ol.style.Fill({ color: '#1f2937' }),
        stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.9)', width: 3 }),
        placement: geom === 'linija' ? 'line' : 'point',
        offsetY: geom === 'tocka' ? -15 : 0,
        overflow: geom === 'poligon'
      })
    }) : null;

    const zadana = stil.boja || stil.rub || '#2563eb';
    return function (f, rezolucija) {
      let boja = zadana;
      if (stil.kategorije) {
        const k = stil.kategorije.vrijednosti[f.get(stil.kategorije.polje)];
        if (k) boja = k.boja;
      }
      const osnovni = osnovniStil(boja);
      if (!natpisStil || rezolucija > natpisMaxRez) return osnovni;
      natpisStil.getText().setText(String(f.get(stil.natpis) || ''));
      return [osnovni, natpisStil];
    };
  }

  function napraviLegendu(def) {
    if (def.tip === 'wms' && def.legenda !== false) {
      // legenda koju daje sam WMS servis (GetLegendGraphic)
      const sloj = String(def.wmsSlojevi).split(',')[0];
      const url = def.url + (def.url.includes('?') ? '&' : '?') +
        'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&FORMAT=image/png&LAYER=' + encodeURIComponent(sloj);
      const img = el('img', { src: url, alt: 'Legenda: ' + def.naziv, loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      return el('div', { class: 'legenda legenda-wms' }, img);
    }
    const stil = def.stil;
    if (!stil) return null;
    const geom = stil.geometrija || 'poligon';
    const znak = (boja) => {
      const z = el('span', { class: 'znak ' + geom });
      if (geom === 'poligon') { z.style.borderColor = stil.rub || boja; z.style.background = stil.ispuna || 'transparent'; }
      else z.style.background = boja;
      return z;
    };
    const l = el('div', { class: 'legenda' });
    if (stil.kategorije) {
      for (const k of Object.values(stil.kategorije.vrijednosti)) l.append(el('div', {}, znak(k.boja), k.oznaka));
    } else if (geom !== 'poligon' || stil.ispuna) {
      l.append(el('div', {}, znak(stil.boja || stil.rub || '#2563eb'), def.naziv));
    } else {
      return null;
    }
    return l;
  }

  // ---------- izrada slojeva ----------

  function zoomURezoluciju(zoom) {
    // rezolucija (m/px) u Web Mercatoru za zadani zoom
    return 156543.03392804097 / Math.pow(2, zoom);
  }

  function napraviOlSloj(def) {
    const zajednicko = {
      visible: !!def.vidljivo,
      opacity: def.neprozirnost !== undefined ? def.neprozirnost : 1,
      maxResolution: def.minZoom !== undefined ? zoomURezoluciju(def.minZoom) : undefined,
      minResolution: def.maxZoom !== undefined ? zoomURezoluciju(def.maxZoom) : undefined
    };

    if (def.tip === 'geojson') {
      const izvor = new ol.source.Vector({
        url: def.url,
        format: new ol.format.GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })
      });
      izvor.on('featuresloaderror', () => console.warn('Greška pri učitavanju sloja', def.id));
      const sloj = new ol.layer.Vector(Object.assign({ source: izvor, style: napraviStil(def.stil) }, zajednicko));
      sloj.set('upitni', def.klik !== false);
      return sloj;
    }

    if (def.tip === 'wms') {
      const izvor = new ol.source.ImageWMS({
        url: def.url,
        params: { LAYERS: def.wmsSlojevi, FORMAT: def.format || 'image/png', TRANSPARENT: true, VERSION: '1.3.0' },
        projection: def.projekcija || 'EPSG:3857',
        ratio: 1.2,
        attributions: def.atribucija || def.izvor
      });
      return new ol.layer.Image(Object.assign({ source: izvor }, zajednicko));
    }

    console.warn('Nepoznat tip sloja:', def.tip, def.id);
    return null;
  }

  function napraviPodlogu(def) {
    let sloj;
    if (def.tip === 'osm') {
      sloj = new ol.layer.Tile({ source: new ol.source.OSM() });
    } else if (def.tip === 'wms') {
      sloj = new ol.layer.Image({
        source: new ol.source.ImageWMS({
          url: def.url,
          params: { LAYERS: def.wmsSlojevi, FORMAT: def.format || 'image/jpeg', VERSION: '1.3.0' },
          projection: def.projekcija || 'EPSG:3857',
          ratio: 1.2,
          attributions: def.atribucija
        })
      });
    } else {
      sloj = new ol.layer.Tile({ visible: false });
    }
    sloj.setVisible(!!def.zadano);
    sloj.setZIndex(-100);
    return sloj;
  }

  // ---------- sučelje: podloge i slojevi ----------

  function prikaziPodloge() {
    const div = document.getElementById('podloge');
    for (const def of stanje.portal.podloge) {
      const unos = el('input', {
        type: 'radio', name: 'podloga', value: def.id, checked: !!def.zadano,
        onchange: () => {
          for (const [id, s] of Object.entries(stanje.podloge)) s.setVisible(id === def.id);
        }
      });
      div.append(el('label', {}, unos, def.naziv));
    }
  }

  function prikaziSlojeve() {
    const div = document.getElementById('slojevi');
    for (const grupa of stanje.konfig.grupe) {
      const det = el('details', { class: 'grupa', open: grupa.otvoreno !== false },
        el('summary', {}, grupa.naziv));
      const slojeviGrupe = stanje.konfig.slojevi.filter(s => s.grupa === grupa.id);
      for (const def of slojeviGrupe) {
        const zapis = stanje.slojevi[def.id];
        if (!zapis) continue;
        const legenda = napraviLegendu(def);
        // legenda se prikazuje samo dok je sloj uključen
        if (legenda) legenda.hidden = !def.vidljivo;
        const kvacica = el('input', {
          type: 'checkbox', checked: !!def.vidljivo,
          onchange: (e) => {
            zapis.olSloj.setVisible(e.target.checked);
            if (legenda) legenda.hidden = !e.target.checked;
            zatvoriSkocni();
          }
        });
        const red = el('div', { class: 'sloj-red' },
          el('label', {}, kvacica, el('span', {}, def.naziv,
            def.minZoom ? el('span', { class: 'napomena' }, ' (uvećajte kartu)') : null)),
          el('button', { class: 'gumb-info', title: 'Podaci o sloju', 'aria-label': 'Podaci o sloju ' + def.naziv,
            onclick: () => prikaziMetapodatke(def) }, 'i'));
        det.append(el('div', { class: 'sloj' }, red, legenda));
      }
      div.append(det);
    }
  }

  function otvoriDijalog(...sadrzaj) {
    const d = document.getElementById('dijalog');
    const s = d.querySelector('.dijalog-sadrzaj');
    s.replaceChildren(...sadrzaj);
    d.showModal();
  }

  function prikaziMetapodatke(def) {
    const dl = el('dl');
    const dodaj = (k, v) => { if (v) dl.append(el('dt', {}, k), el('dd', {}, v)); };
    dodaj('Opis', def.opis);
    dodaj('Izvor', def.izvor);
    dodaj('Licenca', def.licenca);
    dodaj('Ažurirano', def.azurirano);
    otvoriDijalog(el('h3', {}, def.naziv), dl);
  }

  // ---------- skočni prozor (klik na objekt) ----------

  function zatvoriSkocni() {
    document.getElementById('skocni').hidden = true;
    stanje.odabranaKoordinata = null;
  }

  function pozicionirajSkocni() {
    if (!stanje.odabranaKoordinata) return;
    const px = stanje.karta.getPixelFromCoordinate(stanje.odabranaKoordinata);
    if (!px) return;
    const r = stanje.karta.getTargetElement().getBoundingClientRect();
    const s = document.getElementById('skocni');
    s.style.left = (r.left + px[0]) + 'px';
    s.style.top = (r.top + px[1]) + 'px';
  }

  function sadrzajZaObjekt(f, def) {
    const svojstva = f.getProperties();
    const cfg = def.skocniProzor || {};
    const naslov = svojstva[cfg.naslov] || def.naziv;
    const tablica = el('table');
    const polja = cfg.polja || Object.keys(svojstva).filter(k => k !== 'geometry').map(k => ({ polje: k, oznaka: k }));
    for (const p of polja) {
      const v = formatiraj(svojstva[p.polje], p.format, def);
      if (v === null) continue;
      tablica.append(el('tr', {}, el('th', {}, p.oznaka), el('td', {}, v)));
    }
    return [el('h3', {}, naslov), tablica, el('div', { class: 'vise' }, 'Sloj: ' + def.naziv)];
  }

  function naKlik(evt) {
    const pogoci = [];
    stanje.karta.forEachFeatureAtPixel(evt.pixel, (f, sloj) => {
      if (sloj && sloj.get('upitni') && sloj.get('defId') !== 'granica') pogoci.push([f, sloj]);
    }, { hitTolerance: 5 });

    if (!pogoci.length) { zatvoriSkocni(); return; }
    const [f, sloj] = pogoci[0];
    const def = stanje.slojevi[sloj.get('defId')].def;
    const s = document.getElementById('skocni');
    const sadrzaj = sadrzajZaObjekt(f, def);
    if (pogoci.length > 1) sadrzaj.push(el('div', { class: 'vise' }, 'Na ovom mjestu ima još ' + (pogoci.length - 1) + ' objekata – uvećajte kartu.'));
    s.querySelector('.skocni-sadrzaj').replaceChildren(...sadrzaj);
    const geom = f.getGeometry();
    stanje.odabranaKoordinata = geom.getType() === 'Point' ? geom.getCoordinates() : evt.coordinate;
    s.hidden = false;
    pozicionirajSkocni();
  }

  // ---------- pretraga (adrese, ulice, naselja) ----------

  function normaliziraj(t) {
    return String(t).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,]/g, ' ');
  }

  async function postaviPretragu(cfg) {
    const unos = document.getElementById('pretraga');
    const lista = document.getElementById('pretragaRezultati');
    if (!cfg) { unos.parentElement.hidden = true; return; }
    const format = new ol.format.GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
    const zapisi = [];

    const [adrese, naselja, ulice] = await Promise.all([
      cfg.adrese ? ucitajJSON(cfg.adrese) : null,
      cfg.naselja ? ucitajJSON(cfg.naselja) : null,
      cfg.ulice ? ucitajJSON(cfg.ulice) : null
    ]);
    if (naselja) for (const f of format.readFeatures(naselja)) {
      zapisi.push({ vrsta: 'Naselje', tekst: f.get('naziv'), geom: f.getGeometry(), red: 0 });
    }
    if (ulice) {
      const poUlici = new Map();
      for (const f of format.readFeatures(ulice)) {
        if (!f.getGeometry()) continue;
        const k = f.get('naziv') + '|' + f.get('naselje');
        const ext = f.getGeometry().getExtent();
        if (poUlici.has(k)) ol.extent.extend(poUlici.get(k).ext, ext);
        else poUlici.set(k, { f, ext });
      }
      for (const { f, ext } of poUlici.values()) {
        zapisi.push({ vrsta: 'Ulica', tekst: f.get('naziv') + ', ' + f.get('naselje'), extent: ext, red: 1 });
      }
    }
    if (adrese) for (const [ulica, broj, naselje, lon, lat] of adrese.adrese) {
      zapisi.push({ vrsta: 'Adresa', tekst: ulica + ' ' + broj + ', ' + naselje, tocka: ol.proj.fromLonLat([lon, lat]), red: 2 });
    }
    for (const z of zapisi) z.kljuc = normaliziraj(z.tekst);

    // sloj za oznaku pronađene lokacije
    const izvorOznake = new ol.source.Vector();
    const slojOznake = new ol.layer.Vector({
      source: izvorOznake, zIndex: 1000,
      style: new ol.style.Style({
        image: new ol.style.Circle({ radius: 9, fill: new ol.style.Fill({ color: 'rgba(220,38,38,0.85)' }), stroke: new ol.style.Stroke({ color: '#fff', width: 3 }) }),
        stroke: new ol.style.Stroke({ color: 'rgba(220,38,38,0.9)', width: 4 })
      })
    });
    stanje.karta.addLayer(slojOznake);

    let rezultati = [], aktivni = -1;

    function odaberi(z) {
      const view = stanje.karta.getView();
      izvorOznake.clear();
      if (z.tocka) {
        izvorOznake.addFeature(new ol.Feature(new ol.geom.Point(z.tocka)));
        view.animate({ center: z.tocka, zoom: 18, duration: 500 });
      } else if (z.extent) {
        view.fit(z.extent, { padding: [60, 60, 60, 60], maxZoom: 18, duration: 500 });
      } else if (z.geom) {
        view.fit(z.geom, { padding: [40, 40, 40, 40], duration: 500 });
      }
      unos.value = z.tekst;
      lista.hidden = true;
      if (window.innerWidth <= 720) document.getElementById('panel').classList.add('skriven');
    }

    function prikazi() {
      lista.replaceChildren(...rezultati.map((z, i) => el('li', {
        class: i === aktivni ? 'aktivan' : '', role: 'option',
        onmousedown: (e) => { e.preventDefault(); odaberi(z); }
      }, el('span', { class: 'vrsta' }, z.vrsta), z.tekst)));
      lista.hidden = rezultati.length === 0;
    }

    unos.addEventListener('input', () => {
      const rijeci = normaliziraj(unos.value).split(/\s+/).filter(Boolean);
      aktivni = -1;
      if (!rijeci.length) { rezultati = []; prikazi(); return; }
      rezultati = zapisi
        .filter(z => rijeci.every(r => z.kljuc.includes(r)))
        .sort((a, b) => a.red - b.red || a.kljuc.length - b.kljuc.length)
        .slice(0, 12);
      prikazi();
    });
    unos.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { aktivni = Math.min(aktivni + 1, rezultati.length - 1); prikazi(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { aktivni = Math.max(aktivni - 1, 0); prikazi(); e.preventDefault(); }
      else if (e.key === 'Enter' && rezultati.length) { odaberi(rezultati[Math.max(aktivni, 0)]); }
      else if (e.key === 'Escape') { lista.hidden = true; }
    });
    unos.addEventListener('blur', () => setTimeout(() => { lista.hidden = true; }, 150));
    unos.addEventListener('focus', () => { if (rezultati.length) lista.hidden = false; });
  }

  // ---------- pokretanje ----------

  async function pokreni() {
    const [portal, konfig] = await Promise.all([ucitajJSON('config/portal.json'), ucitajJSON('config/layers.json')]);
    stanje.portal = portal;
    stanje.konfig = konfig;

    document.title = portal.naslov;
    document.getElementById('naslov').textContent = portal.naslov;
    document.getElementById('podnaslov').textContent = portal.podnaslov || '';

    // Hrvatske projekcije (HTRS96/TM)
    for (const [kod, definicija] of Object.entries(portal.projekcije || {})) proj4.defs(kod, definicija);
    ol.proj.proj4.register(proj4);
    const htrs = ol.proj.get('EPSG:3765');
    if (htrs) htrs.setExtent([150000, 4700000, 850000, 5200000]);

    const view = new ol.View({
      center: ol.proj.fromLonLat(portal.pocetniPrikaz.centar),
      zoom: portal.pocetniPrikaz.zoom,
      minZoom: portal.minZoom,
      maxZoom: portal.maxZoom
    });

    const karta = new ol.Map({ target: 'karta', view });
    stanje.karta = karta;
    karta.addControl(new ol.control.ScaleLine());

    for (const def of portal.podloge) {
      const s = napraviPodlogu(def);
      stanje.podloge[def.id] = s;
      karta.addLayer(s);
    }

    konfig.slojevi.forEach((def, i) => {
      const s = napraviOlSloj(def);
      if (!s) return;
      s.set('defId', def.id);
      s.setZIndex(i);
      stanje.slojevi[def.id] = { def, olSloj: s };
      karta.addLayer(s);
    });

    prikaziPodloge();
    prikaziSlojeve();
    postaviPretragu(portal.pretraga).catch((g) => console.warn('Pretraga nije dostupna:', g));

    // granica općine – za gumb "Cijela općina"
    const granica = stanje.slojevi.granica;
    if (granica) {
      const izvor = granica.olSloj.getSource();
      izvor.once('featuresloadend', () => {
        stanje.granicaExtent = izvor.getExtent();
        // na početku prikaži cijelu općinu (radi i na mobitelu)
        view.fit(stanje.granicaExtent, { padding: [30, 30, 30, 30] });
      });
    }
    document.getElementById('gumbOpcina').addEventListener('click', () => {
      if (stanje.granicaExtent) view.fit(stanje.granicaExtent, { padding: [40, 40, 40, 40], duration: 400 });
    });

    // koordinate miša u HTRS96/TM
    const koord = document.getElementById('koordinate');
    karta.on('pointermove', (e) => {
      if (e.dragging || !htrs) return;
      const [x, y] = ol.proj.transform(e.coordinate, 'EPSG:3857', 'EPSG:3765');
      koord.textContent = 'HTRS96/TM  E ' + x.toFixed(0) + '  N ' + y.toFixed(0);
    });
    karta.on('pointermove', (e) => {
      if (e.dragging) return;
      const imaObjekt = karta.hasFeatureAtPixel(e.pixel, {
        layerFilter: (l) => l.get('upitni') && l.get('defId') !== 'granica', hitTolerance: 5
      });
      karta.getTargetElement().style.cursor = imaObjekt ? 'pointer' : '';
    });

    karta.on('singleclick', naKlik);
    karta.on('postrender', pozicionirajSkocni);
    document.querySelector('#skocni .zatvori').addEventListener('click', zatvoriSkocni);

    // panel, dijalog, "O portalu"
    document.getElementById('gumbPanel').addEventListener('click', () => {
      document.getElementById('panel').classList.toggle('skriven');
      setTimeout(() => karta.updateSize(), 50);
    });
    if (window.innerWidth <= 720) document.getElementById('panel').classList.add('skriven');
    const dijalog = document.getElementById('dijalog');
    dijalog.querySelector('.zatvori').addEventListener('click', () => dijalog.close());
    document.getElementById('gumbOPortalu').addEventListener('click', () =>
      otvoriDijalog(el('h3', {}, portal.naslov), el('p', {}, portal.oPortalu || '')));
  }

  pokreni().catch((g) => {
    console.error(g);
    document.getElementById('karta').append(
      el('p', { style: 'padding:20px;color:#b91c1c' }, 'Greška pri pokretanju portala: ' + g.message));
  });
})();
