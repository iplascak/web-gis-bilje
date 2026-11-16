-- =====================================================================
-- Migracija 6: uklanja nekorišteni pogled public.prijave_javno
-- Supabase ga označava kao "Security Definer View" (CRITICAL): pogled se izvršava s pravima
-- vlasnika i zaobilazi RLS. Pogled je prikazivao samo javne podatke, ali ga portal ne koristi –
-- javni sloj prijava čita funkcija prijave_geojson(). Sigurnije ga je ukloniti.
-- Pokreće se jednom u Supabase → SQL Editor (smije se ponoviti).
-- =====================================================================
drop view if exists public.prijave_javno;
