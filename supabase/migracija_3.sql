-- =====================================================================
-- Web GIS Općine Bilje – dopuna baze (3):
--   * uloga "urednik" (npr. ravnateljica KRC-a: projekti i doprinosi mještana)
--   * projekti općine (unos kroz portal, javni prikaz na karti)
--   * tražilica pokojnika (grobni očevidnik – samo javni podaci o pokojnima)
--   * doprinosi mještana: stare fotografije i zaboravljeni toponimi (uz odobrenje)
-- Pokretanje: Supabase -> SQL Editor -> New query -> zalijepiti -> Run. Smije se ponoviti.
-- =====================================================================

-- ---------- uloga "urednik" ----------
alter table public.profili drop constraint if exists profili_uloga_check;
alter table public.profili add constraint profili_uloga_check
  check (uloga in ('gost', 'urednik', 'zaposlenik', 'direktor', 'nacelnik', 'admin'));

create or replace function public.je_urednik() returns boolean
language sql stable security definer set search_path = public as $$
  select public.moja_uloga() in ('urednik', 'nacelnik', 'admin')
$$;
-- grobni očevidnik vode djelatnici Komunalno - Bilje d.o.o. (i admin)
create or replace function public.vodi_groblja() returns boolean
language sql stable security definer set search_path = public as $$
  select public.moja_uloga() = 'admin'
      or (public.moja_uloga() in ('zaposlenik', 'direktor')
          and (select organizacija from public.profili where id = auth.uid()) = 'Komunalno - Bilje d.o.o.')
$$;

-- =====================================================================
-- PROJEKTI
-- =====================================================================
create table if not exists public.projekti (
  id                   bigint generated always as identity primary key,
  naziv                text not null check (char_length(naziv) between 3 and 300),
  opis                 text,
  kategorija           text not null check (kategorija in (
                         'ceste_promet', 'komunalna_infrastruktura', 'vodoopskrba_odvodnja', 'drustvena_infrastruktura',
                         'sport_rekreacija', 'kultura_bastina', 'turizam', 'energetika', 'okolis_otpad',
                         'poljoprivreda', 'socijalni_programi', 'obrazovanje_djeca', 'uprava_digitalizacija', 'ostalo')),
  status               text not null default 'u_pripremi' check (status in ('planirano', 'u_pripremi', 'u_provedbi', 'provedeno', 'odustalo')),
  naselje              text,
  lokacija_opis        text,          -- adresa, k.č. ili "cijela općina"
  lon                  double precision check (lon between 18.5 and 19.1),
  lat                  double precision check (lat between 45.45 and 45.8),
  obuhvat              jsonb,         -- GeoJSON geometrija (linija ceste, poligon parka…), neobavezno
  godina_pocetka       int check (godina_pocetka between 2000 and 2100),
  godina_zavrsetka     int check (godina_zavrsetka between 2000 and 2100),
  vrijednost_eur       numeric(14, 2),
  bespovratno_eur      numeric(14, 2),
  udio_opcine_eur      numeric(14, 2),
  izvor_financiranja   text,          -- npr. "EU – EPFRR", "Ministarstvo regionalnoga razvoja", "proračun Općine"
  program_natjecaj     text,          -- npr. "PRR 2014.–2020., mjera 7.4.1", "NPOO", "LAG Baranja"
  nositelj             text default 'Općina Bilje',
  partneri             text,
  poveznica            text,          -- vijest, odluka, stranica projekta
  izvor_podatka        text,          -- npr. "Službeni glasnik 11/2024, Plan razvojnih programa"
  fotografija          text,          -- putanja u spremištu 'projekti-foto'
  javno                boolean not null default true,
  stvoreno             timestamptz not null default now(),
  azurirano            timestamptz not null default now(),
  uredio               uuid default auth.uid() references auth.users(id) on delete set null
);
alter table public.projekti enable row level security;
drop policy if exists "projekti: javni" on public.projekti;
create policy "projekti: javni" on public.projekti for select using (javno or public.je_urednik());
drop policy if exists "projekti: urednici unose" on public.projekti;
create policy "projekti: urednici unose" on public.projekti for insert to authenticated with check (public.je_urednik());
drop policy if exists "projekti: urednici mijenjaju" on public.projekti;
create policy "projekti: urednici mijenjaju" on public.projekti for update to authenticated using (public.je_urednik()) with check (public.je_urednik());
drop policy if exists "projekti: brisanje" on public.projekti;
create policy "projekti: brisanje" on public.projekti for delete to authenticated using (public.moja_uloga() in ('nacelnik', 'admin'));
grant select on public.projekti to anon, authenticated;
grant insert, update, delete on public.projekti to authenticated;

