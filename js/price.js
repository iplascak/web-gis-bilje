/*
 * Modul: vođene priče. Priča je datoteka config/price/<id>.json s koracima
 * { naslov, tekst, slojevi:[...], pogled:'opcina'|{centar:[lon,lat],zoom}, akcija?, gumb? }.
 * Svaki korak uključuje svoje slojeve, pomiče kartu i (po želji) otvara alat. Nove priče može pisati urednik.
 */
(function () {
  'use strict';
  const PRICE = [{ id: 'poljoprivreda', naziv: 'Priča: poljoprivreda', ikona: 'traktor' }, { id: 'turizam', naziv: 'Priča: izlet u Kopački rit', ikona: 'lokacija' }, { id: 'bastina', naziv: 'Priča: baština osam sela', ikona: 'stup' }];
  let stanje = null, el = null;

  async function pokreniPricu(id) {
    let p;
    const j = window.webgisJezik && window.webgisJezik !== 'hr' ? '.' + window.webgisJezik : '';
    try { p = await (await fetch('config/price/' + id + j + '.json')).json(); }
    catch (g) { try { p = await (await fetch('config/price/' + id + '.json')).json(); } catch (g2) { return; } }
    const koraci = p.koraci.filter(k => !k.slojevi.length || k.slojevi.some(s => stanje.slojevi[s]));
    let i = 0;
    document.querySelector('.prica')?.remove();
    const tekst = el('div', { class: 'prica-tekst' });
    const tocke = el('div', { class: 'prica-tocke' });
    const nazad = el('button', { class: 'gumb-mali', onclick: () => idi(i - 1) }, '‹ Natrag');
    const dalje = el('button', { class: 'gumb-primarni', onclick: () => idi(i + 1) }, 'Dalje ›');
    const okvir = el('section', { class: 'prica', role: 'dialog', 'aria-label': p.naslov },
      el('div', { class: 'prica-zaglavlje' }, el('span', { class: 'prica-oznaka' }, p.naslov),
        el('button', { class: 'gumb-zatvori', 'aria-label': 'Zatvori priču', onclick: zatvori }, stanje.api.ikona('zatvori', 16))),
      tekst, el('div', { class: 'prica-dno' }, nazad, tocke, dalje));
    document.getElementById('karta').append(okvir);
    document.addEventListener('keydown', tipke);

    function tipke(e) { if (e.key === 'ArrowRight') idi(i + 1); else if (e.key === 'ArrowLeft') idi(i - 1); else if (e.key === 'Escape') zatvori(); }
    function zatvori() { okvir.remove(); document.removeEventListener('keydown', tipke); }
    function idi(n) {
      if (n < 0 || n >= koraci.length) { if (n >= koraci.length) zatvori(); return; }
      i = n; const k = koraci[i];
      const ukljuci = new Set([...(stanje.portal.uvijekUkljuceni || []), ...k.slojevi]);
      for (const [id, z] of Object.entries(stanje.slojevi)) if (z.postaviVidljivost) z.postaviVidljivost(ukljuci.has(id));
      const v = stanje.karta.getView();
      if (k.pogled === 'opcina' && stanje.granicaExtent) v.fit(stanje.granicaExtent, { padding: [40, 40, 40, window.innerWidth > 720 ? 420 : 40], duration: 900 });
      else if (k.pogled && k.pogled.centar) v.animate({ center: ol.proj.fromLonLat(k.pogled.centar), zoom: k.pogled.zoom || 13, duration: 900 });
      const akcija = k.akcija && stanje.akcije[k.akcija];
      tekst.replaceChildren(el('div', { class: 'prica-korak' }, (window.webgisKorak ? window.webgisKorak[0] : 'Korak') + ' ' + (i + 1) + ' ' + (window.webgisKorak ? window.webgisKorak[1] : 'od') + ' ' + koraci.length),
        el('h3', {}, k.naslov), el('p', {}, k.tekst),
        akcija ? el('button', { class: 'gumb-mali', onclick: akcija }, k.gumb || 'Otvori') : '');
      tocke.replaceChildren(...koraci.map((_, j) => el('button', { class: 'prica-tocka' + (j === i ? ' aktivna' : ''), 'aria-label': 'Korak ' + (j + 1), onclick: () => idi(j) })));
      nazad.disabled = i === 0;
      dalje.textContent = i === koraci.length - 1 ? 'Završi' : 'Dalje ›';
    }
    idi(0);
  }

  function pokreni(s) {
    stanje = s; el = s.api.el;
    s.akcije.prica = pokreniPricu;
    s.akcije.prica_poljo = () => pokreniPricu('poljoprivreda');
    s.akcije.prica_turizam = () => pokreniPricu('turizam');
    s.akcije.prica_bastina = () => pokreniPricu('bastina');
    const bp = document.getElementById('brziPrikazi');
    if (bp) for (const p of PRICE) bp.append(el('button', { class: 'brzi-prikaz', title: 'Vođena priča kroz karte', onclick: () => pokreniPricu(p.id) }, s.api.ikona(p.ikona, 16), el('span', {}, p.naziv)));
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'price', pripremi() {}, pokreni });
})();
