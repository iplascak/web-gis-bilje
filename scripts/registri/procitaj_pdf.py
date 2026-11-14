#!/usr/bin/env python3
"""
Čita registre Općine Bilje iz PDF-a (objavljeni na bilje.hr) u CSV tablice.

    python scripts/registri/procitaj_pdf.py REGISTAR_NEKRETNINA.pdf Evidencija_komunalne_infrastrukture.pdf

Izlaz: data/izvori/registar_imovine.csv i data/izvori/registar_komunalne_infrastrukture.csv
Zapisi se prepoznaju po rednom broju u lijevom stupcu; tekstualni stupci po
vodoravnom položaju riječi, a brojčani dio (k.o., z.k.u., z.k.č., P.L., k.č.,
jedinica, količina) po obrascu.
"""
import csv
import pathlib
import re
import sys

import pdfplumber

KORIJEN = pathlib.Path(__file__).resolve().parents[2]

# x-rasponi tekstualnih stupaca (u točkama PDF-a)
STUPCI = {
    "imovina": {"naziv": (75, 148), "portfelj": (148, 195), "podportfelj": (195, 265), "adresa": (265, 325),
                "funkcija": (688, 720), "vrijednost_eur": (750, 842)},
    "komunalna": {"oznaka": (58, 100), "naziv": (100, 165), "vrsta": (165, 215), "portfelj": (215, 265),
                  "podportfelj": (265, 325)},
}
JED = r"(M2|m2|M|m|KOM|kom|kom\.)"
JEZGRA = re.compile(r"(\d+)\s+(\d+(?:/\d+)?)\s+(\d+)\s+(\d+(?:/\d+)?)\s+" + JED + r"\s+([\d.,]+)\s+(\d+/\d+)")
# registar komunalne infrastrukture: z.k.u., P.L., k.č. (bez z.k.č.)
JEZGRA_KRATKA = re.compile(r"(\d+)\s+(\d+)\s+(\d+(?:/\d+)?)\s+" + JED + r"\s+([\d.,]+)\s+(\d+/\d+)")
KC_U_NAZIVU = re.compile(r"k\.?\s*č\.?\s*(?:br\.?\s*)?(\d+(?:/\d+)?)", re.IGNORECASE)
KO = re.compile(r"\((\d{6})\)")


def citaj(put, vrsta):
    zapisi = []
    with pdfplumber.open(put) as pdf:
        for stranica in pdf.pages:
            rijeci = stranica.extract_words(keep_blank_chars=False, y_tolerance=0.5)
            rb = [w for w in rijeci if w["x0"] < 58 and re.fullmatch(r"\d+\.", w["text"])]
            rb.sort(key=lambda w: w["top"])
            for i, w in enumerate(rb):
                razmak = (rb[i + 1]["top"] - w["top"]) if i + 1 < len(rb) else (w["top"] - rb[i - 1]["top"] if i else 36)
                gore = (rb[i - 1]["top"] + w["top"]) / 2 if i else w["top"] - razmak / 2
                dolje = (w["top"] + rb[i + 1]["top"]) / 2 if i + 1 < len(rb) else w["top"] + razmak / 2
                pojas = [r for r in rijeci if gore <= r["top"] < dolje]
                # redovi teksta unutar pojasa
                redovi = {}
                for r in pojas:
                    redovi.setdefault(round(r["top"] / 3), []).append(r)
                tekst = " ".join(" ".join(x["text"] for x in sorted(red, key=lambda x: x["x0"]))
                                 for _, red in sorted(redovi.items()))
                z = {"rb": w["text"].rstrip(".")}
                for ime, (x0, x1) in STUPCI[vrsta].items():
                    z[ime] = " ".join(r["text"] for r in sorted(pojas, key=lambda r: (round(r["top"] / 3), r["x0"]))
                                      if x0 <= r["x0"] < x1).strip()
                m = KO.search(tekst)
                z["ko_mb"] = m.group(1) if m else ""
                j = JEZGRA.search(tekst)
                k = None
                if j:
                    z.update(zku=j.group(1), zkc=j.group(2), pl=j.group(3), kc=j.group(4),
                             jedinica=j.group(5).upper(), kolicina=j.group(6), udio=j.group(7))
                elif (k := JEZGRA_KRATKA.search(tekst)):
                    z.update(zku=k.group(1), zkc="", pl=k.group(2), kc=k.group(3),
                             jedinica=k.group(4).upper(), kolicina=k.group(5), udio=k.group(6))
                else:
                    n = KC_U_NAZIVU.search(z.get("naziv", ""))
                    z.update(zku="", zkc="", pl="", kc=n.group(1) if n else "", jedinica="", kolicina="", udio="")
                z["kc_izvor"] = "tablica" if j or k else ("naziv" if z["kc"] else "")
                zapisi.append(z)
    return zapisi


def main():
    izlaz = KORIJEN / "data/izvori"
    for put in sys.argv[1:]:
        vrsta = "komunalna" if "komunal" in put.lower() else "imovina"
        zapisi = citaj(put, vrsta)
        ime = "registar_komunalne_infrastrukture.csv" if vrsta == "komunalna" else "registar_imovine.csv"
        with open(izlaz / ime, "w", newline="", encoding="utf-8") as d:
            pis = csv.DictWriter(d, fieldnames=list(zapisi[0].keys()), delimiter=";")
            pis.writeheader()
            pis.writerows(zapisi)
        bez = sum(1 for z in zapisi if not z["kc"])
        print(f"{ime}: {len(zapisi)} zapisa, bez k.č.: {bez}")


if __name__ == "__main__":
    main()
