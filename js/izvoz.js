/*
 * Modul: izvoz podataka prema ulozi (kartica "Izvoz" u dijalogu računa).
 *
 *  svi (i neprijavljeni) – javni slojevi: gumb "Preuzmi" u detaljima sloja (GeoJSON, CSV)
 *  urednik               – projekti (svi, i neobjavljeni), doprinosi mještana
 *  osoblje (redar, Komunalno, JUO, načelnik) – prijave komunalnih problema, BEZ podataka o prijavitelju
 *  Komunalno Bilje + admin – evidencija pokojnika (njihov vlastiti očevidnik)
 *  admin                 – sve navedeno
 *
 * Stvarnu zaštitu provodi baza (RLS): korisnik može izvesti samo ono što smije i pročitati.
 * E-mail adrese i ID-evi prijavitelja nikad se ne izvoze s portala (GDPR – minimizacija).
 */
(function () {
  'use strict';
  const datum = () => new Date().toISOString().slice(0, 10);

  function pokreni(s) {
    if (!s.baza) return;
    const el = s.api.el, b = s.baza;

    async function izvezi(gumb, ime, upit) {
      const tekst = gumb.textContent; gumb.disabled = true; gumb.textContent = 'Pripremam…';
      try {
        const { data, error } = await upit();
        if (error) throw error;
        if (!data || !data.length) { b.poruka('Nema podataka za izvoz (ili za njih nemate ovlasti).'); return; }
        s.api.preuzmiDatoteku(ime + '_' + datum() + '.csv', s.api.uCsv(data), 'text/csv;charset=utf-8');
      } catch (g) { b.poruka('Izvoz nije uspio: ' + (g.message || g)); }
      finally { gumb.disabled = false; gumb.textContent = tekst; }
    }

    function stavka(naslov, opis, ime, upit) {
      const gumb = el('button', { class: 'gumb' }, 'Preuzmi CSV');
      gumb.onclick = () => izvezi(gumb, ime, upit);
      return el('div', { class: 'izvoz-stavka' }, el('div', {}, el('strong', {}, naslov), el('p', { class: 'sitno-siva' }, opis)), gumb);
    }

    async function prikazi(sadrzaj) {
      const k = b.korisnik(); const uloga = k && k.uloga;
      const stavke = [];
      if (b.jeOsoblje()) {
        stavke.push(stavka('Prijave komunalnih problema', 'Sve prijave sa statusom, odgovorom i lokacijom. Bez imena i e-maila prijavitelja.', 'prijave',
          () => b.sb.from('prijave').select('id, stvoreno, azurirano, kategorija, opis, adresa, status, javno, odgovor, lon, lat').order('stvoreno', { ascending: false })));
      }
      if (b.jeUrednik()) {
        stavke.push(stavka('Projekti općine', 'Svi projekti, uključujući neobjavljene – za izvješća i dopunu tablice.', 'projekti',
          () => b.sb.from('projekti').select('*').order('godina_pocetka', { ascending: true })));
        stavke.push(stavka('Doprinosi mještana', 'Stare fotografije, toponimi i sjećanja (bez podataka o pošiljatelju).', 'doprinosi',
          () => b.sb.from('doprinosi').select('id, stvoreno, vrsta, naslov, opis, razdoblje, autor, status, lon, lat, fotografija').order('stvoreno', { ascending: false })));
      }
      let groblja = false;
      try { const { data } = await b.sb.rpc('vodi_groblja'); groblja = !!data; } catch (g) { /* migracija još nije pokrenuta */ }
      if (groblja) {
        stavke.push(stavka('Evidencija pokojnika', 'Samo za Komunalno Bilje d.o.o. – osobni podaci, ne prosljeđivati izvan ovlaštenih osoba.', 'pokojnici',
          () => b.sb.from('pokojnici').select('*').order('prezime')));
      }
      sadrzaj.replaceChildren(
        el('p', {}, 'Podaci koje smijete preuzeti prema svojoj ulozi' + (uloga ? ' (' + uloga + ')' : '') + '. Javne slojeve karte svatko može preuzeti preko gumba „Preuzmi” u detaljima sloja (•••).'),
        ...(stavke.length ? stavke : [el('p', { class: 'sitno-siva' }, 'Vaša uloga nema dodatnih podataka za izvoz.')]),
        el('p', { class: 'sitno-siva' }, 'Preuzete datoteke s osobnim podacima čuvajte samo dok su potrebne za posao i ne šaljite ih e-poštom izvan općine.'));
    }

    b.kartice.push({ naziv: 'Izvoz', vidljivo: () => b.jeOsoblje() || b.jeUrednik(), prikazi });
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'izvoz', pripremi() {}, pokreni });
})();
