#!/usr/bin/env python3
"""Slojevi Bioportala (MZOZT, informacijski sustav zaštite prirode) za područje Općine Bilje.
WFS https://services.bioportal.hr/wfs – 'Nema uvjeta za pristup i korištenje' (NIPP 1658).
Spremamo statične GeoJSON izreze (mjesečno osvježavanje), jer je servis spor i bez CORS jamstva."""
import json, os, sys, urllib.parse, urllib.request

WFS = "https://services.bioportal.hr/wfs"
BBOX = "671406,5047223,692946,5067583,EPSG:3765"   # obuhvat općine u HTRS96/TM
IZLAZ = "data/bioportal"
SLOJEVI = {
    # naziv_datoteke: [slojevi WFS-a]
    "zasticena_podrucja": ["zasticeno_podrucje_poligoni"],
    "natura_ptice": ["n2krh2023ptice"],
    "natura_stanista": ["n2krh2023stanista"],
    "ramsar": ["ramsar"],
    "rezervat_biosfere": ["unesco_mab"],
    "upravljacke_zone": ["upravljacke_zonacije_poligoni"],
    "stanista_2016": ["kopnena_stanista_2016"],
    "posjetitelji_tocke": ["atrakcije_tocke", "info_objekt", "poucna_info_ploca", "promatranje_zivotinja", "ribolov", "ugostiteljstvo_i_smjestaj"],
    "posjetitelji_linije": ["biciklizam", "atrakcije_linije", "poucna_staza", "ribolov_linije"],
    "obnova_prirode": ["prijedlozi_obnove_stanisnih_tipova2", "prijedlozi_obnove_za_vrste_v2", "prijedlozi_obnove_prirodne_povezanosti_rijeka"],
    "prepreke_vodotoci": ["baza_prepreka_2026", "prepreke_rh_05"],
    "osjetljivost_solar": ["ocjena_priroda_solar"],
    "osjetljivost_vjetar": ["ocjena_priroda_vjetar"],
}
VRSTA = {"atrakcije_tocke": "atrakcija", "info_objekt": "info centar", "poucna_info_ploca": "poučna ploča", "promatranje_zivotinja": "promatranje životinja",
         "ribolov": "ribolov", "ugostiteljstvo_i_smjestaj": "ugostiteljstvo i smještaj", "biciklizam": "biciklistička staza", "atrakcije_linije": "šetnica / atrakcija",
         "poucna_staza": "poučna staza", "ribolov_linije": "ribolovna voda", "prijedlozi_obnove_stanisnih_tipova2": "obnova staništa",
         "prijedlozi_obnove_za_vrste_v2": "obnova za vrste", "prijedlozi_obnove_prirodne_povezanosti_rijeka": "povezanost rijeka",
         "baza_prepreka_2026": "prepreka (2026.)", "prepreke_rh_05": "prepreka (ustava, prag)"}
NAZIV_POLJA = ["naziv", "nazivatr", "nazivstaze", "nazivprom", "nazivribo", "nazivobje", "sitename", "site", "nks1_naziv", "mjera_ime", "tip_pregra", "hymo_type1"]

GRANICA = []
for f in json.load(open("data/granica_opcine.geojson"))["features"]:
    g = f["geometry"]
    for p in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]): GRANICA.append(p[0])


def tocke(g):
    if not g: return []
    if g["type"] == "GeometryCollection": return [q for x in g["geometries"] for q in tocke(x)]
    t = g["coordinates"]
    if g["type"] == "Point": return [t]
    while t and isinstance(t[0], list) and t[0] and isinstance(t[0][0], list): t = [q for x in t for q in x]
    return t


def unutar(x, y):
    ima = False
    for r in GRANICA:
        for (x1, y1), (x2, y2) in zip(r, r[1:]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ima = not ima
    return ima


def dodiruje(g):
    t = tocke(g)
    # objekt ulazi ako mu je barem jedna točka (uzorak) u općini ili je središte u općini (veliki poligoni)
    if any(unutar(x, y) for x, y in t[:: max(1, len(t) // 200)]): return True
    if t:
        cx, cy = sum(p[0] for p in t) / len(t), sum(p[1] for p in t) / len(t)
        return unutar(cx, cy)
    return False


def dohvati(sloj):
    q = {"service": "WFS", "version": "1.1.0", "request": "GetFeature", "typeName": "dzzpnpis:" + sloj, "outputFormat": "application/json",
         "srsName": "EPSG:4326", "bbox": BBOX}
    r = urllib.request.Request(WFS + "?" + urllib.parse.urlencode(q), headers={"User-Agent": "web-gis-bilje"})
    with urllib.request.urlopen(r, timeout=300) as o:
        j = json.load(o)
    for f in j["features"]:
        # GeoServer s EPSG:4326 u WFS 1.1.0 vraća lat/lon – zamijeni ako treba
        pass
    return j["features"]


def zamijeni_osi(g):
    if g["type"] == "GeometryCollection":
        for x in g["geometries"]: zamijeni_osi(x)
        return
    def z(c):
        if isinstance(c[0], (int, float)): return [c[1], c[0]] + c[2:]
        return [z(x) for x in c]
    g["coordinates"] = z(g["coordinates"])


def main():
    os.makedirs(IZLAZ, exist_ok=True)
    popis = {}
    for ime, slojevi in SLOJEVI.items():
        sve = []
        for s in slojevi:
            try:
                zn = dohvati(s)
            except Exception as g:
                print("GREŠKA", s, g); continue
            for f in zn:
                if not f.get("geometry"): continue
                t = tocke(f["geometry"])
                if t and t[0][0] > 40:  # lat/lon redoslijed → okreni
                    zamijeni_osi(f["geometry"])
                if not dodiruje(f["geometry"]): continue
                p = {k: v for k, v in (f.get("properties") or {}).items() if v not in (None, "") and not k.startswith(("ogc_fid", "shape_", "fid"))}
                for k in list(p):
                    if isinstance(p[k], str): p[k] = p[k].strip()
                p["naziv"] = next((p[k] for k in NAZIV_POLJA if p.get(k)), p.get("naziv"))
                if s in VRSTA: p["vrsta"] = VRSTA[s]
                sve.append({"type": "Feature", "geometry": f["geometry"], "properties": p})
            print(f"{ime} <- {s}: {len(zn)} u obuhvatu")
        json.dump({"type": "FeatureCollection", "features": sve}, open(f"{IZLAZ}/{ime}.geojson", "w"), ensure_ascii=False, separators=(",", ":"))
        popis[ime] = len(sve)
        print(f"== {ime}: {len(sve)} objekata, {os.path.getsize(f'{IZLAZ}/{ime}.geojson') // 1024} kB")
    json.dump(popis, open(f"{IZLAZ}/popis.json", "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()
