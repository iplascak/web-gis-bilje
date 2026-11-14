#!/usr/bin/env python3
"""ARKOD parcele za Općinu Bilje iz GeoPackage datoteka APPRRR-a.
Zadržava samo: ARKOD ID, šifru i naziv vrste uporabe, površinu (ha). Nikakvi podaci o korisnicima."""
import json, os, subprocess, sys, urllib.request

ARHIVA = "https://www.apprrr.hr/wp-content/uploads/nipp/arkod_31_12_{g}.gpkg"
ARHIVA_2019 = "https://www.apprrr.hr/wp-content/uploads/NIPP/arkod_31_12_2019.gpkg"
TRENUTNO = "https://www.apprrr.hr/wp-content/uploads/nipp/land_parcels.gpkg"
BBOX = ["18.69", "45.54", "18.98", "45.73"]
IZLAZ = "data/poljoprivreda/arkod"
VRSTE = {"200": "oranica", "210": "staklenik na oranici", "310": "livada", "320": "pašnjak", "321": "krški pašnjak", "410": "vinograd",
         "421": "maslinik", "422": "voćnjak", "430": "mješoviti trajni nasadi", "450": "rasadnik", "490": "ostale trajne kulture",
         "491": "brzorastući panjači", "900": "ostalo", "910": "privremeno neodržavano"}
UA = {"User-Agent": "Mozilla/5.0 (web-gis-bilje)"}


def preuzmi(url, put):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as o, open(put, "wb") as f:
        while True:
            b = o.read(1 << 20)
            if not b: break
            f.write(b)
    print("preuzeto", url, os.path.getsize(put) // 1e6, "MB", flush=True)


GRANICA = []
for _f in json.load(open("data/granica_opcine.geojson"))["features"]:
    _g = _f["geometry"]
    for _p in (_g["coordinates"] if _g["type"] == "MultiPolygon" else [_g["coordinates"]]):
        GRANICA.append(_p[0])


def srediste(g):
    t = g.get("coordinates") or []
    while t and isinstance(t[0], list) and t[0] and isinstance(t[0][0], list): t = [q for x in t for q in x]
    t = [p for p in t if isinstance(p, list) and len(p) >= 2]
    if not t: return None
    return sum(p[0] for p in t) / len(t), sum(p[1] for p in t) / len(t)


def unutar(pt):
    if pt is None: return False
    x, y = pt; ima = False
    for prsten in GRANICA:
        for (x1, y1), (x2, y2) in zip(prsten, prsten[1:]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                ima = not ima
    return ima


def obradi(url, oznaka, proba=False):
    put = "/tmp/arkod.gpkg"
    try:
        preuzmi(url, put)
    except Exception as g:
        print("GREŠKA preuzimanja", url, g); return
    info = subprocess.run(["ogrinfo", "-so", "-al", put], capture_output=True, text=True).stdout
    if proba:
        print(info[:4000]); return
    import re as _r
    sloj = _r.search(r"^\d+: (\S+)", subprocess.run(["ogrinfo", "-q", put], capture_output=True, text=True).stdout, _r.M).group(1)
    tmp = "/tmp/izrez.geojson"
    if os.path.exists(tmp): os.remove(tmp)
    # granica u koordinatnom sustavu izvora (HTRS96/TM) – izbjegava zabunu s redoslijedom osi kod EPSG:4326
    gr = "/tmp/granica_izvor.gpkg"
    if not os.path.exists(gr):
        subprocess.run(["ogr2ogr", "-f", "GPKG", gr, "data/granica_opcine.geojson", "-t_srs", "EPSG:3765"], check=True)
    ext = subprocess.run(["ogrinfo", "-so", "-al", gr], capture_output=True, text=True).stdout
    import re as _re
    e = _re.search(r"Extent: \(([-\d.]+), ([-\d.]+)\) - \(([-\d.]+), ([-\d.]+)\)", ext).groups()
    print("  obuhvat (HTRS96):", e)
    print("  sloj:", repr(sloj))
    prov = subprocess.run(["ogrinfo", "-so", put, sloj, "-spat", *e], capture_output=True, text=True)
    print("  u obuhvatu:", [r for r in prov.stdout.split("\n") if "Feature Count" in r], prov.stderr[-500:])
    r = subprocess.run(["ogr2ogr", "-f", "GeoJSON", tmp, put, sloj, "-spat", *e,
                        "-t_srs", "EPSG:4326", "-nlt", "CONVERT_TO_LINEAR", "-nlt", "PROMOTE_TO_MULTI", "-lco", "COORDINATE_PRECISION=6", "-lco", "RFC7946=YES"],
                       capture_output=True, text=True)
    print("  ogr2ogr:", r.returncode, r.stderr[-1500:])
    d = json.load(open(tmp))
    # zadrži parcele čije je središte unutar granice općine (bez dodatnih biblioteka)
    d["features"] = [f for f in d["features"] if f.get("geometry") and unutar(srediste(f["geometry"]))]
    polja = list(d["features"][0]["properties"]) if d["features"] else []
    print(oznaka, len(d["features"]), "parcela, polja:", polja)
    nadji = lambda *imena: next((p for p in polja if p.lower() in imena), None)
    p_id = nadji("arkod_id", "id_arkod", "id")  # jpaid se namjerno ne preuzima (moguća oznaka korisnika)
    p_vr = nadji("land_use_id", "vrsta_uporabe", "vrsta_upor", "land_use", "uporaba", "vrsta", "landuse_code", "lu_code", "vrsta_uporabe_sifra", "vu_sifra")
    p_pov = nadji("povrsina", "area", "povrsina_ha", "pov", "area_ha")
    print("  koristim:", p_id, p_vr, p_pov)
    znacajke = []
    for f in d["features"]:
        pr = f["properties"]
        sifra = str(pr.get(p_vr, "") or "").split(".")[0] if p_vr else ""
        pov = pr.get(p_pov) if p_pov else None
        try:
            pov = round(float(pov) / (10000 if float(pov) > 500 else 1), 2)
        except (TypeError, ValueError):
            pov = None
        znacajke.append({"type": "Feature", "geometry": f["geometry"],
                         "properties": {"arkod_id": pr.get(p_id) if p_id else None, "arkod_vrsta": sifra,
                                        "kultura": VRSTE.get(sifra, "vrsta " + sifra if sifra else "nepoznato"), "povrsina_ha": pov,
                                        "navodnjavanje": 1 if pr.get("irrigation") in (1, "1") else 0}})
    os.makedirs(IZLAZ, exist_ok=True)
    json.dump({"type": "FeatureCollection", "stanje": oznaka, "features": znacajke}, open(f"{IZLAZ}/arkod_{oznaka}.geojson", "w"),
              ensure_ascii=False, separators=(",", ":"))
    os.remove(put)


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "trenutno"
    if arg == "proba":
        obradi(TRENUTNO, "trenutno", proba=True); obradi(ARHIVA.format(g=2013), "2013", proba=True); return
    if arg == "trenutno":
        obradi(TRENUTNO, "trenutno")
    else:
        a, b = (arg.split("-") + [arg])[:2]
        for g in range(int(a), int(b) + 1):
            obradi(ARHIVA_2019 if g == 2019 else ARHIVA.format(g=g), str(g))
    if os.environ.get("BEZ_POPISA"): return
    # popis dostupnih stanja za portal
    stanja = sorted(f[6:-8] for f in os.listdir(IZLAZ) if f.startswith("arkod_") and f.endswith(".geojson"))
    json.dump({"stanja": stanja}, open(f"{IZLAZ}/popis.json", "w"))


if __name__ == "__main__":
    main()
