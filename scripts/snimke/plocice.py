"""XYZ pločice (EPSG:3857, WebP s prozirnošću) iz ortofota (npr. snimke groblja dronom).

Pokretanje: python scripts/snimke/plocice.py ulaz.tif data/groblja/<naselje> 15 21
Potrebno: pip install rasterio shapely pyproj pillow numpy
Izlaz: <dir>/{z}/{x}/{y}.webp i obris.json (obuhvat snimke, WGS84).
"""
import io, json, math, pathlib, sys
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, transform_bounds
from rasterio.transform import from_bounds
from rasterio import features
from PIL import Image

R = 20037508.342789244
def tile_bounds(z, x, y):
    n = 2 ** z; s = 2 * R / n
    return (-R + x * s, R - (y + 1) * s, -R + (x + 1) * s, R - y * s)
def tile_range(b, z):
    n = 2 ** z; s = 2 * R / n
    return (int((b[0] + R) // s), int((R - b[3]) // s), int((b[2] + R) // s), int((R - b[1]) // s))

izvor, izlaz, zmin, zmax = sys.argv[1], pathlib.Path(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
with rasterio.open(izvor) as d:
    rgb = d.read()
    maska = d.dataset_mask()
    b3857 = transform_bounds(d.crs, "EPSG:3857", *d.bounds)
    # obris snimljenog područja (za sloj s nazivima groblja)
    oblici = [g for g, v in features.shapes((maska > 0).astype("uint8"), transform=d.transform) if v == 1]
    broj = 0; velicina = 0
    for z in range(zmin, zmax + 1):
        x0, y0, x1, y1 = tile_range(b3857, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                tb = tile_bounds(z, x, y)
                tr = from_bounds(*tb, 256, 256)
                dst = np.zeros((3, 256, 256), np.uint8)
                alfa = np.zeros((256, 256), np.uint8)
                rs = Resampling.average if z < zmax else Resampling.bilinear
                for i in range(3):
                    reproject(rgb[i], dst[i], src_transform=d.transform, src_crs=d.crs,
                              dst_transform=tr, dst_crs="EPSG:3857", resampling=rs)
                reproject(maska, alfa, src_transform=d.transform, src_crs=d.crs,
                          dst_transform=tr, dst_crs="EPSG:3857", resampling=Resampling.nearest)
                if alfa.max() == 0:
                    continue
                img = Image.fromarray(np.dstack([dst.transpose(1, 2, 0), alfa]), "RGBA")
                p = izlaz / str(z) / str(x); p.mkdir(parents=True, exist_ok=True)
                buf = io.BytesIO(); img.save(buf, "WEBP", quality=78, method=6)
                (p / f"{y}.webp").write_bytes(buf.getvalue())
                broj += 1; velicina += len(buf.getvalue())
print(json.dumps({"plocica": broj, "MB": round(velicina / 1e6, 1), "extent3857": [round(v, 1) for v in b3857]}))
import shapely.geometry as sg, shapely.ops as so
from pyproj import Transformer
poli = so.unary_union([sg.shape(o) for o in oblici]).buffer(0.5).buffer(-0.5).simplify(0.5)
t = Transformer.from_crs(3765, 4326, always_xy=True)
poli84 = sg.shape(sg.mapping(so.transform(t.transform, poli.convex_hull)))
(izlaz / "obris.json").write_text(json.dumps(sg.mapping(poli84)))
