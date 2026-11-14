/*
 * Modul: kalendar događanja (manifestacije, sport, kultura, sajmovi, radovi i zatvorene ceste)
 * i komunalni objekti (javna rasvjeta, klupe, koševi, igrala…). Baza: supabase/migracija_4.sql.
 * Događanja unose urednici (KRC, TZ); radove i komunalne objekte unose djelatnici općine i Komunalnog.
 */
(function () {
  'use strict';
  let stanje = null, el = null, cfg = null;
  const KAT = {
    manifestacija: { boja: '#c2185b', oznaka: 'manifestacija', simbol: 'kultura' }, kultura: { boja: '#7b1fa2', oznaka: 'kultura', simbol: 'kultura' },
    sport: { boja: '#1565c0', oznaka: 'sport', simbol: 'sport' }, turizam: { boja: '#00838f', oznaka: 'turizam i izleti', simbol: 'turizam' },
    edukacija: { boja: '#5d4037', oznaka: 'edukacija, radionice', simbol: 'skola' }, sajam: { boja: '#ef6c00', oznaka: 'sajam, tržnica', simbol: 'trgovina' },
    vjerski: { boja: '#455a64', oznaka: 'vjerski događaj', simbol: 'vjera' }, radovi: { boja: '#d32f2f', oznaka: 'radovi / zatvorena cesta', simbol: 'u_obradi' },
    ostalo: { boja: '#607d8b', oznaka: 'ostalo', simbol: 'usluge' }
  };
  const VRSTE = {
    svjetiljka: { boja: '#f9a825', oznaka: 'svjetiljka javne rasvjete' }, klupa: { boja: '#8d6e63', oznaka: 'klupa' }, kos: { boja: '#546e7a', oznaka: 'koš za otpad' },
    igralo: { boja: '#e91e63', oznaka: 'igralo' }, hidrant: { boja: '#c62828', oznaka: 'hidrant' }, znak: { boja: '#1565c0', oznaka: 'prometni znak' },
    stajaliste: { boja: '#283593', oznaka: 'autobusno stajalište' }, zeleni_otok: { boja: '#2e7d32', oznaka: 'zeleni otok' }, aed: { boja: '#d50000', oznaka: 'defibrilator (AED)' },
    slavina: { boja: '#0288d1', oznaka: 'javna slavina' }, punionica: { boja: '#00897b', oznaka: 'punionica za e-vozila' }, ostalo: { boja: '#78909c', oznaka: 'ostalo' }
  };
  const rpc = (ime) => cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + ime;
  const fmt = (iso, sat = true) => iso ? new Date(iso).toLocaleString('hr-HR', Object.assign({ weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' }, sat ? { hour: '2-digit', minute: '2-digit' } : {})) : '';
  const kada = (p) => { const a = new Date(p.pocetak), b = p.kraj ? new Date(p.kraj) : null; const isti = b && a.toDateString() === b.toDateString();
    return fmt(p.pocetak) + (b ? ' – ' + (isti ? b.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' }) : fmt(p.kraj)) : ''); };

  function ics(p) {
    const d = (x) => new Date(x).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const esc = (t) => String(t || '').replace(/[\\,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
    const t = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Web GIS Opcine Bilje//HR', 'BEGIN:VEVENT', 'UID:dogadjanje-' + p.id + '@bilje',
      'DTSTAMP:' + d(new Date()), 'DTSTART:' + d(p.pocetak), 'DTEND:' + d(p.kraj || new Date(new Date(p.pocetak).getTime() + 2 * 3600e3)),
      'SUMMARY:' + esc(p.naziv), 'LOCATION:' + esc(p.mjesto || 'Općina Bilje'), 'DESCRIPTION:' + esc((p.opis || '') + (p.poveznica ? '\n' + p.poveznica : '')),
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(t);
  }

  function pripremi(konfig, portal) {
    cfg = portal.prijave;
    if (!cfg || !cfg.supabaseUrl) return;
    const zag = { apikey: cfg.supabaseKljuc };
    const i = konfig.slojevi.findIndex(s => s.grupa === 'svakodnevica');
    konfig.slojevi.splice(i < 0 ? 0 : i, 0, {
      id: 'dogadjanja', naziv: 'Događanja i radovi', grupa: 'svakodnevica', podgrupa: 'Događanja', tip: 'geojson',
      url: rpc('dogadjanja_geojson'), zaglavlja: zag, vidljivo: false,
      stil: { geometrija: 'tocka', natpis: 'naziv', natpisMinZoom: 14, kategorije: { polje: 'kategorija', vrijednosti: KAT } },
      skocniProzor: { naslov: 'naziv', polja: [{ polje: 'mjesto', oznaka: 'Mjesto' }, { polje: 'organizator', oznaka: 'Organizator' }, { polje: 'opis', oznaka: '' }] },
      skocniDodatak: 'dogadjanje',
      opis: 'Manifestacije, sport, kultura, sajmovi te radovi i zatvorene ceste – sljedećih 12 mjeseci.',
      detaljno: 'Kalendar događanja u općini koji uređuju KRC, Turistička zajednica i općina, te obavijesti o radovima i zatvorenim cestama. Svako događanje možete dodati u svoj kalendar na mobitelu.',
      izvor: 'Općina Bilje, KRC, TZ', azurirano: 'uživo'
    }, {
      id: 'komunalni_objekti', naziv: 'Komunalni objekti (rasvjeta, klupe, igrala…)', grupa: 'imovina', podgrupa: 'Komunalna oprema', tip: 'geojson',
      url: rpc('komunalni_objekti_geojson'), zaglavlja: zag, vidljivo: false, minZoom: 14,
      stil: { geometrija: 'tocka', velicina: 5, kategorije: { polje: 'vrsta', vrijednosti: VRSTE } },
      skocniProzor: { naslov: 'oznaka', polja: [{ polje: 'vrsta', oznaka: 'Vrsta' }, { polje: 'ulica', oznaka: 'Ulica' }, { polje: 'stanje', oznaka: 'Stanje' }, { polje: 'napomena', oznaka: 'Napomena' }] },
      skocniDodatak: 'komunalni_objekt',
      opis: 'Svjetiljke javne rasvjete i druga komunalna oprema – s mogućnošću prijave kvara na točno određeni objekt.',
      detaljno: 'Evidencija komunalne opreme koju vode općina i Komunalno – Bilje d.o.o.: svjetiljke javne rasvjete, klupe, koševi, igrala, hidranti, zeleni otoci, defibrilatori. Klikom na objekt možete prijaviti kvar baš za taj objekt (npr. „ne svijetli svjetiljka br. 123”).',
      izvor: 'Općina Bilje, Komunalno – Bilje d.o.o.', azurirano: 'uživo'
    });
  }

  async function popisDogadjanja() {
    const sadrzaj = el('div', {}, el('p', {}, 'Učitavam…'));
    stanje.api.otvoriDijalog(el('h3', {}, 'Događanja u Općini Bilje'), sadrzaj);
    let j;
    try { j = await (await fetch(rpc('dogadjanja_geojson'), { headers: { apikey: cfg.supabaseKljuc } })).json(); } catch (g) { j = null; }
    const f = (j && j.features) || [];
    if (!f.length) { sadrzaj.replaceChildren(el('p', {}, 'Trenutno nema najavljenih događanja.'), el('p', { class: 'sitno-siva' }, 'Događanja unose KRC, Turistička zajednica i općina.')); return; }
    sadrzaj.replaceChildren(el('div', { class: 'dog-popis' }, ...f.map(x => {
      const p = x.properties, k = KAT[p.kategorija] || KAT.ostalo;
      return el('div', { class: 'dog-stavka' },
        el('div', { class: 'dog-datum', style: 'border-color:' + k.boja }, el('b', {}, new Date(p.pocetak).getDate() + '.'), el('span', {}, new Date(p.pocetak).toLocaleDateString('hr-HR', { month: 'short' }))),
        el('div', { class: 'dog-tekst' }, el('strong', {}, p.naziv), el('div', { class: 'sitno-siva' }, k.oznaka + ' · ' + kada(p) + (p.mjesto ? ' · ' + p.mjesto : '')),
          el('div', { class: 'redak-gumba' },
            x.geometry ? el('button', { class: 'gumb-mali', onclick: () => { document.getElementById('dijalog').close();
              const z = stanje.slojevi.dogadjanja; if (z && z.postaviVidljivost) z.postaviVidljivost(true);
              stanje.karta.getView().animate({ center: ol.proj.fromLonLat(x.geometry.coordinates), zoom: 16, duration: 600 }); } }, 'Na karti') : '',
            el('a', { class: 'gumb-mali', href: ics(p), download: 'dogadjanje.ics' }, '📅 U kalendar'))));
    })));
  }

  // ---------- uređivanje ----------
  async function urednikDogadjanja(sadrzaj) {
    const b = stanje.baza;
    sadrzaj.replaceChildren(b.poruka('Učitavam…'));
    const { data, error } = await b.sb.from('dogadjanja').select('id, naziv, kategorija, pocetak, javno').order('pocetak', { ascending: false }).limit(300);
    if (error) { sadrzaj.replaceChildren(b.poruka('Greška: ' + error.message + ' (je li pokrenuta migracija_4.sql?)', 'greska')); return; }
    sadrzaj.replaceChildren(
      el('div', { class: 'redak-gumba' }, el('button', { class: 'gumb-primarni', onclick: () => obrazac() }, '+ Novo događanje')),
      el('div', { class: 'tablica-okvir' }, el('table', { class: 'tablica-prijava' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Događanje'), el('th', {}, 'Kada'), el('th'))),
        el('tbody', {}, ...data.map(d => el('tr', {}, el('td', {}, d.naziv, el('div', { class: 'sitno-siva' }, (KAT[d.kategorija] || {}).oznaka + (d.javno ? '' : ' · skriveno'))),
          el('td', {}, fmt(d.pocetak)), el('td', {}, el('button', { class: 'gumb-mali', onclick: () => obrazac(d.id) }, 'Uredi'))))))));
  }

  async function obrazac(id) {
    const b = stanje.baza;
    let p = { kategorija: 'manifestacija', javno: true };
    if (id) { const { data } = await b.sb.from('dogadjanja').select('*').eq('id', id).single(); p = data || p; }
    const lokalno = (iso) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
    const polja = {};
    const unos = (k, tip = 'text', extra = {}) => (polja[k] = el(tip === 'textarea' ? 'textarea' : 'input', Object.assign({ type: tip, value: tip === 'datetime-local' ? lokalno(p[k]) : (p[k] ?? '') }, extra), tip === 'textarea' ? (p[k] || '') : null));
    const kat = (polja.kategorija = el('select', {}, ...Object.entries(KAT).filter(([k]) => b.jeUrednik() || k === 'radovi').map(([k, v]) => el('option', { value: k, selected: p.kategorija === k }, v.oznaka))));
    const javno = el('input', { type: 'checkbox', checked: p.javno !== false });
    let lon = p.lon, lat = p.lat;
    const lok = el('span', { class: 'sitno-siva' }, lon ? lat.toFixed(5) + ', ' + lon.toFixed(5) : 'nije odabrana');
    const status = el('div');
    const red = (n, x) => el('label', { class: 'polje' }, el('span', {}, n), x);
    const forma = el('form', { class: 'obrazac', onsubmit: async (e) => {
      e.preventDefault();
      const z = {};
      for (const [k, v] of Object.entries(polja)) { let x = v.value.trim(); if (x === '') x = null; if (x && (k === 'pocetak' || k === 'kraj')) x = new Date(x).toISOString(); z[k] = x; }
      z.lon = lon ?? null; z.lat = lat ?? null; z.javno = javno.checked;
      const { error } = id ? await b.sb.from('dogadjanja').update(z).eq('id', id) : await b.sb.from('dogadjanja').insert(z);
      if (error) { status.replaceChildren(b.poruka('Spremanje nije uspjelo: ' + error.message, 'greska')); return; }
      status.replaceChildren(b.poruka('Spremljeno.', 'uspjeh'));
      const s = stanje.slojevi.dogadjanja; if (s) s.olSloj.getSource().refresh();
    } },
      red('Naziv *', unos('naziv', 'text', { required: true })), red('Opis', unos('opis', 'textarea', { rows: 3 })),
      el('div', { class: 'dva-stupca' }, red('Vrsta', kat), red('Organizator', unos('organizator'))),
      el('div', { class: 'dva-stupca' }, red('Početak *', unos('pocetak', 'datetime-local', { required: true })), red('Završetak', unos('kraj', 'datetime-local'))),
      red('Mjesto (npr. Dom kulture Bilje, Ulica …)', unos('mjesto_opis')),
      el('div', { class: 'polje' }, el('span', {}, 'Točka na karti'), el('div', { class: 'redak-gumba' }, lok,
        el('button', { type: 'button', class: 'gumb-mali', onclick: () => { document.getElementById('dijalog').close();
          stanje.api.odaberiTocku((k) => { [lon, lat] = ol.proj.toLonLat(k); lok.textContent = lat.toFixed(5) + ', ' + lon.toFixed(5); document.getElementById('dijalog').showModal(); }, 'Kliknite mjesto događanja'); } }, 'Odaberi na karti'))),
      red('Poveznica (web, Facebook)', unos('poveznica', 'url')),
      el('label', { class: 'kvacica' }, javno, ' Prikaži javno'),
      el('div', { class: 'redak-gumba' }, el('button', { class: 'gumb-primarni', type: 'submit' }, 'Spremi'),
        id ? el('button', { type: 'button', class: 'gumb-sekundarni', onclick: async () => { const { error } = await b.sb.from('dogadjanja').delete().eq('id', id);
          status.replaceChildren(error ? b.poruka('Brisanje nije uspjelo: ' + error.message, 'greska') : b.poruka('Obrisano.', 'uspjeh')); } }, 'Obriši') : ''), status);
    stanje.api.otvoriDijalog(el('h3', {}, id ? 'Uredi događanje' : 'Novo događanje'), forma);
  }

  async function urednikObjekti(sadrzaj) {
    const b = stanje.baza;
    const vrsta = el('select', {}, ...Object.entries(VRSTE).map(([k, v]) => el('option', { value: k }, v.oznaka)));
    const oznaka = el('input', { type: 'text', placeholder: 'broj / oznaka (npr. JR-123)' });
    const status = el('div');
    sadrzaj.replaceChildren(
      el('p', {}, 'Dodavanje komunalnih objekata na kartu: odaberite vrstu, upišite oznaku i kliknite mjesto na karti. Za veći popis (npr. sve svjetiljke iz katastra rasvjete) pošaljite tablicu adminu za jednokratni uvoz.'),
      el('div', { class: 'dva-stupca' }, el('label', { class: 'polje' }, el('span', {}, 'Vrsta'), vrsta), el('label', { class: 'polje' }, el('span', {}, 'Oznaka'), oznaka)),
      el('button', { class: 'gumb-primarni', onclick: () => { document.getElementById('dijalog').close();
        stanje.api.odaberiTocku(async (k) => {
          const [lon, lat] = ol.proj.toLonLat(k);
          const najbliza = stanje.api.najblizaAdresa ? stanje.api.najblizaAdresa(k) : null;
          const { error } = await b.sb.from('komunalni_objekti').insert({ vrsta: vrsta.value, oznaka: oznaka.value.trim() || null, lon, lat,
            ulica: najbliza ? najbliza.tekst : null });
          const s = stanje.slojevi.komunalni_objekti; if (s) { s.olSloj.getSource().refresh(); if (s.postaviVidljivost) s.postaviVidljivost(true); }
          stanje.api.otvoriDijalog(el('h3', {}, 'Komunalni objekti'), error ? b.poruka('Nije spremljeno: ' + error.message, 'greska') : b.poruka('Objekt je dodan na kartu.', 'uspjeh'));
        }, 'Kliknite mjesto objekta');
      } }, 'Dodaj na karti'), status);
  }

  function pokreni(s) {
    stanje = s; el = s.api.el;
    if (!cfg || !cfg.supabaseUrl) return;
    s.akcije.dogadjanja = popisDogadjanja;
    s.skocniDodaci.dogadjanje = (f) => {
      const p = f.getProperties();
      return el('div', {}, el('p', {}, el('strong', {}, kada(p))),
        el('div', { class: 'redak-gumba' }, el('a', { class: 'gumb-mali', href: ics(p), download: 'dogadjanje.ics' }, '📅 Dodaj u kalendar'),
          p.poveznica ? el('a', { class: 'gumb-mali', href: p.poveznica, target: '_blank', rel: 'noopener' }, 'Više') : ''));
    };
    s.skocniDodaci.komunalni_objekt = (f) => {
      const p = f.getProperties();
      return el('button', { class: 'gumb-mali', onclick: () => {
        stanje.api.zatvoriSkocni();
        if (s.akcije.prijavaZaObjekt) s.akcije.prijavaZaObjekt(p, f.getGeometry().getCoordinates());
        else if (s.akcije.prijava) s.akcije.prijava();
      } }, 'Prijavi kvar na ovom objektu');
    };
    if (s.baza) {
      s.baza.kartice.push({ naziv: 'Događanja', vidljivo: () => s.baza.jeUrednik() || s.baza.jeOsoblje(), prikazi: urednikDogadjanja });
      s.baza.kartice.push({ naziv: 'Komunalni objekti', vidljivo: () => s.baza.jeOsoblje(), prikazi: urednikObjekti });
    }
    const bp = document.getElementById('brziPrikazi');
    if (bp) bp.append(el('button', { class: 'brzi-prikaz', title: 'Nadolazeća događanja', onclick: popisDogadjanja }, s.api.ikona('kuca', 16), el('span', {}, 'Događanja')));
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'dogadjanja', pripremi, pokreni });
})();
