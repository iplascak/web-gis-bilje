-- =====================================================================
-- Migracija 9: osoblje na karti vidi i neobjavljene prijave
--   prijave_osoblje_geojson() – sve prijave; neobjavljene imaju status 'neobjavljeno'
--   (siva oznaka „čeka pregled”). Javnost i dalje vidi samo prijave_geojson() (objavljene).
-- Osobni podaci (prijavitelj, e-adresa, interna napomena) ni ovdje se ne vraćaju.
-- Pokreće se jednom u Supabase → SQL Editor (smije se ponoviti). Pokrenite je NAKON migracije_8.
-- =====================================================================
create or replace function public.prijave_osoblje_geojson() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.je_osoblje() then
    raise exception 'Samo za osoblje' using errcode = '42501';
  end if;
  return (
    select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
      'type', 'Feature',
      'geometry', json_build_object('type', 'Point', 'coordinates', json_build_array(lon, lat)),
      'properties', json_build_object(
        'id', id, 'oznaka', oznaka, 'kategorija', kategorija,
        'kategorija_naziv', case kategorija
          when 'cesta' then 'Oštećena cesta ili nogostup' when 'rasvjeta' then 'Javna rasvjeta'
          when 'otpad' then 'Otpad' when 'zelenilo' then 'Zelenilo' when 'odvodnja' then 'Odvodnja i kanali'
          when 'komunalna_oprema' then 'Komunalna oprema' when 'promet' then 'Promet i signalizacija'
          else 'Ostalo' end,
        'opis', opis, 'status', case when javno then status else 'neobjavljeno' end, 'odgovor', odgovor,
        'adresa', adresa,
        'prijavljeno', to_char(stvoreno at time zone 'Europe/Zagreb', 'YYYY-MM-DD'),
        'azurirano', to_char(azurirano at time zone 'Europe/Zagreb', 'YYYY-MM-DD'),
        'fotografija', fotografija)
    ) order by id), '[]'::json))
    from public.prijave);
end $$;
revoke all on function public.prijave_osoblje_geojson() from public, anon;
grant execute on function public.prijave_osoblje_geojson() to authenticated;
