/* Mjerenje posjećenosti bez kolačića i bez osobnih podataka.
   Bilježe se samo zbirni brojači po danu: otvaranje portala, jezik, vrsta uređaja,
   uključeni slojevi i otvorene priče. Ne šalje se IP adresa, identifikator ni ikakav trag
   pojedinog posjetitelja, a na uređaju se ništa ne sprema. Tko u pregledniku uključi
   „Do Not Track”, ne broji se uopće. Brojke se prikazuju u godišnjem izvješću (izvjesce.html). */
(function () {
  'use strict';
  let cfg = null, red = [], timer = null;

  function salji() {
    if (!red.length || !cfg) return;
    const paket = red.splice(0, 30);
    try {
      fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/biljezi_posjet', {
        method: 'POST', keepalive: true,
        headers: { apikey: cfg.supabaseKljuc, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dogadjaji: paket })
      }).catch(() => {});
    } catch (e) { /* mjerenje nikad ne smije smetati portalu */ }
  }
  function biljezi(vrsta, kljuc) {
    if (!cfg) return;
    kljuc = String(kljuc || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40);
    if (!kljuc) return;
    red.push({ vrsta, kljuc });
    clearTimeout(timer);
    timer = setTimeout(salji, 8000);
  }

  function pripremi(konfig, portal) {
    const p = (portal && portal.prijave) || {};
    const ukljuceno = !(navigator.doNotTrack === '1' || window.doNotTrack === '1') &&
      !/^(localhost|127\.)/.test(location.hostname) && p.supabaseUrl && p.supabaseKljuc;
    if (ukljuceno) cfg = p;
    window.webgisPosjete = { biljezi };
  }

  function pokreni(stanje) {
    if (!cfg) return;
    const sirina = Math.min(screen.width, screen.height);
    biljezi('posjet', 'portal');
    biljezi('jezik', window.webgisJezik || document.documentElement.lang || 'hr');
    biljezi('uredaj', sirina < 600 ? 'mobitel' : sirina < 1000 ? 'tablet' : 'racunalo');
    salji();
    // sloj koji posjetitelj sam uključi (ne oni uključeni pri otvaranju)
    setTimeout(() => {
      for (const [id, z] of Object.entries(stanje.slojevi || {})) {
        if (z && z.olSloj) z.olSloj.on('change:visible', () => { if (z.olSloj.getVisible()) biljezi('sloj', id); });
      }
    }, 3000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') salji(); });
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'posjete', pripremi, pokreni });
})();
