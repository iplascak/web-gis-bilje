/*
 * Modul: projekti iz baze, tražilica pokojnika i doprinosi mještana (stare fotografije, toponimi).
 * Radi tek kad je u bazi pokrenuta supabase/migracija_3.sql; do tada se ništa ne prikazuje.
 */
(function () {
  'use strict';
  let stanje = null, el = null, cfg = null;

  const KATEGORIJE = {
    ceste_promet: 'Ceste, nogostupi, promet', komunalna_infrastruktura: 'Komunalna infrastruktura (rasvjeta, groblja…)',
    vodoopskrba_odvodnja: 'Vodoopskrba i odvodnja', drustvena_infrastruktura: 'Društveni domovi i zgrade',
    sport_rekreacija: 'Sport i rekreacija', kultura_bastina: 'Kultura i baština', turizam: 'Turizam',
    energetika: 'Energetika (obnova, OIE)', okolis_otpad: 'Okoliš i otpad', poljoprivreda: 'Poljoprivreda',
    socijalni_programi: 'Socijalni programi', obrazovanje_djeca: 'Vrtić, škola, djeca', uprava_digitalizacija: 'Uprava i digitalizacija', ostalo: 'Ostalo'
  };
  const STATUSI = {
    provedeno: { boja: '#1F7A3D', oznaka: 'provedeno', simbol: 'rijeseno' },
    u_provedbi: { boja: '#e0a800', oznaka: 'u provedbi', simbol: 'u_obradi' },
    u_pripremi: { boja: '#2c57a2', oznaka: 'u pripremi', simbol: 'zaprimljeno' },
    planirano: { boja: '#7c8591', oznaka: 'planirano', simbol: 'zaprimljeno' }
  };
  const rpc = (ime) => cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + ime;

  function pripremi(konfig, portal) {
    cfg = portal.prijave;
    if (!cfg || !cfg.supabaseUrl) return;
    const vr = {};
    for (const [k, v] of Object.entries(STATUSI)) vr[k] = v;
    konfig.slojevi.push({
      id: 'projekti_baza', naziv: 'Projekti općine (2013. – danas)', grupa: 'projekti', tip: 'geojson',
      url: rpc('projekti_geojson'), zaglavlja: { apikey: cfg.supabaseKljuc }, rezerva: 'data/projekti/nacrt.geojson', vidljivo: false,
      stil: { geometrija: 'tocka', debljina: 4, kategorije: { polje: 'status', vrijednosti: vr } },
      skocniProzor: { naslov: 'naziv', polja: [
        { polje: 'status', oznaka: 'Status', format: 'kategorija' }, { polje: 'razdoblje', oznaka: 'Razdoblje' },
        { polje: 'opis', oznaka: 'Opis' }, { polje: 'lokacija', oznaka: 'Lokacija' },
        { polje: 'vrijednost_eur', oznaka: 'Vrijednost', format: 'eur' }, { polje: 'bespovratno_eur', oznaka: 'Bespovratna sredstva', format: 'eur' },
        { polje: 'izvor_financiranja', oznaka: 'Izvor financiranja' }, { polje: 'program', oznaka: 'Program / natječaj' },
        { polje: 'nositelj', oznaka: 'Nositelj' }, { polje: 'partneri', oznaka: 'Partneri' }] },
      skocniDodatak: 'projekt',
      opis: 'Svi projekti općine od 2013. – provedeni, u provedbi i u pripremi.',
      detaljno: 'Projekti Općine Bilje i njezinih ustanova s lokacijom, vrijednošću, izvorom financiranja i statusom. Podatke unose ovlašteni urednici kroz portal, na temelju službenih glasnika, proračuna i ugovora.',
      izvor: 'Općina Bilje', azurirano: 'uživo'
    });
    konfig.slojevi.push({
      id: 'doprinosi', naziv: 'Stare fotografije i zaboravljeni nazivi', grupa: 'bastina', podgrupa: 'Sjećanja mještana', tip: 'geojson',
      url: rpc('doprinosi_geojson'), zaglavlja: { apikey: cfg.supabaseKljuc }, vidljivo: false,
      stil: { geometrija: 'tocka', natpis: 'naslov', natpisMinZoom: 15, kategorije: { polje: 'vrsta', vrijednosti: {
        fotografija: { boja: '#7c2d12', oznaka: 'stara fotografija', simbol: 'bastina' },
        toponim: { boja: '#a16207', oznaka: 'narodni naziv mjesta (toponim)', simbol: 'priroda' },
        prica: { boja: '#6d28d9', oznaka: 'priča / sjećanje', simbol: 'kultura' } } } },
      skocniProzor: { naslov: 'naslov', polja: [{ polje: 'razdoblje', oznaka: 'Razdoblje' }, { polje: 'opis', oznaka: '' }, { polje: 'autor', oznaka: 'Ustupio/la' }] },
      skocniDodatak: 'doprinos',
      opis: 'Kako je nekad izgledalo naše mjesto i kako su se zvala polja, putovi i bare – prilozi mještana.',
      detaljno: 'Mještani dodaju stare fotografije, narodne nazive polja, šuma, bara i putova te kratke priče vezane uz mjesto. Svaki prilog prije objave pregleda urednik. Za fotografije autor potvrđuje da ih smije objaviti.\n\nDodajte svoj prilog gumbom "Dodaj sjećanje" (potrebna je prijava e-adresom).',
      izvor: 'Mještani Općine Bilje', azurirano: 'uživo'
    });
  }

  // ---------- tražilica pokojnika ----------
  let oznaka = null;
  function prikaziGrob(r) {
    const k = ol.proj.fromLonLat([r.lon, r.lat]);
    if (!oznaka) {
      oznaka = new ol.layer.Vector({ source: new ol.source.Vector(), zIndex: 1200, style: new ol.style.Style({
        image: stanje.api.ikonaSimbola(null, '#7cb32b', 34) }) });
      stanje.karta.addLayer(oznaka);
    }
    oznaka.getSource().clear();
    oznaka.getSource().addFeature(new ol.Feature(new ol.geom.Point(k)));
    const dron = stanje.slojevi.groblja_dron; if (dron && dron.postaviVidljivost) dron.postaviVidljivost(true);
    stanje.karta.getView().animate({ center: k, zoom: 20, duration: 700 });
    document.getElementById('dijalog').close();
  }
  function trazilicaPokojnika() {
    const unos = el('input', { type: 'search', placeholder: 'Ime i prezime (najmanje 3 slova)', autocomplete: 'off' });
    const rez = el('div', { class: 'pokojnici-rezultati' });
    let t = null;
    unos.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = unos.value.trim();
        if (q.length < 3) { rez.replaceChildren(); return; }
        try {
          const o = await fetch(rpc('trazi_pokojnika'), { method: 'POST', headers: { apikey: cfg.supabaseKljuc, 'Content-Type': 'application/json' }, body: JSON.stringify({ upit: q }) });
          const j = o.ok ? await o.json() : [];
          rez.replaceChildren(...(j.length ? j.map(r => el('div', { class: 'pokojnik' },
            el('div', {}, el('strong', {}, r.ime + ' ' + r.prezime), el('div', { class: 'sitno-siva' },
              [r.godina_rodjenja, r.godina_smrti].filter(Boolean).join(' – ') + ' · groblje ' + r.groblje +
              (r.polje || r.red || r.broj ? ' · ' + ['polje ' + (r.polje || '–'), 'red ' + (r.red || '–'), 'br. ' + (r.broj || '–')].join(', ') : ''))),
            r.lon ? el('button', { class: 'gumb-mali', onclick: () => prikaziGrob(r) }, 'Na karti') : ''))
            : [el('p', { class: 'sitno-siva' }, o.ok ? 'Nema rezultata.' : 'Tražilica još nije uključena (podaci se pripremaju).')]));
        } catch (g) { rez.replaceChildren(el('p', { class: 'sitno-siva' }, 'Tražilica trenutno nije dostupna.')); }
      }, 300);
    });
    stanje.api.otvoriDijalog(el('h3', {}, 'Tražilica pokojnika'),
      el('p', { class: 'sitno-siva' }, 'Groblja Bilje, Kopačevo, Lug i Vardarac. Podatke vodi Komunalno - Bilje d.o.o.; prikazuju se samo ime, godine i mjesto ukopa. Obitelj može zatražiti da se zapis ne prikazuje.'),
      el('label', { class: 'polje' }, unos), rez);
    unos.focus();
  }

  // ---------- doprinosi mještana ----------
  function dodajDoprinos() {
    const b = stanje.baza;
    if (!b.korisnik()) { b.prijava(dodajDoprinos); return; }
    stanje.api.odaberiTocku(async (koord) => {
      const [lon, lat] = ol.proj.toLonLat(koord);
      const vrsta = el('select', {}, el('option', { value: 'fotografija' }, 'Stara fotografija'), el('option', { value: 'toponim' }, 'Narodni naziv mjesta (polje, put, bara…)'), el('option', { value: 'prica' }, 'Priča / sjećanje'));
      const naslov = el('input', { type: 'text', required: true, maxlength: 200, placeholder: 'npr. "Glavna ulica oko 1960." ili "Kraljev rit"' });
      const opis = el('textarea', { rows: 4, maxlength: 3000, placeholder: 'Što prikazuje, odakle naziv, tko se sjeća…' });
      const razdoblje = el('input', { type: 'text', placeholder: 'npr. oko 1965.' });
      const autor = el('input', { type: 'text', placeholder: 'kako vas potpisati (neobavezno)' });
      const foto = el('input', { type: 'file', accept: 'image/*' });
      const privola = el('input', { type: 'checkbox', required: true });
      const status = el('div');
      const obrazac = el('form', { class: 'obrazac', onsubmit: async (e) => {
        e.preventDefault(); status.replaceChildren(b.poruka('Šaljem…'));
        try {
          let putanja = null;
          if (foto.files[0]) {
            putanja = b.korisnik().id + '/' + crypto.randomUUID() + '.jpg';
            const { error } = await b.sb.storage.from('doprinosi').upload(putanja, foto.files[0], { contentType: foto.files[0].type });
            if (error) throw error;
          }
          const { error } = await b.sb.from('doprinosi').insert({ vrsta: vrsta.value, naslov: naslov.value.trim(), opis: opis.value.trim() || null,
            razdoblje: razdoblje.value.trim() || null, autor: autor.value.trim() || null, fotografija: putanja, lon, lat, privola: privola.checked });
          if (error) throw error;
          stanje.api.otvoriDijalog(el('h3', {}, 'Hvala!'), el('p', {}, 'Vaš prilog je zaprimljen i bit će objavljen nakon pregleda urednika.'));
        } catch (g) { status.replaceChildren(b.poruka('Slanje nije uspjelo: ' + (g.message || g), 'greska')); }
      } },
        el('label', { class: 'polje' }, el('span', {}, 'Vrsta'), vrsta), el('label', { class: 'polje' }, el('span', {}, 'Naslov'), naslov),
        el('label', { class: 'polje' }, el('span', {}, 'Opis'), opis), el('label', { class: 'polje' }, el('span', {}, 'Razdoblje'), razdoblje),
        el('label', { class: 'polje' }, el('span', {}, 'Fotografija (neobavezno)'), foto), el('label', { class: 'polje' }, el('span', {}, 'Potpis'), autor),
        el('label', { class: 'kvacica' }, privola, el('span', {}, 'Potvrđujem da smijem objaviti ovaj prilog (fotografija je moja ili obiteljska) i da se može prikazati na karti.')),
        el('button', { class: 'gumb-primarni', type: 'submit' }, 'Pošalji'), status);
      stanje.api.otvoriDijalog(el('h3', {}, 'Dodaj sjećanje na karti'), obrazac);
    }, 'Kliknite na karti gdje je snimljena fotografija ili gdje se nalazi mjesto');
  }

  // ---------- urednik: projekti i doprinosi ----------
  async function uredniciProjekti(sadrzaj) {
    const b = stanje.baza;
    sadrzaj.replaceChildren(b.poruka('Učitavam…'));
    const { data, error } = await b.sb.from('projekti').select('id, naziv, status, naselje, godina_pocetka, godina_zavrsetka, lon').order('id', { ascending: false });
    if (error) { sadrzaj.replaceChildren(b.poruka('Greška: ' + error.message + ' (je li pokrenuta migracija_3.sql?)', 'greska')); return; }
    sadrzaj.replaceChildren(
      el('div', { class: 'redak-gumba' }, el('button', { class: 'gumb-primarni', onclick: () => obrazacProjekta() }, '+ Novi projekt')),
      el('div', { class: 'tablica-okvir' }, el('table', { class: 'tablica-prijava' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Projekt'), el('th', {}, 'Status'), el('th', {}, 'Godine'), el('th'))),
        el('tbody', {}, ...data.map(p => el('tr', {},
          el('td', {}, p.naziv, el('div', { class: 'sitno-siva' }, (p.naselje || '') + (p.lon ? '' : ' · bez lokacije'))),
          el('td', {}, (STATUSI[p.status] || {}).oznaka || p.status), el('td', {}, [p.godina_pocetka, p.godina_zavrsetka].filter(Boolean).join('–')),
          el('td', {}, el('button', { class: 'gumb-mali', onclick: () => obrazacProjekta(p.id) }, 'Uredi'))))))));
  }

  async function obrazacProjekta(id) {
    const b = stanje.baza;
    let p = {};
    if (id) { const { data } = await b.sb.from('projekti').select('*').eq('id', id).single(); p = data || {}; }
    const polja = {};
    const unos = (k, tip = 'text', extra = {}) => (polja[k] = el(tip === 'textarea' ? 'textarea' : 'input', Object.assign({ type: tip, value: p[k] ?? '' }, extra), tip === 'textarea' ? (p[k] || '') : null));
    const odabir = (k, opcije) => (polja[k] = el('select', {}, ...Object.entries(opcije).map(([v, o]) => el('option', { value: v, selected: p[k] === v }, typeof o === 'string' ? o : o.oznaka))));
    const lok = el('span', { class: 'sitno-siva' }, p.lon ? p.lat.toFixed(5) + ', ' + p.lon.toFixed(5) : 'nije odabrana');
    let lon = p.lon, lat = p.lat;
    const status = el('div');
    const red = (naziv, polje) => el('label', { class: 'polje' }, el('span', {}, naziv), polje);
    // galerija fotografija i dodatne poveznice (migracija_5)
    const fotke = niz(p.fotografije).map(x => Object.assign({}, x));
    if (!fotke.length && p.fotografija) fotke.push({ putanja: p.fotografija });
    const povez = niz(p.poveznice).map(x => Object.assign({}, x));
    const uklonjene = [];
    const popisFotki = el('div'), popisPoveznica = el('div');
    const crtajFotke = () => popisFotki.replaceChildren(...fotke.map((x, i) => el('div', { class: 'ured-foto' },
      el('img', { src: fotoUrl(x.putanja), alt: '' }),
      el('div', {},
        el('input', { type: 'text', value: x.opis || '', placeholder: 'Opis fotografije', oninput: (e) => { x.opis = e.target.value; } }),
        el('div', { class: 'redak-gumba' },
          el('input', { type: 'number', value: x.godina || '', placeholder: 'Godina', style: 'width:90px', oninput: (e) => { x.godina = e.target.value ? parseInt(e.target.value, 10) : null; } }),
          el('select', { onchange: (e) => { x.vrsta = e.target.value || null; } }, ...[['', '—'], ['prije', 'prije'], ['poslije', 'poslije']].map(([v, o]) => el('option', { value: v, selected: (x.vrsta || '') === v }, o))),
          i > 0 ? el('button', { type: 'button', class: 'gumb-mali', title: 'Pomakni naprijed', onclick: () => { fotke.splice(i - 1, 0, fotke.splice(i, 1)[0]); crtajFotke(); } }, '↑') : '',
          el('button', { type: 'button', class: 'gumb-mali', onclick: () => { uklonjene.push(fotke.splice(i, 1)[0].putanja); crtajFotke(); } }, 'Ukloni'))))));
    const crtajPoveznice = () => popisPoveznica.replaceChildren(...povez.map((x, i) => el('div', { class: 'ured-poveznica' },
      el('input', { type: 'text', value: x.naziv || '', placeholder: 'Naziv (npr. Stranica projekta)', oninput: (e) => { x.naziv = e.target.value; } }),
      el('input', { type: 'url', value: x.url || '', placeholder: 'https://…', oninput: (e) => { x.url = e.target.value; } }),
      el('button', { type: 'button', class: 'gumb-mali', onclick: () => { povez.splice(i, 1); crtajPoveznice(); } }, '×'))));
    crtajFotke(); crtajPoveznice();
    const ucitaj = el('input', { type: 'file', accept: 'image/*', multiple: true, onchange: async (e) => {
      const datoteke = [...e.target.files]; e.target.value = '';
      for (const [n, d] of datoteke.entries()) {
        status.replaceChildren(b.poruka('Učitavam fotografiju ' + (n + 1) + ' / ' + datoteke.length + '…'));
        try {
          const blob = await b.smanjiFotografiju(d, 2000);
          const putanja = 'projekt-' + id + '/' + Date.now() + '-' + n + '.jpg';
          const { error } = await b.sb.storage.from('projekti-foto').upload(putanja, blob, { contentType: 'image/jpeg' });
          if (error) throw error;
          fotke.push({ putanja }); crtajFotke();
        } catch (g) { status.replaceChildren(b.poruka('Fotografija nije učitana: ' + g.message, 'greska')); return; }
      }
      status.replaceChildren(b.poruka('Fotografije su učitane – kliknite Spremi.', 'uspjeh'));
    } });
    const obrazac = el('form', { class: 'obrazac', onsubmit: async (e) => {
      e.preventDefault();
      const zapis = {};
      for (const [k, v] of Object.entries(polja)) {
        let x = v.value.trim(); if (x === '') x = null;
        if (x !== null && ['godina_pocetka', 'godina_zavrsetka'].includes(k)) x = parseInt(x, 10);
        if (x !== null && ['vrijednost_eur', 'bespovratno_eur', 'udio_opcine_eur'].includes(k)) x = parseFloat(x.replace(/\./g, '').replace(',', '.'));
        zapis[k] = x;
      }
      zapis.lon = lon ?? null; zapis.lat = lat ?? null;
      zapis.fotografije = fotke.map(x => Object.fromEntries(Object.entries({ putanja: x.putanja, opis: (x.opis || '').trim() || null, godina: x.godina || null, vrsta: x.vrsta || null }).filter(([, v]) => v !== null)));
      zapis.poveznice = povez.filter(x => (x.url || '').trim()).map(x => ({ naziv: (x.naziv || '').trim() || null, url: x.url.trim() }));
      zapis.fotografija = zapis.fotografije.length ? zapis.fotografije[0].putanja : null;
      const spremi = (z) => id ? b.sb.from('projekti').update(z).eq('id', id).select('id').single() : b.sb.from('projekti').insert(z).select('id').single();
      let { data: spremljeno, error } = await spremi(zapis);
      if (error && /fotografije|poveznice/.test(error.message)) { // baza još bez migracije_5
        delete zapis.fotografije; delete zapis.poveznice; ({ data: spremljeno, error } = await spremi(zapis));
      }
      if (error) { status.replaceChildren(b.poruka('Spremanje nije uspjelo: ' + error.message, 'greska')); return; }
      if (uklonjene.length) { await b.sb.storage.from('projekti-foto').remove(uklonjene.splice(0)); }
      status.replaceChildren(b.poruka('Spremljeno.', 'uspjeh'));
      const z = stanje.slojevi.projekti_baza; if (z) z.olSloj.getSource().refresh();
      if (!id && spremljeno) obrazacProjekta(spremljeno.id); // novi projekt: odmah omogući dodavanje fotografija
    } },
      red('Naziv projekta *', unos('naziv', 'text', { required: true })), red('Opis', unos('opis', 'textarea', { rows: 3 })),
      el('div', { class: 'dva-stupca' }, red('Kategorija', odabir('kategorija', KATEGORIJE)), red('Status', odabir('status', STATUSI))),
      el('div', { class: 'dva-stupca' }, red('Naselje', unos('naselje')), red('Lokacija (adresa / k.č.)', unos('lokacija_opis'))),
      el('div', { class: 'polje' }, el('span', {}, 'Točka na karti'), el('div', { class: 'redak-gumba' }, lok,
        el('button', { type: 'button', class: 'gumb-mali', onclick: () => {
          document.getElementById('dijalog').close();
          stanje.api.odaberiTocku((k) => { [lon, lat] = ol.proj.toLonLat(k); lok.textContent = lat.toFixed(5) + ', ' + lon.toFixed(5); document.getElementById('dijalog').showModal(); }, 'Kliknite lokaciju projekta');
        } }, 'Odaberi na karti'))),
      el('div', { class: 'dva-stupca' }, red('Godina početka', unos('godina_pocetka', 'number')), red('Godina završetka', unos('godina_zavrsetka', 'number'))),
      el('div', { class: 'dva-stupca' }, red('Ukupna vrijednost (EUR)', unos('vrijednost_eur')), red('Bespovratno (EUR)', unos('bespovratno_eur'))),
      el('div', { class: 'dva-stupca' }, red('Izvor financiranja', unos('izvor_financiranja', 'text', { placeholder: 'EU – EPFRR, ministarstvo, proračun…' })), red('Program / natječaj', unos('program_natjecaj'))),
      el('div', { class: 'dva-stupca' }, red('Nositelj', unos('nositelj')), red('Partneri', unos('partneri'))),
      red('Glavna poveznica (stranica projekta ili vijest)', unos('poveznica', 'url')),
      el('div', { class: 'polje' }, el('span', {}, 'Dodatne poveznice (odluka, natječaj, vijesti…)'), popisPoveznica,
        el('button', { type: 'button', class: 'gumb-mali', onclick: () => { povez.push({}); crtajPoveznice(); } }, '+ Dodaj poveznicu')),
      el('div', { class: 'polje' }, el('span', {}, 'Fotografije'), popisFotki,
        id ? el('label', { class: 'gumb-mali' }, '+ Dodaj fotografije', Object.assign(ucitaj, { hidden: true }))
          : el('span', { class: 'sitno-siva' }, 'Fotografije se dodaju nakon prvog spremanja projekta.'),
        el('div', { class: 'sitno-siva' }, 'Samo fotografije na koje Općina ima pravo objave; osobe na fotografiji samo uz njihov pristanak. Pri učitavanju se uklanjaju GPS i ostali skriveni podaci. Za usporedbu „prije – poslije” označite po jednu fotografiju.')), red('Izvor podatka', unos('izvor_podatka', 'text', { placeholder: 'npr. Službeni glasnik 11/2024' })),
      el('button', { class: 'gumb-primarni', type: 'submit' }, 'Spremi'), status);
    stanje.api.otvoriDijalog(el('h3', {}, id ? 'Uredi projekt' : 'Novi projekt'), obrazac);
  }

  async function uredniciDoprinosi(sadrzaj) {
    const b = stanje.baza;
    sadrzaj.replaceChildren(b.poruka('Učitavam…'));
    const { data, error } = await b.sb.from('doprinosi').select('id, vrsta, naslov, opis, status, fotografija, stvoreno').order('stvoreno', { ascending: false }).limit(200);
    if (error) { sadrzaj.replaceChildren(b.poruka('Greška: ' + error.message, 'greska')); return; }
    const url = (p) => b.sb.storage.from('doprinosi').getPublicUrl(p).data.publicUrl;
    sadrzaj.replaceChildren(data.length ? el('div', { class: 'tablica-okvir' }, ...data.map(d => el('div', { class: 'doprinos-stavka' },
      d.fotografija ? el('img', { src: url(d.fotografija), class: 'doprinos-slicica', alt: '' }) : '',
      el('div', {}, el('strong', {}, d.naslov), el('div', { class: 'sitno-siva' }, d.vrsta + ' · ' + d.status), el('div', {}, (d.opis || '').slice(0, 200)),
        el('div', { class: 'redak-gumba' },
          el('button', { class: 'gumb-mali', onclick: async () => { await b.sb.from('doprinosi').update({ status: 'odobreno' }).eq('id', d.id); uredniciDoprinosi(sadrzaj); } }, 'Odobri'),
          el('button', { class: 'gumb-mali', onclick: async () => { await b.sb.from('doprinosi').update({ status: 'odbijeno' }).eq('id', d.id); uredniciDoprinosi(sadrzaj); } }, 'Odbij')))))) :
      b.poruka('Nema priloga.'));
  }

  // ---------- skočni prozor projekta: galerija, prije/poslije, poveznice, oznaka EU ----------
  const fotoUrl = (putanja) => cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/projekti-foto/' + putanja.split('/').map(encodeURIComponent).join('/');
  const niz = (v) => { if (!v) return []; if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { return []; } } return Array.isArray(v) ? v : []; };
  const EU_IZVOR = /\bEU\b|europsk|EPFRR|EFRR|\bESF|kohezij|NPOO|Interreg|LEADER|\bLAG\b|ITU/i;

  function svjetlosnaKutija(fotke, i, naslov) {
    let d = document.getElementById('galerijaDijalog');
    if (!d) { d = el('dialog', { id: 'galerijaDijalog', class: 'galerija-dijalog' }); document.body.append(d); d.addEventListener('click', (e) => { if (e.target === d) d.close(); }); }
    const prikazi = () => {
      const f = fotke[i];
      d.replaceChildren(
        el('button', { class: 'galerija-zatvori', 'aria-label': 'Zatvori', onclick: () => d.close() }, '×'),
        el('img', { src: fotoUrl(f.putanja), alt: f.opis || naslov }),
        el('div', { class: 'galerija-opis' }, [f.vrsta === 'prije' ? 'Prije' : f.vrsta === 'poslije' ? 'Poslije' : '', f.opis, f.godina].filter(Boolean).join(' · '),
          el('span', { class: 'sitno-siva' }, ' ' + (i + 1) + ' / ' + fotke.length)),
        fotke.length > 1 ? el('button', { class: 'galerija-strelica lijevo', 'aria-label': 'Prethodna', onclick: () => { i = (i - 1 + fotke.length) % fotke.length; prikazi(); } }, '‹') : '',
        fotke.length > 1 ? el('button', { class: 'galerija-strelica desno', 'aria-label': 'Sljedeća', onclick: () => { i = (i + 1) % fotke.length; prikazi(); } }, '›') : '');
    };
    d.onkeydown = (e) => { if (e.key === 'ArrowLeft') { i = (i - 1 + fotke.length) % fotke.length; prikazi(); } if (e.key === 'ArrowRight') { i = (i + 1) % fotke.length; prikazi(); } };
    prikazi(); if (!d.open) d.showModal();
  }

  function priJePoslije(prije, poslije) {
    const okvir = el('div', { class: 'prije-poslije' },
      el('img', { src: fotoUrl(poslije.putanja), alt: 'Poslije' }),
      el('div', { class: 'prije-sloj' }, el('img', { src: fotoUrl(prije.putanja), alt: 'Prije' })),
      el('span', { class: 'pp-oznaka lijevo' }, 'Prije' + (prije.godina ? ' ' + prije.godina : '')),
      el('span', { class: 'pp-oznaka desno' }, 'Poslije' + (poslije.godina ? ' ' + poslije.godina : '')));
    const klizac = el('input', { type: 'range', min: 0, max: 100, value: 50, 'aria-label': 'Usporedba prije i poslije',
      oninput: (e) => okvir.style.setProperty('--pp', e.target.value + '%') });
    okvir.style.setProperty('--pp', '50%');
    return el('div', {}, okvir, klizac);
  }

  function dodatakProjekta(f) {
    const naslov = f.get('naziv');
    const fotke = niz(f.get('fotografije')).filter(x => x && x.putanja);
    if (!fotke.length && f.get('fotografija')) fotke.push({ putanja: f.get('fotografija') });
    const poveznice = niz(f.get('poveznice')).filter(x => x && x.url);
    if (f.get('poveznica') && !poveznice.some(x => x.url === f.get('poveznica'))) poveznice.unshift({ naziv: 'Više o projektu', url: f.get('poveznica') });
    const dijelovi = [];
    const prije = fotke.find(x => x.vrsta === 'prije'), poslije = fotke.find(x => x.vrsta === 'poslije');
    if (prije && poslije) dijelovi.push(priJePoslije(prije, poslije));
    if (fotke.length) {
      const vidljive = fotke.slice(0, 6);
      dijelovi.push(el('div', { class: 'galerija' }, ...vidljive.map((x, i) => el('button', { class: 'galerija-slicica', title: x.opis || naslov,
        onclick: () => svjetlosnaKutija(fotke, i, naslov) }, el('img', { src: fotoUrl(x.putanja), alt: x.opis || naslov, loading: 'lazy' }),
        i === 5 && fotke.length > 6 ? el('span', { class: 'galerija-jos' }, '+' + (fotke.length - 6)) : ''))));
    }
    if (poveznice.length) dijelovi.push(el('ul', { class: 'projekt-poveznice' }, ...poveznice.map(x =>
      el('li', {}, el('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.naziv || x.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])))));
    if (EU_IZVOR.test((f.get('izvor_financiranja') || '') + ' ' + (f.get('program') || ''))) dijelovi.push(el('div', { class: 'eu-oznaka' },
      el('img', { src: 'img/eu-zastava.svg', alt: 'Zastava Europske unije', width: 36, height: 24 }), el('span', {}, 'Sufinancirano sredstvima Europske unije')));
    return dijelovi;
  }

  async function pokreni(s) {
    stanje = s; el = s.api.el;
    if (cfg) s.skocniDodaci.projekt = dodatakProjekta;
    if (!cfg || !s.baza) return;
    s.akcije.pokojnik = () => trazilicaPokojnika();
    s.akcije.sjecanje = () => dodajDoprinos();
    s.skocniDodaci.doprinos = (f) => f.get('fotografija') ? el('img', { class: 'prijava-foto', alt: f.get('naslov'),
      src: s.baza.sb.storage.from('doprinosi').getPublicUrl(f.get('fotografija')).data.publicUrl }) : null;
    s.baza.kartice.push({ naziv: 'Projekti', vidljivo: s.baza.jeUrednik, prikazi: uredniciProjekti });
    s.baza.kartice.push({ naziv: 'Doprinosi', vidljivo: s.baza.jeUrednik, prikazi: uredniciDoprinosi });
    // gumbi u brzim prikazima
    const bp = document.getElementById('brziPrikazi');
    if (bp) {
      bp.append(el('button', { class: 'brzi-prikaz', title: 'Pronađite grobno mjesto po imenu i prezimenu', onclick: trazilicaPokojnika }, s.api.ikona('stablo', 16), el('span', {}, 'Tražilica pokojnika')),
        el('button', { class: 'brzi-prikaz', title: 'Dodajte staru fotografiju ili narodni naziv mjesta', onclick: dodajDoprinos }, s.api.ikona('olovka', 16), el('span', {}, 'Dodaj sjećanje')));
    }
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'zajednica', pripremi, pokreni });
})();
