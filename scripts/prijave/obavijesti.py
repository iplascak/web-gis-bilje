#!/usr/bin/env python3
"""
Obavijesti e-poštom za prijave komunalnih problema (pokreće GitHub Actions).

  --nove      nova prijava -> osoblje s uključenim "nove prijave";
              promjena statusa -> prijavitelj (ako je ostavio e-adresu)
  --tjedno    tjedno izvješće -> osoblje s uključenim "tjedno izvješće"
  --ciscenje  rok čuvanja: e-adresa prijavitelja briše se 12 mjeseci nakon zatvaranja prijave

Potrebne tajne (GitHub -> Settings -> Secrets and variables -> Actions):
  SUPABASE_SECRET_KEY                    tajni ključ projekta (sb_secret_...)
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM   poslužitelj e-pošte
Bez SUPABASE_SECRET_KEY skripta ne radi ništa. Bez SMTP-a ne šalje poruke
(nove prijave starije od 3 dana tada se označe kao obrađene, da kasnije ne stigne gomila starih poruka).
"""
import argparse
import collections
import datetime as dt
import json
import os
import pathlib
import smtplib
import ssl
import sys
import urllib.parse
import urllib.request
from email.message import EmailMessage
from email.utils import formataddr

KORIJEN = pathlib.Path(__file__).resolve().parents[2]
PORTAL = "https://iplascak.github.io/web-gis-bilje/"
OSOBLJE = ("zaposlenik", "direktor", "nacelnik", "admin")
KATEGORIJE = {
    "cesta": "Oštećena cesta ili nogostup", "rasvjeta": "Javna rasvjeta", "otpad": "Otpad",
    "zelenilo": "Zelenilo", "odvodnja": "Odvodnja i kanali", "komunalna_oprema": "Komunalna oprema",
    "promet": "Promet i signalizacija", "ostalo": "Ostalo",
}
STATUSI = {"zaprimljeno": "zaprimljeno", "u_obradi": "u obradi", "rijeseno": "riješeno",
           "odbijeno": "nije u nadležnosti / odbijeno"}


def log(*a):
    print(*a, flush=True)


class Baza:
    def __init__(self, url, kljuc):
        self.url = url.rstrip("/") + "/rest/v1/"
        self.zaglavlja = {"apikey": kljuc, "Content-Type": "application/json"}
        if not kljuc.startswith("sb_"):  # stari (JWT) service_role ključ
            self.zaglavlja["Authorization"] = "Bearer " + kljuc

    def zahtjev(self, metoda, putanja, tijelo=None):
        z = urllib.request.Request(self.url + putanja, method=metoda, headers=self.zaglavlja,
                                   data=None if tijelo is None else json.dumps(tijelo).encode())
        with urllib.request.urlopen(z, timeout=60) as o:
            t = o.read()
            return json.loads(t) if t else None

    def dohvati(self, tablica, **uvjeti):
        return self.zahtjev("GET", tablica + "?" + urllib.parse.urlencode(uvjeti, safe="(),.*:"))

    def promijeni(self, tablica, uvjeti, podaci):
        return self.zahtjev("PATCH", tablica + "?" + urllib.parse.urlencode(uvjeti, safe="(),.*:"), podaci)


class Posta:
    def __init__(self):
        self.host = os.environ.get("SMTP_HOST")
        self.port = int(os.environ.get("SMTP_PORT") or 587)
        self.korisnik = os.environ.get("SMTP_USER")
        self.lozinka = os.environ.get("SMTP_PASS")
        self.posiljatelj = os.environ.get("SMTP_FROM") or self.korisnik
        self.radi = bool(self.host and self.posiljatelj)

    def posalji(self, primatelji, naslov, tekst):
        if not self.radi:
            log(f"  (bez SMTP-a) ne šaljem: {naslov} -> {len(primatelji)} primatelja")
            return False
        poruka = EmailMessage()
        poruka["Subject"] = naslov
        poruka["From"] = formataddr(("Web GIS Općine Bilje", self.posiljatelj))
        if len(primatelji) == 1:
            poruka["To"] = primatelji[0]
        else:  # više primatelja: skriveno, da se adrese međusobno ne vide
            poruka["To"] = self.posiljatelj
            poruka["Bcc"] = ", ".join(primatelji)
        poruka.set_content(tekst + "\n\n--\nWeb GIS Općine Bilje · " + PORTAL +
                           "\nZaštita osobnih podataka: " + PORTAL + "privatnost.html\n")
        kontekst = ssl.create_default_context()
        if self.port == 465:
            with smtplib.SMTP_SSL(self.host, self.port, context=kontekst, timeout=60) as s:
                if self.korisnik: s.login(self.korisnik, self.lozinka)
                s.send_message(poruka)
        else:
            with smtplib.SMTP(self.host, self.port, timeout=60) as s:
                s.starttls(context=kontekst)
                if self.korisnik: s.login(self.korisnik, self.lozinka)
                s.send_message(poruka)
        log(f"  poslano: {naslov} -> {len(primatelji)} primatelja")
        return True


