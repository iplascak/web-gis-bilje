/*
 * Modul: jezik sučelja (hrvatski / English / magyar). Prijevodi su u config/prijevodi/<jezik>.json:
 * nazivi grupa i slojeva, brzi prikazi i rječnik tekstova sučelja (točna podudaranja).
 * Što nije prevedeno ostaje na hrvatskom. Jezik se bira u zaglavlju ili poveznicom ?jezik=en.
 */
(function () {
  'use strict';
  const JEZICI = { hr: 'HR', en: 'EN', hu: 'HU' };
  const iz = new URLSearchParams(location.search).get('jezik');
  let jezik = 'hr';
  try { jezik = iz || localStorage.getItem('webgis.jezik') || 'hr'; } catch (g) { jezik = iz || 'hr'; }
  if (!JEZICI[jezik]) jezik = 'hr';
  window.webgisJezik = jezik;
  let rj = null;
  if (jezik !== 'hr') {
    try { const x = new XMLHttpRequest(); x.open('GET', 'config/prijevodi/' + jezik + '.json', false); x.send(); if (x.status === 200) rj = JSON.parse(x.responseText); } catch (g) { rj = null; }
  }

  function pripremi(konfig, portal) {
    document.documentElement.lang = jezik;
    if (!rj) return;
    for (const g of konfig.grupe || []) if (rj.grupe && rj.grupe[g.id]) g.naziv = rj.grupe[g.id];
    for (const s of konfig.slojevi || []) {
      const t = rj.slojevi && rj.slojevi[s.id];
      if (t) { s.naziv = t[0]; if (t[1]) { s.opis = t[1]; } }
    }
    for (const b of portal.brziPrikazi || []) if (rj.brzi && rj.brzi[b.id]) b.naziv = rj.brzi[b.id];
    if (rj.naziv) { portal.naziv = rj.naziv; portal.naslov = rj.naziv; document.title = rj.naziv; }
    if (rj.podnaslov) portal.podnaslov = rj.podnaslov;
  }

  function prevedi(korijen) {
    const t = rj && rj.tekst; if (!t) return;
    const hod = document.createTreeWalker(korijen, NodeFilter.SHOW_TEXT);
    let n; while ((n = hod.nextNode())) { const s = n.nodeValue.trim(); if (s && t[s]) n.nodeValue = n.nodeValue.replace(s, t[s]); }
    if (korijen.querySelectorAll) for (const e of korijen.querySelectorAll('[placeholder],[title],[aria-label]')) {
      for (const a of ['placeholder', 'title', 'aria-label']) { const v = e.getAttribute(a); if (v && t[v]) e.setAttribute(a, t[v]); }
    }
  }

  function pokreni(s) {
    const el = s.api.el;
    // izbornik jezika u zaglavlju
    const z = document.querySelector('.zaglavlje'), oPortalu = document.getElementById('gumbOPortalu');
    if (z) {
      const izbor = el('select', { class: 'izbor-jezika', 'aria-label': 'Jezik / Language / Nyelv', onchange: (e) => {
        try { localStorage.setItem('webgis.jezik', e.target.value); } catch (g) { /* */ }
        const u = new URL(location.href); u.searchParams.delete('jezik'); location.href = u.toString();
      } }, ...Object.entries(JEZICI).map(([k, v]) => el('option', { value: k, selected: k === jezik }, v)));
      z.insertBefore(izbor, oPortalu || null);
    }
    if (!rj) return;
    const h1 = document.getElementById('naslov'); if (h1 && rj.naziv) h1.textContent = rj.naziv;
    const pod = document.getElementById('podnaslov'); if (pod && rj.podnaslov) pod.textContent = rj.podnaslov;
    window.webgisKorak = rj.korak;
    prevedi(document.body);
    new MutationObserver((m) => { for (const x of m) for (const n of x.addedNodes) if (n.nodeType === 1) prevedi(n); else if (n.nodeType === 3 && rj.tekst[n.nodeValue.trim()]) n.nodeValue = rj.tekst[n.nodeValue.trim()]; })
      .observe(document.body, { childList: true, subtree: true });
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'jezik', pripremi, pokreni });
})();
