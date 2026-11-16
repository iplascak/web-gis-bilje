-- =====================================================================
-- Migracija 5: galerija fotografija i više poveznica uz projekte
--   * projekti.fotografije – popis fotografija [{"putanja","opis","godina","vrsta":"prije|poslije|"}]
--   * projekti.poveznice   – popis poveznica  [{"naziv","url"}]
--   * javni prikaz (projekti_geojson) vraća i fotografije i poveznice
--   * urednici smiju brisati fotografije projekata iz spremišta
-- Pokreće se jednom u Supabase → SQL Editor (smije se ponoviti).
-- =====================================================================

alter table public.projekti add column if not exists fotografije jsonb not null default '[]'::jsonb;
alter table public.projekti add column if not exists poveznice   jsonb not null default '[]'::jsonb;

alter table public.projekti drop constraint if exists projekti_fotografije_niz;
alter table public.projekti add constraint projekti_fotografije_niz
  check (jsonb_typeof(fotografije) = 'array' and jsonb_array_length(fotografije) <= 30);
alter table public.projekti drop constraint if exists projekti_poveznice_niz;
alter table public.projekti add constraint projekti_poveznice_niz
  check (jsonb_typeof(poveznice) = 'array' and jsonb_array_length(poveznice) <= 15);

-- dosadašnja pojedinačna fotografija postaje prva u galeriji
update public.projekti
   set fotografije = jsonb_build_array(jsonb_build_object('putanja', fotografija))
 where fotografija is not null and fotografije = '[]'::jsonb;

create or replace function public.projekti_geojson() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
    'type', 'Feature',
    'geometry', coalesce(obuhvat, json_build_object('type', 'Point', 'coordinates', json_build_array(lon, lat))::jsonb),
    'properties', json_build_object('id', id, 'naziv', naziv, 'opis', opis, 'kategorija', kategorija, 'status', status,
      'naselje', naselje, 'lokacija', lokacija_opis, 'razdoblje', concat_ws('–', godina_pocetka, godina_zavrsetka),
      'vrijednost_eur', vrijednost_eur, 'bespovratno_eur', bespovratno_eur, 'izvor_financiranja', izvor_financiranja,
      'program', program_natjecaj, 'nositelj', nositelj, 'partneri', partneri, 'poveznica', poveznica,
      'fotografije', fotografije, 'poveznice', poveznice)
  ) order by id), '[]'::json))
  from public.projekti where javno and (lon is not null or obuhvat is not null)
$$;
grant execute on function public.projekti_geojson() to anon, authenticated;

drop policy if exists "projekti-foto: urednici brisu" on storage.objects;
create policy "projekti-foto: urednici brisu" on storage.objects for delete to authenticated
  using (bucket_id = 'projekti-foto' and public.je_urednik());
drop policy if exists "projekti-foto: urednici mijenjaju" on storage.objects;
create policy "projekti-foto: urednici mijenjaju" on storage.objects for update to authenticated
  using (bucket_id = 'projekti-foto' and public.je_urednik());
