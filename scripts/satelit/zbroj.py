#!/usr/bin/env python3
"""Spaja godišnje satelitske nizove u proizvode za portal (sve na granu 'satelit', ne u glavni repozitorij):
  p/<k>.json       – nizovi po parceli (sve godine), 64 datoteke po ključu
  stanje.geojson   – parcele sa sažetkom tekuće sezone (za kartu)
  zone.png/.json   – zone unutar parcela (višegodišnji prosjek NDVI-a svibanj–kolovoz, relativno prema parceli)
  sazetak.json     – godine, zadnji datum, broj parcela
Upotreba: zbroj.py <mapa_izvor> <izlazna_mapa>"""
import datetime as dt, glob, gzip, json, os, sys, zlib
import numpy as np
import rasterio
from rasterio.warp import reproject, Resampling, transform_bounds

sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
IZVOR, IZLAZ = sys.argv[1], sys.argv[2]
os.makedirs(f"{IZLAZ}/p", exist_ok=True)

jed = json.load(open("data/satelit/jedinice.geojson"))["features"]
ids = [f["properties"]["id"] for f in jed]
nizovi = {}
godine = []
for put in sorted(glob.glob(f"{IZVOR}/niz_*.json.gz")):
    r = json.load(gzip.open(put, "rt"))
    g = r["godina"]; godine.append(g)
    doy = [dt.date.fromisoformat(d).timetuple().tm_yday for d in r["datumi"]]
    for pid, obs in r["v"].items():
        nizovi.setdefault(pid, {})[str(g)] = [[doy[i], a, b, c] for i, a, b, c in obs]
godine.sort()
tek = godine[-1] if godine else dt.date.today().year
zadnji = None
for put in glob.glob(f"{IZVOR}/niz_{tek}.json.gz"):
    r = json.load(gzip.open(put, "rt")); zadnji = r["datumi"][-1] if r["datumi"] else None

kljuc = lambda pid: zlib.crc32(pid.encode()) % 64
paketi = {}
for pid, s in nizovi.items():
    paketi.setdefault(kljuc(pid), {})[pid] = s
for k, v in paketi.items():
    json.dump(v, open(f"{IZLAZ}/p/{k}.json", "w"), separators=(",", ":"))


def interp(obs, d):
    if not obs: return None
    xs = [o[0] for o in obs]; ys = [o[1] for o in obs]
    if d < xs[0] - 15 or d > xs[-1] + 15: return None
    return float(np.interp(d, xs, ys))


