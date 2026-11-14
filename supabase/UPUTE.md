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
5. **Authentication → Emails → Magic link** – u tekst poruke dodajte kod, npr.:
   `Vaš kod za prijavu na Web GIS Općine Bilje: {{ .Token }}` (poveznica `{{ .ConfirmationURL }}` može ostati).
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

- **E-pošta:** ugrađeni Supabase poslužitelj e-pošte šalje samo nekoliko poruka na sat.
  Prije javnog pokretanja u *Authentication → Emails → SMTP Settings* upišite besplatni SMTP
  (npr. Brevo, 300 poruka dnevno) ili općinski poslužitelj e-pošte.
- **Uspavljivanje:** besplatni projekt se uspava nakon 7 dana bez ikakvog korištenja;
  tjedna provjera servisa (GitHub Actions) ga drži budnim.
- **GDPR:** javno se vide samo prijave koje je osoblje objavilo, bez imena i e-adrese.
  Fotografije se pri slanju smanjuju i iz njih se uklanjaju EXIF podaci (GPS, uređaj).
  Općina je voditelj obrade – u "O portalu" treba dodati kratku obavijest o privatnosti.
