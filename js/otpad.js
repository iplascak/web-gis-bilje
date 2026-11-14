/*
 * Modul: odvoz komunalnog otpada.
 * Podaci: data/otpad/raspored.json (datumi po zonama, iz rasporeda Unikoma)
 *         data/otpad/ulice_odvoz.geojson (ulice s oznakom zone)
 *         data/otpad/<zona>.ics (kalendar za pretplatu)
 * Godišnje ažuriranje: vidi config/izvori.json (podsjetnik adminu).
 */
(function () {
  'use strict';
  let raspored = null;
  let stanje = null;

  const BOJE_ZONA = {
    bilje_1: { boja: '#287856', oznaka: 'Bilje I – ponedjeljak' },
    bilje_2: { boja: '#2c57a2', oznaka: 'Bilje II – utorak' },
    sela: { boja: '#c47f00', oznaka: 'Vardarac, Lug, Kopačevo, Kozjak, Zlatna Greda – srijeda' },
    nepoznato: { boja: '#9aa0a6', oznaka: 'nije navedeno u rasporedu' }
  };

  const danas = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const DANI = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];
  function lijepiDatum(iso) {
    const d = new Date(iso + 'T12:00:00');
    const razlika = Math.round((d - new Date(danas() + 'T12:00:00')) / 864e5);
    const kad = razlika === 0 ? 'danas' : razlika === 1 ? 'sutra' : razlika < 7 ? 'za ' + razlika + ' dana' : '';
    return DANI[d.getDay()] + ', ' + d.getDate() + '. ' + (d.getMonth() + 1) + '.' + (kad ? ' (' + kad + ')' : '');
  }

  // sljedeći odvozi za zonu: [{datum, vrste:[...]}]
  function sljedeci(zona, koliko = 4) {
    if (!raspored || !raspored.zone[zona]) return [];
    const d0 = danas();
    return Object.entries(raspored.zone[zona].datumi)
      .filter(([d]) => d >= d0).slice(0, koliko)
      .map(([datum, vrste]) => ({ datum, vrste }));
  }

  function prikazOdvoza(zona, el) {
    if (zona === 'nepoznato') {
      return el('p', { class: 'sitno-siva' }, 'Ova ulica nije navedena u rasporedu odvoza. Provjerite na besplatnom telefonu Unikoma 0800 200 025.');
    }
    const z = raspored.zone[zona];
    const popis = sljedeci(zona);
    const okvir = el('div', { class: 'odvoz' },
      el('div', { class: 'odvoz-zona' }, z.naziv),
      popis.length ? el('ul', { class: 'odvoz-popis' }, ...popis.map(o => el('li', {},
        el('span', { class: 'odvoz-datum' }, lijepiDatum(o.datum)),
        el('span', { class: 'odvoz-vrste' }, ...o.vrste.map(v => el('span', { class: 'odvoz-oznaka', style: 'background:' + raspored.vrste[v].boja }, raspored.vrste[v].naziv)))))) :
        el('p', { class: 'sitno-siva' }, 'Raspored za sljedeću godinu još nije objavljen.'),
      el('a', { class: 'gumb-mali', href: 'data/otpad/' + zona + '.ics', download: 'odvoz-otpada-' + zona + '.ics',
        title: 'Datoteka za kalendar na mobitelu ili računalu (podsjetnik večer prije)' }, '📅 Dodaj u kalendar'));
    return okvir;
  }

  function pripremi(konfig) {
    if (!konfig.grupe.some(g => g.id === 'svakodnevica')) {
      konfig.grupe.splice(1, 0, { id: 'svakodnevica', naziv: 'Svakodnevica', ikona: 'kanta', otvoreno: false });
    }
    const vrijednosti = {};
    for (const [k, v] of Object.entries(BOJE_ZONA)) vrijednosti[k] = v;
    konfig.slojevi.push({
      id: 'odvoz_otpada', naziv: 'Odvoz otpada po ulicama', grupa: 'svakodnevica', podgrupa: 'Otpad', tip: 'geojson',
      url: 'data/otpad/ulice_odvoz.geojson', vidljivo: false,
      stil: { geometrija: 'linija', debljina: 4, kategorije: { polje: 'zona_otpada', vrijednosti } },
      skocniProzor: { naslov: 'naziv', polja: [{ polje: 'naselje', oznaka: 'Naselje' }] },
      skocniDodatak: 'otpad',
      opis: 'Kada se odvozi otpad u vašoj ulici – klik na ulicu pokazuje sljedeće odvoze.',
      detaljno: 'Raspored odvoza miješanog komunalnog otpada, papira, plastike i stakla po ulicama, prema rasporedu koji objavljuje Unikom d.o.o. za Općinu Bilje. Klikom na ulicu vidite sljedeće datume odvoza i možete preuzeti kalendar s podsjetnikom večer prije (radi na mobitelu i računalu).\n\nMobilno reciklažno dvorište i glomazni otpad: vidi napomene u kartici ulice.\n\nZa ulice označene sivo raspored ih ne navodi – provjerite na besplatnom telefonu Unikoma 0800 200 025.',
      izvor: 'Unikom d.o.o., raspored za 2026.', azurirano: '2026.'
    });
    konfig.slojevi.push({
      id: 'mobilno_reciklazno', naziv: 'Mobilno reciklažno dvorište', grupa: 'svakodnevica', podgrupa: 'Otpad', tip: 'geojson',
      url: 'data/otpad/mobilno_reciklazno.geojson', vidljivo: false,
      stil: { geometrija: 'tocka', boja: '#287856', simbol: 'reciklaza', natpis: 'naselje', natpisMinZoom: 12 },
      skocniProzor: { naslov: 'naziv', polja: [{ polje: 'termini', oznaka: 'Termini 2026.' }, { polje: 'vrijeme', oznaka: 'Vrijeme' }, { polje: 'napomena', oznaka: 'Napomena' }] },
      opis: 'Gdje i kada dolazi mobilno reciklažno dvorište.',
      detaljno: 'Mobilno reciklažno dvorište Unikoma dolazi u naselja Općine Bilje četiri puta godišnje. Točna lokacija stajanja u naselju nije navedena u rasporedu – točka označava središte naselja dok općina ne potvrdi mjesto.',
      izvor: 'Unikom d.o.o.', azurirano: '2026.'
    });
  }

  async function pokreni(s) {
    stanje = s;
    const el = s.api.el;
    try { raspored = await (await fetch('data/otpad/raspored.json')).json(); } catch (g) { console.warn('Raspored odvoza nije učitan'); return; }
    s.skocniDodaci.otpad = (f) => {
      const okvir = el('div', {}, prikazOdvoza(f.get('zona_otpada'), el));
      okvir.append(el('details', { class: 'odvoz-napomene' }, el('summary', {}, 'Glomazni otpad, reciklažno dvorište…'),
        ...raspored.napomene.map(n => el('p', {}, n))));
      return okvir;
    };
    s.otpad = { raspored, sljedeci, prikazOdvoza: (z) => prikazOdvoza(z, el), zonaUlice: (ulica, naselje) => zonaUlice(ulica, naselje) };
  }

  // zona za adresu (ulica + naselje) – za "Moja adresa"
  let ulicaZona = null;
  async function zonaUlice(ulica, naselje) {
    if (!ulicaZona) {
      ulicaZona = {};
      const j = await (await fetch('data/otpad/ulice_odvoz.geojson')).json();
      for (const f of j.features) ulicaZona[(f.properties.naselje + '|' + f.properties.naziv).toLowerCase()] = f.properties.zona_otpada;
    }
    if (naselje && naselje !== 'Bilje') return 'sela';
    return ulicaZona[((naselje || 'Bilje') + '|' + ulica).toLowerCase()] || 'nepoznato';
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'otpad', pripremi, pokreni });
})();
