#!/usr/bin/env python3
"""
Provjera vanjskih servisa i lokalnih podataka portala.

Čita config/portal.json i config/layers.json i za svaki izvor provjerava radi li:
  - WMS: GetCapabilities sadrži traženi sloj
  - WFS: GetFeature vraća ispravan GeoJSON
  - katastar: GetFeatureInfo vraća broj čestice za poznatu točku
  - OpenStreetMap: pločica karte se može preuzeti
  - lokalne GeoJSON datoteke postoje i mogu se pročitati

Izlaz: izvjestaj_provjere.md; izlazni kod 1 ako nešto ne radi.
Pokretanje lokalno:  python scripts/provjera_servisa.py
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

KORIJEN = pathlib.Path(__file__).resolve().parent.parent
ZAGLAVLJA = {"User-Agent": "WebGIS-Opcina-Bilje-provjera/1.0 (+https://github.com)"}
# poznata točka u Bilju (HTRS96/TM) za provjeru katastra
TOCKA_HTRS = (674920, 5054291)


def dohvati(url, pokusaja=3):
    zadnja = None
    for i in range(pokusaja):
        try:
            zahtjev = urllib.request.Request(url, headers=ZAGLAVLJA)
            with urllib.request.urlopen(zahtjev, timeout=60) as o:
                return o.status, o.read()
        except Exception as g:  # mrežne greške: pokušaj ponovno
            zadnja = g
            time.sleep(5 * (i + 1))
    raise zadnja


def s_parametrima(url, parametri):
    return url + ("&" if "?" in url else "?") + urllib.parse.urlencode(parametri)


_capabilities = {}


def provjeri_wms(url, sloj):
    if url not in _capabilities:
        _, tijelo = dohvati(s_parametrima(url, {"SERVICE": "WMS", "REQUEST": "GetCapabilities", "VERSION": "1.3.0"}))
        _capabilities[url] = tijelo.decode("utf-8", "replace")
    if f"<Name>{sloj}</Name>" not in _capabilities[url]:
        raise RuntimeError(f"sloj '{sloj}' nije u GetCapabilities")
    return "sloj postoji"


def provjeri_wfs(url, type_name, bbox):
    _, tijelo = dohvati(s_parametrima(url, {
        "service": "WFS", "version": "1.1.0", "request": "GetFeature", "typeName": type_name,
        "outputFormat": "application/json", "srsName": "EPSG:3857", "bbox": bbox}))
    try:
        podaci = json.loads(tijelo)
    except ValueError:
        raise RuntimeError("odgovor nije GeoJSON: " + tijelo[:200].decode("utf-8", "replace"))
    return f"{len(podaci.get('features', []))} objekata"


def provjeri_katastar(cfg):
    x, y = TOCKA_HTRS
    _, tijelo = dohvati(s_parametrima(cfg["url"], {
        "SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetFeatureInfo", "LAYERS": cfg["sloj"],
        "QUERY_LAYERS": cfg["sloj"], "STYLES": "", "CRS": "EPSG:3765",
        "BBOX": f"{x-10},{y-10},{x+10},{y+10}", "WIDTH": 101, "HEIGHT": 101, "I": 50, "J": 50,
        "INFO_FORMAT": "text/plain", "FEATURE_COUNT": 1}))
    tekst = tijelo.decode("utf-8", "replace")
    if "BROJ_CESTICE" not in tekst:
        raise RuntimeError("nema broja čestice u odgovoru: " + tekst[:200])
    return "broj čestice dohvaćen"


def provjeri_osm():
    status, tijelo = dohvati("https://tile.openstreetmap.org/12/2260/1449.png")
    if not tijelo.startswith(b"\x89PNG"):
        raise RuntimeError("pločica nije PNG")
    return "pločica dohvaćena"


def provjeri_lokalno(putanja):
    podaci = json.loads((KORIJEN / putanja).read_text(encoding="utf-8"))
    n = len(podaci.get("features", podaci.get("adrese", [])))
    if n == 0:
        raise RuntimeError("datoteka je prazna")
    return f"{n} zapisa"


def main():
    portal = json.loads((KORIJEN / "config/portal.json").read_text(encoding="utf-8"))
    slojevi = json.loads((KORIJEN / "config/layers.json").read_text(encoding="utf-8"))["slojevi"]
    provjere = []  # (naziv, funkcija)

    for p in portal.get("podloge", []):
        if p["tip"] == "osm":
            provjere.append((f"Podloga: {p['naziv']}", provjeri_osm))
        elif p["tip"] == "wms":
            provjere.append((f"Podloga: {p['naziv']}", lambda p=p: provjeri_wms(p["url"], p["wmsSlojevi"])))

    for s in slojevi:
        naziv = f"Sloj: {s['naziv']}"
        if s["tip"] == "wms":
            provjere.append((naziv, lambda s=s: provjeri_wms(s["url"], s["wmsSlojevi"])))
        elif s["tip"] == "wfs":
            provjere.append((naziv, lambda s=s: provjeri_wfs(s["url"], s["typeName"], s.get("bbox", portal["wfsBbox"]))))
        elif s["tip"] == "geojson":
            provjere.append((naziv, lambda s=s: provjeri_lokalno(s["url"])))

    lok = portal.get("lokacija", {})
    if lok.get("katastar"):
        provjere.append(("Lokacija: katastarska čestica (DGU)", lambda: provjeri_katastar(lok["katastar"])))
    if portal.get("pretraga", {}).get("adrese"):
        provjere.append(("Pretraga: adrese", lambda: provjeri_lokalno(portal["pretraga"]["adrese"])))

    redovi, greske = [], 0
    for naziv, fn in provjere:
        try:
            rezultat = fn()
            redovi.append(f"| ✅ | {naziv} | {rezultat} |")
        except Exception as g:
            greske += 1
            redovi.append(f"| ❌ | {naziv} | {str(g)[:300]} |")
        print(redovi[-1])

    naslov = "Svi servisi rade." if not greske else f"{greske} od {len(provjere)} provjera nije prošlo."
    izvjestaj = "\n".join([
        f"## Provjera servisa portala – {time.strftime('%d.%m.%Y. %H:%M UTC', time.gmtime())}",
        "", naslov, "", "| | Izvor | Rezultat |", "|---|---|---|", *redovi, "",
        "Ako neki vanjski servis (DGU, Hrvatske vode) ne radi više dana zaredom, vjerojatno je promijenio adresu ili naziv sloja: treba ažurirati `config/layers.json` ili `config/portal.json`.",
    ])
    (KORIJEN / "izvjestaj_provjere.md").write_text(izvjestaj, encoding="utf-8")
    sys.exit(1 if greske else 0)


if __name__ == "__main__":
    main()
