#!/usr/bin/env python3
"""Preuzima službene glasnike Općine Bilje (PDF) i izvlači tekst – za pregled projekata i odluka.
Rezultat (glasnici_tekst/*.txt) se sprema kao artefakt radnje, ne u repozitorij."""
import pathlib, re, sys, time, urllib.request
import pdfplumber

UA = {"User-Agent": "Mozilla/5.0 (web-gis-bilje; +https://github.com/iplascak/web-gis-bilje)"}
izlaz = pathlib.Path("glasnici_tekst"); izlaz.mkdir(exist_ok=True)
pdf_dir = pathlib.Path("glasnici_pdf"); pdf_dir.mkdir(exist_ok=True)

def dohvati(url, pokusaja=3):
    for i in range(pokusaja):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as o:
                return o.read()
        except Exception as g:
            print("  greška", url, g); time.sleep(5)
    return None

html = dohvati("https://bilje.hr/sluzbeni-glasnik-opcine-bilje/").decode("utf-8", "ignore")
linkovi = sorted(set(re.findall(r'href="([^"]+\.pdf)"', html, re.I)))
linkovi = [l if l.startswith("http") else "https://bilje.hr/" + l.lstrip("/") for l in linkovi]
print(len(linkovi), "PDF-ova")
for url in linkovi:
    ime = re.sub(r"[^A-Za-z0-9_.-]", "_", url.rsplit("/", 1)[-1])
    txt = izlaz / (ime + ".txt")
    if txt.exists(): continue
    p = pdf_dir / ime
    b = dohvati(url)
    if not b: continue
    p.write_bytes(b)
    try:
        with pdfplumber.open(p) as d:
            t = "\n".join(f"\n=== str. {i+1} ===\n" + (pg.extract_text() or "") for i, pg in enumerate(d.pages))
        txt.write_text(url + "\n" + t, encoding="utf-8")
        print("ok", ime, len(t))
    except Exception as g:
        print("pdf greška", ime, g)
