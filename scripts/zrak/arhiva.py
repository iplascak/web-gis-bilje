#!/usr/bin/env python3
"""Dnevna arhiva kvalitete zraka za godišnje izvješće.
Svaki sat dodaje novo satno mjerenje u dnevni zbroj (po postaji i tvari):
  arhiva[postaja][tvar][YYYY-MM-DD] = [zbroj, broj_sati, najveća, najlošiji_razred, zadnje_vrijeme]
Uporaba: arhiva.py zrak.geojson stara_arhiva.json(ili prazno) izlaz.json"""
import json, sys, re
zrak = json.load(open(sys.argv[1]))
try: a = json.load(open(sys.argv[2]))
except Exception: a = {}
for f in zrak["features"]:
    p = f["properties"]; st = a.setdefault(p["naziv"], {})
    for tvar, m in (p.get("mjerenja") or {}).items():
        v = m.get("vrijednost"); t = m.get("vrijeme") or ""
        x = re.match(r"\s*(\d+)\.(\d+)\.(\d{4})\.?\s+(\d+):", t)
        if v is None or not x: continue
        dan = f"{x[3]}-{int(x[2]):02d}-{int(x[1]):02d}"
        d = st.setdefault(tvar, {}).setdefault(dan, [0, 0, 0, 0, ""])
        if d[4] == t: continue
        d[0] = round(d[0] + v, 2); d[1] += 1; d[2] = max(d[2], v)
        d[3] = max(d[3], m.get("razred") or 0); d[4] = t
json.dump(a, open(sys.argv[3], "w"), ensure_ascii=False, separators=(",", ":"))