def poveznica(p):
    return f"{PORTAL}#v=18/{p['lon']:.5f}/{p['lat']:.5f}"


def primatelji(baza, polje):
    redovi = baza.dohvati("profili", select="email,uloga", **{polje: "eq.true"})
    return sorted({r["email"] for r in redovi if r.get("email") and r["uloga"] in OSOBLJE})


def nove(baza, posta):
    sada = dt.datetime.now(dt.timezone.utc)
    prijave = baza.dohvati("prijave", select="id,stvoreno,kategorija,opis,adresa,lon,lat,fotografija",
                           obavijest_poslana="eq.false", order="id")
    osoblje = primatelji(baza, "obavijesti_nove")
    for p in prijave:
        starost = sada - dt.datetime.fromisoformat(p["stvoreno"])
        kat = KATEGORIJE.get(p["kategorija"], p["kategorija"])
        naslov = f"Nova prijava br. {p['id']}: {kat}" + (f" – {p['adresa']}" if p.get("adresa") else "")
        tekst = (f"Zaprimljena je nova prijava komunalnog problema.\n\n"
                 f"Broj: {p['id']}\nVrsta: {kat}\nLokacija: {p.get('adresa') or 'vidi kartu'}\n"
                 f"Fotografija: {'da' if p.get('fotografija') else 'ne'}\n\nOpis:\n{p['opis']}\n\n"
                 f"Otvorite na karti (prijavite se i kliknite 'Općina'):\n{poveznica(p)}")
        poslano = bool(osoblje) and posta.posalji(osoblje, naslov, tekst)
        if poslano or not osoblje or starost > dt.timedelta(days=3):
            baza.promijeni("prijave", {"id": f"eq.{p['id']}"}, {"obavijest_poslana": True})

    promjene = baza.dohvati("prijave_povijest", select="id,prijava,status,stari_status,vrijeme",
                            obavijest_poslana="eq.false", order="id")
    for pr in promjene:
        oznaci = True
        if pr["status"] != pr.get("stari_status"):
            p = (baza.dohvati("prijave", select="id,kategorija,odgovor,kontakt_email,lon,lat,adresa",
                              id=f"eq.{pr['prijava']}") or [None])[0]
            if p and p.get("kontakt_email"):
                kat = KATEGORIJE.get(p["kategorija"], p["kategorija"])
                tekst = (f"Poštovani,\n\nstatus vaše prijave br. {p['id']} ({kat}"
                         f"{', ' + p['adresa'] if p.get('adresa') else ''}) promijenjen je u: "
                         f"{STATUSI.get(pr['status'], pr['status']).upper()}.\n")
                if p.get("odgovor"):
                    tekst += f"\nOdgovor Općine Bilje:\n{p['odgovor']}\n"
                tekst += f"\nSvoje prijave možete pratiti na portalu (gumb 'Moje prijave'):\n{poveznica(p)}\n\nHvala što brinete o našoj općini!"
                starost = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(pr["vrijeme"])
                oznaci = posta.posalji([p["kontakt_email"]], f"Vaša prijava br. {p['id']}: {STATUSI.get(pr['status'])}", tekst) \
                    or starost > dt.timedelta(days=3)
        if oznaci:
            baza.promijeni("prijave_povijest", {"id": f"eq.{pr['id']}"}, {"obavijest_poslana": True})
    log(f"Nove prijave: {len(prijave)}, promjene statusa: {len(promjene)}")


def naselje(adresa):
    return adresa.rsplit(",", 1)[-1].strip() if adresa and "," in adresa else "nepoznato"


