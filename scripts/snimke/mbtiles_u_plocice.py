#!/usr/bin/env python3
"""MBTiles (npr. izvoz iz QGIS-a) -> mapa XYZ pločica u WebP-u za portal.

    python scripts/snimke/mbtiles_u_plocice.py ulaz.mbtiles data/podloge/<naziv> [--kvaliteta 72]

Ispisuje obuhvat (EPSG:3857) i raspon zoomova za config/portal.json -> "preklopi".
Prazne (potpuno bijele ili prozirne) pločice se preskaču.
"""
import argparse, io, json, math, pathlib, sqlite3
import numpy as np
from PIL import Image

R = 20037508.342789244

ap = argparse.ArgumentParser()
ap.add_argument("ulaz"); ap.add_argument("izlaz"); ap.add_argument("--kvaliteta", type=int, default=72)
a = ap.parse_args()
db = sqlite3.connect(a.ulaz)
meta = dict(db.execute("select name, value from metadata"))
izlaz = pathlib.Path(a.izlaz)
broj = bajtova = 0
zoomovi = set()
for z, x, y_tms, podaci in db.execute("select zoom_level, tile_column, tile_row, tile_data from tiles"):
    y = (2 ** z - 1) - y_tms
    slika = Image.open(io.BytesIO(podaci)).convert("RGBA")
    arr = np.asarray(slika)
    prazno = (arr[..., 3] == 0) | (arr[..., :3].min(axis=2) >= 250) | (arr[..., :3].max(axis=2) <= 3)
    if prazno.all():
        continue
    if prazno.any():
        arr = arr.copy(); arr[prazno, 3] = 0; slika = Image.fromarray(arr)
    p = izlaz / str(z) / str(x); p.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO(); slika.save(buf, "WEBP", quality=a.kvaliteta, method=5)
    (p / f"{y}.webp").write_bytes(buf.getvalue())
    broj += 1; bajtova += buf.tell(); zoomovi.add(z)
b = [float(v) for v in meta.get("bounds", "-180,-85,180,85").split(",")]
merc = lambda lon, lat: (lon / 180 * R, math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) / math.pi * R)
x0, y0 = merc(b[0], b[1]); x1, y1 = merc(b[2], b[3])
print(json.dumps({"plocica": broj, "MB": round(bajtova / 1e6, 1), "zoom": [min(zoomovi), max(zoomovi)],
                  "extent": [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)], "metadata": meta}, ensure_ascii=False, indent=1))
