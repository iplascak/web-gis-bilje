#!/usr/bin/env python3
"""
Pretvara data/izvori/projekti.csv u data/projekti.geojson.

Tablicu projekata možete uređivati u Excelu (spremiti kao CSV, razdjelnik ';', UTF-8).
Lokacija projekta određuje se ovim redom:
  1. stupci lon i lat (ako postoje i popunjeni su) – točna lokacija
  2. stupac 'lokacija':  ulica:<naziv ulice>  |  groblje  |  stara_drava
  3. inače: središte izgrađenog dijela svakog naselja iz stupca 'naselja' (približno)
Projekti u istom naselju raspoređuju se u krug oko središta da se ne preklapaju.
Pokretanje:  python scripts/projekti.py
"""
import csv
import json
import math
import pathlib

KORIJEN = pathlib.Path(__file__).resolve().parent.parent
HRK_EUR = 7.53450  # fiksni tečaj konverzije
M_U_STUPNJ_LAT = 1 / 111320.0


def ucitaj(p):
    return json.loads((KORIJEN / p).read_text(encoding="utf-8"))


def u_poligonu(x, y, prsten):
    unutra = False
    for i in range(len(prsten)):
        x1, y1 = prsten[i]
        x2, y2 = prsten[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            unutra = not unutra
    return unutra


def poligoni(geom):
    return [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]


def sadrzi(geom, x, y):
    return any(u_poligonu(x, y, p[0]) for p in poligoni(geom))


def teziste(geom):
    # težište najvećeg prstena (dovoljno za smještaj oznake)
    najveci = max((p[0] for p in poligoni(geom)), key=len)
    a = cx = cy = 0.0
    for i in range(len(najveci) - 1):
        x1, y1 = najveci[i]
        x2, y2 = najveci[i + 1]
        k = x1 * y2 - x2 * y1
        a += k
        cx += (x1 + x2) * k
        cy += (y1 + y2) * k
    if abs(a) < 1e-12:
        xs, ys = zip(*najveci)
        return sum(xs) / len(xs), sum(ys) / len(ys)
    return cx / (3 * a), cy / (3 * a)


def povrsina(geom):
    s = 0.0
    for p in poligoni(geom):
        r = p[0]
        s += abs(sum(r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1] for i in range(len(r) - 1))) / 2
    return s


def main():
    naselja = ucitaj("data/naselja.geojson")["features"]
    gp = ucitaj("data/gradevinska_podrucja.geojson")["features"]
    ulice = ucitaj("data/ulice.geojson")["features"]

    # središte naselja = težište najvećeg izgrađenog dijela građevinskog područja unutar naselja
    sredista = {}
    for n in naselja:
        ime = n["properties"]["naziv"]
        kandidati = [f for f in gp if f["properties"]["kategorija"] in ("naselje_izgr", "naselje_neizgr")
                     and sadrzi(n["geometry"], *teziste(f["geometry"]))]
        izgr = [f for f in kandidati if f["properties"]["kategorija"] == "naselje_izgr"] or kandidati
        sredista[ime] = teziste(max(izgr, key=lambda f: povrsina(f["geometry"]))["geometry"]) if izgr else teziste(n["geometry"])

    def posebna(lok, naselje):
        if lok.startswith("ulica:"):
            ime = lok.split(":", 1)[1].strip().lower()
            for f in ulice:
                if f["properties"]["naziv"].lower() == ime and f["properties"]["naselje"] == naselje:
                    k = f["geometry"]["coordinates"]
                    k = k if f["geometry"]["type"] == "LineString" else k[0]
                    return tuple(k[len(k) // 2])
        if lok == "groblje":
            for f in gp:
                if f["properties"]["kategorija"] == "groblje":
                    t = teziste(f["geometry"])
                    if any(n["properties"]["naziv"] == naselje and sadrzi(n["geometry"], *t) for n in naselja):
                        return t
        if lok == "stara_drava":
            for f in gp:
                if "Stara Drava" in f["properties"]["namjena"]:
                    return teziste(f["geometry"])
        return None

    brojac = {}
    znacajke = []
    with open(KORIJEN / "data/izvori/projekti.csv", encoding="utf-8-sig", newline="") as d:
        for r in csv.DictReader(d, delimiter=";"):
            lista = [n.strip() for n in r["naselja"].split(",") if n.strip()]
            tocke, tocnost = [], "približna (naselje)"
            if r.get("lon") and r.get("lat"):
                tocke, tocnost = [(float(r["lon"]), float(r["lat"]))], "točna"
            elif r.get("lokacija"):
                t = posebna(r["lokacija"].strip(), lista[0])
                if t:
                    tocke, tocnost = [t], "lokacija iz podataka (ulica/površina)"
            if not tocke:
                for n in lista:
                    cx, cy = sredista[n]
                    k = brojac.get(n, 0)
                    brojac[n] = k + 1
                    if k:  # spirala oko središta, razmak ~110 m
                        kut = k * 2.4
                        rad = 110 * math.sqrt(k)
                        cx += rad * math.cos(kut) * M_U_STUPNJ_LAT / math.cos(math.radians(cy))
                        cy += rad * math.sin(kut) * M_U_STUPNJ_LAT
                    tocke.append((round(cx, 6), round(cy, 6)))
            hrk = float(r["vrijednost_hrk"]) if r["vrijednost_hrk"] else None
            znacajke.append({
                "type": "Feature",
                "properties": {
                    "naziv": r["naziv"],
                    "spremnost": r["spremnost_2021"],
                    "vrijednost_eur": round(hrk / HRK_EUR) if hrk else None,
                    "vrijednost_hrk": hrk,
                    "naselja": ", ".join(lista),
                    "izvor_financiranja": r["izvor_financiranja"] or None,
                    "napomena": r["napomena"] or None,
                    "lokacija_tocnost": tocnost,
                    "izvor": "Strateški razvojni program Općine Bilje do 2030. (stanje 2021.)" if r["spremnost_2021"] not in ("eu",) else "bilje.hr – EU projekti",
                },
                "geometry": {"type": "MultiPoint", "coordinates": [list(t) for t in tocke]},
            })
    (KORIJEN / "data/projekti.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": znacajke}, ensure_ascii=False), encoding="utf-8")
    print(f"{len(znacajke)} projekata zapisano u data/projekti.geojson")


if __name__ == "__main__":
    main()
