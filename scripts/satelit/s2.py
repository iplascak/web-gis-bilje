#!/usr/bin/env python3
"""Sentinel-2 L2A (Copernicus, preko Earth Search STAC – besplatno) po poljoprivrednim parcelama Općine Bilje.

Za svaki datum snimanja i svaku parcelu (ARKOD, trenutno stanje kao prostorna jedinica) računa:
  NDVI  – bujnost/zelena masa (B08, B04)
  NDMI  – voda u biljci (B08, B11)
  sd    – raspršenost NDVI-a unutar parcele (neujednačenost usjeva)
Oblaci, sjene i snijeg maskiraju se slojem SCL; parcela ulazi u datum samo ako je ≥ 60 % piksela čisto.
Radiometrija: od Processing Baseline 04.00 (25. 1. 2022.) L2A ima pomak BOA_ADD_OFFSET = −1000;
Earth Search označava je li pomak već primijenjen (earthsearch:boa_offset_applied) – inače ga primjenjujemo ovdje.

Upotreba: s2.py <godina> [izlazna_mapa]
Izlaz: <mapa>/niz_<godina>.json i <mapa>/sezona_<godina>.tif (prosječni NDVI svibanj–kolovoz po pikselu, za zone).
"""
import json, os, sys, time
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.features import rasterize
from rasterio.transform import from_origin
from pyproj import Transformer
from pystac_client import Client

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("AWS_NO_SIGN_REQUEST", "YES")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")

GODINA = int(sys.argv[1])
IZLAZ = sys.argv[2] if len(sys.argv) > 2 else "satelit_izlaz"
JEDINICE = "data/satelit/jedinice.geojson"
BBOX = [18.69, 45.54, 18.98, 45.73]
CRS = "EPSG:32634"   # UTM 34N – mreža Sentinel-2 pločica za ovo područje
RES = 10
VALJANI_SCL = (4, 5, 6, 7)  # vegetacija, golo tlo, voda, neklasificirano; bez oblaka, sjena, snijega


def mreza():
    t = Transformer.from_crs("EPSG:4326", CRS, always_xy=True)
    xs, ys = zip(*[t.transform(x, y) for x in (BBOX[0], BBOX[2]) for y in (BBOX[1], BBOX[3])])
    x0, y1 = np.floor(min(xs) / 20) * 20, np.ceil(max(ys) / 20) * 20
    x1, y0 = np.ceil(max(xs) / 20) * 20, np.floor(min(ys) / 20) * 20
    w, h = int((x1 - x0) / RES), int((y1 - y0) / RES)
    return (x0, y0, x1, y1), from_origin(x0, y1, RES, RES), (h, w), t


def oznake(transform, oblik, t):
    jed = json.load(open(JEDINICE))["features"]
    def proj(c):
        if isinstance(c[0], (int, float)): return list(t.transform(c[0], c[1]))
        return [proj(x) for x in c]
    oblici = [({"type": f["geometry"]["type"], "coordinates": proj(f["geometry"]["coordinates"])}, i + 1) for i, f in enumerate(jed)]
    lab = rasterize(oblici, out_shape=oblik, transform=transform, fill=0, dtype="int32")
    return lab, [f["properties"]["id"] for f in jed]


def citaj(href, granice, oblik, resampling_20m=False):
    with rasterio.open(href) as ds:
        win = from_bounds(*granice, transform=ds.transform)
        return ds.read(1, window=win, out_shape=oblik, boundless=True, fill_value=0,
                       resampling=rasterio.enums.Resampling.nearest)


def refl(dn, item):
    p = item.properties
    pb = str(p.get("s2:processing_baseline") or "00.00")
    dn = dn.astype("float32")
    if pb >= "04.00" and not p.get("earthsearch:boa_offset_applied", False):
        dn = dn - 1000.0
    return dn / 10000.0


