#!/usr/bin/env python3
"""Površine ARKOD parcela po vrsti uporabe i godini (za izvješće portala) -> data/poljoprivreda/arkod/sazetak.json"""
import json, os, collections
D = "data/poljoprivreda/arkod"
st = json.load(open(f"{D}/popis.json"))["stanja"]
out = {}
for s in st:
    d = json.load(open(f"{D}/arkod_{s}.geojson"))
    c = collections.Counter(); n = 0; nav = 0
    for f in d["features"]:
        p = f["properties"]; ha = p.get("povrsina_ha") or 0
        c[p.get("kultura") or "ostalo"] += ha; n += 1; nav += ha if p.get("navodnjavanje") else 0
    out[s] = {"parcela": n, "ha": {k: round(v, 1) for k, v in c.most_common()}, "navodnjavano_ha": round(nav, 1)}
json.dump(out, open(f"{D}/sazetak.json", "w"), ensure_ascii=False, indent=0)
print({k: (v["parcela"], round(sum(v["ha"].values()))) for k, v in out.items()})
