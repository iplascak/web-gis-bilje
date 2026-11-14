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


def obradi(url, oznaka, proba=False):
    put = "/tmp/arkod.gpkg"
    try:
        preuzmi(url, put)
    except Exception as g:
        print("GREŠKA preuzimanja", url, g); return
    info = subprocess.run(["ogrinfo", "-so", "-al", put], capture_output=True, text=True).stdout
    if proba:
        print(info[:4000]); return
    sloj = subprocess.run(["ogrinfo", "-q", put], capture_output=True, text=True).stdout.split("\n")[0].split(":")[1].split("(")[0].strip()
    tmp = "/tmp/izrez.geojson"
    if os.path.exists(tmp): os.remove(tmp)
    subprocess.run(["ogr2ogr", "-f", "GeoJSON", tmp, put, sloj, "-t_srs", "EPSG:4326", "-spat", *BBOX, "-spat_srs", "EPSG:4326",
                    "-clipdst", "data/granica_opcine.geojson", "-nlt", "PROMOTE_TO_MULTI", "-lco", "COORDINATE_PRECISION=6"], check=True)
    d = json.load(open(tmp))
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
