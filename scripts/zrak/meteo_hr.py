#!/usr/bin/env python3
"""Kvaliteta zraka s postaja DHMZ (meteo.hr) u blizini općine -> zrak.json.

Pokreće se svaki sat (GitHub Actions); rezultat ide na granu 'podaci-uzivo' (jedan commit,
bez rasta povijesti), a portal ga čita s raw.githubusercontent.com.
Podaci su izvorni, nekontrolirani podaci DHMZ-a (kako ih DHMZ i objavljuje).
"""
import datetime as dt, html, json, re, sys, time, urllib.parse, urllib.request

POSTAJE = {"Kopački rit": (45.698028, 18.834639), "Osijek 1": None, "Osijek 2": None}
PRATI = {"PM10": ["lebdece cestice (<10um)", "lebdeće čestice (<10µm)"], "PM2.5": ["lebdece cestice (<2.5um)", "lebdeće čestice (<2.5µm)"],
         "O3": ["ozon"], "NO2": ["dušikov dioksid", "dusikov dioksid"], "SO2": ["sumporov dioksid"]}
# granice razreda (µg/m³) – pojednostavljeni europski indeks kvalitete zraka (satne vrijednosti)
RAZREDI = {"PM10": [20, 40, 50, 100, 150], "PM2.5": [10, 20, 25, 50, 75], "O3": [50, 100, 130, 240, 380], "NO2": [40, 90, 120, 230, 340], "SO2": [100, 200, 350, 500, 750]}
NAZIVI = ["dobra", "prihvatljiva", "umjerena", "loša", "vrlo loša", "izrazito loša"]
UA = {"User-Agent": "Mozilla/5.0 (web-gis-bilje; +https://github.com/iplascak/web-gis-bilje)"}
BAZA = "https://meteo.hr/kvaliteta_zraka.php"


def dohvati(params):
    url = BAZA + "?" + urllib.parse.urlencode(params)
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as o:
                return o.read().decode("utf-8", "ignore")
        except Exception as g:
            print("greška", url, g); time.sleep(5)
    return ""


def razred(par, v):
    for i, g in enumerate(RAZREDI.get(par, [])):
        if v <= g: return i
    return len(RAZREDI.get(par, [])) or None


def main():
    izlaz = {"vrijeme": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"), "izvor": "DHMZ (meteo.hr), izvorni nekontrolirani podaci",
             "razredi": NAZIVI, "postaje": []}
    for ime in POSTAJE:
        h = dohvati({"section": "podaci_kz", "post": ime})
        stavke = re.findall(r'title="([^"]*)" href="/kvaliteta_zraka\.php\?section=podaci_kz&amp;post=[^&]*&amp;id_komp=(\d+)&amp;komp=([^"]+)"', h)
        komp = {html.unescape(t).strip().lower(): (i, html.unescape(k)) for t, i, k in stavke}
        lat = re.search(r"Geografska širina:\s*([\d.]+)", h); lon = re.search(r"Geografska dužina:\s*([\d.]+)", h)
        postaja = {"naziv": ime, "lat": float(lat.group(1)) if lat else None, "lon": float(lon.group(1)) if lon else None,
                   "url": BAZA + "?" + urllib.parse.urlencode({"section": "podaci_kz", "post": ime}), "mjerenja": {}}
        for par, naslovi in PRATI.items():
            kljuc = next((k for k in komp if any(n.lower() in k for n in naslovi)), None)
            if not kljuc: continue
            idk, kn = komp[kljuc]
            t = dohvati({"section": "podaci_kz", "post": ime, "id_komp": idk, "komp": kn})
            redovi = re.findall(r"<td[^>]*>\s*([^<]*?\d{1,2}\.\s*\d{1,2}\.[^<]*?)\s*</td>\s*<td[^>]*>\s*([-\d.,]+)\s*</td>", t)
            niz = [(d, float(v.replace(",", "."))) for d, v in redovi if v not in ("-", "")]
            if not niz: continue
            zadnje = niz[-1]
            postaja["mjerenja"][par] = {"vrijednost": zadnje[1], "vrijeme": zadnje[0], "razred": razred(par, zadnje[1]),
                                        "niz": [v for _, v in niz[-24:]], "jedinica": "µg/m³"}
        print(ime, {k: v["vrijednost"] for k, v in postaja["mjerenja"].items()})
        izlaz["postaje"].append(postaja)
    json.dump(izlaz, open(sys.argv[1] if len(sys.argv) > 1 else "zrak.json", "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()
