-- =====================================================================
-- Web GIS Općine Bilje – dopuna baze (4):
--   * kalendar događanja (manifestacije, sport, kultura, sajmovi, radovi i zatvorene ceste)
--   * komunalni objekti (svjetiljke javne rasvjete, klupe, koševi, igrala, hidranti…)
--     i poveznica prijave s objektom ("ne svijetli svjetiljka br. 123")
-- Pokretanje: Supabase -> SQL Editor -> New query -> zalijepiti -> Run. Smije se ponoviti.
-- =====================================================================

-- ---------- DOGAĐANJA ----------
create table if not exists public.dogadjanja (
  id            bigint generated always as identity primary key,
  naziv         text not null check (char_length(naziv) between 3 and 200),
  opis          text check (char_length(opis) <= 4000),
  kategorija    text not null default 'manifestacija' check (kategorija in
                  ('manifestacija', 'kultura', 'sport', 'turizam', 'edukacija', 'sajam', 'vjerski', 'radovi', 'ostalo')),
  pocetak       timestamptz not null,
  kraj          timestamptz,
  mjesto_opis   text,
  lon           double precision check (lon between 18.5 and 19.1),
  lat           double precision check (lat between 45.45 and 45.8),
  organizator   text,
  poveznica     text,
  fotografija   text,
  javno         boolean not null default true,
  autor         uuid default auth.uid() references auth.users(id) on delete set null,
  stvoreno      timestamptz not null default now(),
  azurirano     timestamptz not null default now()
);
alter table public.dogadjanja enable row level security;
drop policy if exists "dogadjanja: citanje" on public.dogadjanja;
create policy "dogadjanja: citanje" on public.dogadjanja for select to anon, authenticated
  using (javno or public.je_urednik() or public.je_osoblje());
drop policy if exists "dogadjanja: unos" on public.dogadjanja;
create policy "dogadjanja: unos" on public.dogadjanja for insert to authenticated
  with check (public.je_urednik() or (public.je_osoblje() and kategorija = 'radovi'));
drop policy if exists "dogadjanja: izmjena" on public.dogadjanja;
create policy "dogadjanja: izmjena" on public.dogadjanja for update to authenticated
  using (public.je_urednik() or (public.je_osoblje() and kategorija = 'radovi'))
  with check (public.je_urednik() or (public.je_osoblje() and kategorija = 'radovi'));
drop policy if exists "dogadjanja: brisanje" on public.dogadjanja;
create policy "dogadjanja: brisanje" on public.dogadjanja for delete to authenticated
  using (public.je_urednik() or (public.je_osoblje() and kategorija = 'radovi'));
grant select on public.dogadjanja to anon, authenticated;
grant insert, update, delete on public.dogadjanja to authenticated;

create or replace function public.dogadjanje_azurirano() returns trigger language plpgsql as $$
begin new.azurirano := now(); return new; end $$;
drop trigger if exists dogadjanje_azurirano on public.dogadjanja;
create trigger dogadjanje_azurirano before update on public.dogadjanja for each row execute function public.dogadjanje_azurirano();

-- javni prikaz: događanja od prije 2 dana do 1 godine unaprijed
create or replace function public.dogadjanja_geojson() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
    'type', 'Feature',
    'geometry', case when lon is null then null else json_build_object('type', 'Point', 'coordinates', json_build_array(lon, lat)) end,
    'properties', json_build_object('id', id, 'naziv', naziv, 'opis', opis, 'kategorija', kategorija, 'pocetak', pocetak, 'kraj', kraj,
      'mjesto', mjesto_opis, 'organizator', organizator, 'poveznica', poveznica, 'fotografija', fotografija)
  ) order by pocetak), '[]'::json))
  from public.dogadjanja
  where javno and coalesce(kraj, pocetak) >= now() - interval '2 days' and pocetak <= now() + interval '1 year'
$$;
grant execute on function public.dogadjanja_geojson() to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dogadjanja-foto', 'dogadjanja-foto', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "dogadjanja-foto: urednici" on storage.objects;
create policy "dogadjanja-foto: urednici" on storage.objects for insert to authenticated
  with check (bucket_id = 'dogadjanja-foto' and (public.je_urednik() or public.je_osoblje()));

-- ---------- KOMUNALNI OBJEKTI ----------
create table if not exists public.komunalni_objekti (
  id            bigint generated always as identity primary key,
  vrsta         text not null check (vrsta in ('svjetiljka', 'klupa', 'kos', 'igralo', 'hidrant', 'znak', 'stajaliste', 'zeleni_otok', 'aed', 'slavina', 'punionica', 'ostalo')),
  oznaka        text,                     -- npr. broj svjetiljke ili stupa
  naselje       text,
  ulica         text,
  lon           double precision not null check (lon between 18.5 and 19.1),
  lat           double precision not null check (lat between 45.45 and 45.8),
  stanje        text not null default 'ispravno' check (stanje in ('ispravno', 'neispravno', 'u_popravku', 'uklonjeno')),
  svojstva      jsonb not null default '{}'::jsonb,   -- npr. {"izvor":"LED","snaga_w":40,"godina":2023}
  napomena      text,
  izvor         text default 'unos',      -- unos | OSM | terenski popis
  azurirano     timestamptz not null default now()
);
alter table public.komunalni_objekti enable row level security;
drop policy if exists "objekti: citanje" on public.komunalni_objekti;
create policy "objekti: citanje" on public.komunalni_objekti for select to anon, authenticated using (stanje <> 'uklonjeno' or public.je_osoblje());
drop policy if exists "objekti: osoblje" on public.komunalni_objekti;
create policy "objekti: osoblje" on public.komunalni_objekti for all to authenticated
  using (public.je_osoblje()) with check (public.je_osoblje());
grant select on public.komunalni_objekti to anon, authenticated;
grant insert, update, delete on public.komunalni_objekti to authenticated;
create index if not exists komunalni_objekti_vrsta_idx on public.komunalni_objekti (vrsta);

create or replace function public.komunalni_objekti_geojson() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
    'type', 'Feature', 'geometry', json_build_object('type', 'Point', 'coordinates', json_build_array(lon, lat)),
    'properties', json_build_object('id', id, 'vrsta', vrsta, 'oznaka', oznaka, 'naselje', naselje, 'ulica', ulica,
      'stanje', stanje, 'svojstva', svojstva, 'napomena', napomena)) order by id), '[]'::json))
  from public.komunalni_objekti where stanje <> 'uklonjeno'
$$;
grant execute on function public.komunalni_objekti_geojson() to anon, authenticated;

-- prijava se može vezati uz objekt
alter table public.prijave add column if not exists objekt_id bigint references public.komunalni_objekti(id) on delete set null;
