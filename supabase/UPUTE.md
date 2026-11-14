# Prijave komunalnih problema – postavljanje baze (Supabase)

Supabase je besplatna baza (PostgreSQL) s prijavom korisnika i spremištem fotografija.
Besplatni paket je dovoljan za općinu: 500 MB baze, 1 GB fotografija, 50 000 korisnika mjesečno.

## 1. Projekt (jednom, ~5 minuta)

1. Na <https://supabase.com> se registrirajte (može GitHub računom) i kliknite **New project**.
   - Name: `web-gis-bilje`
   - Region: **Central EU (Frankfurt)** – podaci ostaju u EU (GDPR)
   - Database password: generirajte i spremite na sigurno mjesto (portal ga ne treba)
2. **SQL Editor → New query** → zalijepite cijeli sadržaj `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: uključeno (zadano).
4. **Authentication → URL Configuration**:
   - Site URL: `https://iplascak.github.io/web-gis-bilje/`
   - Redirect URLs: dodajte `https://iplascak.github.io/web-gis-bilje/**`
5. Predložak e-poruke za sada ostaje zadani (poveznica "Sign in"). Mijenjati se može tek nakon
   postavljanja vlastitog SMTP-a (vidi točku 3) – tada u *Authentication → Emails → Magic link*
   prevedite poruku i dodajte kod: `Vaš kod za prijavu: {{ .Token }}`.
6. **Project Settings → API Keys**: kopirajte **Project URL** i **publishable** (ili *anon*) ključ.
   Ta dva podatka upisuju se u `config/portal.json`:
   ```json
   "prijave": { "supabaseUrl": "https://xxxx.supabase.co", "supabaseKljuc": "sb_publishable_..." }
   ```
   **Nikad** ne kopirajte *secret* / *service_role* ključ u portal ni u repozitorij.

## 2. Uloge

Nakon prve prijave na portal, u SQL Editoru sebi dodijelite ulogu admina:

```sql
update public.profili set uloga = 'admin'
where id = (select id from auth.users where email = 'vasa@adresa.hr');
```

Djelatnicima općine isto tako dodijelite `zaposlenik` ili `nacelnik`.
Svi ostali su automatski `gost` (mještanin): šalju prijave i vide samo svoje.

## 3. Za ozbiljnu uporabu

- **E-pošta (obavezno prije javnog pokretanja):** ugrađeni Supabase poslužitelj šalje poruke
  SAMO članovima vašeg Supabase tima i tek nekoliko na sat – dovoljno za testiranje, ne za mještane.
  Za javnu uporabu u *Authentication → Emails → SMTP Settings* upišite vlastiti SMTP:
  najbolje općinsku adresu (npr. portal@bilje.hr, podatke daje informatičar/pružatelj e-pošte općine)
  ili besplatni servis (npr. Brevo, 300 poruka dnevno) uz potvrđenu adresu pošiljatelja.
- **Uspavljivanje:** besplatni projekt se uspava nakon 7 dana bez ikakvog korištenja;
  tjedna provjera servisa (GitHub Actions) ga drži budnim.
- **GDPR:** javno se vide samo prijave koje je osoblje objavilo, bez imena i e-adrese.
  Fotografije se pri slanju smanjuju i iz njih se uklanjaju EXIF podaci (GPS, uređaj).
  Općina je voditelj obrade – u "O portalu" treba dodati kratku obavijest o privatnosti.
