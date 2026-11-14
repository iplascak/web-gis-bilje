#!/usr/bin/env python3
"""
Satelitska analiza elementarne nepogode za portal.

Pokretanje (lokalno ili kroz GitHub Actions):
    python scripts/nepogode/analiza.py --id susa-2026

Čita zapis iz config/nepogode.json, preuzima snimke Sentinel-2 L2A s javnog
STAC kataloga Earth Search (AWS, besplatno, bez prijave), računa proizvode i
zapisuje ih u data/nepogode/<id>/:
    odstupanje.png    – obojena karta (EPSG:3857) za prikaz na portalu
    parcele.geojson   – prosjek po ARKOD parceli i razred odstupanja
    manifest.json     – popis korištenih snimaka, parametri i provjere kvalitete
Na kraju upisuje rezultate i status 'obradeno' u config/nepogode.json.

Metode:
    ndvi_anomalija – suša, toplinski val: godina nepogode prema referentnim godinama
    ndvi_promjena  – tuča, oluja, požar: razdoblje poslije prema razdoblju prije
    s1_voda        – poplava (u pripremi)

Napomena o Sentinel-2: od Processing Baseline 04.00 (25. 1. 2022.) L2A brojevi
sadrže pomak BOA_ADD_OFFSET = -1000. Pomak se primjenjuje po snimci, prema
njezinim metapodacima, i bilježi u manifestu, kako se godine prije i poslije
2022. ne bi usporedile pogrešno.
"""
import argparse
import datetime as dt
import json
import pathlib
import sys

import geopandas as gpd
import numpy as np
import odc.stac
import pystac_client
import rasterio.features
import rioxarray  # noqa: F401  (registrira .rio)
import xarray as xr
from PIL import Image

KORIJEN = pathlib.Path(__file__).resolve().parents[2]
STAC_URL = "https://earth-search.aws.element84.com/v1"
KOLEKCIJA = "sentinel-2-l2a"
UTM = "EPSG:32634"
SCL_VALJANO = (4, 5)  # vegetacija, golo tlo; oblaci, sjene, voda i snijeg se odbacuju

# razredi odstupanja NDVI-ja (razlika prema referenci) – isti za kartu i parcele
RAZREDI = [
    (-9.0, -0.20, "#8c510a", "izrazito ispod prosjeka", "izrazito_ispod"),
    (-0.20, -0.10, "#d8b365", "znatno ispod prosjeka", "znatno_ispod"),
    (-0.10, -0.05, "#f6e8c3", "blago ispod prosjeka", "blago_ispod"),
    (-0.05, 0.05, "#e5e7eb", "uobičajeno", "uobicajeno"),
    (0.05, 0.10, "#c7eae5", "blago iznad prosjeka", "blago_iznad"),
    (0.10, 9.0, "#35978f", "iznad prosjeka", "iznad"),
]


def log(*a):
    print(*a, flush=True)


def ucitaj_json(p):
    return json.loads((KORIJEN / p).read_text(encoding="utf-8"))


def pomak_snimke(item):
    """BOA_ADD_OFFSET za snimku (u DN), prema baselineu i oznaci Earth Searcha."""
    p = item.properties
    baseline = float(p.get("s2:processing_baseline", "0") or 0)
    vec_primijenjen = bool(p.get("earthsearch:boa_offset_applied", False))
    pomak = -1000 if (baseline >= 4.0 and not vec_primijenjen) else 0
    return pomak, baseline, vec_primijenjen


