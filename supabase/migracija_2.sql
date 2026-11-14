-- =====================================================================
-- Web GIS Općine Bilje – dopuna baze (2): uloge, korisnici, brisanje,
-- obavijesti e-poštom, brisanje vlastitog računa i rok čuvanja podataka.
-- Pokretanje: Supabase -> SQL Editor -> New query -> zalijepiti -> Run.
-- Smije se pokrenuti više puta.
--
-- Uloge:
--   gost        – mještanin: šalje prijave, vidi svoje
--   zaposlenik  – obrađuje prijave (komunalni redar, poslovođa Komunalno - Bilje d.o.o.)
--   direktor    – direktor/ica Komunalno - Bilje d.o.o.: vidi i obrađuje sve prijave
--   nacelnik    – kao direktor + smije brisati prijave
--   admin       – sve navedeno + dodjela uloga korisnicima
-- =====================================================================

-- ---------- profili: e-adresa, organizacija, funkcija, obavijesti ----------
alter table public.profili add column if not exists email text;
alter table public.profili add column if not exists organizacija text;
alter table public.profili add column if not exists funkcija text;
alter table public.profili add column if not exists obavijesti_nove boolean not null default false;
alter table public.profili add column if not exists obavijesti_tjedno boolean not null default false;

alter table public.profili drop constraint if exists profili_uloga_check;
alter table public.profili add constraint profili_uloga_check
  check (uloga in ('gost', 'zaposlenik', 'direktor', 'nacelnik', 'admin'));

update public.profili p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;

create or replace function public.novi_korisnik() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profili (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create or replace function public.je_osoblje() returns boolean
language sql stable security definer set search_path = public as $$
  select public.moja_uloga() in ('zaposlenik', 'direktor', 'nacelnik', 'admin')
$$;
create or replace function public.smije_brisati() returns boolean
language sql stable security definer set search_path = public as $$
  select public.moja_uloga() in ('nacelnik', 'admin')
$$;

-- korisnik smije mijenjati samo svoje ime; ulogu, organizaciju i obavijesti mijenja admin
drop policy if exists "profil: svoje ime" on public.profili;
create policy "profil: svoje ime" on public.profili for update
  using (id = auth.uid())
  with check (id = auth.uid() and uloga = public.moja_uloga());
create or replace function public.zastiti_profil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- sustavne promjene (npr. pri prijavi korisnika)
  if public.moja_uloga() <> 'admin' then
    new.uloga := old.uloga; new.organizacija := old.organizacija; new.funkcija := old.funkcija;
    new.obavijesti_nove := old.obavijesti_nove; new.obavijesti_tjedno := old.obavijesti_tjedno;
  end if;
  new.email := old.email;
  return new;
end $$;
drop trigger if exists na_promjenu_profila on public.profili;
create trigger na_promjenu_profila before update on public.profili
  for each row execute function public.zastiti_profil();

-- ---------- brisanje prijava: načelnik i admin ----------
drop policy if exists "prijave: admin briše" on public.prijave;
drop policy if exists "prijave: brisanje" on public.prijave;
create policy "prijave: brisanje" on public.prijave for delete to authenticated
  using (public.smije_brisati());
drop policy if exists "foto: admin briše" on storage.objects;
drop policy if exists "foto: brisanje" on storage.objects;
create policy "foto: brisanje" on storage.objects for delete to authenticated
  using (bucket_id = 'prijave-foto' and public.smije_brisati());

-- ---------- obavijesti e-poštom (šalje ih zadatak na GitHubu) ----------
alter table public.prijave add column if not exists obavijest_poslana boolean not null default false;
alter table public.prijave_povijest add column if not exists stari_status text;
alter table public.prijave_povijest add column if not exists obavijest_poslana boolean not null default false;

create or replace function public.prijava_promijenjena() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- datum zadnje promjene samo za stvarne promjene sadržaja (ne za oznake obavijesti i čišćenje)
  if (new.status, new.javno, new.opis, new.odgovor, new.kategorija)
     is distinct from (old.status, old.javno, old.opis, old.odgovor, old.kategorija) then
    new.azurirano := now();
  end if;
  if new.status is distinct from old.status or new.javno is distinct from old.javno then
    insert into public.prijave_povijest (prijava, status, javno, korisnik, stari_status, obavijest_poslana)
    values (new.id, new.status, new.javno, auth.uid(), old.status, new.status = old.status);
  end if;
  new.prijavitelj := old.prijavitelj;
  new.stvoreno := old.stvoreno;
  new.obavijest_poslana := old.obavijest_poslana or new.obavijest_poslana;
  return new;
end $$;

-- ---------- brisanje vlastitog računa (pravo na brisanje, čl. 17. GDPR) ----------
alter table public.prijave alter column prijavitelj drop not null;
create or replace function public.obrisi_moj_racun() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Niste prijavljeni'; end if;
  -- prijave ostaju (komunalni problem i dalje postoji), ali bez podataka o prijavitelju
  update public.prijave set kontakt_email = null where prijavitelj = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.obrisi_moj_racun() from public, anon;
grant execute on function public.obrisi_moj_racun() to authenticated;

-- ---------- ovlasti ----------
grant select, update on public.profili to authenticated;
grant select, insert, update, delete on public.prijave to authenticated;
grant select on public.prijave_povijest to authenticated;
grant execute on function public.moja_uloga(), public.je_osoblje(), public.smije_brisati(),
  public.smije_prijaviti(), public.je_javna_fotografija(text) to anon, authenticated;
