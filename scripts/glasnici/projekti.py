#!/usr/bin/env python3
"""Iz teksta službenih glasnika izvlači kapitalne projekte i aktivnosti iz proračuna,
izvršenja proračuna i programa građenja komunalne infrastrukture.
Ispisuje samo nazive projekata, šifre, godine i iznose (bez osobnih podataka)."""
import collections, json, pathlib, re, sys

mapa = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "glasnici_tekst")
RX_K = re.compile(r"\b(Kapitalni projekt|Tekući projekt|Aktivnost)\s+([KTA]\d{6})\s+(.+)", re.I)
RX_IZNOS = re.compile(r"\d{1,3}(?:\.\d{3})+(?:,\d{2})|\d+,\d{2}")
RX_GOD = re.compile(r"(?:za|u)\s+(20[12]\d)\.?\s*(?:godin|god\.)", re.I)
VRSTA = [("izvrš", "izvrsenje"), ("program građenja", "program_gradnje"), ("program gradnje", "program_gradnje"),
         ("plan razvojnih", "plan_razvojnih"), ("proračun", "proracun")]

projekti = collections.OrderedDict()
for f in sorted(mapa.glob("*.txt")):
    t = f.read_text(encoding="utf-8", errors="ignore")
    url = t.split("\n", 1)[0]
    # glasnik i godina iz naziva datoteke / teksta
    god_dat = re.findall(r"20[12]\d", f.name)
    for blok in re.split(r"\n=== str\. \d+ ===\n", t):
        nizak = blok.lower()
        vrsta = next((v for k, v in VRSTA if k in nizak), "ostalo")
        godine = RX_GOD.findall(blok)
        for red in blok.split("\n"):
            m = RX_K.search(red)
            if not m or m.group(2).upper().startswith("A"):
                continue  # aktivnosti (redovni rashodi) preskačemo – zanimaju nas projekti
            sifra = m.group(2).upper()
            ostatak = m.group(3)
            iznosi = RX_IZNOS.findall(ostatak)
            naziv = RX_IZNOS.split(ostatak)[0].strip(" .-–")
            naziv = re.sub(r"\s{2,}", " ", naziv)[:160]
            if len(naziv) < 4:
                continue
            k = (sifra, naziv.lower())
            z = projekti.setdefault(k, {"sifra": sifra, "naziv": naziv, "pojave": []})
            z["pojave"].append({"glasnik": f.name.replace(".txt", ""), "vrsta": vrsta,
                                "godina": godine[0] if godine else (god_dat[0] if god_dat else ""), "iznosi": iznosi[:4]})

print("PROJEKATA:", len(projekti))
for z in projekti.values():
    god = sorted({p["godina"] for p in z["pojave"] if p["godina"]})
    vrste = sorted({p["vrsta"] for p in z["pojave"]})
    zadnji = next((p["iznosi"] for p in reversed(z["pojave"]) if p["iznosi"]), [])
    print(f"@@ {z['sifra']} | {z['naziv']} | godine={','.join(god)} | vrste={','.join(vrste)} | n={len(z['pojave'])} | iznosi={';'.join(zadnji)}")
json.dump(list(projekti.values()), open("projekti_iz_glasnika.json", "w"), ensure_ascii=False)
