-- =====================================================================
-- Migracija 8: brojevi prijava po godinama – „redni broj/godina” (npr. 1/2026)
--   * prijave.godina, prijave.redni – dodjeljuje ih baza pri spremanju prijave
--   * prijave.oznaka – gotov zapis „redni/godina” za prikaz i e-poštu
--   * numeracija svake godine kreće od 1; ako se obrišu SVE prijave tekuće godine
--     (npr. probne prije javnog početka), sljedeća opet dobiva broj 1
-- Interni id ostaje (veze s poviješću statusa); građani i osoblje vide samo oznaku.
-- Pokreće se jednom u Supabase → SQL Editor (smije se ponoviti).
-- =====================================================================
alter table public.prijave add column if not exists godina smallint;
alter table public.prijave add column if not exists redni integer;

-- postojeće prijave: numeracija po godini, redom kako su stigle
update public.prijave p set godina = b.godina, redni = b.redni
from (select id, extract(year from stvoreno at time zone 'Europe/Zagreb')::smallint as godina,
             row_number() over (partition by extract(year from stvoreno at time zone 'Europe/Zagreb') order by id) as redni
      from public.prijave) b
where p.id = b.id and p.redni is null;

create or replace function public.prijave_dodijeli_broj() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.godina := extract(year from coalesce(new.stvoreno, now()) at time zone 'Europe/Zagreb')::smallint;
  perform pg_advisory_xact_lock(hashtext('prijave_broj'), new.godina);  -- dvije istodobne prijave ne dobivaju isti broj
  select coalesce(max(redni), 0) + 1 into new.redni from public.prijave where godina = new.godina;
  return new;
end $$;

drop trigger if exists prijave_broj on public.prijave;
create trigger prijave_broj before insert on public.prijave
  for each row execute function public.prijave_dodijeli_broj();

alter table public.prijave add column if not exists oznaka text
  generated always as (redni::text || '/' || godina::text) stored;

create unique index if not exists prijave_godina_redni on public.prijave (godina, redni);

-- javni sloj: dodana oznaka
create or replace function public.prijave_geojson() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
    'type', 'Feature',
    'geometry', json_build_object('type', 'Point', 'coordinates',
                json_build_array(round(lon::numeric, 4), round(lat::numeric, 4))),
    'properties', json_build_object(
      'id', id, 'oznaka', oznaka, 'kategorija', kategorija,
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
