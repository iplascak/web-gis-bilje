#!/usr/bin/env python3
"""
Povezuje općinske registre s katastarskim česticama i izrađuje slojeve za portal.

Ulaz:  data/izvori/registar_imovine.csv, data/izvori/registar_komunalne_infrastrukture.csv
       (izrađuje ih scripts/registri/procitaj_pdf.py iz PDF-ova s bilje.hr)
Katastar: aktualne čestice s DGU-ovog INSPIRE ATOM servisa (jedna ZIP datoteka po k.o.)
Izlaz: data/opcinska_imovina.geojson
       data/komunalna_infrastruktura.geojson
       data/izvori/registri_neupareno.csv  – zapisi čija čestica nije pronađena
Pokreće se kroz GitHub Actions ('Registri općine'), jer treba pristup internetu.
"""
import csv
import io
import json
import pathlib
import re
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

import geopandas as gpd
import pandas as pd

KORIJEN = pathlib.Path(__file__).resolve().parents[2]
ATOM = "https://oss.uredjenazemlja.hr/oss/public/atom/atom_feed.xml"
ZAGLAVLJA = {"User-Agent": "WebGIS-Opcina-Bilje/1.0"}
KO_NAZIVI = {"300055": "Bilje", "300209": "Kopačevo", "300241": "Lug", "300322": "Vardarac"}


def dohvati(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=ZAGLAVLJA), timeout=180) as o:
        return o.read()


def zip_adrese():
    xml = ET.fromstring(dohvati(ATOM))
    adrese = {}
    for el in xml.iter():
        href = el.attrib.get("href", "")
        m = re.search(r"(\d{6})\.zip$", href)
        if m:
            adrese[m.group(1)] = href
    return adrese


def cestice_ko(ko, url):
    sadrzaj = dohvati(url)
    with tempfile.TemporaryDirectory() as tmp:
        zipfile.ZipFile(io.BytesIO(sadrzaj)).extractall(tmp)
        datoteke = sorted(pathlib.Path(tmp).rglob("*.gml")) + sorted(pathlib.Path(tmp).rglob("*.xml"))
        slojevi = []
        for d in datoteke:
            try:
                g = gpd.read_file(d)
            except Exception:
                continue
            if len(g) and g.geometry.notna().any():
                slojevi.append(g)
        if not slojevi:
            raise RuntimeError(f"k.o. {ko}: u ZIP-u nema čitljivog GML-a")
        g = max(slojevi, key=len)  # sloj čestica je najveći
    # broj čestice: 'label' ili kraj 'nationalCadastralReference'
    if "label" in g.columns:
        broj = g["label"].astype(str)
    else:
        ref = next(c for c in g.columns if "nationalcadastralreference" in c.lower())
        broj = g[ref].astype(str).str.split(r"[-:]").str[-1]
    g = g.assign(kc=broj.str.strip(), ko_mb=ko)[["kc", "ko_mb", "geometry"]]
    if g.crs is None:
        g = g.set_crs(3765)
    print(f"  k.o. {ko} ({KO_NAZIVI.get(ko, '?')}): {len(g)} čestica", flush=True)
    return g.to_crs(4326)


def kategorija_komunalne(podportfelj):
    t = re.sub(r"\(\d{6}\)", " ", podportfelj)
    for ime in KO_NAZIVI.values():
        t = t.replace(ime, " ")
    t = re.sub(r"\s+", " ", t).strip().upper()
    redoslijed = ["NERAZVRSTANE CESTE", "JAVNA RASVJETA", "JAVNE ZELENE POVRŠINE", "JAVNA PARKIRALIŠTA",
                  "JAVNE PROMETNE POVRŠINE", "GROBLJA", "GRAĐEVINE I UREĐAJI JAVNE NAMJENE", "TRŽNICE"]
    for k in redoslijed:
        if all(r in t for r in k.split()):
            return k.capitalize().replace("Javne zelene površine", "Javne zelene površine")
    return t.capitalize() or "Ostalo"


def ocisti(tekst, ukloni=()):
    t = tekst or ""
    for r in ukloni:
        t = t.replace(r, " ")
    return re.sub(r"\s+", " ", t).strip()