def tjedno(baza, posta):
    sada = dt.datetime.now(dt.timezone.utc)
    prije7 = sada - dt.timedelta(days=7)
    sve = baza.dohvati("prijave", select="id,stvoreno,azurirano,kategorija,status,javno,adresa", order="id")
    povijest = baza.dohvati("prijave_povijest", select="prijava,status,vrijeme", status="eq.rijeseno", order="vrijeme")
    vrijeme = lambda t: dt.datetime.fromisoformat(t)
    nove_tj = [p for p in sve if vrijeme(p["stvoreno"]) >= prije7]
    rijeseno_kada = {}
    for h in povijest:
        rijeseno_kada.setdefault(h["prijava"], vrijeme(h["vrijeme"]))
    rijesene_tj = [p for p in sve if p["status"] == "rijeseno" and p["id"] in rijeseno_kada and rijeseno_kada[p["id"]] >= prije7]
    otvorene = [p for p in sve if p["status"] in ("zaprimljeno", "u_obradi")]
    stare = sorted([p for p in otvorene if sada - vrijeme(p["stvoreno"]) > dt.timedelta(days=14)], key=lambda p: p["stvoreno"])
    trajanja = [(rijeseno_kada[p["id"]] - vrijeme(p["stvoreno"])).total_seconds() / 86400
                for p in sve if p["status"] == "rijeseno" and p["id"] in rijeseno_kada]

    def tablica(brojac):
        return "\n".join(f"  {k}: {v}" for k, v in brojac.most_common()) or "  –"

    od, do = (prije7 + dt.timedelta(hours=1)).strftime("%d.%m."), sada.strftime("%d.%m.%Y.")
    redovi = [
        f"Tjedno izvješće o prijavama komunalnih problema ({od} – {do})", "",
        f"Novih prijava ovaj tjedan: {len(nove_tj)}",
        f"Riješeno ovaj tjedan: {len(rijesene_tj)}",
        f"Otvorenih ukupno: {len(otvorene)} (zaprimljeno {sum(p['status'] == 'zaprimljeno' for p in otvorene)}, "
        f"u obradi {sum(p['status'] == 'u_obradi' for p in otvorene)})",
        f"Neobjavljenih (čekaju pregled): {sum(not p['javno'] for p in sve if p['status'] != 'odbijeno')}",
    ]
    if trajanja:
        redovi.append(f"Prosječno vrijeme rješavanja (sve riješene prijave): {sum(trajanja) / len(trajanja):.1f} dana")
    tekst = "\n".join(redovi) + "\n"
    tekst += "\nNove prijave po vrsti:\n" + tablica(collections.Counter(KATEGORIJE.get(p["kategorija"], p["kategorija"]) for p in nove_tj))
    tekst += "\n\nNove prijave po naselju:\n" + tablica(collections.Counter(naselje(p.get("adresa")) for p in nove_tj))
    tekst += "\n\nOtvorene prijave starije od 14 dana:\n" + ("\n".join(
        f"  br. {p['id']} – {KATEGORIJE.get(p['kategorija'], p['kategorija'])}, {p.get('adresa') or ''} "
        f"(prijavljeno {vrijeme(p['stvoreno']).strftime('%d.%m.%Y.')}, {STATUSI[p['status']]})" for p in stare[:30]) or "  nema")
    tekst += f"\n\nSve prijave na karti: {PORTAL}"
    osoblje = primatelji(baza, "obavijesti_tjedno")
    log(tekst)
    if osoblje:
        posta.posalji(osoblje, f"Tjedno izvješće o prijavama ({od} – {do})", tekst)


def ciscenje(baza):
    granica = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=365)).isoformat(timespec="seconds")
    r = baza.promijeni("prijave", {"status": "in.(rijeseno,odbijeno)", "azurirano": f"lt.{granica}",
                                   "kontakt_email": "not.is.null"}, {"kontakt_email": None})
    log(f"Rok čuvanja: obrisana e-adresa iz {len(r or [])} zatvorenih prijava starijih od 12 mjeseci")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nove", action="store_true")
    ap.add_argument("--tjedno", action="store_true")
    ap.add_argument("--ciscenje", action="store_true")
    a = ap.parse_args()
    kljuc = os.environ.get("SUPABASE_SECRET_KEY")
    if not kljuc:
        log("SUPABASE_SECRET_KEY nije postavljen – obavijesti su isključene.")
        return
    cfg = json.loads((KORIJEN / "config/portal.json").read_text(encoding="utf-8")).get("prijave") or {}
    baza = Baza(cfg["supabaseUrl"], kljuc)
    baza.zaglavlja["Prefer"] = "return=representation"
    posta = Posta()
    if not posta.radi:
        log("SMTP nije postavljen – poruke se ne šalju.")
    if a.nove: nove(baza, posta)
    if a.tjedno: tjedno(baza, posta)
    if a.ciscenje: ciscenje(baza)


if __name__ == "__main__":
    main()
