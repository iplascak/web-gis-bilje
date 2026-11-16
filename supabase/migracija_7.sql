-- =====================================================================
-- Migracija 7: prava za ulogu service_role (automatika na GitHubu)
-- Projekt ne daje automatski prava novim tablicama, pa tajni ključ (SUPABASE_SECRET_KEY)
-- nije mogao čitati prijave: "permission denied for table prijave".
-- service_role koristi samo GitHub Actions (obavijesti, uvoz projekata); preglednik ga nikad ne vidi.
-- Pokreće se jednom u Supabase → SQL Editor (smije se ponoviti).
-- =====================================================================
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- i za tablice koje će nastati ubuduće
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