def main():
    imovina = pd.read_csv(KORIJEN / "data/izvori/registar_imovine.csv", sep=";", dtype=str).fillna("")
    komunalna = pd.read_csv(KORIJEN / "data/izvori/registar_komunalne_infrastrukture.csv", sep=";", dtype=str).fillna("")

    # k.o. iz adrese ako nedostaje (npr. 'Lug ...' -> 300241)
    po_imenu = {v: k for k, v in KO_NAZIVI.items()}
    for df in (imovina, komunalna):
        for i, r in df[df.ko_mb == ""].iterrows():
            for ime, mb in po_imenu.items():
                if ime in (r.get("adresa", "") + " " + r.get("podportfelj", "")):
                    df.at[i, "ko_mb"] = mb
                    break

    potrebne = sorted((set(imovina.ko_mb) | set(komunalna.ko_mb)) - {""})
    adrese = zip_adrese()
    print(f"ATOM: {len(adrese)} k.o.; potrebne: {potrebne}", flush=True)
    cestice = pd.concat([cestice_ko(ko, adrese[ko]) for ko in potrebne if ko in adrese], ignore_index=True)
    cestice = gpd.GeoDataFrame(cestice, geometry="geometry", crs=4326)
    kljuc = cestice.set_index(["ko_mb", "kc"])

    neupareno = []

    def spoji(df, izvor):
        geometrije = []
        for _, r in df.iterrows():
            k = (r.ko_mb, r.kc.strip())
            if k in kljuc.index:
                g = kljuc.loc[[k]].geometry.union_all()
                geometrije.append(g)
            else:
                geometrije.append(None)
                neupareno.append({"registar": izvor, "rb": r.rb, "ko_mb": r.ko_mb, "kc": r.kc, "naziv": r.naziv})
        return gpd.GeoDataFrame(df.assign(geometry=geometrije), geometry="geometry", crs=4326)

    # --- općinska imovina ---
    im = spoji(imovina, "imovina")
    im = im[im.geometry.notna()].copy()
    im["naziv"] = im.naziv.map(lambda t: ocisti(t))
    im["vrsta"] = im.podportfelj.map(lambda t: ocisti(t).capitalize() or "Ostalo")
    im["ko"] = im.ko_mb.map(KO_NAZIVI)
    im["povrsina_m2"] = pd.to_numeric(im.kolicina.str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce")
    im["vrijednost_eur"] = pd.to_numeric(im.vrijednost_eur.str.replace(",", "", regex=False), errors="coerce")
    im[["rb", "naziv", "vrsta", "portfelj", "adresa", "ko", "kc", "povrsina_m2", "vrijednost_eur", "geometry"]] \
        .to_file(KORIJEN / "data/opcinska_imovina.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)

    # --- komunalna infrastruktura ---
    ki = spoji(komunalna, "komunalna")
    ki = ki[ki.geometry.notna()].copy()
    ki["kategorija"] = ki.podportfelj.map(kategorija_komunalne)
    ki["naziv"] = (ki.oznaka + " " + ki.naziv).map(
        lambda t: ocisti(t, ("Nerazvrstane", "ceste", "NERAZVRSTANE", "CESTE")))
    ki["ko"] = ki.ko_mb.map(KO_NAZIVI)
    ki["povrsina_m2"] = pd.to_numeric(ki.kolicina.str.replace(".", "", regex=False).str.replace(",", ".", regex=False), errors="coerce")
    ki[["rb", "naziv", "kategorija", "ko", "kc", "povrsina_m2", "geometry"]] \
        .to_file(KORIJEN / "data/komunalna_infrastruktura.geojson", driver="GeoJSON", COORDINATE_PRECISION=6)

    with open(KORIJEN / "data/izvori/registri_neupareno.csv", "w", newline="", encoding="utf-8") as d:
        w = csv.DictWriter(d, fieldnames=["registar", "rb", "ko_mb", "kc", "naziv"], delimiter=";")
        w.writeheader()
        w.writerows(neupareno)

    print(f"Imovina: {len(im)}/{len(imovina)} povezano; komunalna: {len(ki)}/{len(komunalna)} povezano; "
          f"neupareno: {len(neupareno)}", flush=True)
    print("Kategorije komunalne:", ki.kategorija.value_counts().to_dict(), flush=True)


if __name__ == "__main__":
    main()