def ndvi_kompozit(bbox, od, do, max_oblacnost, rezolucija, opis, manifest):
    """Medijan NDVI-ja za razdoblje [od, do] uz SCL masku; vraća (ndvi, broj_opazanja)."""
    klijent = pystac_client.Client.open(STAC_URL)
    items = klijent.search(collections=[KOLEKCIJA], bbox=bbox, datetime=f"{od}/{do}",
                           query={"eo:cloud_cover": {"lt": max_oblacnost}}).item_collection()
    # Ista pločica i datum mogu postojati u više obrada (izvorna i reprocesirana).
    # Zadržava se po jedna: prednost ima ona kojoj pomak ne treba ručno primjenjivati.
    najbolje = {}
    for it in items:
        k = (it.properties.get("s2:mgrs_tile") or it.properties.get("grid:code"), it.datetime.date())
        rang = 1 if pomak_snimke(it)[0] else 0
        if k not in najbolje or rang < najbolje[k][0]:
            najbolje[k] = (rang, it)
    uklonjeno = len(items) - len(najbolje)
    items = [v[1] for v in najbolje.values()]
    zapis = {"razdoblje": [od, do], "broj_snimaka": len(items), "uklonjeni_duplikati": uklonjeno, "snimke": []}
    manifest["kompoziti"][opis] = zapis
    if len(items) == 0:
        log(f"  {opis}: nema snimaka")
        return None, None

    # pomak po solarnom danu (odc.stac grupira snimke istog prolaza)
    lon_sred = (bbox[0] + bbox[2]) / 2
    pomaci = {}
    for it in items:
        pomak, baseline, primijenjen = pomak_snimke(it)
        dan = (it.datetime + dt.timedelta(hours=lon_sred / 15)).date()
        pomaci.setdefault(dan, pomak)
        zapis["snimke"].append({"id": it.id, "datum": it.datetime.date().isoformat(),
                                "baseline": baseline, "offset_vec_primijenjen": primijenjen,
                                "primijenjeni_pomak_dn": pomak, "oblacnost": it.properties.get("eo:cloud_cover")})

    ds = odc.stac.load(items, bands=["red", "nir", "scl"], crs=UTM, resolution=rezolucija,
                       bbox=bbox, groupby="solar_day", chunks={}, fail_on_error=False).compute()
    dani = [np.datetime64(t, "D").astype(object) for t in ds.time.values]
    pomak = xr.DataArray([pomaci.get(d, 0) for d in dani], dims="time", coords={"time": ds.time})
    red = ds.red.astype("float32")
    nir = ds.nir.astype("float32")
    valjano = (red > 0) & (nir > 0) & ds.scl.isin(SCL_VALJANO)
    r = (red + pomak) / 10000.0
    n = (nir + pomak) / 10000.0
    zbroj = n + r
    ndvi = ((n - r) / zbroj).where(valjano & (zbroj > 0))
    broj = ndvi.count("time")
    kompozit = ndvi.median("time").where(broj >= 2)
    udio = float(np.isfinite(kompozit.values).mean())
    zapis.update({"broj_dana": int(ds.sizes["time"]), "udio_valjanih_piksela": round(udio, 3),
                  "srednji_ndvi": round(float(np.nanmean(kompozit.values)), 3)})
    log(f"  {opis}: {len(items)} snimaka (uklonjeno duplikata: {uklonjeno}), {ds.sizes['time']} dana, valjano {udio:.0%}, "
        f"srednji NDVI {zapis['srednji_ndvi']}")
    return kompozit, broj


def razred(v):
    for lo, hi, boja, oznaka, kod in RAZREDI:
        if lo <= v < hi:
            return kod, oznaka
    return None, None


def oboji(arr):
    """RGBA slika prema razredima; NaN je proziran."""
    h, w = arr.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    for lo, hi, boja, _, _ in RAZREDI:
        m = (arr >= lo) & (arr < hi)
        rgba[m, 0] = int(boja[1:3], 16)
        rgba[m, 1] = int(boja[3:5], 16)
        rgba[m, 2] = int(boja[5:7], 16)
        rgba[m, 3] = 200
    return rgba


def zapisi_sliku(odstupanje_utm, granica, izlaz):
    da = odstupanje_utm.rio.write_crs(UTM).rio.write_nodata(np.nan)
    da = da.rio.reproject("EPSG:3857", nodata=np.nan)
    da = da.rio.clip(granica.to_crs(3857).geometry, all_touched=True, drop=True)
    vrijednosti = da.values.squeeze()
    Image.fromarray(oboji(vrijednosti), "RGBA").save(izlaz, optimize=True)
    minx, miny, maxx, maxy = da.rio.bounds()
    return [round(minx, 2), round(miny, 2), round(maxx, 2), round(maxy, 2)]


