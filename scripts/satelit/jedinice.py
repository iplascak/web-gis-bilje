#!/usr/bin/env python3
"""Prostorne jedinice za satelitsko praćenje: poljoprivredne parcele iz ARKOD-a (trenutno stanje),
sa stabilnom oznakom izvedenom iz položaja središta (ne mijenja se dok se parcela ne promijeni)."""
import json
d = json.load(open("data/poljoprivreda/arkod/arkod_trenutno.geojson"))
out, vidjeno = [], set()
for f in d["features"]:
    g = f["geometry"]
    t = g["coordinates"]
    while isinstance(t[0][0], list): t = [q for x in t for q in x]
    cx = sum(p[0] for p in t) / len(t); cy = sum(p[1] for p in t) / len(t)
    pid = f"p{round(cx * 1e4):d}{round(cy * 1e4):d}"
    if pid in vidjeno: continue
    vidjeno.add(pid)
    p = f["properties"]
    out.append({"type": "Feature", "geometry": g, "properties": {"id": pid, "kultura": p.get("kultura"), "arkod_vrsta": p.get("arkod_vrsta"),
                                                               "povrsina_ha": p.get("povrsina_ha")}})
json.dump({"type": "FeatureCollection", "features": out}, open("data/satelit/jedinice.geojson", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "jedinica")