# zone unutar parcela
zone_udio = {}
tifovi = sorted(glob.glob(f"{IZVOR}/sezona_*.tif"))
if tifovi:
    slojevi = []
    for t in tifovi:
        with rasterio.open(t) as ds:
            a = ds.read(1).astype("float32"); prof = ds.profile; tr = ds.transform; crs = ds.crs
        a[a == 255] = np.nan; slojevi.append(a / 250 * 1.2 - 0.2)
    with np.errstate(all="ignore"):
        prosjek = np.nanmean(np.stack(slojevi), axis=0)
    spec = importlib.util.spec_from_file_location("s2", os.path.join(os.path.dirname(__file__), "s2.py"))
    from rasterio.features import rasterize
    from pyproj import Transformer
    t4 = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    def proj(c):
        if isinstance(c[0], (int, float)): return list(t4.transform(c[0], c[1]))
        return [proj(x) for x in c]
    lab = rasterize([({"type": f["geometry"]["type"], "coordinates": proj(f["geometry"]["coordinates"])}, i + 1) for i, f in enumerate(jed)],
                    out_shape=prosjek.shape, transform=tr, fill=0, dtype="int32")
    n = len(ids) + 1
    ok = (lab > 0) & np.isfinite(prosjek)
    cnt = np.bincount(lab[ok], minlength=n); s = np.bincount(lab[ok], prosjek[ok], n)
    sred = np.where(cnt > 0, s / np.maximum(cnt, 1), np.nan)
    rel = np.full(prosjek.shape, np.nan, "float32")
    rel[ok] = prosjek[ok] / np.maximum(sred[lab[ok]], 0.05)
    razred = np.zeros(prosjek.shape, "uint8")
    razred[ok & (rel < 0.9)] = 1; razred[ok & (rel >= 0.9) & (rel <= 1.1)] = 2; razred[ok & (rel > 1.1)] = 3
    for j in range(1, n):
        if cnt[j] < 20: continue
    c1 = np.bincount(lab[razred == 1], minlength=n); c3 = np.bincount(lab[razred == 3], minlength=n)
    for j in range(1, n):
        if cnt[j] >= 20:
            zone_udio[ids[j - 1]] = (round(100 * c1[j] / cnt[j]), round(100 * c3[j] / cnt[j]))
    # obojena slika u Web Mercatoru
    boje = np.array([[0, 0, 0, 0], [214, 96, 77, 190], [250, 240, 180, 110], [26, 152, 80, 190]], "uint8")
    dst_crs = "EPSG:3857"
    l, b, r, t = transform_bounds(crs, dst_crs, *rasterio.transform.array_bounds(prosjek.shape[0], prosjek.shape[1], tr))
    sir = int(prosjek.shape[1] * 1.45); vis = int(prosjek.shape[0] * 1.45)
    dst_tr = rasterio.transform.from_bounds(l, b, r, t, sir, vis)
    cilj = np.zeros((vis, sir), "uint8")
    reproject(razred, cilj, src_transform=tr, src_crs=crs, dst_transform=dst_tr, dst_crs=dst_crs, resampling=Resampling.nearest)
    from PIL import Image
    Image.fromarray(boje[cilj], "RGBA").save(f"{IZLAZ}/zone.png", optimize=True)
    json.dump({"obuhvat": [l, b, r, t], "godine": [int(os.path.basename(x)[7:11]) for x in tifovi]}, open(f"{IZLAZ}/zone.json", "w"))

# sažetak po parceli za kartu
danas_doy = dt.date.fromisoformat(zadnji).timetuple().tm_yday if zadnji else None
znacajke = []
for f in jed:
    pid = f["properties"]["id"]; s = nizovi.get(pid, {})
    obs = s.get(str(tek), [])
    p = dict(f["properties"])
    if obs:
        d, nd, nm, sd = obs[-1]
        prijasnje = [interp(s[str(g)], d) for g in godine if g != tek and str(g) in s]
        prijasnje = [x for x in prijasnje if x is not None]
        ref = float(np.median(prijasnje)) if len(prijasnje) >= 2 else None
        razlika = round(nd - ref, 2) if ref is not None else None
        if razlika is None: stanje = "nema usporedbe"
        elif nd < 0.3 and ref < 0.3: stanje = "golo tlo / mirovanje"
        elif razlika <= -0.15: stanje = "znatno slabije"
        elif razlika <= -0.07: stanje = "slabije"
        elif razlika >= 0.07: stanje = "bujnije"
        else: stanje = "uobičajeno"
        p.update({"zadnji_datum": (dt.date(tek, 1, 1) + dt.timedelta(days=d - 1)).isoformat(), "ndvi": nd, "ndmi": nm, "ndvi_sd": sd,
                  "ndvi_uobicajeno": round(ref, 2) if ref is not None else None, "razlika": razlika, "stanje": stanje})
    else:
        p["stanje"] = "nema snimke"
    if pid in zone_udio: p["zona_slabija_pct"], p["zona_jaca_pct"] = zone_udio[pid]
    znacajke.append({"type": "Feature", "geometry": f["geometry"], "properties": p})
json.dump({"type": "FeatureCollection", "features": znacajke}, open(f"{IZLAZ}/stanje.geojson", "w"), ensure_ascii=False, separators=(",", ":"))
json.dump({"godine": godine, "tekuca": tek, "zadnji_datum": zadnji, "parcela": len(nizovi),
           "izracunato": dt.datetime.utcnow().isoformat(timespec="minutes") + "Z"}, open(f"{IZLAZ}/sazetak.json", "w"))
print("godine", godine, "parcela s podacima", len(nizovi), "zadnji datum", zadnji)