def main():
    os.makedirs(IZLAZ, exist_ok=True)
    granice, transform, oblik, t = mreza()
    lab, ids = oznake(transform, oblik, t)
    n = len(ids) + 1
    ukupno = np.bincount(lab.ravel(), minlength=n)
    print("parcela:", len(ids), "mreža:", oblik, flush=True)

    kat = Client.open("https://earth-search.aws.element84.com/v1")
    pretraga = kat.search(collections=["sentinel-2-l2a"], bbox=BBOX, datetime=f"{GODINA}-01-01/{GODINA}-12-31",
                          query={"eo:cloud_cover": {"lt": 70}}, max_items=2000)
    po_datumu = {}
    for it in pretraga.items():
        # samo pločice u UTM zoni 34 (isti koordinatni sustav kao mreža); pločice zone 33 (npr. 33TYL) se preskaču
        epsg = it.properties.get("proj:epsg") or (it.properties.get("proj:code") or "").replace("EPSG:", "")
        if str(epsg) not in ("32634",) and "_34T" not in it.id:
            continue
        po_datumu.setdefault(it.datetime.strftime("%Y-%m-%d"), []).append(it)
    datumi = sorted(po_datumu)
    print(GODINA, "datuma sa snimkama:", len(datumi), flush=True)

    rezultat = {"godina": GODINA, "datumi": [], "v": {}}
    sez_sum = np.zeros(oblik, "float32"); sez_n = np.zeros(oblik, "uint16")
    for d in datumi:
        t0 = time.time()
        ndvi = np.full(oblik, np.nan, "float32"); ndmi = np.full(oblik, np.nan, "float32")
        for it in po_datumu[d]:
            try:
                scl = citaj(it.assets["scl"].href, granice, oblik)
                ok = np.isin(scl, VALJANI_SCL) & np.isnan(ndvi)
                if not ok.any(): continue
                red = refl(citaj(it.assets["red"].href, granice, oblik), it)
                nir = refl(citaj(it.assets["nir"].href, granice, oblik), it)
                sw = refl(citaj(it.assets["swir16"].href, granice, oblik), it)
            except Exception as g:
                print("  greška", it.id, g, flush=True); continue
            with np.errstate(divide="ignore", invalid="ignore"):
                a = (nir - red) / (nir + red); b = (nir - sw) / (nir + sw)
            ok &= np.isfinite(a) & (nir > 0)
            ndvi[ok] = a[ok]; ndmi[ok] = b[ok]
        cisto = np.isfinite(ndvi) & (lab > 0)
        if cisto.sum() == 0:
            print(d, "oblačno", flush=True); continue
        l = lab[cisto]; v = ndvi[cisto]; w = np.nan_to_num(ndmi[cisto])
        cnt = np.bincount(l, minlength=n); s1 = np.bincount(l, v, n); s2 = np.bincount(l, v * v, n); m1 = np.bincount(l, w, n)
        dobro = (cnt >= 0.6 * np.maximum(ukupno, 1)) & (ukupno > 0)
        dobro[0] = False
        k = np.nonzero(dobro)[0]
        if len(k) == 0:
            print(d, "premalo čistih parcela", flush=True); continue
        i = len(rezultat["datumi"]); rezultat["datumi"].append(d)
        sr = s1[k] / cnt[k]; sd = np.sqrt(np.maximum(s2[k] / cnt[k] - sr * sr, 0)); md = m1[k] / cnt[k]
        for j, a, b, c in zip(k, sr, md, sd):
            rezultat["v"].setdefault(ids[j - 1], []).append([i, round(float(a), 3), round(float(b), 3), round(float(c), 3)])
        mj = int(d[5:7])
        if 5 <= mj <= 8:
            m = np.isfinite(ndvi); sez_sum[m] += ndvi[m]; sez_n[m] += 1
        print(d, "parcela:", len(k), f"{time.time() - t0:.0f}s", flush=True)

    import gzip
    with gzip.open(f"{IZLAZ}/niz_{GODINA}.json.gz", "wt") as f: json.dump(rezultat, f, separators=(",", ":"))
    sez = np.where(sez_n > 0, sez_sum / np.maximum(sez_n, 1), np.nan)
    sez8 = np.where(np.isfinite(sez), np.clip((sez + 0.2) / 1.2 * 250, 0, 250), 255).astype("uint8")  # 255 = nema podatka
    with rasterio.open(f"{IZLAZ}/sezona_{GODINA}.tif", "w", driver="GTiff", height=oblik[0], width=oblik[1], count=1, dtype="uint8",
                       crs=CRS, transform=transform, nodata=255, compress="deflate") as ds:
        ds.write(sez8, 1)
    print("gotovo:", len(rezultat["datumi"]), "datuma", flush=True)


if __name__ == "__main__":
    main()
