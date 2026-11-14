#!/usr/bin/env python3
"""Pregled izvora podataka (config/izvori.json): ispisuje koje izvore treba pregledati/ažurirati.

Izlaz: pregled_izvora.md; izlazni kod 1 ako ima izvora kojima je pregled za ≤ 30 dana ili je prošao.
Tjedni workflow tada otvara (ili dopunjuje) issue "Ažuriranje podataka", a ako su postavljene
SMTP tajne, šalje e-poruku administratorima portala.
"""
import datetime as dt, json, pathlib, sys
K = pathlib.Path(__file__).resolve().parents[1]
cfg = json.loads((K / "config/izvori.json").read_text(encoding="utf-8"))
danas = dt.date.today()
redovi, hitno = [], 0
for i in sorted(cfg["izvori"], key=lambda x: x["sljedeci_pregled"]):
    d = dt.date.fromisoformat(i["sljedeci_pregled"])
    dana = (d - danas).days
    stanje = "⚠️ **prošao rok**" if dana < 0 else ("🔔 uskoro" if dana <= 30 else "u redu")
    if dana <= 30: hitno += 1
    redovi.append(f"| {i['naziv']} | {i['sljedeci_pregled']} | {stanje} | {i['kako']} |")
md = ["# Pregled izvora podataka", "", f"Stanje na dan {danas.isoformat()}.", "",
      "| Izvor | Pregled do | Stanje | Što napraviti |", "|---|---|---|---|", *redovi, "",
      "Nakon ažuriranja upišite novi datum u `config/izvori.json` (polje `sljedeci_pregled`)."]
(K / "pregled_izvora.md").write_text("\n".join(md), encoding="utf-8")
print("\n".join(md))
sys.exit(1 if hitno else 0)
