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
    odabranaKoordinata: null,
    skriveneKategorije: {},
    nacinLokacije: false,
    odabirTocke: null,
    skocniDodaci: {},
    preklopi: {},
    intenzitetPodloge: 0.75,
    sivaPodloga: false
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

  function hexURgba(hex, alfa) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alfa})` : hex;
  }

  // jednostavni simboli za točke (bijeli znak na obojenom krugu), viewBox 24x24
  const SIMBOLI = {
    opcina: 'M3 10h18L12 4z M5 11h2.5v7H5z M10.75 11h2.5v7h-2.5z M16.5 11H19v7h-2.5z M3 19h18v2H3z',
    vrtic: 'M12 3.5a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z M8 10h8l2.5 4-1.8 1L15 12.5V21h-2.2v-5h-1.6v5H9v-8.5L7.3 15l-1.8-1z',
    kultura: 'M3.5 5.5C6 4.5 9 4.6 11 6v13c-2-1.4-5-1.5-7.5-.5z M20.5 5.5C18 4.5 15 4.6 13 6v13c2-1.4 5-1.5 7.5-.5z',
    turizam: 'M10.6 10h2.8v9h-2.8z M12 4.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
    zaprimljeno: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2.3a6.7 6.7 0 1 1 0 13.4 6.7 6.7 0 0 1 0-13.4zM11 7h2v5.1l3.2 2-1.1 1.7L11 13.2z',
    u_obradi: 'M14.7 3.3a5 5 0 0 0-5.9 6.6l-5.5 5.5a1.6 1.6 0 0 0 0 2.3l3 3a1.6 1.6 0 0 0 2.3 0l5.5-5.5a5 5 0 0 0 6.6-5.9l-3 3-2.8-.7-.7-2.8z',
    rijeseno: 'M9.5 16.2 4.8 11.5 3.2 13.1l6.3 6.3L21 7.9l-1.6-1.6z',
    odbijeno: 'M6.4 4.8 12 10.4l5.6-5.6 1.6 1.6-5.6 5.6 5.6 5.6-1.6 1.6-5.6-5.6-5.6 5.6-1.6-1.6 5.6-5.6-5.6-5.6z',
    reciklaza: 'M7.5 9.5 10 5.2a2 2 0 0 1 3.5 0l1.3 2.2 1.8-1 .2 4.6-4.1-2.1 1.8-1-1-1.7-2.2 3.8zM16.8 11l2.5 4.3a2 2 0 0 1-1.7 3H15v2l-3.9-2.6 3.9-2.4v2h2.6l-2.2-3.8zM9.6 18.3H4.6a2 2 0 0 1-1.7-3l1.3-2.2-1.8-1 4-2.5.2 4.6-1.8-1-1 1.7h4.4z',
    komunalno: 'M2 7h11v8.5H2z M13.5 10H18l3 3.2v2.3h-7.5z M6 15.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z M17 15.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z'
  };
  function svgSimbola(simbol, boja) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      '<circle cx="16" cy="16" r="14.5" fill="' + boja + '" stroke="#fff" stroke-width="2.5"/>' +
      '<g transform="translate(5.2 5.2) scale(0.9)"><path d="' + SIMBOLI[simbol] + '" fill="#fff" fill-rule="evenodd"/></g></svg>');
  }
  function ikonaSimbola(simbol, boja, velicina) {
    return new ol.style.Icon({ src: svgSimbola(simbol, boja), width: velicina || 30, height: velicina || 30 });
  }

  function napraviStil(stil, idSloja) {
    stil = stil || {};
    const geom = stil.geometrija || 'poligon';
    const kesh = {};

    function osnovniStil(boja, simbol) {
      const kljuc = boja + (simbol || '');
      if (kesh[kljuc]) return kesh[kljuc];
      let s;
      if (geom === 'tocka' && simbol && SIMBOLI[simbol]) {
        s = new ol.style.Style({ image: ikonaSimbola(simbol, boja, stil.velicinaIkone) });
      } else if (geom === 'tocka') {
        s = new ol.style.Style({
          image: new ol.style.Circle({
            radius: stil.velicina || 7,
            fill: new ol.style.Fill({ color: boja }),
            stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
          })
        });
      } else if (geom === 'linija') {
        s = new ol.style.Style({ stroke: new ol.style.Stroke({ color: boja, width: stil.debljina || 3, lineDash: stil.isprekidano ? [8, 6] : undefined }) });
      } else {
        const ispuna = stil.ispuna || (stil.ispunaProzirnost ? hexURgba(boja, stil.ispunaProzirnost) : 'rgba(0,0,0,0)');
        s = new ol.style.Style({
          stroke: new ol.style.Stroke({ color: stil.rub || boja, width: stil.debljina || 2, lineDash: stil.isprekidano ? [8, 6] : undefined }),
          fill: new ol.style.Fill({ color: ispuna })
        });
      }
      kesh[kljuc] = s;
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
        offsetY: geom === 'tocka' ? (stil.simbol || stil.kategorije && Object.values(stil.kategorije.vrijednosti).some(v => v.simbol) ? -22 : -15) : 0,
        overflow: geom === 'poligon'
      })
    }) : null;

    const zadana = stil.boja || stil.rub || '#2563eb';
    return function (f, rezolucija) {
      let boja = zadana, simbol = null;
      if (stil.kategorije) {
        const vrijednost = f.get(stil.kategorije.polje);
        // kategorija isključena u legendi -> objekt se ne crta (i ne može se kliknuti)
        const skrivene = idSloja && stanje.skriveneKategorije[idSloja];
        if (skrivene && skrivene.has(String(vrijednost))) return null;
        const k = stil.kategorije.vrijednosti[vrijednost];
        if (k) { boja = k.boja; simbol = k.simbol; }
      }
      const osnovni = osnovniStil(boja, simbol || stil.simbol);
      if (!natpisStil || rezolucija > natpisMaxRez) return osnovni;
      natpisStil.getText().setText(String(f.get(stil.natpis) || ''));
      return [osnovni, natpisStil];
    };
  }

  function napraviLegendu(def) {
    if (def.legendaStavke) {
      const l = el('div', { class: 'legenda' });
      for (const st of def.legendaStavke) {
        const z = el('span', { class: 'znak poligon' });
        z.style.background = st.boja; z.style.borderColor = st.boja;
        l.append(el('div', {}, z, st.oznaka));
      }
      return l;
    }
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
    const znak = (boja, simbol) => {
      if (geom === 'tocka' && simbol && SIMBOLI[simbol]) return el('img', { class: 'znak-ikona', src: svgSimbola(simbol, boja), alt: '' });
      const z = el('span', { class: 'znak ' + geom });
      if (geom === 'poligon') {
        z.style.borderColor = stil.rub || boja;
        z.style.background = stil.ispuna || (stil.ispunaProzirnost ? hexURgba(boja, Math.max(stil.ispunaProzirnost, 0.3)) : 'transparent');
        if (stil.isprekidano) z.style.borderStyle = 'dashed';
      }
      else z.style.background = boja;
      return z;
    };
    const l = el('div', { class: 'legenda' });
    if (stil.kategorije) {
      // svaka kategorija ima vlastitu kvačicu za uključivanje/isključivanje
      const skrivene = stanje.skriveneKategorije[def.id] || (stanje.skriveneKategorije[def.id] = new Set());
      for (const [vrijednost, k] of Object.entries(stil.kategorije.vrijednosti)) {
        const kv = el('input', { type: 'checkbox', checked: !skrivene.has(vrijednost), 'aria-label': k.oznaka,
          onchange: (e) => {
            if (e.target.checked) skrivene.delete(vrijednost); else skrivene.add(vrijednost);
            const z = stanje.slojevi[def.id];
            if (z) z.olSloj.changed();
            zatvoriSkocni();
          } });
        l.append(el('label', { class: 'kategorija' }, kv, znak(k.boja, k.simbol), k.oznaka));
      }
      l.classList.add('legenda-kategorije');
    } else if (geom !== 'poligon' || stil.ispuna) {
      l.append(el('div', {}, znak(stil.boja || stil.rub || '#2563eb', stil.simbol), def.naziv));
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

  function wfsUrl(def) {
    const p = new URLSearchParams({
      service: 'WFS', version: def.verzija || '1.1.0', request: 'GetFeature',
      typeName: def.typeName, outputFormat: 'application/json', srsName: 'EPSG:3857',
      bbox: def.bbox || stanje.portal.wfsBbox
    });
    return def.url + '?' + p.toString();
  }

  function napraviOlSloj(def) {
    const zajednicko = {
      visible: !!def.vidljivo,
      opacity: def.neprozirnost !== undefined ? def.neprozirnost : 1,
      maxResolution: def.minZoom !== undefined ? zoomURezoluciju(def.minZoom) : undefined,
      minResolution: def.maxZoom !== undefined ? zoomURezoluciju(def.maxZoom) : undefined
    };

    if (def.tip === 'geojson') {
      const format = new ol.format.GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' });
      const izvor = new ol.source.Vector(def.zaglavlja ? {
        // izvor koji traži zaglavlja (npr. ključ baze) – vlastito učitavanje
        loader: (extent, res, proj, uspjeh, neuspjeh) => {
          fetch(def.url, { headers: def.zaglavlja })
            .then(o => { if (!o.ok) throw new Error(o.status); return o.json(); })
            .then(j => { const f = format.readFeatures(j); izvor.clear(true); izvor.addFeatures(f); uspjeh(f); })
            .catch(() => { izvor.dispatchEvent('featuresloaderror'); neuspjeh(); });
        }
      } : { url: def.url, format });
      izvor.on('featuresloaderror', () => console.warn('Greška pri učitavanju sloja', def.id));
      const sloj = new ol.layer.Vector(Object.assign({ source: izvor, style: napraviStil(def.stil, def.id) }, zajednicko));
      sloj.set('upitni', def.klik !== false);
      return sloj;
    }

    if (def.tip === 'wfs') {
      // WFS: vektorski objekti uživo sa servisa (samo za područje općine)
      const izvor = new ol.source.Vector({
        url: wfsUrl(def),
        format: new ol.format.GeoJSON({ dataProjection: 'EPSG:3857', featureProjection: 'EPSG:3857' }),
        attributions: def.atribucija
      });
      izvor.on('featuresloaderror', () => console.warn('Greška pri učitavanju WFS sloja', def.id));
      const sloj = new ol.layer.Vector(Object.assign({ source: izvor, style: napraviStil(def.stil, def.id) }, zajednicko));
      sloj.set('upitni', def.klik !== false);
      return sloj;
    }

    if (def.tip === 'slika') {
      // gotova slika (npr. rezultat satelitske analize) s poznatim obuhvatom u EPSG:3857
      const izvor = new ol.source.ImageStatic({
        url: def.url, imageExtent: def.extent, projection: 'EPSG:3857', attributions: def.atribucija
      });
      return new ol.layer.Image(Object.assign({ source: izvor }, zajednicko));
    }

    if (def.tip === 'xyz') {
      // vlastite pločice (npr. snimke dronom); više izvora, svaki samo unutar svog obuhvata
      const slojevi = (def.izvori || [{ url: def.url, extent: def.extent }]).map(iz => new ol.layer.Tile({
        extent: iz.extent,
        source: new ol.source.XYZ({ url: iz.url, maxZoom: def.maxNativeZoom || 21, attributions: def.atribucija, transition: 150 })
      }));
      return new ol.layer.Group(Object.assign({ layers: slojevi }, zajednicko));
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
      sloj = new ol.layer.Tile({ source: new ol.source.OSM(), className: 'podloga' });
    } else if (def.tip === 'wms') {
      // jedna slika po prikazu (ne pločice): DGU na svaku sliku stavlja vodeni žig "GEOPORTAL",
      // pa bi ga pločice ponavljale po cijeloj karti
      sloj = new ol.layer.Image({
        className: 'podloga',
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
    sloj.setOpacity(stanje.intenzitetPodloge);
    return sloj;
  }

  function procitajPostavku(kljuc, zadano) {
    try { const v = localStorage.getItem('webgis.' + kljuc); return v === null ? zadano : JSON.parse(v); } catch (g) { return zadano; }
  }
  function spremiPostavku(kljuc, v) {
    try { localStorage.setItem('webgis.' + kljuc, JSON.stringify(v)); } catch (g) { /* nije važno */ }
  }

  function postaviIzgledPodloge() {
    for (const s of Object.values(stanje.podloge)) s.setOpacity(stanje.intenzitetPodloge);
    stanje.karta.getTargetElement().classList.toggle('podloga-siva', stanje.sivaPodloga);
  }

  // ---------- sučelje: podloge i slojevi ----------



  // ---------- ikone sučelja (vlastiti jednostavni crteži, 24x24, obrub) ----------
  const IKONE = {
    karta: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
    kanta: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6m4-6v6',
    traktor: 'M3 17a3 3 0 1 0 6 0 3 3 0 0 0-6 0zm13 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM6 14V7h6l2 5h5v5M9 17h7M12 7v5',
    oblak: 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
    lokacija: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zm0-14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    ravnalo: 'M3 17 17 3l4 4L7 21zM7 13l2 2m1-5 2 2m1-5 2 2',
    poruka: 'M4 5h16v11H9l-5 4z',
    zgrada: 'M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16',
    kran: 'M4 21h10M7 21V5l13 3M7 5 4 8m16 0v5m-2 0h4v3h-4z',
    sestar: 'M12 3v3m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-1 4-5 11m7-11 5 11M7 15h10',
    val: 'M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
    satelit: 'M13 7 9 3 5 7l4 4m4-4 4 4m-4-4 2-2 4 4-2 2m-8 0 4 4 4-4M9 11l-2 2 4 4 2-2M4 16a4 4 0 0 0 4 4M3 13a8 8 0 0 0 8 8',
    list: 'M5 19c0-9 5-14 15-14 0 10-5 15-14 15zM5 19 13 11',
    stup: 'M3 21h18M5 18h14M6 18V9m4 9V9m4 9V9m4 9V9M3 9l9-6 9 6z',
    autobus: 'M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11zM5 12h14M7 17v3m10-3v3M8 14.5h.01M16 14.5h.01',
    slojevi: 'm12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5',
    tocke: 'M5 12h.01M12 12h.01M19 12h.01',
    zatvori: 'M6 6l12 12M18 6 6 18',
    povuci: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    plus: 'M12 5v14M5 12h14',
    info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    cilj: 'M12 3v3m0 12v3M3 12h3m12 0h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    kuca: 'M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6',
    stablo: 'M12 21v-6m0 0-4-4m4 4 4-4M12 3a6 6 0 0 0-6 6 6 6 0 0 0 12 0 6 6 0 0 0-6-6z',
    kljuc: 'M14.7 3.3a5 5 0 0 0-5.9 6.6l-5.5 5.5a1.6 1.6 0 0 0 0 2.3l3 3a1.6 1.6 0 0 0 2.3 0l5.5-5.5a5 5 0 0 0 6.6-5.9l-3 3-2.8-.7-.7-2.8z',
    strelica: 'm9 6 6 6-6 6'
  };
  function ikona(ime, velicina = 18) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', velicina); s.setAttribute('height', velicina);
    s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ikona');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', IKONE[ime] || IKONE.slojevi);
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.8');
    p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.append(p);
    return s;
  }

  // minijaturni prikaz stila sloja (kako izgleda na karti)
  function uzorakSloja(def) {
    const stil = def.stil || {};
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('width', 20); svg.setAttribute('height', 20);
    svg.setAttribute('class', 'uzorak'); svg.setAttribute('aria-hidden', 'true');
    const dodaj = (ime, attrs) => { const e = document.createElementNS(NS, ime); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); svg.append(e); };
    const kat = stil.kategorije ? Object.values(stil.kategorije.vrijednosti) : [];
    const boje = kat.length ? kat.map(k => k.boja).slice(0, 3) : [stil.boja || stil.rub || '#2563eb'];
    const geom = stil.geometrija;
    const sim = kat.find(k => k.simbol) || (stil.simbol ? { simbol: stil.simbol, boja: boje[0] } : null);
    if (geom === 'tocka' && sim && SIMBOLI[sim.simbol]) {
      return el('img', { class: 'uzorak', src: svgSimbola(sim.simbol, sim.boja), alt: '', width: 20, height: 20 });
    }
    if (!def.stil) {
      // rasterski sloj (WMS, snimka): mali "mozaik"
      dodaj('rect', { x: 2, y: 2, width: 16, height: 16, rx: 4, fill: '#d9e3d0' });
      dodaj('path', { d: 'M2 13c3-3 6-3 9 0s5 2 7-1v4a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z', fill: '#8fb07a' });
      dodaj('circle', { cx: 13.5, cy: 6.5, r: 2, fill: '#f1c50e' });
    } else if (geom === 'tocka') {
      if (kat.length > 1) boje.forEach((b, i) => dodaj('circle', { cx: 5 + i * 5, cy: 10 + (i % 2 ? -3 : 3), r: 3.6, fill: b, stroke: '#fff', 'stroke-width': 1.2 }));
      else dodaj('circle', { cx: 10, cy: 10, r: 5, fill: boje[0], stroke: '#fff', 'stroke-width': 1.5 });
    } else if (geom === 'linija') {
      boje.forEach((b, i) => dodaj('path', { d: `M2 ${14 - i * 4}c4-6 8 2 16-4`, fill: 'none', stroke: b, 'stroke-width': stil.debljina > 2 ? 3 : 2.2,
        'stroke-dasharray': stil.isprekidano ? '3 2.5' : 'none', 'stroke-linecap': 'round' }));
    } else {
      if (kat.length > 1) boje.forEach((b, i) => dodaj('rect', { x: 2 + i * 5, y: 2 + i * 5, width: 10, height: 10, rx: 2.5, fill: b, 'fill-opacity': .55, stroke: b, 'stroke-width': 1.2 }));
      else dodaj('rect', { x: 3, y: 3, width: 14, height: 14, rx: 3.5, fill: boje[0], 'fill-opacity': Math.max(stil.ispunaProzirnost ?? .25, .12),
        stroke: boje[0], 'stroke-width': 1.6, 'stroke-dasharray': stil.isprekidano ? '3 2' : 'none' });
    }
    return svg;
  }

  // ---------- podloga: plutajući prebacivač u kutu karte ----------

  function sličicaPodloge(def) {
    // mali pregled oko središta Bilja, učitan izravno sa servisa
    if (def.tip === 'osm') {
      const z = 13, lon = 18.745, lat = 45.606, n = 2 ** z;
      const x = Math.floor((lon + 180) / 360 * n);
      const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
      return 'https://tile.openstreetmap.org/' + z + '/' + x + '/' + y + '.png';
    }
    if (def.tip === 'wms') {
      const p = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: def.wmsSlojevi, STYLES: '',
        FORMAT: def.format || 'image/jpeg', CRS: def.projekcija || 'EPSG:3765', WIDTH: 128, HEIGHT: 128,
        BBOX: def.projekcija === 'EPSG:3857' ? '2085800,5716400,2087800,5718400' : '673700,5052600,675700,5054600' });
      return def.url + '?' + p;
    }
    return null;
  }

  function postaviPodlogu(idPodloge) {
    if (!stanje.podloge[idPodloge]) return;
    for (const [id, s] of Object.entries(stanje.podloge)) s.setVisible(id === idPodloge);
    stanje.podloga = idPodloge;
    for (const g of document.querySelectorAll('[data-podloga]')) g.classList.toggle('aktivna', g.dataset.podloga === idPodloge);
    const def = stanje.portal.podloge.find(p => p.id === idPodloge);
    const gumb = document.getElementById('gumbPodloga');
    if (gumb && def) {
      const sl = sličicaPodloge(def);
      gumb.querySelector('.slicica').style.backgroundImage = sl ? 'url("' + sl + '")' : 'none';
      gumb.querySelector('.naziv-podloge').textContent = def.kratkiNaziv || def.naziv;
    }
  }

  function prikaziPodloge() {
    const okvir = el('div', { class: 'podloga-izbornik', id: 'podlogaIzbornik', hidden: true, role: 'dialog', 'aria-label': 'Odabir podloge' });
    const mreza = el('div', { class: 'podloga-mreza' });
    for (const def of stanje.portal.podloge) {
      const sl = sličicaPodloge(def);
      mreza.append(el('button', { class: 'podloga-plocica', 'data-podloga': def.id, title: def.naziv, onclick: () => postaviPodlogu(def.id) },
        el('span', { class: 'slicica' + (sl ? '' : ' prazna'), style: sl ? 'background-image:url("' + sl + '")' : '' }),
        el('span', {}, def.kratkiNaziv || def.naziv)));
    }
    // intenzitet i crno-bijeli prikaz podloge (da se slojevi bolje vide)
    const klizac = el('input', { type: 'range', min: 15, max: 100, step: 5, value: Math.round(stanje.intenzitetPodloge * 100),
      'aria-label': 'Intenzitet podloge',
      oninput: (e) => { stanje.intenzitetPodloge = e.target.value / 100; postaviIzgledPodloge(); spremiPostavku('intenzitet', stanje.intenzitetPodloge); } });
    const siva = el('input', { type: 'checkbox', checked: stanje.sivaPodloga,
      onchange: (e) => { stanje.sivaPodloga = e.target.checked; postaviIzgledPodloge(); spremiPostavku('siva', stanje.sivaPodloga); } });
    // dodatne snimke koje se lijepe preko odabrane podloge (npr. DOF Bilje 2020, snimke dronom)
    const preklopi = (stanje.portal.preklopi || []).map(def => {
      const sloj = napraviOlSloj(Object.assign({ tip: 'xyz' }, def, { vidljivo: false }));
      sloj.setZIndex(-50);
      stanje.karta.addLayer(sloj);
      stanje.preklopi[def.id] = sloj;
      const kv = el('input', { type: 'checkbox', onchange: (e) => {
        sloj.setVisible(e.target.checked);
        if (e.target.checked) pribliziSloju(def, sloj);
      } });
      return el('label', { class: 'prekidac-red', title: def.opis || '' }, el('span', {}, def.naziv), kv);
    });
    okvir.append(el('div', { class: 'podloga-naslov' }, 'Podloga'), mreza,
      ...(preklopi.length ? [el('div', { class: 'podloga-naslov' }, 'Preko podloge'), ...preklopi] : []),
      el('div', { class: 'podloga-naslov' }, 'Izgled'),
      el('label', { class: 'klizac' }, el('span', {}, 'Jačina podloge'), klizac),
      el('label', { class: 'prekidac-red' }, el('span', {}, 'Crno-bijela podloga'), siva));
    const gumb = el('button', { id: 'gumbPodloga', class: 'gumb-podloga', 'aria-expanded': 'false', 'aria-controls': 'podlogaIzbornik',
      title: 'Promijeni podlogu', onclick: (e) => {
        e.stopPropagation();
        okvir.hidden = !okvir.hidden;
        gumb.setAttribute('aria-expanded', String(!okvir.hidden));
      } },
      el('span', { class: 'slicica' }), el('span', { class: 'naziv-podloge' }), ikona('slojevi', 14));
    const omot = el('div', { class: 'podloga-prekidac' }, okvir, gumb);
    document.body.append(omot);
    document.addEventListener('click', (e) => { if (!omot.contains(e.target)) { okvir.hidden = true; gumb.setAttribute('aria-expanded', 'false'); } });
    postaviPodlogu(stanje.podloga || (stanje.portal.podloge.find(p => p.zadano) || stanje.portal.podloge[0]).id);
  }

  // ---------- slojevi: aktivni na vrhu, grupe po namjeni, cijeli redak je prekidač ----------

  function prikaziSlojeve() {
    const div = document.getElementById('slojevi');
    const filtar = document.getElementById('filtarSlojeva');
    const zapisiGrupa = [];

    for (const grupa of stanje.konfig.grupe) {
      const slojeviGrupe = stanje.konfig.slojevi.filter(s => s.grupa === grupa.id && stanje.slojevi[s.id]);
      if (!slojeviGrupe.length) continue;
      const brojac = el('span', { class: 'brojac' });
      const sadrzaj = el('div', { class: 'grupa-sadrzaj' });
      const omot = el('div', { class: 'grupa-omot' }, sadrzaj);
      const zaglavlje = el('button', { class: 'grupa-zaglavlje', 'aria-expanded': 'false' },
        el('span', { class: 'grupa-ikona' }, ikona(grupa.ikona)), el('span', { class: 'grupa-naziv' }, grupa.naziv), brojac,
        el('span', { class: 'chevron' }, ikona('strelica', 16)));
      const blok = el('section', { class: 'grupa' }, zaglavlje, omot);
      const otvori = (v) => { blok.classList.toggle('otvorena', v); zaglavlje.setAttribute('aria-expanded', String(v)); };
      zaglavlje.addEventListener('click', () => otvori(!blok.classList.contains('otvorena')));
      otvori(!!grupa.otvoreno);

      let podgrupa = null;
      const redovi = [];
      for (const def of slojeviGrupe) {
        if (def.podgrupa && def.podgrupa !== podgrupa) {
          podgrupa = def.podgrupa;
          sadrzaj.append(el('div', { class: 'podgrupa' }, podgrupa));
        }
        const r = napraviRedSloja(def, () => otvori(true), osvjeziBrojac);
        redovi.push(r);
        sadrzaj.append(r.element);
      }
      function osvjeziBrojac() {
        const n = redovi.filter(r => r.ukljucen()).length;
        brojac.textContent = n ? String(n) : '';
        brojac.hidden = !n;
      }
      osvjeziBrojac();
      zapisiGrupa.push({ blok, redovi, otvori, sadrzaj });
      div.append(blok);
    }

    // traženje sloja po nazivu
    if (filtar) filtar.addEventListener('input', () => {
      const q = normalizirajTekst(filtar.value.trim());
      for (const g of zapisiGrupa) {
        let ima = 0;
        for (const r of g.redovi) { const ok = !q || r.trazi.includes(q); r.element.hidden = !ok; if (ok) ima++; }
        for (const pg of g.sadrzaj.querySelectorAll('.podgrupa')) pg.hidden = !!q;
        g.blok.hidden = !ima;
        if (q) g.otvori(true);
      }
    });
    prikaziBrzePrikaze();
    osvjeziAktivne();
  }

  function normalizirajTekst(t) {
    return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
  }

  function napraviRedSloja(def, otvoriGrupu, osvjeziBrojac) {
    const zapis = stanje.slojevi[def.id];
    const legenda = napraviLegendu(def);
    const kategorije = def.stil && def.stil.kategorije;
    // legenda s kategorijama (i kvačicama) vidi se uz uključen sloj; ostalo je u izborniku •••
    const legendaUz = legenda && kategorije ? legenda : null;
    const detalji = el('div', { class: 'sloj-detalji', hidden: true });
    const red = el('div', { class: 'sloj-red', role: 'switch', tabindex: '0', 'aria-checked': 'false' },
      uzorakSloja(def),
      el('span', { class: 'sloj-naziv' }, def.naziv, def.minZoom ? el('span', { class: 'napomena' }, 'vidljivo pri uvećanju') : null),
      el('button', { class: 'gumb-vise', title: 'Više o sloju', 'aria-label': 'Više o sloju ' + def.naziv,
        onclick: (e) => { e.stopPropagation(); otvoriDetalje(); } }, ikona('tocke', 18)));
    const element = el('div', { class: 'sloj', 'data-sloj': def.id }, red, legendaUz || '', detalji);

    function otvoriDetalje() {
      if (!detalji.hidden) { detalji.hidden = true; element.classList.remove('detalji'); return; }
      const prozirnost = el('input', { type: 'range', min: 10, max: 100, step: 5, value: Math.round(zapis.olSloj.getOpacity() * 100),
        'aria-label': 'Neprozirnost sloja', oninput: (e) => zapis.olSloj.setOpacity(e.target.value / 100) });
      detalji.replaceChildren(
        el('label', { class: 'klizac' }, el('span', {}, 'Neprozirnost'), prozirnost),
        el('div', { class: 'detalji-gumbi' },
          el('button', { class: 'gumb-mali', onclick: () => { postavi(true); pribliziSloju(Object.assign({}, def), zapis.olSloj, true); } }, ikona('cilj', 14), ' Približi'),
          el('button', { class: 'gumb-mali', onclick: () => prikaziMetapodatke(def) }, ikona('info', 14), ' O sloju')),
        legenda && !kategorije ? legenda : '');
      if (legenda && !kategorije) legenda.hidden = false;
      detalji.hidden = false;
      element.classList.add('detalji');
    }

    function postavi(v, priblizi) {
      zapis.olSloj.setVisible(v);
      element.classList.toggle('ukljucen', v);
      red.setAttribute('aria-checked', String(v));
      if (legendaUz) legendaUz.hidden = !v;
      if (v) otvoriGrupu();
      osvjeziBrojac();
      osvjeziAktivne();
      if (v && priblizi) pribliziSloju(def, zapis.olSloj);
    }
    const prebaci = () => { zatvoriSkocni(); postavi(!zapis.olSloj.getVisible(), true); oznaciBrziPrikaz(); };
    red.addEventListener('click', prebaci);
    red.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); prebaci(); } });

    zapis.postaviVidljivost = (v) => postavi(v, false);
    zapis.def = def;
    // početno stanje (bez približavanja)
    element.classList.toggle('ukljucen', !!def.vidljivo);
    red.setAttribute('aria-checked', String(!!def.vidljivo));
    if (legendaUz) legendaUz.hidden = !def.vidljivo;
    return {
      element, ukljucen: () => zapis.olSloj.getVisible(),
      trazi: normalizirajTekst(def.naziv + ' ' + (def.opis || '') + ' ' + (def.podgrupa || ''))
    };
  }

  // "Na karti": svi uključeni slojevi na jednom mjestu; povlačenjem se mijenja redoslijed (što je gore, crta se iznad)
  function osvjeziAktivne() {
    const okvir = document.getElementById('aktivniSlojevi');
    if (!okvir) return;
    const aktivni = Object.entries(stanje.slojevi)
      .filter(([, z]) => z.def && z.olSloj.getVisible())
      .sort((a, b) => b[1].olSloj.getZIndex() - a[1].olSloj.getZIndex());
    okvir.hidden = !aktivni.length;
    const popis = el('div', { class: 'aktivni-popis' });
    for (const [id, z] of aktivni) {
      const stavka = el('div', { class: 'aktivni-stavka', draggable: 'true', 'data-id': id },
        el('span', { class: 'rucka', title: 'Povucite za promjenu redoslijeda' }, ikona('povuci', 14)),
        uzorakSloja(z.def), el('span', { class: 'aktivni-naziv', title: z.def.naziv }, z.def.naziv),
        el('button', { class: 'gumb-ukloni', title: 'Isključi', 'aria-label': 'Isključi sloj ' + z.def.naziv,
          onclick: () => { z.postaviVidljivost(false); oznaciBrziPrikaz(); } }, ikona('zatvori', 14)));
      stavka.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', id); stavka.classList.add('vuce'); });
      stavka.addEventListener('dragend', () => stavka.classList.remove('vuce'));
      stavka.addEventListener('dragover', (e) => { e.preventDefault(); stavka.classList.add('cilj'); });
      stavka.addEventListener('dragleave', () => stavka.classList.remove('cilj'));
      stavka.addEventListener('drop', (e) => {
        e.preventDefault(); stavka.classList.remove('cilj');
        const izvor = e.dataTransfer.getData('text/plain');
        if (!izvor || izvor === id) return;
        const red = aktivni.map(([i]) => i).filter(i => i !== izvor);
        red.splice(red.indexOf(id), 0, izvor);
        // novi redoslijed: prvi u popisu ima najveći z-index
        const z0 = Math.max(...aktivni.map(([, x]) => x.olSloj.getZIndex()));
        red.forEach((i, n) => stanje.slojevi[i].olSloj.setZIndex(z0 + 1 + (red.length - n)));
        osvjeziAktivne();
      });
      popis.append(stavka);
    }
    okvir.replaceChildren(
      el('div', { class: 'aktivni-zaglavlje' }, el('span', {}, 'Na karti'), el('span', { class: 'brojac' }, String(aktivni.length)),
        el('button', { class: 'gumb-tekst-mali', onclick: () => {
          for (const [, z] of aktivni) z.postaviVidljivost(false);
          oznaciBrziPrikaz();
        } }, 'Isključi sve')),
      popis);
  }

  // brzi prikazi: unaprijed složeni skupovi slojeva za česta pitanja mještana
  function prikaziBrzePrikaze() {
    const okvir = document.getElementById('brziPrikazi');
    const prikazi = (stanje.portal.brziPrikazi || []).filter(p => p.slojevi.some(id => stanje.slojevi[id]));
    if (!okvir || !prikazi.length) return;
    okvir.hidden = false;
    okvir.replaceChildren(...prikazi.map(p => el('button', { class: 'brzi-prikaz', 'data-prikaz': p.id, title: p.opis || '',
      onclick: () => {
        const ukljuci = new Set([...(stanje.portal.uvijekUkljuceni || []), ...p.slojevi]);
        for (const [id, z] of Object.entries(stanje.slojevi)) if (z.postaviVidljivost) z.postaviVidljivost(ukljuci.has(id));
        zatvoriSkocni();
        oznaciBrziPrikaz();
        if (p.prikaz) stanje.karta.getView().animate({ center: ol.proj.fromLonLat(p.prikaz.centar), zoom: p.prikaz.zoom, duration: 600 });
        else if (stanje.granicaExtent) stanje.karta.getView().fit(stanje.granicaExtent, { padding: [30, 30, 30, 30], duration: 600 });
      } }, ikona(p.ikona, 16), el('span', {}, p.naziv))));
    oznaciBrziPrikaz();
  }

  function oznaciBrziPrikaz() {
    const ukljuceni = new Set(Object.entries(stanje.slojevi).filter(([, z]) => z.def && z.olSloj.getVisible()).map(([id]) => id));
    for (const p of stanje.portal.brziPrikazi || []) {
      const g = document.querySelector('[data-prikaz="' + p.id + '"]');
      if (!g) continue;
      const ocekivano = new Set([...(stanje.portal.uvijekUkljuceni || []), ...p.slojevi].filter(id => stanje.slojevi[id]));
      g.classList.toggle('aktivan', ocekivano.size === ukljuceni.size && [...ocekivano].every(id => ukljuceni.has(id)));
    }
  }

  // ---------- približavanje uključenom sloju ----------
  // Kad korisnik uključi sloj, karta se pomakne/približi tako da se sloj odmah vidi:
  // ako je sloj uglavnom izvan prikaza, premalen da bi se uočio ili vidljiv tek pri većem uvećanju.

  function obuhvatiSloja(def, sloj) {
    if (def.izvori) return Promise.resolve(def.izvori.map(i => i.extent).filter(Boolean));
    if (def.extent) return Promise.resolve([def.extent]);
    const izvor = sloj.getSource && sloj.getSource();
    if (izvor && izvor.getFeatures) {
      const gotovo = () => {
        const e = izvor.getExtent();
        return izvor.getFeatures().length && isFinite(e[0]) ? [e] : [];
      };
      if (izvor.getFeatures().length) return Promise.resolve(gotovo());
      return new Promise(ok => {
        const t = setTimeout(() => ok(gotovo()), 6000);
        izvor.once('featuresloadend', () => { clearTimeout(t); ok(gotovo()); });
        izvor.once('featuresloaderror', () => { clearTimeout(t); ok([]); });
      });
    }
    return Promise.resolve(stanje.granicaExtent ? [stanje.granicaExtent] : []);
  }

  async function pribliziSloju(def, sloj, uvijek) {
    const obuhvati = await obuhvatiSloja(def, sloj);
    if (!obuhvati.length || !sloj.getVisible()) return;
    const view = stanje.karta.getView();
    const prikaz = view.calculateExtent(stanje.karta.getSize());
    const ukupno = obuhvati.reduce((a, e) => ol.extent.extend(a, e), ol.extent.createEmpty());
    const povrsina = (e) => Math.max(ol.extent.getWidth(e), 1) * Math.max(ol.extent.getHeight(e), 1);
    const presjek = ol.extent.getIntersection(ukupno, prikaz);
    const udioVidljivo = ol.extent.isEmpty(presjek) ? 0 : povrsina(presjek) / povrsina(ukupno);
    const premalen = povrsina(ukupno) < 0.01 * povrsina(prikaz);
    const minZ = def.minZoom;
    const premaloUvecano = minZ !== undefined && view.getZoom() < minZ;
    // sloj koji već prekriva većinu prikaza (npr. veća snimka) također se već vidi
    const pokrivaPrikaz = ol.extent.isEmpty(presjek) ? 0 : povrsina(presjek) / povrsina(prikaz);
    if (!uvijek && (udioVidljivo >= 0.5 || pokrivaPrikaz >= 0.5) && !premalen && !premaloUvecano) return;

    const sredina = view.getCenter();
    let cilj = ukupno;
    if (obuhvati.length > 1 && minZ !== undefined) {
      // više odvojenih dijelova (npr. groblja): najbliži trenutnom prikazu
      cilj = obuhvati.slice().sort((a, b) => {
        const d = (e) => { const c = ol.extent.getCenter(e); return Math.hypot(c[0] - sredina[0], c[1] - sredina[1]); };
        return d(a) - d(b);
      })[0];
    }
    const rez = view.getResolutionForExtent(cilj, stanje.karta.getSize().map(v => v - 80));
    let zoom = Math.min(view.getZoomForResolution(rez), def.najvecePriblizavanje || 17);
    let centar = ol.extent.getCenter(cilj);
    if (minZ !== undefined && zoom < minZ) {
      zoom = minZ;
      // velik sloj vidljiv tek izbliza (ulice, katastar): ostani na trenutnom mjestu ako je unutar sloja
      if (ol.extent.containsCoordinate(cilj, sredina)) centar = sredina;
      else if (stanje.portal.pocetniPrikaz) centar = ol.proj.fromLonLat(stanje.portal.pocetniPrikaz.centar);
    }
    view.animate({ center: centar, zoom, duration: 600 });
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
    dodaj('Izvor', def.izvor);
    dodaj('Licenca', def.licenca);
    dodaj('Ažurirano', def.azurirano);
    const tekst = String(def.detaljno || def.opis || '').split(/\n\n+/).filter(Boolean)
      .map(o => el('p', {}, ...o.split('\n').flatMap((r, i) => i ? [el('br'), r] : [r])));
    otvoriDijalog(el('h3', {}, def.naziv), ...tekst, el('h4', {}, 'Podaci o sloju'), dl);
  }

  // ---------- skočni prozor (klik na objekt) ----------

  function zatvoriSkocni() {
    document.getElementById('skocni').hidden = true;
    stanje.odabranaKoordinata = null;
  }

  // skočni prozor uvijek cijeli unutar karte: iznad točke ako ima mjesta, inače ispod; vodoravno se pomakne do ruba
  function pozicionirajSkocni() {
    if (!stanje.odabranaKoordinata) return;
    const s = document.getElementById('skocni');
    if (s.hidden || window.matchMedia('(max-width: 720px)').matches) return;
    const px = stanje.karta.getPixelFromCoordinate(stanje.odabranaKoordinata);
    if (!px) return;
    const r = stanje.karta.getTargetElement().getBoundingClientRect();
    const w = s.offsetWidth, h = s.offsetHeight, razmak = 16, rub = 8;
    const x = r.left + px[0] + window.scrollX, y = r.top + px[1] + window.scrollY;
    const gore = r.top + window.scrollY + rub, dolje = r.bottom + window.scrollY - rub;
    let ispod = y - h - razmak < gore && y + h + razmak <= dolje;
    let top = ispod ? y + razmak : y - h - razmak;
    top = Math.max(gore, Math.min(top, dolje - h));
    const left = Math.max(r.left + rub, Math.min(x - w / 2, r.right - w - rub));
    s.style.left = left + 'px';
    s.style.top = top + 'px';
    s.classList.toggle('ispod', ispod);
    // strelica pokazuje na točku i kad je prozor pomaknut; skriva se ako točka nije uz prozor
    const strelicaX = Math.max(18, Math.min(x - left, w - 18));
    s.style.setProperty('--strelica-x', strelicaX + 'px');
    s.classList.toggle('bez-strelice', ispod ? top !== y + razmak : top !== y - h - razmak);
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
    const rezultat = [el('h3', {}, naslov), tablica];
    // moduli mogu dodati vlastiti sadržaj u skočni prozor (npr. fotografiju, uređivanje)
    const dodatak = def.skocniDodatak && stanje.skocniDodaci[def.skocniDodatak];
    if (dodatak) rezultat.push(...[].concat(dodatak(f, def) || []));
    rezultat.push(el('div', { class: 'vise' }, 'Sloj: ' + def.naziv));
    return rezultat;
  }

  function gumbLokacija(koordinata) {
    if (!stanje.portal.lokacija) return null;
    return el('button', { class: 'gumb-lokacija', onclick: () => { zatvoriSkocni(); izvjestajLokacije(koordinata); } },
      'Što je na ovoj lokaciji?');
  }

  function naKlik(evt) {
    const pogoci = [];
    stanje.karta.forEachFeatureAtPixel(evt.pixel, (f, sloj) => {
      if (sloj && sloj.get('upitni') && sloj.get('defId') !== 'granica') pogoci.push([f, sloj]);
    }, { hitTolerance: 5 });

    const s = document.getElementById('skocni');
    if (stanje.odabirTocke) {
      // modul je zatražio odabir mjesta na karti (npr. prijava problema)
      const povratni = stanje.odabirTocke;
      odaberiTocku(null);
      zatvoriSkocni();
      povratni(evt.coordinate);
      return;
    }
    if (stanje.nacinLokacije) {
      // uključen način "Što je ovdje?": klik otvara izvještaj o lokaciji
      postaviNacinLokacije(false);
      zatvoriSkocni();
      izvjestajLokacije(evt.coordinate);
      return;
    }
    if (!pogoci.length) { zatvoriSkocni(); return; }
    const [f, sloj] = pogoci[0];
    const def = stanje.slojevi[sloj.get('defId')].def;
    const sadrzaj = sadrzajZaObjekt(f, def);
    if (pogoci.length > 1) sadrzaj.push(el('div', { class: 'vise' }, 'Na ovom mjestu ima još ' + (pogoci.length - 1) + ' objekata – uvećajte kartu.'));
    const g = gumbLokacija(evt.coordinate);
    if (g) sadrzaj.push(g);
    s.querySelector('.skocni-sadrzaj').replaceChildren(...sadrzaj);
    const geom = f.getGeometry();
    stanje.odabranaKoordinata = geom.getType() === 'Point' ? geom.getCoordinates() : evt.coordinate;
    s.hidden = false;
    pozicionirajSkocni();
  }


  // odabir točke na karti za module: odaberiTocku(fn) – sljedeći klik poziva fn(koordinata)
  function odaberiTocku(povratni, poruka) {
    stanje.odabirTocke = povratni;
    stanje.karta.getTargetElement().classList.toggle('nacin-lokacije', !!povratni);
    let traka = document.getElementById('trakaOdabira');
    if (!povratni) { if (traka) traka.remove(); return; }
    if (!traka) {
      traka = el('div', { id: 'trakaOdabira', class: 'traka-odabira' });
      document.body.append(traka);
    }
    traka.replaceChildren(el('span', {}, poruka || 'Kliknite na kartu'),
      el('button', { onclick: () => odaberiTocku(null) }, 'Odustani'));
  }

  function postaviNacinLokacije(ukljuceno) {
    stanje.nacinLokacije = ukljuceno;
    const g = document.getElementById('gumbOvdje');
    if (g) g.classList.toggle('aktivan', ukljuceno);
    stanje.karta.getTargetElement().classList.toggle('nacin-lokacije', ukljuceno);
  }

  // ---------- "Što je na ovoj lokaciji?" ----------
  // Sve provjere opisane su u config/portal.json -> "lokacija". Vrste provjera:
  //   "poligon"   – nalazi li se točka unutar objekta nekog sloja (geojson ili wfs)
  //   "wmsPiksel" – razred iz WMS karte očitan iz boje piksela prema legendi servisa
  //   katastar    – broj čestice i k.o. preko WMS GetFeatureInfo DGU-a

  const predmemorija = new Map();

  function dohvatiObjekte(def) {
    if (predmemorija.has(def.id)) return predmemorija.get(def.id);
    const url = def.tip === 'wfs' ? wfsUrl(def) : def.url;
    const projekcija = def.tip === 'wfs' ? 'EPSG:3857' : 'EPSG:4326';
    const obecanje = fetch(url).then(o => { if (!o.ok) throw new Error(o.status); return o.json(); })
      .then(j => new ol.format.GeoJSON({ dataProjection: projekcija, featureProjection: 'EPSG:3857' }).readFeatures(j));
    obecanje.catch(() => predmemorija.delete(def.id));
    predmemorija.set(def.id, obecanje);
    return obecanje;
  }

  async function legendaBoja(def) {
    const kljuc = 'legenda:' + def.id;
    if (!predmemorija.has(kljuc)) {
      const url = def.url + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&FORMAT=application/json&LAYER=' + encodeURIComponent(def.wmsSlojevi);
      predmemorija.set(kljuc, fetch(url).then(o => o.json()).then(j => {
        const sim = j.Legend[0].rules[0].symbolizers[0];
        return (sim.Raster ? sim.Raster.colormap.entries : []).map(e => ({
          oznaka: e.label.trim(),
          rgb: [1, 3, 5].map(i => parseInt(e.color.slice(i, i + 2), 16))
        }));
      }));
    }
    return predmemorija.get(kljuc);
  }

  async function ocitajPiksel(def, koord) {
    // mali isječak karte (~10 m/piksel) oko točke; čita se središnji piksel
    const h = 250, w = 51;
    const p = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: def.wmsSlojevi, STYLES: '',
      CRS: 'EPSG:3857', BBOX: [koord[0] - h, koord[1] - h, koord[0] + h, koord[1] + h].join(','),
      WIDTH: w, HEIGHT: w, FORMAT: 'image/png', TRANSPARENT: 'true'
    });
    const [boje, slika] = await Promise.all([
      legendaBoja(def),
      fetch(def.url + '?' + p.toString()).then(o => o.blob()).then(b => createImageBitmap(b))
    ]);
    const c = document.createElement('canvas');
    c.width = c.height = w;
    const ctx = c.getContext('2d');
    ctx.drawImage(slika, 0, 0);
    const [r, g, b, a] = ctx.getImageData(Math.floor(w / 2), Math.floor(w / 2), 1, 1).data;
    if (a < 100) return null;
    let najbolja = null, min = Infinity;
    for (const e of boje) {
      const d = (e.rgb[0] - r) ** 2 + (e.rgb[1] - g) ** 2 + (e.rgb[2] - b) ** 2;
      if (d < min) { min = d; najbolja = e; }
    }
    return najbolja ? najbolja.oznaka : 'u zoni';
  }

  async function katastarskaCestica(cfg, koord) {
    const [x, y] = ol.proj.transform(koord, 'EPSG:3857', 'EPSG:3765');
    const p = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo', LAYERS: cfg.sloj, QUERY_LAYERS: cfg.sloj,
      STYLES: '', CRS: 'EPSG:3765', BBOX: [x - 10, y - 10, x + 10, y + 10].join(','),
      WIDTH: 101, HEIGHT: 101, I: 50, J: 50, INFO_FORMAT: 'text/plain', FEATURE_COUNT: 1
    });
    const t = await fetch(cfg.url + '?' + p.toString()).then(o => o.text());
    const broj = (/BROJ_CESTICE\s*=\s*(\S+)/.exec(t) || [])[1];
    const ko = (/MATICNI_BROJ_KO\s*=\s*(\S+)/.exec(t) || [])[1];
    if (!broj) return null;
    return { broj, ko, koNaziv: (cfg.katastarskeOpcine || {})[ko] };
  }

  function najblizaAdresa(koord) {
    if (!stanje.adrese) return null;
    const ll = ol.proj.toLonLat(koord);
    let naj = null, min = Infinity;
    for (const a of stanje.adrese) {
      const d = ol.sphere.getDistance(ll, [a[3], a[4]]);
      if (d < min) { min = d; naj = a; }
    }
    return naj && min <= 75 ? { tekst: naj[0] + ' ' + naj[1] + ', ' + naj[2], udaljenost: Math.round(min) } : null;
  }

  function oznakaLokacije(koord) {
    if (!stanje.slojOznakeLokacije) {
      stanje.slojOznakeLokacije = new ol.layer.Vector({
        source: new ol.source.Vector(), zIndex: 1001,
        style: new ol.style.Style({ image: new ol.style.RegularShape({
          points: 4, radius: 11, angle: Math.PI / 4,
          stroke: new ol.style.Stroke({ color: '#111827', width: 3 }) }) })
      });
      stanje.karta.addLayer(stanje.slojOznakeLokacije);
    }
    const izvor = stanje.slojOznakeLokacije.getSource();
    izvor.clear();
    izvor.addFeature(new ol.Feature(new ol.geom.Point(koord)));
  }

  function red(oznaka) {
    const vrijednost = el('td', { class: 'ucitava' }, 'provjeravam…');
    return { tr: el('tr', {}, el('th', {}, oznaka), vrijednost), vrijednost };
  }

  function postavi(td, tekst, stanjeOznake) {
    td.className = stanjeOznake || '';
    td.replaceChildren(...[].concat(tekst));
  }

  async function izvjestajLokacije(koord) {
    const cfg = stanje.portal.lokacija;
    oznakaLokacije(koord);
    const [x, y] = ol.proj.transform(koord, 'EPSG:3857', 'EPSG:3765');
    const [lon, lat] = ol.proj.toLonLat(koord);
    const dijelovi = [el('h3', {}, 'Što je na ovoj lokaciji?')];

    // osnovno
    const osnovno = el('table', { class: 'izvjestaj' });
    const rNaselje = red('Naselje'), rAdresa = red('Najbliža adresa'), rCestica = red('Katastarska čestica');
    osnovno.append(rNaselje.tr, rAdresa.tr, rCestica.tr,
      el('tr', {}, el('th', {}, 'Koordinate'), el('td', {}, 'HTRS96/TM E ' + x.toFixed(0) + ', N ' + y.toFixed(0),
        el('br'), el('span', { class: 'sitno' }, 'WGS84 ' + lat.toFixed(5) + ', ' + lon.toFixed(5)))));
    dijelovi.push(el('h4', {}, 'Osnovno'), osnovno);

    const naselja = stanje.slojevi.naselja;
    (naselja ? dohvatiObjekte(naselja.def) : Promise.resolve([])).then(fs => {
      const f = fs.find(f => f.getGeometry().intersectsCoordinate(koord));
      postavi(rNaselje.vrijednost, f ? f.get('naziv') : 'izvan općine');
    }).catch(() => postavi(rNaselje.vrijednost, 'nije dostupno', 'greska'));

    const adr = najblizaAdresa(koord);
    postavi(rAdresa.vrijednost, adr ? adr.tekst + (adr.udaljenost > 15 ? ' (≈' + adr.udaljenost + ' m)' : '') : 'nema adrese u blizini');

    if (cfg.katastar) {
      katastarskaCestica(cfg.katastar, koord).then(c => {
        postavi(rCestica.vrijednost, c ? 'k.č. ' + c.broj + ', k.o. ' + (c.koNaziv || c.ko) : 'nije pronađena');
      }).catch(() => postavi(rCestica.vrijednost, 'servis DGU-a trenutno nije dostupan', 'greska'));
    } else rCestica.tr.remove();

    // provjere iz konfiguracije
    for (const odjeljak of cfg.provjere || []) {
      const t = el('table', { class: 'izvjestaj' });
      dijelovi.push(el('h4', {}, odjeljak.naslov), t);
      for (const st of odjeljak.stavke) {
        const zapis = stanje.slojevi[st.sloj];
        if (!zapis) continue;
        const def = zapis.def;
        const r = red(st.oznaka || def.naziv);
        t.append(r.tr);
        if (st.vrsta === 'wmsPiksel') {
          ocitajPiksel(def, koord)
            .then(v => v ? postavi(r.vrijednost, 'DA – ' + v, 'da') : postavi(r.vrijednost, 'ne', 'ne'))
            .catch(() => postavi(r.vrijednost, 'servis nije dostupan', 'greska'));
        } else {
          dohvatiObjekte(def).then(fs => {
            const pogoci = fs.filter(f => f.getGeometry() && f.getGeometry().intersectsCoordinate(koord));
            if (!pogoci.length) return postavi(r.vrijednost, st.inace || 'ne', st.inace ? '' : 'ne');
            const nazivi = [...new Set(pogoci.map(f => {
              let n = f.get(st.polje) || def.naziv;
              if (st.dodatno && f.get(st.dodatno)) n += ' (' + (st.dodatnoPrefiks || '') + f.get(st.dodatno) + ')';
              return n;
            }))];
            if (st.neutralno) postavi(r.vrijednost, nazivi.join('; '));
            else postavi(r.vrijednost, 'DA – ' + nazivi.join('; '), 'da');
          }).catch(() => postavi(r.vrijednost, 'servis nije dostupan', 'greska'));
        }
      }
    }

    const gumbDijeli = el('button', { class: 'gumb-lokacija', onclick: () => podijeli(koord, gumbDijeli) }, 'Podijeli ovu lokaciju');
    dijelovi.push(gumbDijeli);
    dijelovi.push(el('p', { class: 'napomena-izvjestaj' },
      'Informativni podaci iz javnih servisa DGU-a, Hrvatskih voda i podataka općine. Nemaju pravnu snagu; za službene podatke obratite se nadležnim tijelima (katastar, zemljišne knjige, Jedinstveni upravni odjel Općine Bilje).'));
    otvoriDijalog(...dijelovi);
  }


  // ---------- dijeljenje poveznice ----------
  // Format: #v=zoom/lon/lat&p=podloga&s=sloj1,sloj2&l=lon,lat  (l = otvoreni izvještaj o lokaciji)

  function napraviPoveznicu(koordLokacije) {
    const view = stanje.karta.getView();
    const [lon, lat] = ol.proj.toLonLat(view.getCenter());
    const dio = ['v=' + view.getZoom().toFixed(2) + '/' + lon.toFixed(5) + '/' + lat.toFixed(5)];
    const podloga = stanje.podloga || (stanje.portal.podloge.find(p => p.zadano) || {}).id;
    if (podloga) dio.push('p=' + podloga);
    const ukljuceni = Object.entries(stanje.slojevi).filter(([, z]) => z.olSloj.getVisible()).map(([id]) => id);
    dio.push('s=' + ukljuceni.join(','));
    if (koordLokacije) {
      const [x, y] = ol.proj.toLonLat(koordLokacije);
      dio.push('l=' + x.toFixed(6) + ',' + y.toFixed(6));
    }
    return location.origin + location.pathname + '#' + dio.join('&');
  }

  async function podijeli(koordLokacije, gumb) {
    const url = napraviPoveznicu(koordLokacije);
    const naslov = koordLokacije ? 'Lokacija – ' + stanje.portal.naslov : stanje.portal.naslov;
    try {
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        await navigator.share({ title: naslov, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      if (gumb) { const t = gumb.textContent; gumb.textContent = 'Poveznica kopirana ✓'; setTimeout(() => { gumb.textContent = t; }, 2500); }
    } catch (g) {
      // rezerva: prikaži poveznicu za ručno kopiranje
      const polje = el('input', { class: 'poveznica-polje', value: url, readonly: true });
      otvoriDijalog(el('h3', {}, 'Poveznica za dijeljenje'), el('p', {}, 'Kopirajte poveznicu:'), polje);
      polje.select();
    }
  }

  function primijeniPoveznicu() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (![...h.keys()].length) return false;
    const view = stanje.karta.getView();
    if (h.get('v')) {
      const [z, lon, lat] = h.get('v').split('/').map(Number);
      if ([z, lon, lat].every(isFinite)) { view.setCenter(ol.proj.fromLonLat([lon, lat])); view.setZoom(z); }
    }
    if (h.get('p')) postaviPodlogu(h.get('p'));
    if (h.has('s')) {
      const ukljuceni = new Set(h.get('s').split(',').filter(Boolean));
      for (const [id, z] of Object.entries(stanje.slojevi)) if (z.postaviVidljivost) z.postaviVidljivost(ukljuceni.has(id));
    }
    if (h.get('l') && stanje.portal.lokacija) {
      const [lon, lat] = h.get('l').split(',').map(Number);
      if (isFinite(lon) && isFinite(lat)) setTimeout(() => izvjestajLokacije(ol.proj.fromLonLat([lon, lat])), 300);
    }
    return !!h.get('v');
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
    if (adrese) stanje.adrese = adrese.adrese;
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


  // ---------- elementarne nepogode ----------
  // Svaka obrađena nepogoda iz config/nepogode.json automatski dobiva dva sloja
  // (karta odstupanja i ARKOD parcele) te provjeru u izvještaju o lokaciji.

  const fmtPostotak = (v) => (v * 100).toLocaleString('hr-HR', { maximumFractionDigits: 0 }) + ' %';

  function dodajNepogode(cfg, konfig, portal) {
    const obradene = (cfg.nepogode || []).filter(n => n.status === 'obradeno' && n.rezultati);
    if (!obradene.length) return;
    if (!konfig.grupe.some(g => g.id === 'nepogode')) {
      const iza = konfig.grupe.findIndex(g => g.id === 'poplave');
      konfig.grupe.splice(iza >= 0 ? iza + 1 : konfig.grupe.length, 0, { id: 'nepogode', naziv: 'Nepogode iz satelita', ikona: 'satelit', otvoreno: false });
    }
    const stavkeLokacije = [];
    for (const n of obradene) {
      const r = n.rezultati;
      const metoda = (cfg.metode || {})[n.analiza.metoda] || {};
      const legenda = r.legenda.concat([{ kod: 'nema_podataka', boja: '#ffffff', oznaka: 'nema dovoljno podataka' }]);
      const udjeli = legenda.filter(l => r.statistika_udio && r.statistika_udio[l.kod])
        .map(l => '• ' + l.oznaka + ': ' + fmtPostotak(r.statistika_udio[l.kod]) + ' (' + r.statistika_ha[l.kod].toLocaleString('hr-HR') + ' ha)').join('\n');
      const radar = n.analiza.metoda === 's1_voda';
      const ogranicenja = r.ogranicenja || 'Rezultat je pokazatelj stanja vegetacije sa satelita, a ne procjena štete. Na odstupanje utječe i plodored: različita kultura na istoj parceli u različitim godinama daje drugačiji NDVI bez ikakve štete. Za službenu procjenu štete mjerodavna je općinska komisija. Rezultat može poslužiti kao pomoć pri odabiru parcela za terenski obilazak.';
      const povrsine = r.povrsine_opcina_ha
        ? 'Na cijelom području općine: poplavljeno ' + r.povrsine_opcina_ha.poplava.toLocaleString('hr-HR') + ' ha, uobičajene vodene površine ' + r.povrsine_opcina_ha.stalna_voda.toLocaleString('hr-HR') + ' ha.\n\n'
        : '';
      const usporedba = n.analiza.godina
        ? 'razdoblje ' + n.analiza.razdoblje.join(' – ') + '. ' + n.analiza.godina + '. prema ' + r.referenca
        : n.analiza.tijekom ? 'događaj ' + n.analiza.tijekom.join(' – ') + ' prema ' + r.referenca
        : r.referenca;
      const zajednickiTekst =
        n.opis + '\n\n' +
        'Metoda: ' + (metoda.naziv || n.analiza.metoda) + '. ' + (metoda.opis || '') + '\n\n' +
        'Usporedba: ' + usporedba + '.\n\n' + povrsine +
        (udjeli ? 'Udio površine ARKOD parcela po razredima:\n' + udjeli + '\n\n' : '') +
        'Ograničenja: ' + ogranicenja;
      const izvor = r.izvor || 'Copernicus Sentinel-2 L2A (ESA), obrada: Web GIS Općine Bilje';
      const opisKarta = r.opis_karte || (n.naziv + ': odstupanje stanja vegetacije (NDVI) od uobičajenog.');
      konfig.slojevi.push({
        id: n.id + '_karta', naziv: n.naziv + ' – ' + (r.naziv_karte || 'karta odstupanja'), grupa: 'nepogode', tip: 'slika',
        url: r.slika.url, extent: r.slika.extent, vidljivo: false, neprozirnost: radar ? 1 : 0.85,
        legendaStavke: r.legenda_karte || r.legenda, opis: opisKarta, detaljno: zajednickiTekst, izvor,
        azurirano: 'obrađeno ' + r.datum_obrade, atribucija: r.atribucija || 'Sadrži modificirane podatke Copernicus Sentinel-2'
      });
      const vrijednosti = {};
      for (const l of legenda) vrijednosti[l.kod] = { boja: l.boja, oznaka: l.oznaka };
      konfig.slojevi.push({
        id: n.id + '_parcele', naziv: n.naziv + ' – ' + (r.naziv_parcela || 'po ARKOD parcelama'), grupa: 'nepogode', tip: 'geojson',
        url: r.parcele, vidljivo: false,
        stil: { geometrija: 'poligon', debljina: 0.8, ispunaProzirnost: 0.75, kategorije: { polje: 'razred', vrijednosti } },
        skocniProzor: { naslov: 'razred_opis', polja: r.polja_parcele || [
          { polje: 'kultura', oznaka: 'Uporaba (ARKOD 2023.)' },
          { polje: 'povrsina_ha', oznaka: 'Površina (ha)' },
          { polje: 'ndvi', oznaka: 'NDVI ' + (n.analiza.godina || 'poslije') },
          { polje: 'ndvi_ref', oznaka: 'NDVI uobičajeno' },
          { polje: 'odstupanje', oznaka: 'Odstupanje' },
          { polje: 'arkod_id', oznaka: 'ARKOD ID' }] },
        opis: n.naziv + ': ' + (radar ? 'udio poplavljene površine' : 'prosječno odstupanje') + ' po ARKOD parceli.',
        detaljno: zajednickiTekst, izvor: izvor + '; ARKOD 2023.',
        azurirano: 'obrađeno ' + r.datum_obrade
      });
      stavkeLokacije.push({ vrsta: 'poligon', sloj: n.id + '_parcele', polje: 'razred_opis', oznaka: n.naziv, neutralno: true,
        inace: 'nije ARKOD parcela' });
    }
    if (portal.lokacija && stavkeLokacije.length) {
      portal.lokacija.provjere.push({ naslov: 'Nepogode i poplave (satelitska analiza)', stavke: stavkeLokacije });
    }
  }

  // ---------- pokretanje ----------

  async function pokreni() {
    const [portal, konfig] = await Promise.all([ucitajJSON('config/portal.json'), ucitajJSON('config/layers.json')]);
    stanje.portal = portal;
    stanje.konfig = konfig;
    stanje.intenzitetPodloge = procitajPostavku('intenzitet', portal.intenzitetPodloge || 0.75);
    stanje.sivaPodloga = procitajPostavku('siva', false);
    try {
      dodajNepogode(await ucitajJSON('config/nepogode.json'), konfig, portal);
    } catch (g) { console.warn('Nepogode nisu učitane:', g); }
    // dodatni moduli (js/*.js) prijavljuju se u window.webgisModuli
    const moduli = window.webgisModuli || [];
    for (const m of moduli) {
      try { if (m.pripremi) m.pripremi(konfig, portal); } catch (g) { console.warn('Modul', m.naziv, g); }
    }

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
    window.webgis = stanje; // za otklanjanje grešaka iz konzole preglednika
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
    postaviIzgledPodloge();
    prikaziSlojeve();
    postaviPretragu(portal.pretraga).catch((g) => console.warn('Pretraga nije dostupna:', g));
    stanje.prikazIzPoveznice = primijeniPoveznicu();
    window.addEventListener('hashchange', () => primijeniPoveznicu());

    // granica općine – za gumb "Cijela općina"
    const granica = stanje.slojevi.granica;
    if (granica) {
      const izvor = granica.olSloj.getSource();
      izvor.once('featuresloadend', () => {
        stanje.granicaExtent = izvor.getExtent();
        // na početku prikaži cijelu općinu (radi i na mobitelu), osim ako poveznica određuje prikaz
        if (!stanje.prikazIzPoveznice) view.fit(stanje.granicaExtent, { padding: [30, 30, 30, 30] });
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
      karta.getTargetElement().style.cursor = (stanje.nacinLokacije || stanje.odabirTocke) ? 'crosshair' : (imaObjekt ? 'pointer' : '');
    });

    karta.on('singleclick', naKlik);
    // desni klik (na mobitelu dugi pritisak) odmah otvara izvještaj o lokaciji
    karta.getViewport().addEventListener('contextmenu', (e) => {
      if (!portal.lokacija) return;
      e.preventDefault();
      zatvoriSkocni();
      izvjestajLokacije(karta.getEventCoordinate(e));
    });
    const gumbOvdje = document.getElementById('gumbOvdje');
    if (gumbOvdje && portal.lokacija) gumbOvdje.addEventListener('click', () => postaviNacinLokacije(!stanje.nacinLokacije));
    else if (gumbOvdje) gumbOvdje.hidden = true;
    karta.on('postrender', pozicionirajSkocni);
    // sadržaj se može naknadno povećati (npr. učitana fotografija) – ponovno smjesti prozor
    if (window.ResizeObserver) new ResizeObserver(() => pozicionirajSkocni()).observe(document.getElementById('skocni'));
    document.querySelector('#skocni .zatvori').addEventListener('click', zatvoriSkocni);

    // panel, dijalog, "O portalu"
    document.getElementById('gumbPanel').addEventListener('click', () => {
      const skriven = document.getElementById('panel').classList.toggle('skriven');
      document.body.classList.toggle('panel-skriven', skriven);
      setTimeout(() => karta.updateSize(), 50);
    });
    if (window.innerWidth <= 720) { document.getElementById('panel').classList.add('skriven'); document.body.classList.add('panel-skriven'); }
    const dijalog = document.getElementById('dijalog');
    dijalog.querySelector('.zatvori').addEventListener('click', () => dijalog.close());
    const gumbPodijeli = document.getElementById('gumbPodijeli');
    gumbPodijeli.addEventListener('click', () => podijeli(null, gumbPodijeli));
    document.getElementById('gumbOPortalu').addEventListener('click', () =>
      otvoriDijalog(
        el('div', { class: 'o-portalu-zaglavlje' },
          el('img', { src: 'assets/grb.png', alt: 'Grb Općine Bilje', class: 'grb-dijalog' }),
          el('div', {}, el('h3', {}, portal.naslov), el('p', { class: 'sitno-siva' }, portal.podnaslov || ''))),
        el('p', {}, portal.oPortalu || ''),
        el('h4', {}, 'Poveznice'),
        el('p', {},
          el('a', { href: 'https://bilje.hr/', target: '_blank', rel: 'noopener' }, 'Službena stranica Općine Bilje'), el('br'),
          el('a', { href: 'https://bilje.hr/prostorno-planska-dokumentacija/', target: '_blank', rel: 'noopener' }, 'Važeća prostorno-planska dokumentacija'), el('br'),
          el('a', { href: 'privatnost.html', target: '_blank' }, 'Zaštita osobnih podataka'), el('br'),
          el('a', { href: 'https://github.com/iplascak/web-gis-bilje', target: '_blank', rel: 'noopener' }, 'Izvorni kod portala (otvoreni kod)'))));
  }

  // sučelje za module
  stanje.api = { el, otvoriDijalog, zatvoriSkocni, najblizaAdresa, odaberiTocku, formatiraj };

  pokreni().then(() => {
    for (const m of window.webgisModuli || []) {
      try { if (m.pokreni) m.pokreni(stanje); } catch (g) { console.warn('Modul', m.naziv, g); }
    }
  }).catch((g) => {
    console.error(g);
    document.getElementById('karta').append(
      el('p', { style: 'padding:20px;color:#b91c1c' }, 'Greška pri pokretanju portala: ' + g.message));
  });
})();
