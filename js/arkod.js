/*
 * Modul: ARKOD po godinama. Podatke priprema .github/workflows/arkod.yml (APPRRR GeoPackage):
 * data/poljoprivreda/arkod/arkod_<godina|trenutno>.geojson + popis.json.
 * Prikazuje se samo vrsta uporabe, površina i navodnjavanje – bez podataka o korisnicima.
 */
(function () {
  'use strict';
  const MAPA = 'data/poljoprivreda/arkod/';
  let stanje = null, el = null, popis = [], odabrano = 'trenutno';

  function postaviGodinu(zapis, g) {
    odabrano = g;
    const izvor = new ol.source.Vector({ url: MAPA + 'arkod_' + g + '.geojson',
      format: new ol.format.GeoJSON({ dataProjection: 'EPSG:4326', featureProjection: 'EPSG:3857' }) });
    zapis.olSloj.setSource(izvor);
    zapis.def.izvor = 'APPRRR – ARKOD, ' + (g === 'trenutno' ? 'trenutno stanje (osvježava se mjesečno)' : 'stanje 31. 12. ' + g + '.');
    zapis.def.azurirano = g === 'trenutno' ? 'mjesečno' : g + '.';
  }

  async function pokreni(s) {
    stanje = s; el = s.api.el;
    try { popis = (await (await fetch(MAPA + 'popis.json')).json()).stanja || []; } catch (g) { return; }
    const zapis = s.slojevi.arkod_uporaba;
    if (!zapis || !popis.length) return;
    if (popis.includes('trenutno')) postaviGodinu(zapis, 'trenutno');
    else postaviGodinu(zapis, popis[popis.length - 1]);
    s.detaljiDodaci.arkod_uporaba = (z) => el('label', { class: 'klizac' }, el('span', {}, 'Stanje'),
      el('select', { onchange: (e) => postaviGodinu(z, e.target.value) },
        ...popis.slice().reverse().map(g => el('option', { value: g, selected: g === odabrano }, g === 'trenutno' ? 'trenutno' : '31. 12. ' + g + '.'))));
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'arkod', pripremi() {}, pokreni });
})();
