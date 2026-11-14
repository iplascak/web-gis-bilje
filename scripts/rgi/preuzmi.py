#!/usr/bin/env python3
"""Službena geografska imena (toponimi) DGU – Registar geografskih imena (RGI), za područje općine.
WFS https://rgi.dgu.hr/geoserver/wfshr/wfs (nippimenovanomjesto)."""
import collections, json, os, urllib.parse, urllib.request

GRANICA = []
for f in json.load(open("data/granica_opcine.geojson"))["features"]:
    g = f["geometry"]
    for p in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]): GRANICA.append(p[0])


def unutar(x, y):
    ima = False
    for r in GRANICA:
        for (x1, y1), (x2, y2) in zip(r, r[1:]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ima = not ima
    return ima


def tocke(g):
    t = g["coordinates"]
    if g["type"] == "Point": return [t]
    while t and isinstance(t[0], list) and t[0] and isinstance(t[0][0], list): t = [q for x in t for q in x]
    return t


q = {"service": "WFS", "version": "1.1.0", "request": "GetFeature", "typeName": "wfshr:nippimenovanomjesto", "outputFormat": "application/json",
     "srsName": "EPSG:4326", "bbox": "671406,5047223,692946,5067583,EPSG:3765"}
j = json.load(urllib.request.urlopen(urllib.request.Request("https://rgi.dgu.hr/geoserver/wfshr/wfs?" + urllib.parse.urlencode(q),
                                                            headers={"User-Agent": "web-gis-bilje"}), timeout=180))
zn = []
for f in j["features"]:
    g = f.get("geometry")
    if not g: continue
    t = tocke(g)
    if t and t[0][0] > 40:  # lat/lon → lon/lat
        def z(c): return [c[1], c[0]] if isinstance(c[0], (int, float)) else [z(x) for x in c]
        g["coordinates"] = z(g["coordinates"]); t = tocke(g)
    if not any(unutar(x, y) for x, y in t[:: max(1, len(t) // 50)]): continue
    p = f["properties"]
    zn.append({"type": "Feature", "geometry": g, "properties": {"naziv": p.get("geografskoime"), "vrsta": p.get("vrstaobiljezja"),
                                                               "status": p.get("status"), "jezik": p.get("jezik"), "id": p.get("identifikator")}})
os.makedirs("data/rgi", exist_ok=True)
json.dump({"type": "FeatureCollection", "features": zn}, open("data/rgi/toponimi.geojson", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(zn), "imena;", collections.Counter(f["geometry"]["type"] for f in zn), collections.Counter(f["properties"]["vrsta"] for f in zn).most_common(40))