create or replace function public.projekt_promijenjen() returns trigger
language plpgsql as $$ begin new.azurirano := now(); new.uredio := coalesce(auth.uid(), new.uredio); return new; end $$;
drop trigger if exists na_promjenu_projekta on public.projekti;
create trigger na_promjenu_projekta before update on public.projekti for each row execute function public.projekt_promijenjen();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projekti-foto', 'projekti-foto', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "projekti-foto: urednici" on storage.objects;
create policy "projekti-foto: urednici" on storage.objects for insert to authenticated
  with check (bucket_id = 'projekti-foto' and public.je_urednik());

-- =====================================================================
-- TRAŽILICA POKOJNIKA (grobni očevidnik – javni dio)
-- Podaci o KORISNICIMA grobnih mjesta (živim osobama) NE unose se ovdje.
-- =====================================================================
create table if not exists public.pokojnici (
  id               bigint generated always as identity primary key,
  groblje          text not null check (groblje in ('Bilje', 'Kopačevo', 'Lug', 'Vardarac')),
  polje            text,
  red              text,
  broj             text,
  oznaka_mjesta    text,          -- povezuje s obrisom na karti (npr. "B123") ili oznaka iz očevidnika
  ime              text not null,
  prezime          text not null,
  godina_rodjenja  int,
  godina_smrti     int,
  lon              double precision,
  lat              double precision,
  javno            boolean not null default true,   -- obitelj može zatražiti da se ne prikazuje
  azurirano        timestamptz not null default now()
);
create index if not exists pokojnici_prezime_idx on public.pokojnici (lower(prezime));
alter table public.pokojnici enable row level security;
drop policy if exists "pokojnici: vode groblja" on public.pokojnici;
create policy "pokojnici: vode groblja" on public.pokojnici for all to authenticated
  using (public.vodi_groblja()) with check (public.vodi_groblja());
grant select, insert, update, delete on public.pokojnici to authenticated;

-- javna tražilica: najviše 50 rezultata, samo javni zapisi, najmanje 3 slova
create or replace function public.trazi_pokojnika(upit text) returns table (
  ime text, prezime text, godina_rodjenja int, godina_smrti int, groblje text, polje text, red text, broj text, lon double precision, lat double precision)
language sql stable security definer set search_path = public as $$
  select ime, prezime, godina_rodjenja, godina_smrti, groblje, polje, red, broj, lon, lat
  from public.pokojnici
  where javno and char_length(trim(upit)) >= 3
    and (lower(prezime || ' ' || ime) like '%' || lower(trim(upit)) || '%'
         or lower(ime || ' ' || prezime) like '%' || lower(trim(upit)) || '%')
  order by prezime, ime limit 50
$$;
grant execute on function public.trazi_pokojnika(text) to anon, authenticated;