def po_parcelama(odstupanje, ciljni, referentni, z, parcele_utm):
    """Prosjeci po ARKOD parceli (rasterizacija na mrežu rezultata)."""
    transform = odstupanje.rio.transform()
    oblik = odstupanje.shape
    oznake = rasterio.features.rasterize(
        ((geom, i + 1) for i, geom in enumerate(parcele_utm.geometry)),
        out_shape=oblik, transform=transform, fill=0, dtype="int32", all_touched=False)
    n = len(parcele_utm) + 1
    rezultat = {}
    for ime, da in (("odstupanje", odstupanje), ("ndvi", ciljni), ("ndvi_ref", referentni), ("z", z)):
        v = da.values
        ok = np.isfinite(v) & (oznake > 0)
        zbroj = np.bincount(oznake[ok], weights=v[ok], minlength=n)
        broj = np.bincount(oznake[ok], minlength=n)
        rezultat[ime] = np.where(broj > 0, zbroj / np.maximum(broj, 1), np.nan)
        rezultat["broj"] = broj
    ukupno = np.bincount(oznake.ravel(), minlength=n)
    rezultat["udio_valjanih"] = np.where(ukupno > 0, rezultat["broj"] / np.maximum(ukupno, 1), 0)
    return rezultat


def analiza_ndvi(nepogoda, granica, parcele, izlaz_dir, manifest):
    a = nepogoda["analiza"]
    bbox = list(granica.to_crs(4326).total_bounds)
    rez = a.get("rezolucija_m", 20)
    oblak = a.get("max_oblacnost", 70)

    if a["metoda"] == "ndvi_anomalija":
        g = a["godina"]
        od_md, do_md = a["razdoblje"]
        ciljni, _ = ndvi_kompozit(bbox, f"{g}-{od_md}", f"{g}-{do_md}", oblak, rez, f"godina {g}", manifest)
        ref = []
        for rg in a["referentne_godine"]:
            k, _ = ndvi_kompozit(bbox, f"{rg}-{od_md}", f"{rg}-{do_md}", oblak, rez, f"referenca {rg}", manifest)
            if k is not None:
                ref.append(k)
        if ciljni is None or len(ref) < 3:
            raise SystemExit("Premalo snimaka za analizu (treba godina nepogode i barem 3 referentne godine).")
        ref_stack = xr.concat([r.reindex_like(ciljni, method="nearest") for r in ref], dim="godina")
        broj_ref = ref_stack.count("godina")
        referentni = ref_stack.mean("godina").where(broj_ref >= 3)
        std = ref_stack.std("godina").where(broj_ref >= 3)
        opis_ref = f"prosjek {len(ref)} referentnih godina ({a['referentne_godine'][0]}–{a['referentne_godine'][-1]})"
    elif a["metoda"] == "ndvi_promjena":
        referentni, _ = ndvi_kompozit(bbox, *a["prije"], oblak, rez, "prije", manifest)
        ciljni, _ = ndvi_kompozit(bbox, *a["poslije"], oblak, rez, "poslije", manifest)
        if referentni is None or ciljni is None:
            raise SystemExit("Nema dovoljno snimaka prije ili poslije događaja.")
        referentni = referentni.reindex_like(ciljni, method="nearest")
        std = xr.full_like(ciljni, np.nan)
        opis_ref = f"razdoblje prije događaja ({a['prije'][0]} – {a['prije'][1]})"
    else:
        raise SystemExit(f"Metoda '{a['metoda']}' još nije podržana.")

    odstupanje = (ciljni - referentni)
    z = odstupanje / np.maximum(std, 0.05)
    for da in (odstupanje, ciljni, referentni, z):
        da.rio.write_crs(UTM, inplace=True)

    extent = zapisi_sliku(odstupanje, granica, izlaz_dir / "odstupanje.png")

    # parcele
    p_utm = parcele.to_crs(UTM)
    s = po_parcelama(odstupanje, ciljni, referentni, z, p_utm)
    znacajke = []
    statistika = {k[4]: 0.0 for k in RAZREDI}
    for i, red in enumerate(parcele.itertuples(index=False), start=1):
        if s["udio_valjanih"][i] < 0.3 or not np.isfinite(s["odstupanje"][i]):
            kod, oznaka = "nema_podataka", "nema dovoljno podataka"
        else:
            kod, oznaka = razred(s["odstupanje"][i])
            statistika[kod] += float(red.povrsina_ha)
        znacajke.append({
            "type": "Feature",
            "geometry": red.geometry.__geo_interface__,
            "properties": {
                "arkod_id": None if red.arkod_id is None or red.arkod_id != red.arkod_id else int(red.arkod_id),
                "kultura": red.kultura,
                "povrsina_ha": float(red.povrsina_ha),
                "razred": kod, "razred_opis": oznaka,
                "odstupanje": None if not np.isfinite(s["odstupanje"][i]) else round(float(s["odstupanje"][i]), 3),
                "ndvi": None if not np.isfinite(s["ndvi"][i]) else round(float(s["ndvi"][i]), 3),
                "ndvi_ref": None if not np.isfinite(s["ndvi_ref"][i]) else round(float(s["ndvi_ref"][i]), 3),
                "z": None if not np.isfinite(s["z"][i]) else round(float(s["z"][i]), 2),
                "udio_valjanih": round(float(s["udio_valjanih"][i]), 2),
            },
        })
    (izlaz_dir / "parcele.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": znacajke}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    ukupno = sum(statistika.values()) or 1
    return {
        "slika": {"url": f"data/nepogode/{nepogoda['id']}/odstupanje.png", "extent": extent},
        "parcele": f"data/nepogode/{nepogoda['id']}/parcele.geojson",
        "manifest": f"data/nepogode/{nepogoda['id']}/manifest.json",
        "referenca": opis_ref,
        "legenda": [{"kod": k, "boja": b, "oznaka": o} for _, _, b, o, k in RAZREDI],
        "statistika_ha": {k: round(v, 1) for k, v in statistika.items()},
        "statistika_udio": {k: round(v / ukupno, 3) for k, v in statistika.items()},
        "srednje_odstupanje_parcela": round(float(np.nanmean(s["odstupanje"][1:])), 3),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="id nepogode iz config/nepogode.json")
    args = ap.parse_args()

    cfg_put = KORIJEN / "config/nepogode.json"
    cfg = json.loads(cfg_put.read_text(encoding="utf-8"))
    nepogoda = next((n for n in cfg["nepogode"] if n["id"] == args.id), None)
    if not nepogoda:
        sys.exit(f"Nepogoda '{args.id}' ne postoji u config/nepogode.json")

    granica = gpd.read_file(KORIJEN / "data/granica_opcine.geojson")
    parcele = gpd.read_file(KORIJEN / "data/izvori/arkod_2023.geojson")
    izlaz_dir = KORIJEN / "data/nepogode" / nepogoda["id"]
    izlaz_dir.mkdir(parents=True, exist_ok=True)

    manifest = {"nepogoda": nepogoda["id"], "stac": STAC_URL, "kolekcija": KOLEKCIJA,
                "parametri": nepogoda["analiza"], "scl_valjani_razredi": list(SCL_VALJANO),
                "pokrenuto": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "kompoziti": {}}
    log(f"Analiza: {nepogoda['naziv']} ({nepogoda['analiza']['metoda']})")
    rezultati = analiza_ndvi(nepogoda, granica, parcele, izlaz_dir, manifest)
    rezultati["datum_obrade"] = dt.date.today().isoformat()
    (izlaz_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")

    nepogoda["rezultati"] = rezultati
    nepogoda["status"] = "obradeno"
    cfg_put.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log("Gotovo:", json.dumps(rezultati["statistika_udio"], ensure_ascii=False))


if __name__ == "__main__":
    main()
