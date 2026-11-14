-- =====================================================================
-- Web GIS Općine Bilje – baza za prijave komunalnih problema i korisnike
-- Pokretanje: Supabase -> SQL Editor -> zalijepiti cijelu datoteku -> Run.
-- Skripta se smije pokrenuti više puta (ne briše podatke).
--
-- Razine pristupa (uloge):
--   gost        – svaki prijavljeni mještanin: šalje prijave, vidi svoje prijave
--   zaposlenik  – djelatnik općine: vidi sve prijave, mijenja status, odgovara, objavljuje
--   nacelnik    – kao zaposlenik (kasnije: pregledi, izvještaji)
--   admin       – sve navedeno + dodjela uloga i brisanje
-- Neprijavljeni posjetitelj vidi samo ODOBRENE prijave, bez osobnih podataka.
-- =====================================================================

-- ---------- korisnički profili ----------
create table if not exists public.profili (
  id         uuid primary key references auth.users(id) on delete cascade,
  ime        text,
  uloga      text not null default 'gost'
             check (uloga in ('gost', 'zaposlenik', 'nacelnik', 'admin')),
  stvoreno   timestamptz not null default now()
);
alter table public.profili enable row level security;

-- profil se stvara automatski pri prvoj prijavi korisnika
create or replace function public.novi_korisnik() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profili (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists na_novog_korisnika on auth.users;
create trigger na_novog_korisnika after insert on auth.users
  for each row execute function public.novi_korisnik();

-- pomoćne funkcije za pravila pristupa
create or replace function public.moja_uloga() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select uloga from public.profili where id = auth.uid()), 'anonimno')
$$;
create or replace function public.je_osoblje() returns boolean
language sql stable security definer set search_path = public as $$
  select public.moja_uloga() in ('zaposlenik', 'nacelnik', 'admin')
$$;

drop policy if exists "profil: svoj ili osoblje" on public.profili;
create policy "profil: svoj ili osoblje" on public.profili for select
  using (id = auth.uid() or public.je_osoblje());
drop policy if exists "profil: svoje ime" on public.profili;
create policy "profil: svoje ime" on public.profili for update
  using (id = auth.uid()) with check (id = auth.uid() and uloga = public.moja_uloga());
drop policy if exists "profil: admin dodjeljuje uloge" on public.profili;
create policy "profil: admin dodjeljuje uloge" on public.profili for update
  using (public.moja_uloga() = 'admin');

-- ---------- prijave ----------
create table if not exists public.prijave (
  id               bigint generated always as identity primary key,
  stvoreno         timestamptz not null default now(),
  azurirano        timestamptz not null default now(),
  kategorija       text not null check (kategorija in
                   ('cesta', 'rasvjeta', 'otpad', 'zelenilo', 'odvodnja', 'komunalna_oprema', 'promet', 'ostalo')),
  opis             text not null check (char_length(opis) between 5 and 2000),
  lon              double precision not null check (lon between 18.5 and 19.1),
  lat              double precision not null check (lat between 45.45 and 45.8),
  adresa           text,
  fotografija      text,              -- putanja u spremištu 'prijave-foto'
  status           text not null default 'zaprimljeno'
                   check (status in ('zaprimljeno', 'u_obradi', 'rijeseno', 'odbijeno')),
  javno            boolean not null default false,   -- objavljuje osoblje nakon pregleda
  odgovor          text,              -- javni odgovor općine
  -- osobni i interni podaci: nikad u javnom pregledu
  prijavitelj      uuid not null default auth.uid() references auth.users(id) on delete set null,
  kontakt_email    text,
  napomena_interna text
);
create index if not exists prijave_status_idx on public.prijave (status);
create index if not exists prijave_prijavitelj_idx on public.prijave (prijavitelj);
alter table public.prijave enable row level security;

-- zaštita od zlouporabe: najviše 10 prijava po korisniku u 24 sata
create or replace function public.smije_prijaviti() returns boolean
language sql stable security definer set search_path = public as $$
  select count(*) < 10 from public.prijave
  where prijavitelj = auth.uid() and stvoreno > now() - interval '24 hours'
$$;

drop policy if exists "prijave: nova" on public.prijave;
create policy "prijave: nova" on public.prijave for insert to authenticated
  with check (prijavitelj = auth.uid() and status = 'zaprimljeno' and javno = false
              and odgovor is null and napomena_interna is null and public.smije_prijaviti());
drop policy if exists "prijave: svoje ili osoblje" on public.prijave;
create policy "prijave: svoje ili osoblje" on public.prijave for select to authenticated
  using (prijavitelj = auth.uid() or public.je_osoblje());
drop policy if exists "prijave: osoblje uređuje" on public.prijave;
create policy "prijave: osoblje uređuje" on public.prijave for update to authenticated
  using (public.je_osoblje()) with check (public.je_osoblje());
drop policy if exists "prijave: admin briše" on public.prijave;
create policy "prijave: admin briše" on public.prijave for delete to authenticated
  using (public.moja_uloga() = 'admin');

