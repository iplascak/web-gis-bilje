#!/usr/bin/env python3
"""Javni sadržaji i slobodno vrijeme iz OpenStreetMapa (Overpass API) -> data/sadrzaji/*.geojson.

Pokreće se mjesečno (GitHub Actions) pa se karta sama osvježava kad mještani ili općina
dopune OpenStreetMap. Kategorije i nazivi su ovdje, na jednom mjestu.
"""
import json, pathlib, sys, time, urllib.parse, urllib.request

K = pathlib.Path(__file__).resolve().parents[2]
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UPIT = """[out:json][timeout:120];
area["boundary"="administrative"]["name"="Općina Bilje"]->.a;
(
 nwr(area.a)["amenity"~"^(pharmacy|doctors|clinic|dentist|veterinary|school|kindergarten|library|post_office|townhall|bank|atm|fuel|charging_station|drinking_water|recycling|toilets|place_of_worship|fire_station|police|community_centre|social_facility|restaurant|cafe|bar|pub|fast_food|marketplace)$"];
 nwr(area.a)["leisure"~"^(playground|sports_centre|pitch|park|fitness_station|dog_park|bird_hide|swimming_pool|slipway)$"];
 nwr(area.a)["shop"];
 nwr(area.a)["emergency"="defibrillator"];
 nwr(area.a)["tourism"~"^(viewpoint|museum|attraction|picnic_site|camp_site|guest_house|hotel|apartment)$"];
 nwr(area.a)["historic"~"^(castle|manor|memorial|monument|church|archaeological_site|wayside_cross)$"];
);
out center tags;"""

SPORT = {"soccer": "nogomet", "handball": "rukomet", "basketball": "košarka", "tennis": "tenis"}
TRGOVINE = {"supermarket": "supermarket", "convenience": "trgovina mješovitom robom", "bakery": "pekara", "chemist": "drogerija / ljekarna za bilje",
            "hairdresser": "frizer", "butcher": "mesnica", "kiosk": "kiosk", "gift": "suveniri", "farm": "prodaja s OPG-a"}


def razvrstaj(t):
    """-> (sloj, kategorija, opis vrste) ili None"""
    a, l, s, tu, h = t.get("amenity"), t.get("leisure"), t.get("shop"), t.get("tourism"), t.get("historic")
    if t.get("emergency") == "defibrillator": return ("javni", "zdravlje", "defibrilator (AED)")
    if a in ("pharmacy",): return ("javni", "zdravlje", "ljekarna")
    if a in ("clinic", "doctors"): return ("javni", "zdravlje", "ambulanta / liječnik")
    if a == "dentist": return ("javni", "zdravlje", "stomatolog")
    if a == "veterinary": return ("javni", "zdravlje", "veterinar")
    if a == "kindergarten": return ("javni", "obrazovanje", "dječji vrtić")
    if a == "school": return ("javni", "obrazovanje", "škola")
    if a == "library": return ("javni", "obrazovanje", "knjižnica")
    if a in ("post_office", "townhall", "bank", "atm", "community_centre", "social_facility"):
        return ("javni", "usluge", {"post_office": "pošta", "townhall": "općina", "bank": "banka", "atm": "bankomat",
                                     "community_centre": "društveni dom", "social_facility": "socijalna ustanova"}[a])
    if a == "fuel": return ("javni", "usluge", "benzinska postaja")
    if a == "charging_station": return ("javni", "usluge", "punionica električnih vozila")
    if a == "recycling":
        return ("javni", "otpad", "reciklažno dvorište" if "dvori" in t.get("name", "").lower() else "zeleni otok (spremnici za reciklažu)")
    if a == "drinking_water": return ("javni", "otpad", "javna slavina s pitkom vodom")
    if a == "toilets": return ("slobodno", "odmor", "javni WC")
    if a in ("fire_station", "police"): return ("javni", "sigurnost", "vatrogasci (DVD)" if a == "fire_station" else "policija")
    if a == "place_of_worship": return ("javni", "vjera", "crkva / vjerski objekt")
    if s: return ("javni", "trgovine", TRGOVINE.get(s, "trgovina"))
    if a == "marketplace": return ("javni", "trgovine", "tržnica")
    if l == "playground": return ("javni", "igra", "dječje igralište")
    if l in ("pitch", "sports_centre", "fitness_station", "swimming_pool"):
        sp = SPORT.get(t.get("sport", ""), "")
        return ("javni", "sport", ("sportski teren" + (" – " + sp if sp else "")) if l == "pitch" else {"sports_centre": "sportski centar", "fitness_station": "vježbalište na otvorenom", "swimming_pool": "bazen"}[l])
    if l == "dog_park": return ("javni", "igra", "park za pse")
    if l == "park": return ("slobodno", "odmor", "park")
    if l == "bird_hide": return ("slobodno", "priroda", "promatračnica ptica")
    if l == "slipway": return ("slobodno", "priroda", "istezalište za čamce")
    if a in ("restaurant", "cafe", "bar", "pub", "fast_food"):
        return ("slobodno", "ugostiteljstvo", {"restaurant": "restoran", "cafe": "kafić", "bar": "kafić / bar", "pub": "pivnica", "fast_food": "brza hrana"}[a])
    if tu in ("guest_house", "hotel", "apartment", "camp_site"):
        return ("slobodno", "smjestaj", {"guest_house": "smještaj (sobe, kuća za odmor)", "hotel": "hotel", "apartment": "apartman", "camp_site": "kamp"}[tu])
    if tu == "viewpoint": return ("slobodno", "priroda", "vidikovac")
    if tu == "picnic_site": return ("slobodno", "odmor", "izletište")
    if tu in ("museum", "attraction"): return ("slobodno", "bastina", "muzej" if tu == "museum" else "znamenitost")
    if h: return ("slobodno", "bastina", {"castle": "dvorac", "manor": "kurija / ladanjska vila", "memorial": "spomen-obilježje", "monument": "spomenik",
                                          "church": "crkva", "archaeological_site": "arheološki lokalitet", "wayside_cross": "raspelo"}.get(h, "baština"))
    return None


