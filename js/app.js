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

  function hexURgba(hex, alfa) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alfa})` : hex;
  }

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
        s = new ol.style.Style({ stroke: new ol.style.Stroke({ color: boja, width: stil.debljina || 3, lineDash: stil.isprekidano ? [8, 6] : undefined }) });
      } else {
        const ispuna = stil.ispuna || (stil.ispunaProzirnost ? hexURgba(boja, stil.ispunaProzirnost) : 'rgba(0,0,0,0)');
        s = new ol.style.Style({
          stroke: new ol.style.Stroke({ color: stil.rub || boja, width: stil.debljina || 2, lineDash: stil.isprekidano ? [8, 6] : undefined }),
          fill: new ol.style.Fill({ color: ispuna })
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
    const znak = (boja) => {
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
      const izvor = new ol.source.Vector({
        url: def.url,
        format: new ol.format.GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' })
      });
      izvor.on('featuresloaderror', () => console.warn('Greška pri učitavanju sloja', def.id));
      const sloj = new ol.layer.Vector(Object.assign({ source: izvor, style: napraviStil(def.stil) }, zajednicko));
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
      const sloj = new ol.layer.Vector(Object.assign({ source: izvor, style: napraviStil(def.stil) }, zajednicko));
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

  function postaviPodlogu(idPodloge) {
    if (!stanje.podloge[idPodloge]) return;
    for (const [id, s] of Object.entries(stanje.podloge)) s.setVisible(id === idPodloge);
    const r = document.querySelector('input[name=podloga][value="' + idPodloge + '"]');
    if (r) r.checked = true;
    stanje.podloga = idPodloge;
  }

  function prikaziPodloge() {
    const div = document.getElementById('podloge');
    for (const def of stanje.portal.podloge) {
      const unos = el('input', {
        type: 'radio', name: 'podloga', value: def.id, checked: !!def.zadano,
        onchange: () => postaviPodlogu(def.id)
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
        zapis.postaviVidljivost = (v) => {
          kvacica.checked = v;
          zapis.olSloj.setVisible(v);
          if (legenda) legenda.hidden = !v;
          // otvori grupu da se uključeni sloj vidi u panelu
          if (v) det.open = true;
        };
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
    if (!pogoci.length) {
      // prazno mjesto: ponudi izvještaj o lokaciji
      if (!stanje.portal.lokacija) { zatvoriSkocni(); return; }
      const [x, y] = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:3765');
      s.querySelector('.skocni-sadrzaj').replaceChildren(
        el('h3', {}, 'Odabrana lokacija'),
        el('div', { class: 'vise' }, 'HTRS96/TM  E ' + x.toFixed(0) + '  N ' + y.toFixed(0)),
        gumbLokacija(evt.coordinate));
      stanje.odabranaKoordinata = evt.coordinate;
      s.hidden = false;
      pozicionirajSkocni();
      return;
    }
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
      konfig.grupe.splice(1, 0, { id: 'nepogode', naziv: 'Elementarne nepogode', otvoreno: false });
    }
    const stavkeLokacije = [];
    for (const n of obradene) {
      const r = n.rezultati;
      const metoda = (cfg.metode || {})[n.analiza.metoda] || {};
      const legenda = r.legenda.concat([{ kod: 'nema_podataka', boja: '#ffffff', oznaka: 'nema dovoljno podataka' }]);
      const udjeli = legenda.filter(l => r.statistika_udio && r.statistika_udio[l.kod])
        .map(l => '• ' + l.oznaka + ': ' + fmtPostotak(r.statistika_udio[l.kod]) + ' (' + r.statistika_ha[l.kod].toLocaleString('hr-HR') + ' ha)').join('\n');
      const zajednickiTekst =
        n.opis + '\n\n' +
        'Metoda: ' + (metoda.naziv || n.analiza.metoda) + '. ' + (metoda.opis || '') + '\n\n' +
        'Usporedba: ' + (n.analiza.godina ? 'razdoblje ' + n.analiza.razdoblje.join(' – ') + '. ' + n.analiza.godina + '. prema ' : '') + r.referenca + '.\n\n' +
        (udjeli ? 'Udio površine ARKOD parcela po razredima:\n' + udjeli + '\n\n' : '') +
        'Ograničenja: rezultat je pokazatelj stanja vegetacije sa satelita, a ne procjena štete. Na odstupanje utječe i plodored: različita kultura na istoj parceli u različitim godinama daje drugačiji NDVI bez ikakve štete. Za službenu procjenu štete mjerodavna je općinska komisija. Rezultat može poslužiti kao pomoć pri odabiru parcela za terenski obilazak.';
      const izvor = 'Copernicus Sentinel-2 L2A (ESA), obrada: Web GIS Općine Bilje';
      const opisKarta = n.naziv + ': odstupanje stanja vegetacije (NDVI) od uobičajenog.';
      konfig.slojevi.push({
        id: n.id + '_karta', naziv: n.naziv + ' – karta odstupanja', grupa: 'nepogode', tip: 'slika',
        url: r.slika.url, extent: r.slika.extent, vidljivo: false, neprozirnost: 0.85,
        legendaStavke: r.legenda, opis: opisKarta, detaljno: zajednickiTekst, izvor,
        azurirano: 'obrađeno ' + r.datum_obrade, atribucija: 'Sadrži modificirane podatke Copernicus Sentinel-2'
      });
      const vrijednosti = {};
      for (const l of legenda) vrijednosti[l.kod] = { boja: l.boja, oznaka: l.oznaka };
      konfig.slojevi.push({
        id: n.id + '_parcele', naziv: n.naziv + ' – po ARKOD parcelama', grupa: 'nepogode', tip: 'geojson',
        url: r.parcele, vidljivo: false,
        stil: { geometrija: 'poligon', debljina: 0.8, ispunaProzirnost: 0.75, kategorije: { polje: 'razred', vrijednosti } },
        skocniProzor: { naslov: 'razred_opis', polja: [
          { polje: 'kultura', oznaka: 'Uporaba (ARKOD 2023.)' },
          { polje: 'povrsina_ha', oznaka: 'Površina (ha)' },
          { polje: 'ndvi', oznaka: 'NDVI ' + (n.analiza.godina || 'poslije') },
          { polje: 'ndvi_ref', oznaka: 'NDVI uobičajeno' },
          { polje: 'odstupanje', oznaka: 'Odstupanje' },
          { polje: 'arkod_id', oznaka: 'ARKOD ID' }] },
        opis: n.naziv + ': prosječno odstupanje po ARKOD parceli.', detaljno: zajednickiTekst, izvor: izvor + '; ARKOD 2023.',
        azurirano: 'obrađeno ' + r.datum_obrade
      });
      stavkeLokacije.push({ vrsta: 'poligon', sloj: n.id + '_parcele', polje: 'razred_opis', oznaka: n.naziv, neutralno: true,
        inace: 'nije ARKOD parcela' });
    }
    if (portal.lokacija && stavkeLokacije.length) {
      portal.lokacija.provjere.push({ naslov: 'Elementarne nepogode (satelitska analiza)', stavke: stavkeLokacije });
    }
  }

  // ---------- pokretanje ----------

  async function pokreni() {
    const [portal, konfig] = await Promise.all([ucitajJSON('config/portal.json'), ucitajJSON('config/layers.json')]);
    stanje.portal = portal;
    stanje.konfig = konfig;
    try {
      dodajNepogode(await ucitajJSON('config/nepogode.json'), konfig, portal);
    } catch (g) { console.warn('Nepogode nisu učitane:', g); }

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
          el('a', { href: 'https://github.com/iplascak/web-gis-bilje', target: '_blank', rel: 'noopener' }, 'Izvorni kod portala (otvoreni kod)'))));
  }

  pokreni().catch((g) => {
    console.error(g);
    document.getElementById('karta').append(
      el('p', { style: 'padding:20px;color:#b91c1c' }, 'Greška pri pokretanju portala: ' + g.message));
  });
})();
