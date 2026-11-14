#!/usr/bin/env python3
"""Iz teksta službenih glasnika (2013.–) izvlači kandidate za popis općinskih projekata:
stavke proračuna (Aktivnost/Kapitalni/Tekući projekt) i točke programa građenja.
Samo nazivi, godine i iznosi – bez osobnih podataka. Rezultat je za ručnu provjeru."""
import collections, json, pathlib, re, sys

mapa = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "glasnici_tekst")
RX_STAVKA = re.compile(r"^(?:Aktivnost|Kapitalni projekt|Tekući projekt|Projekt)\s+([AKT]\d{1,7})\s+(.+?)\s*((?:-?\d{1,3}(?:\.\d{3})*,\d{2}\s*)*)$")
RX_TOCKA = re.compile(r"^\d{1,2}\.\d{1,2}\.\s+(.{6,140}?)\s*((?:\d{1,3}(?:\.\d{3})*,\d{2})?)\s*(?:eur|kn|EUR|KN)?$")
INVEST = re.compile(r"(?i)izgradnj|rekonstrukc|uređenj|obnov|sanacij|asfalt|nabava (?:vozila|opreme|komunal)|energetsk|vrtić|jaslic|dvoran|staz|nogostup|pješač|cest|ulic|mrtvačn|kolumbarij|groblj|rasvjet|park|igrališt|dom kulture|društven|eu projekt|interreg|prekogranič|centar|tržnic|vodovod|odvodnj|kanalizac|reciklaž|biciklist|tenisk|litko|vatrogas|škol|zgrad|trg|most|ribnjak|sportsk")
ISKLJUCI = re.compile(r"(?i)održavanj|plaće|materijal|tekuć|naknad|subvenc|stipendij|pomoć|dotacij|financiranje rada|redovn|osigur|kamat|otplat|zakup|najam|božićn|iluminac|certificir")

def iznos(s):
    try: return float(s.replace(".", "").replace(",", "."))
    except ValueError: return None

kandidati = collections.OrderedDict()
for f in sorted(mapa.glob("*.txt")):
    g = re.findall(r"(20[12]\d)", f.name)
    godina = int(g[-1]) if g else None
    if godina and godina < 2013: continue
    redovi = f.read_text(encoding="utf-8", errors="ignore").split("\n")
    for i, red in enumerate(redovi):
        red = red.strip()
        m = RX_STAVKA.match(red); izvor = "proracun"
        if m:
            naziv, brojevi = m.group(2), re.findall(r"-?\d{1,3}(?:\.\d{3})*,\d{2}", m.group(3) or "")
            # naziv se ponekad nastavlja u sljedećem retku (velika slova, bez brojeva)
            if not brojevi and i + 1 < len(redovi):
                nast = redovi[i + 1].strip()
                brojevi = re.findall(r"-?\d{1,3}(?:\.\d{3})*,\d{2}", nast)
                naziv += " " + re.split(r"\s-?\d{1,3}(?:\.\d{3})*,\d{2}", nast)[0]
        else:
            m = RX_TOCKA.match(red); izvor = "program_gradnje"
            if not m: continue
            naziv, brojevi = m.group(1), [m.group(2)] if m.group(2) else []
        naziv = re.sub(r"\s{2,}", " ", naziv).strip(" .-–,:")
        if not INVEST.search(naziv) or ISKLJUCI.search(naziv) or len(naziv) < 6: continue
        kljuc = re.sub(r"[^a-zčćžšđ0-9]+", " ", naziv.lower()).strip()[:70]
        z = kandidati.setdefault(kljuc, {"naziv": naziv.capitalize() if naziv.isupper() else naziv, "godine": set(), "glasnici": set(), "izvori": set(), "max_iznos": 0.0, "sifre": set()})
        if godina: z["godine"].add(godina)
        z["glasnici"].add(f.name.replace(".pdf.txt", "")); z["izvori"].add(izvor)
        if izvor == "proracun": z["sifre"].add(m.group(1))
        for b in brojevi:
            v = iznos(b)
            if v and v > z["max_iznos"]: z["max_iznos"] = v

print("KANDIDATA:", len(kandidati))
for z in kandidati.values():
    god = sorted(z["godine"])
    print("@@", " | ".join([z["naziv"], f"{god[0]}-{god[-1]}" if god else "", ",".join(sorted(z["sifre"])), ",".join(sorted(z["izvori"])),
          f"{z['max_iznos']:.2f}", str(len(z["glasnici"])), ",".join(sorted(z["glasnici"])[:6])]))
