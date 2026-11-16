#!/usr/bin/env python3
"""Uvoz tablice projekata (CSV izvezen iz Projekti_Opcine_Bilje_2013-danas.xlsx, list 'Projekti')
u bazu portala. Pokreće se ručno (workflow projekti-uvoz). Postojeći projekt istog naziva se ažurira."""
import csv, json, os, sys, urllib.request, urllib.parse

URL = "https://pwowutilrdhnsygawmsu.supabase.co/rest/v1/projekti"
KLJUC = os.environ["SUPABASE_SECRET_KEY"]
H = {"apikey": KLJUC, "Authorization": "Bearer " + KLJUC, "Content-Type": "application/json"}
POLJA = ["naziv", "opis", "kategorija", "status", "naselje", "lokacija_opis", "lon", "lat", "godina_pocetka", "godina_zavrsetka",
         "vrijednost_eur", "bespovratno_eur", "udio_opcine_eur", "izvor_financiranja", "program_natjecaj", "nositelj", "partneri",
         "poveznica", "poveznice", "izvor_podatka", "javno"]
BROJ = {"lon", "lat", "vrijednost_eur", "bespovratno_eur", "udio_opcine_eur"}
CIJELI = {"godina_pocetka", "godina_zavrsetka"}


def zahtjev(metoda, url, tijelo=None, dodatno=None):
    r = urllib.request.Request(url, data=json.dumps(tijelo).encode() if tijelo is not None else None, method=metoda, headers={**H, **(dodatno or {})})
    with urllib.request.urlopen(r, timeout=60) as o:
        t = o.read().decode()
        return json.loads(t) if t else None


def main(put):
    redovi = list(csv.DictReader(open(put, encoding="utf-8-sig"), delimiter=";"))
    novi = azurirani = preskoceni = 0
    for r in redovi:
        if not (r.get("naziv") or "").strip() or r["naziv"].startswith("PRIMJER"):
            continue
        z = {}
        for p in POLJA:
            v = (r.get(p) or "").strip()
            if v == "": continue
            if p in BROJ: v = float(v.replace(".", "").replace(",", ".")) if p not in ("lon", "lat") else float(v.replace(",", "."))
            elif p in CIJELI: v = int(float(v))
            elif p == "javno": v = v.lower() in ("da", "true", "1")
            elif p == "poveznice":  # "naziv | adresa ; naziv | adresa"
                v = [{"naziv": (d.split("|", 1)[0].strip() if "|" in d else None) or None, "url": d.split("|", 1)[-1].strip()}
                     for d in v.split(";") if d.split("|", 1)[-1].strip().startswith("http")]
            z[p] = v
        if z.get("status") == "odustalo": z["javno"] = False
        try:
            post = zahtjev("GET", URL + "?select=id&naziv=eq." + urllib.parse.quote(z["naziv"]))
            if post:
                zahtjev("PATCH", URL + "?id=eq." + str(post[0]["id"]), z); azurirani += 1
            else:
                zahtjev("POST", URL, z, {"Prefer": "return=minimal"}); novi += 1
        except urllib.error.HTTPError as g:
            print("GREŠKA", z["naziv"], g.code, g.read().decode()[:300]); preskoceni += 1
    print(f"novih {novi}, ažuriranih {azurirani}, s greškom {preskoceni}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data/projekti/uvoz.csv")