-- =====================================================================
-- DOPRINOSI MJEŠTANA: stare fotografije i zaboravljeni toponimi
-- =====================================================================
create table if not exists public.doprinosi (
  id            bigint generated always as identity primary key,
  vrsta         text not null check (vrsta in ('fotografija', 'toponim', 'prica')),
  naslov        text not null check (char_length(naslov) between 2 and 200),
  opis          text check (char_length(opis) <= 3000),
  razdoblje     text,              -- npr. "oko 1965.", "1930-ih"
  autor         text,              -- kako potpisati (npr. "obitelj Kovač"), neobavezno
  fotografija   text,              -- putanja u spremištu 'doprinosi'
  lon           double precision not null check (lon between 18.5 and 19.1),
  lat           double precision not null check (lat between 45.45 and 45.8),
  status        text not null default 'na_cekanju' check (status in ('na_cekanju', 'odobreno', 'odbijeno')),
  privola       boolean not null default false,   -- autor potvrđuje pravo na objavu fotografije
  prijavitelj   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  stvoreno      timestamptz not null default now()
);
alter table public.doprinosi enable row level security;
drop policy if exists "doprinosi: novi" on public.doprinosi;
create policy "doprinosi: novi" on public.doprinosi for insert to authenticated
  with check (prijavitelj = auth.uid() and status = 'na_cekanju' and privola);
drop policy if exists "doprinosi: citanje" on public.doprinosi;
create policy "doprinosi: citanje" on public.doprinosi for select
  using (status = 'odobreno' or prijavitelj = auth.uid() or public.je_urednik() or public.je_osoblje());
drop policy if exists "doprinosi: uredivanje" on public.doprinosi;
create policy "doprinosi: uredivanje" on public.doprinosi for update to authenticated
  using (public.je_urednik()) with check (public.je_urednik());
drop policy if exists "doprinosi: brisanje" on public.doprinosi;
create policy "doprinosi: brisanje" on public.doprinosi for delete to authenticated
  using (public.je_urednik() or prijavitelj = auth.uid());
grant select on public.doprinosi to anon, authenticated;
grant insert, update, delete on public.doprinosi to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doprinosi', 'doprinosi', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "doprinosi-foto: svoja mapa" on storage.objects;
create policy "doprinosi-foto: svoja mapa" on storage.objects for insert to authenticated
  with check (bucket_id = 'doprinosi' and (storage.foldername(name))[1] = auth.uid()::text);
-- napomena: spremište je javno (fotografije se prikazuju bez prijave), ali naziv datoteke je
-- nasumičan, a na karti se prikazuju samo odobreni doprinosi.

-- GeoJSON za kartu (portal ga čita izravno kao sloj)
create or replace function public.projekti_geojson() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
    'type', 'Feature',
    'geometry', coalesce(obuhvat, json_build_object('type', 'Point', 'coordinates', json_build_array(lon, lat))::jsonb),
    'properties', json_build_object('id', id, 'naziv', naziv, 'opis', opis, 'kategorija', kategorija, 'status', status,
      'naselje', naselje, 'lokacija', lokacija_opis, 'razdoblje', concat_ws('–', godina_pocetka, godina_zavrsetka),
      'vrijednost_eur', vrijednost_eur, 'bespovratno_eur', bespovratno_eur, 'izvor_financiranja', izvor_financiranja,
      'program', program_natjecaj, 'nositelj', nositelj, 'poveznica', poveznica, 'fotografija', fotografija)
  ) order by id), '[]'::json))
  from public.projekti where javno and (lon is not null or obuhvat is not null)
$$;
grant execute on function public.projekti_geojson() to anon, authenticated;

create or replace function public.doprinosi_geojson() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
    'type', 'Feature', 'geometry', json_build_object('type', 'Point', 'coordinates', json_build_array(round(lon::numeric, 5), round(lat::numeric, 5))),
    'properties', json_build_object('id', id, 'vrsta', vrsta, 'naslov', naslov, 'opis', opis, 'razdoblje', razdoblje,
      'autor', autor, 'fotografija', fotografija)) order by id), '[]'::json))
  from public.doprinosi where status = 'odobreno'
$$;
grant execute on function public.doprinosi_geojson() to anon, authenticated;