def main():
    j = None
    for url in OVERPASS:
        for pokusaj in range(3):
            try:
                z = urllib.request.Request(url, data=urllib.parse.urlencode({"data": UPIT}).encode(),
                                           headers={"User-Agent": "web-gis-bilje (github.com/iplascak/web-gis-bilje)"})
                with urllib.request.urlopen(z, timeout=180) as o:
                    j = json.loads(o.read())
                break
            except Exception as g:
                print("Overpass greška:", url, g); time.sleep(20)
        if j: break
    if not j:
        sys.exit("Overpass nije dostupan")
    izlaz = {"javni": [], "slobodno": []}
    for e in j["elements"]:
        t = e.get("tags", {})
        r = razvrstaj(t)
        if not r: continue
        sloj, kat, vrsta = r
        lat = e.get("lat") or e["center"]["lat"]; lon = e.get("lon") or e["center"]["lon"]
        adresa = " ".join(x for x in [t.get("addr:street"), t.get("addr:housenumber")] if x)
        if adresa and t.get("addr:city"): adresa += ", " + t["addr:city"]
        izlaz[sloj].append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, "properties": {
            "naziv": t.get("name") or vrsta[0].upper() + vrsta[1:], "kategorija": kat, "vrsta": vrsta,
            "adresa": adresa or None, "radno_vrijeme": t.get("opening_hours"), "telefon": t.get("phone") or t.get("contact:phone"),
            "web": t.get("website") or t.get("contact:website"), "osm": f"https://www.openstreetmap.org/{e['type']}/{e['id']}"}})
    d = K / "data/sadrzaji"; d.mkdir(parents=True, exist_ok=True)
    for sloj, fs in izlaz.items():
        fs.sort(key=lambda f: (f["properties"]["kategorija"], f["properties"]["naziv"]))
        (d / f"{sloj}.geojson").write_text(json.dumps({"type": "FeatureCollection", "izvor": "© OpenStreetMap suradnici (ODbL)",
                                                         "features": fs}, ensure_ascii=False, indent=0), encoding="utf-8")
        print(sloj, len(fs))


if __name__ == "__main__":
    main()
