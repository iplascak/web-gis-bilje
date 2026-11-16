-- =====================================================================
-- Migracija 10: mjerenje posjećenosti bez kolačića i bez osobnih podataka
--   * posjete – samo zbirni brojači po danu (npr. 2026-11-17 · jezik · hu → 14)
--   * ne bilježi se IP adresa, preglednik, identifikator ni ikakav trag pojedinog posjetitelja;
--     na uređaju posjetitelja ne sprema se ništa (bez kolačića i lokalne pohrane)
--   * biljezi_posjet(dogadjaji) – portal šalje pri otvaranju i kad netko uključi sloj ili priču
--   * posjete_godine(godina) – zbirni pregled za godišnje izvješće (javan)
-- Pokreće se jednom u Supabase → SQL Editor (smije se ponoviti).
-- =====================================================================
create table if not exists public.posjete (
  dan     date    not null,
  vrsta   text    not null check (vrsta in ('posjet', 'jezik', 'uredaj', 'sloj', 'prica')),
  kljuc   text    not null check (kljuc ~ '^[a-z0-9_-]{1,40}$'),
  broj    integer not null default 0,
  primary key (dan, vrsta, kljuc)
);
alter table public.posjete enable row level security;   -- bez pravila: tablici se pristupa samo kroz funkcije
grant select, insert, update, delete on public.posjete to service_role;

create or replace function public.biljezi_posjet(dogadjaji jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb; danas date := (now() at time zone 'Europe/Zagreb')::date; n int := 0;
begin
  if jsonb_typeof(dogadjaji) <> 'array' then return; end if;
  for d in select * from jsonb_array_elements(dogadjaji) loop
    n := n + 1;
    exit when n > 30;                                         -- najviše 30 zapisa po pozivu
    if d->>'vrsta' in ('posjet', 'jezik', 'uredaj', 'sloj', 'prica') and coalesce(d->>'kljuc', '') ~ '^[a-z0-9_-]{1,40}$' then
      insert into public.posjete (dan, vrsta, kljuc, broj) values (danas, d->>'vrsta', d->>'kljuc', 1)
      on conflict (dan, vrsta, kljuc) do update set broj = posjete.broj + 1;
    end if;
  end loop;
end $$;
revoke all on function public.biljezi_posjet(jsonb) from public;
grant execute on function public.biljezi_posjet(jsonb) to anon, authenticated;

create or replace function public.posjete_godine(godina int) returns json
language sql stable security definer set search_path = public as $$
  with g as (select * from public.posjete where extract(year from dan) = godina)
  select json_build_object(
    'ukupno',      (select coalesce(sum(broj), 0) from g where vrsta = 'posjet'),
    'dana',        (select count(distinct dan) from g where vrsta = 'posjet'),
    'od',          (select min(dan) from g),
    'po_mjesecu',  (select coalesce(json_object_agg(m, s), '{}'::json) from
                     (select extract(month from dan)::int m, sum(broj) s from g where vrsta = 'posjet' group by 1) x),
    'jezik',       (select coalesce(json_object_agg(kljuc, s), '{}'::json) from
                     (select kljuc, sum(broj) s from g where vrsta = 'jezik' group by 1) x),
    'uredaj',      (select coalesce(json_object_agg(kljuc, s), '{}'::json) from
                     (select kljuc, sum(broj) s from g where vrsta = 'uredaj' group by 1) x),
    'slojevi',     (select coalesce(json_object_agg(kljuc, s), '{}'::json) from
                     (select kljuc, sum(broj) s from g where vrsta = 'sloj' group by 1 order by 2 desc limit 15) x),
    'price',       (select coalesce(json_object_agg(kljuc, s), '{}'::json) from
                     (select kljuc, sum(broj) s from g where vrsta = 'prica' group by 1) x))
$$;
grant execute on function public.posjete_godine(int) to anon, authenticated;
