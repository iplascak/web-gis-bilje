/*
 * Modul: prijave komunalnih problema (Supabase).
 *
 * Uključuje se upisom u config/portal.json:
 *   "prijave": { "supabaseUrl": "https://xxxx.supabase.co", "supabaseKljuc": "<javni (anon/publishable) ključ>" }
 * Javni ključ smije biti javan: što tko smije vidjeti i mijenjati određuju pravila u bazi
 * (supabase/schema.sql). Tajni (service_role / secret) ključ NIKAD ne ide u portal ni u repozitorij.
 *
 * Tko što vidi:
 *   posjetitelj – sloj s odobrenim prijavama (bez osobnih podataka)
 *   prijavljeni mještanin – može poslati prijavu i pratiti svoje prijave
 *   osoblje općine (zaposlenik, načelnik, admin) – sve prijave, status, odgovor, objava
 */
(function () {
  'use strict';

  const KATEGORIJE = {
    cesta: 'Oštećena cesta ili nogostup',
    rasvjeta: 'Javna rasvjeta',
    otpad: 'Otpad (divlje odlagalište, kontejneri)',
    zelenilo: 'Zelenilo (košnja, stabla, raslinje)',
    odvodnja: 'Odvodnja i kanali',
    komunalna_oprema: 'Komunalna oprema (klupe, igrališta, znakovi)',
    promet: 'Promet i prometna signalizacija',
    ostalo: 'Ostalo'
  };
  const STATUSI = {
    zaprimljeno: { boja: '#6b7280', oznaka: 'zaprimljeno' },
    u_obradi: { boja: '#e0a800', oznaka: 'u obradi' },
    rijeseno: { boja: '#1F7A3D', oznaka: 'riješeno' },
    odbijeno: { boja: '#b91c1c', oznaka: 'nije u nadležnosti / odbijeno' }
  };
  const OSOBLJE = ['zaposlenik', 'nacelnik', 'admin'];
  const NAZIVI_ULOGA = { gost: 'mještanin', zaposlenik: 'zaposlenik općine', nacelnik: 'načelnik', admin: 'administrator' };

  let cfg = null;        // portal.prijave
  let sb = null;         // Supabase klijent
  let stanje = null;     // stanje portala (app.js)
  let el = null;
  let korisnik = null;   // { id, email, uloga }

  const jeOsoblje = () => korisnik && OSOBLJE.includes(korisnik.uloga);
  const datum = (t) => t ? new Date(t).toLocaleDateString('hr-HR') : '';

  // ---------- priprema sloja (prije stvaranja karte) ----------

  function pripremi(konfig, portal) {
    cfg = portal.prijave;
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseKljuc || !window.supabase) return;
    if (!konfig.grupe.some(g => g.id === 'prijave')) {
      konfig.grupe.splice(1, 0, { id: 'prijave', naziv: 'Prijave mještana', otvoreno: true });
    }
    const vrijednosti = {};
    for (const [k, v] of Object.entries(STATUSI)) vrijednosti[k] = { boja: v.boja, oznaka: v.oznaka };
    konfig.slojevi.push({
      id: 'prijave', naziv: 'Prijave komunalnih problema', grupa: 'prijave', tip: 'geojson',
      url: cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/prijave_geojson',
      zaglavlja: { apikey: cfg.supabaseKljuc },
      vidljivo: true,
      stil: { geometrija: 'tocka', velicina: 7, kategorije: { polje: 'status', vrijednosti } },
      skocniProzor: { naslov: 'kategorija_naziv', polja: [
        { polje: 'opis', oznaka: 'Opis' },
        { polje: 'adresa', oznaka: 'Lokacija' },
        { polje: 'status', oznaka: 'Status', format: 'kategorija' },
        { polje: 'odgovor', oznaka: 'Odgovor općine' },
        { polje: 'prijavljeno', oznaka: 'Prijavljeno' },
        { polje: 'azurirano', oznaka: 'Zadnja promjena' },
        { polje: 'id', oznaka: 'Broj prijave' }] },
      skocniDodatak: 'prijava',
      opis: 'Komunalni problemi koje su prijavili mještani, nakon pregleda općinskih službi.',
      detaljno: 'Mještani putem gumba "Prijavi problem" prijavljuju komunalne probleme (oštećenja ceste, rasvjetu, otpad, zelenilo...) s lokacijom i fotografijom. Prijavu najprije pregledaju općinske službe; na karti se prikazuje tek nakon pregleda, bez imena i kontakta prijavitelja.\n\nBoja točke pokazuje status: zaprimljeno, u obradi, riješeno ili odbijeno (npr. ako problem nije u nadležnosti općine).\n\nZa prijavu je potrebna samo e-adresa, na koju stiže jednokratni kod za prijavu. E-adresa se koristi isključivo za prijavu na portal i ne objavljuje se.',
      izvor: 'Prijave mještana, Općina Bilje',
      azurirano: 'uživo'
    });
    for (const z of document.querySelectorAll('[data-prijave]')) z.hidden = false;
  }

  // ---------- pokretanje ----------

  async function pokreni(s) {
    if (!cfg || !cfg.supabaseUrl || !window.supabase) return;
    stanje = s;
    el = s.api.el;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKljuc, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    s.skocniDodaci.prijava = dodatakSkocnom;

    document.getElementById('gumbPrijavi').addEventListener('click', zapocniPrijavu);
    document.getElementById('gumbRacun').addEventListener('click', () => korisnik ? prikaziRacun() : prijavaKorisnika());

    sb.auth.onAuthStateChange((dogadaj, sesija) => { setTimeout(() => postaviKorisnika(sesija), 0); });
    const { data } = await sb.auth.getSession();
    await postaviKorisnika(data.session);
    // poveznica iz e-pošte ostavlja tokene u adresi – očisti ih
    if (/access_token=|error_description=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  }

  async function postaviKorisnika(sesija) {
    if (!sesija) { korisnik = null; azurirajGumbRacuna(); return; }
    if (korisnik && korisnik.id === sesija.user.id && korisnik.uloga) { azurirajGumbRacuna(); return; }
    korisnik = { id: sesija.user.id, email: sesija.user.email, uloga: 'gost' };
    const { data } = await sb.from('profili').select('uloga, ime').eq('id', korisnik.id).maybeSingle();
    if (data) Object.assign(korisnik, data);
    azurirajGumbRacuna();
    osvjeziSloj();
  }

  function azurirajGumbRacuna() {
    const g = document.getElementById('gumbRacun');
    g.querySelector('span').textContent = korisnik ? (jeOsoblje() ? 'Općina' : 'Moje prijave') : 'Prijava';
    g.classList.toggle('prijavljen', !!korisnik);
  }

  function osvjeziSloj() {
    const z = stanje && stanje.slojevi.prijave;
    if (z) z.olSloj.getSource().refresh();
  }

  function poruka(tekst, vrsta) {
    return el('p', { class: 'poruka ' + (vrsta || '') }, tekst);
  }

  // ---------- prijava korisnika (jednokratni kod e-poštom) ----------

  function prijavaKorisnika(nakon) {
    const email = el('input', { type: 'email', required: true, autocomplete: 'email', placeholder: 'vasa@adresa.hr' });
    const kod = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '123456', maxlength: 10 });
    const status = el('div');
    const korakKod = el('div', { hidden: true },
      el('label', { class: 'polje' }, el('span', {}, 'Kod iz e-pošte'), kod),
      el('button', { class: 'gumb-primarni', type: 'button', onclick: potvrdiKod }, 'Prijavi me'),
      el('p', { class: 'sitno-siva' }, 'Možete i samo otvoriti poveznicu iz e-pošte u ovom pregledniku.'));
    const gumbSalji = el('button', { class: 'gumb-primarni', type: 'submit' }, 'Pošalji kod');
    const obrazac = el('form', { class: 'obrazac', onsubmit: async (e) => {
      e.preventDefault();
      gumbSalji.disabled = true;
      status.replaceChildren(poruka('Šaljem…'));
      const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(),
        options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
      gumbSalji.disabled = false;
      if (error) { status.replaceChildren(poruka('Slanje nije uspjelo: ' + error.message, 'greska')); return; }
      status.replaceChildren(poruka('Poslali smo e-poruku na ' + email.value.trim() + '. Upišite kod iz poruke.', 'uspjeh'));
      korakKod.hidden = false;
      kod.focus();
    } },
      el('label', { class: 'polje' }, el('span', {}, 'E-adresa'), email), gumbSalji);

    async function potvrdiKod() {
      const { data, error } = await sb.auth.verifyOtp({ email: email.value.trim(), token: kod.value.trim(), type: 'email' });
      if (error) { status.replaceChildren(poruka('Kod nije ispravan ili je istekao.', 'greska')); return; }
      await postaviKorisnika(data.session);
      document.getElementById('dijalog').close();
      if (nakon) nakon();
    }

    stanje.api.otvoriDijalog(
      el('h3', {}, 'Prijava na portal'),
      el('p', {}, 'Za slanje prijave dovoljna je e-adresa: na nju šaljemo jednokratni kod. Lozinka nije potrebna.'),
      obrazac, status, korakKod,
      el('p', { class: 'sitno-siva' }, 'E-adresu koristimo samo za prijavu na portal i eventualni upit općinskih službi o vašoj prijavi. Ne objavljuje se i ne dijeli s drugima.'));
    email.focus();
  }

  // ---------- slanje prijave ----------

  function zapocniPrijavu() {
    if (!korisnik) { prijavaKorisnika(zapocniPrijavu); return; }
    stanje.api.zatvoriSkocni();
    stanje.api.odaberiTocku(obrazacPrijave, 'Kliknite na karti mjesto problema');
  }

  function smanjiFotografiju(datoteka, najvise = 1600) {
    // ponovno kodiranje ujedno uklanja EXIF podatke (npr. GPS lokaciju i uređaj)
    return new Promise((ok, greska) => {
      const slika = new Image();
      slika.onload = () => {
        const omjer = Math.min(1, najvise / Math.max(slika.width, slika.height));
        const c = document.createElement('canvas');
        c.width = Math.round(slika.width * omjer);
        c.height = Math.round(slika.height * omjer);
        c.getContext('2d').drawImage(slika, 0, 0, c.width, c.height);
        URL.revokeObjectURL(slika.src);
        c.toBlob(b => b ? ok(b) : greska(new Error('Fotografija se ne može obraditi')), 'image/jpeg', 0.82);
      };
      slika.onerror = () => greska(new Error('Datoteka nije slika'));
      slika.src = URL.createObjectURL(datoteka);
    });
  }

  function obrazacPrijave(koord) {
    const [lon, lat] = ol.proj.toLonLat(koord);
    const adresa = stanje.api.najblizaAdresa(koord);
    const kategorija = el('select', { required: true },
      el('option', { value: '' }, '– odaberite –'),
      ...Object.entries(KATEGORIJE).map(([k, v]) => el('option', { value: k }, v)));
    const opis = el('textarea', { required: true, minlength: 5, maxlength: 2000, rows: 4,
      placeholder: 'Što je problem? Npr. "Ne radi ulična svjetiljka ispred kućnog broja 12."' });
    const foto = el('input', { type: 'file', accept: 'image/*' });
    const privola = el('input', { type: 'checkbox', required: true });
    const status = el('div');
    const gumb = el('button', { class: 'gumb-primarni', type: 'submit' }, 'Pošalji prijavu');

    const obrazac = el('form', { class: 'obrazac', onsubmit: async (e) => {
      e.preventDefault();
      gumb.disabled = true;
      status.replaceChildren(poruka('Šaljem prijavu…'));
      try {
        let putanja = null;
        if (foto.files[0]) {
          const blob = await smanjiFotografiju(foto.files[0]);
          putanja = korisnik.id + '/' + crypto.randomUUID() + '.jpg';
          const { error } = await sb.storage.from('prijave-foto').upload(putanja, blob, { contentType: 'image/jpeg' });
          if (error) throw error;
        }
        const { data, error } = await sb.from('prijave').insert({
          kategorija: kategorija.value, opis: opis.value.trim(),
          lon: +lon.toFixed(6), lat: +lat.toFixed(6),
          adresa: adresa ? adresa.tekst : null, fotografija: putanja, kontakt_email: korisnik.email
        }).select('id').single();
        if (error) throw error;
        stanje.api.otvoriDijalog(
          el('h3', {}, 'Hvala! Prijava je zaprimljena.'),
          el('p', {}, 'Broj prijave: ', el('strong', {}, String(data.id)), '.'),
          el('p', {}, 'Općinske službe pregledat će prijavu. Status možete pratiti pod "Moje prijave" u zaglavlju.'));
      } catch (g) {
        gumb.disabled = false;
        const tekst = /row-level security/i.test(g.message || '')
          ? 'Prijava nije spremljena. Moguće je da ste danas poslali najveći dopušteni broj prijava (10).'
          : 'Prijava nije spremljena: ' + (g.message || g);
        status.replaceChildren(poruka(tekst, 'greska'));
      }
    } },
      el('p', { class: 'sitno-siva' }, adresa ? 'Lokacija: ' + adresa.tekst : 'Lokacija: ' + lat.toFixed(5) + ', ' + lon.toFixed(5)),
      el('label', { class: 'polje' }, el('span', {}, 'Vrsta problema'), kategorija),
      el('label', { class: 'polje' }, el('span', {}, 'Opis'), opis),
      el('label', { class: 'polje' }, el('span', {}, 'Fotografija (nije obavezno)'), foto),
      el('label', { class: 'kvacica' }, privola,
        el('span', {}, 'Razumijem da će prijava nakon pregleda biti javno prikazana na karti (bez mojih podataka). Na fotografiji neće biti lica ni registarskih oznaka.')),
      gumb, status);
    stanje.api.otvoriDijalog(el('h3', {}, 'Prijava komunalnog problema'), obrazac);
  }

  // ---------- skočni prozor: fotografija i uređivanje ----------

  async function potpisanaFotografija(putanja) {
    if (!putanja) return null;
    const { data } = await sb.storage.from('prijave-foto').createSignedUrl(putanja, 3600);
    return data ? data.signedUrl : null;
  }

  function dodatakSkocnom(f) {
    const p = f.getProperties();
    const okvir = el('div', { class: 'prijava-dodatak' });
    if (p.fotografija) {
      potpisanaFotografija(p.fotografija).then(url => {
        if (url) okvir.prepend(el('a', { href: url, target: '_blank', rel: 'noopener' },
          el('img', { src: url, alt: 'Fotografija prijave', class: 'prijava-foto' })));
      });
    }
    if (jeOsoblje()) okvir.append(el('button', { class: 'gumb-lokacija', onclick: () => urediPrijavu(p.id) }, 'Uredi prijavu'));
    return okvir;
  }

  // ---------- račun: moje prijave / pregled za osoblje ----------

  async function prikaziRacun() {
    const sadrzaj = el('div', {}, poruka('Učitavam…'));
    stanje.api.otvoriDijalog(
      el('h3', {}, jeOsoblje() ? 'Prijave mještana' : 'Moje prijave'),
      el('p', { class: 'sitno-siva' }, korisnik.email + ' · ' + (NAZIVI_ULOGA[korisnik.uloga] || korisnik.uloga)),
      sadrzaj,
      el('p', {}, el('button', { class: 'gumb-sekundarni', onclick: async () => {
        await sb.auth.signOut(); korisnik = null; azurirajGumbRacuna(); osvjeziSloj();
        document.getElementById('dijalog').close();
      } }, 'Odjava')));

    let upit = sb.from('prijave').select('id, stvoreno, kategorija, opis, status, javno, odgovor, adresa, lon, lat')
      .order('stvoreno', { ascending: false }).limit(300);
    if (!jeOsoblje()) upit = upit.eq('prijavitelj', korisnik.id);
    const { data, error } = await upit;
    if (error) { sadrzaj.replaceChildren(poruka('Greška: ' + error.message, 'greska')); return; }
    if (!data.length) { sadrzaj.replaceChildren(poruka('Još nema prijava.')); return; }

    const filtar = el('select', {}, el('option', { value: '' }, 'svi statusi'),
      ...Object.entries(STATUSI).map(([k, v]) => el('option', { value: k }, v.oznaka)),
      el('option', { value: 'neobjavljeno' }, 'neobjavljene'));
    const tijelo = el('tbody');
    const nacrtaj = () => {
      const f = filtar.value;
      tijelo.replaceChildren(...data
        .filter(r => !f || (f === 'neobjavljeno' ? !r.javno : r.status === f))
        .map(r => el('tr', {},
          el('td', {}, String(r.id)),
          el('td', {}, datum(r.stvoreno)),
          el('td', {}, KATEGORIJE[r.kategorija] || r.kategorija,
            el('div', { class: 'sitno-siva' }, (r.adresa || '') + (r.opis ? ' – ' + r.opis.slice(0, 80) : ''))),
          el('td', {}, el('span', { class: 'status-oznaka', style: 'background:' + STATUSI[r.status].boja }, STATUSI[r.status].oznaka),
            r.javno ? '' : el('div', { class: 'sitno-siva' }, 'nije objavljeno')),
          el('td', {}, el('button', { class: 'gumb-mali', onclick: () => {
            document.getElementById('dijalog').close();
            const k = ol.proj.fromLonLat([r.lon, r.lat]);
            stanje.karta.getView().animate({ center: k, zoom: Math.max(stanje.karta.getView().getZoom(), 17), duration: 400 });
            if (jeOsoblje()) setTimeout(() => urediPrijavu(r.id), 450);
          } }, jeOsoblje() ? 'Otvori' : 'Na karti')))));
    };
    filtar.addEventListener('change', nacrtaj);
    nacrtaj();
    sadrzaj.replaceChildren(
      jeOsoblje() ? el('label', { class: 'polje polje-redak' }, el('span', {}, 'Prikaži:'), filtar) : '',
      el('div', { class: 'tablica-okvir' }, el('table', { class: 'tablica-prijava' },
        el('thead', {}, el('tr', {}, el('th', {}, 'Br.'), el('th', {}, 'Datum'), el('th', {}, 'Problem'), el('th', {}, 'Status'), el('th'))),
        tijelo)));
  }

  async function urediPrijavu(id) {
    const { data: r, error } = await sb.from('prijave').select('*').eq('id', id).single();
    if (error) { stanje.api.otvoriDijalog(poruka('Greška: ' + error.message, 'greska')); return; }
    const status = el('select', {}, ...Object.entries(STATUSI).map(([k, v]) =>
      el('option', { value: k, selected: k === r.status }, v.oznaka)));
    const javno = el('input', { type: 'checkbox', checked: r.javno });
    const opis = el('textarea', { rows: 3, maxlength: 2000 }, r.opis);
    const odgovor = el('textarea', { rows: 3, placeholder: 'Javni odgovor (vidljiv svima na karti)' }, r.odgovor || '');
    const napomena = el('textarea', { rows: 2, placeholder: 'Interna napomena (vidi samo osoblje)' }, r.napomena_interna || '');
    const poruke = el('div');
    const foto = el('div');
    potpisanaFotografija(r.fotografija).then(url => {
      if (url) foto.append(el('a', { href: url, target: '_blank', rel: 'noopener' }, el('img', { src: url, class: 'prijava-foto', alt: 'Fotografija' })));
    });
    const obrazac = el('form', { class: 'obrazac', onsubmit: async (e) => {
      e.preventDefault();
      const { error: g } = await sb.from('prijave').update({
        status: status.value, javno: javno.checked, opis: opis.value.trim(),
        odgovor: odgovor.value.trim() || null, napomena_interna: napomena.value.trim() || null
      }).eq('id', id);
      if (g) { poruke.replaceChildren(poruka('Spremanje nije uspjelo: ' + g.message, 'greska')); return; }
      poruke.replaceChildren(poruka('Spremljeno.', 'uspjeh'));
      osvjeziSloj();
    } },
      foto,
      el('p', { class: 'sitno-siva' }, 'Prijavljeno ' + datum(r.stvoreno) + (r.adresa ? ' · ' + r.adresa : '') +
        (r.kontakt_email ? ' · kontakt: ' : ''), r.kontakt_email ? el('a', { href: 'mailto:' + r.kontakt_email + '?subject=' + encodeURIComponent('Vaša prijava br. ' + r.id) }, r.kontakt_email) : ''),
      el('label', { class: 'polje' }, el('span', {}, 'Opis (uklonite osobne podatke prije objave)'), opis),
      el('label', { class: 'polje' }, el('span', {}, 'Status'), status),
      el('label', { class: 'polje' }, el('span', {}, 'Odgovor općine'), odgovor),
      el('label', { class: 'polje' }, el('span', {}, 'Interna napomena'), napomena),
      el('label', { class: 'kvacica' }, javno, el('span', {}, 'Objavi na karti (fotografija i opis bit će javni)')),
      el('button', { class: 'gumb-primarni', type: 'submit' }, 'Spremi'), poruke);
    stanje.api.zatvoriSkocni();
    stanje.api.otvoriDijalog(el('h3', {}, 'Prijava br. ' + r.id + ' – ' + (KATEGORIJE[r.kategorija] || r.kategorija)), obrazac);
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'prijave', pripremi, pokreni });
})();