-- povijest promjena statusa (tko je i kada promijenio)
create table if not exists public.prijave_povijest (
  id        bigint generated always as identity primary key,
  prijava   bigint not null references public.prijave(id) on delete cascade,
  vrijeme   timestamptz not null default now(),
  status    text not null,
  javno     boolean not null,
  korisnik  uuid references auth.users(id) on delete set null
);
alter table public.prijave_povijest enable row level security;
drop policy if exists "povijest: osoblje" on public.prijave_povijest;
create policy "povijest: osoblje" on public.prijave_povijest for select to authenticated
  using (public.je_osoblje());

create or replace function public.prijava_promijenjena() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.azurirano := now();
  if new.status is distinct from old.status or new.javno is distinct from old.javno then
    insert into public.prijave_povijest (prijava, status, javno, korisnik)
    values (new.id, new.status, new.javno, auth.uid());
  end if;
  -- osoblje ne smije mijenjati tko je prijavio ni kada
  new.prijavitelj := old.prijavitelj;
  new.stvoreno := old.stvoreno;
  return new;
end $$;
drop trigger if exists na_promjenu_prijave on public.prijave;
create trigger na_promjenu_prijave before update on public.prijave
  for each row execute function public.prijava_promijenjena();

-- ---------- javni pregled: samo odobrene prijave, bez osobnih podataka ----------
-- Lokacija se zaokružuje na ~10 m; opis se objavljuje tek nakon pregleda osoblja.
create or replace view public.prijave_javno as
  select id, stvoreno, azurirano, kategorija, opis,
         round(lon::numeric, 4)::double precision as lon,
         round(lat::numeric, 4)::double precision as lat,
         status, odgovor, fotografija
  from public.prijave
  where javno = true;
grant select on public.prijave_javno to anon, authenticated;

-- isto kao GeoJSON za kartu (portal ga čita izravno kao sloj)
create or replace function public.prijave_geojson() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
    'type', 'Feature',
    'geometry', json_build_object('type', 'Point', 'coordinates',
                json_build_array(round(lon::numeric, 4), round(lat::numeric, 4))),
    'properties', json_build_object(
      'id', id, 'kategorija', kategorija,
      'kategorija_naziv', case kategorija
        when 'cesta' then 'Oštećena cesta ili nogostup' when 'rasvjeta' then 'Javna rasvjeta'
        when 'otpad' then 'Otpad' when 'zelenilo' then 'Zelenilo' when 'odvodnja' then 'Odvodnja i kanali'
        when 'komunalna_oprema' then 'Komunalna oprema' when 'promet' then 'Promet i signalizacija'
        else 'Ostalo' end,
      'opis', opis, 'status', status, 'odgovor', odgovor,
      'adresa', adresa,
      'prijavljeno', to_char(stvoreno at time zone 'Europe/Zagreb', 'YYYY-MM-DD'),
      'azurirano', to_char(azurirano at time zone 'Europe/Zagreb', 'YYYY-MM-DD'),
      'fotografija', fotografija)
  ) order by id), '[]'::json))
  from public.prijave where javno
$$;
grant execute on function public.prijave_geojson() to anon, authenticated;

-- ---------- fotografije ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prijave-foto', 'prijave-foto', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.je_javna_fotografija(putanja text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.prijave where fotografija = putanja and javno)
$$;

drop policy if exists "foto: učitavanje u svoju mapu" on storage.objects;
create policy "foto: učitavanje u svoju mapu" on storage.objects for insert to authenticated
  with check (bucket_id = 'prijave-foto' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "foto: svoje, osoblje ili objavljeno" on storage.objects;
create policy "foto: svoje, osoblje ili objavljeno" on storage.objects for select
  using (bucket_id = 'prijave-foto' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.je_osoblje()
    or public.je_javna_fotografija(name)));
drop policy if exists "foto: admin briše" on storage.objects;
create policy "foto: admin briše" on storage.objects for delete to authenticated
  using (bucket_id = 'prijave-foto' and public.moja_uloga() = 'admin');

-- ---------- ovlasti za API (novi Supabase projekti ih ne daju sami) ----------
-- Što pojedini korisnik stvarno smije vidjeti i mijenjati i dalje određuju pravila (RLS) iznad.
grant usage on schema public to anon, authenticated;
grant select, update on public.profili to authenticated;
grant select, insert, update, delete on public.prijave to authenticated;
grant select on public.prijave_povijest to authenticated;
grant execute on function public.moja_uloga(), public.je_osoblje(), public.smije_prijaviti(),
  public.je_javna_fotografija(text) to anon, authenticated;

-- =====================================================================
-- Nakon prve prijave na portal, sebi dodijelite ulogu admina (zamijenite e-adresu):
--   update public.profili set uloga = 'admin'
--   where id = (select id from auth.users where email = 'vasa@adresa.hr');
-- =====================================================================
