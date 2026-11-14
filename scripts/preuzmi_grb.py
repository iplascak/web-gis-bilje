#!/usr/bin/env python3
"""
Preuzima grb Općine Bilje sa službene stranice, uklanja žutu pozadinu i sprema:
    assets/grb.png          – grb s prozirnom pozadinom (visina 256 px)
    assets/favicon-32.png   – ikona kartice preglednika
    assets/favicon-180.png  – ikona za mobitele (dodaj na početni zaslon)
Pokreće se kroz GitHub Actions ('Priprema grafike'), jer zahtijeva pristup internetu.
"""
import io
import pathlib
import urllib.request
from collections import deque

from PIL import Image

KORIJEN = pathlib.Path(__file__).resolve().parent.parent
URL = "https://bilje.hr/wp-content/uploads/2020/10/cropped-opina.jpg"


def main():
    zahtjev = urllib.request.Request(URL, headers={"User-Agent": "WebGIS-Opcina-Bilje/1.0"})
    slika = Image.open(io.BytesIO(urllib.request.urlopen(zahtjev, timeout=60).read())).convert("RGBA")
    w, h = slika.size
    px = slika.load()
    pozadina = px[0, 0][:3]

    def slicno(p):
        return sum(abs(a - b) for a, b in zip(p[:3], pozadina)) < 90

    # flood fill od rubova: uklanja samo pozadinu povezanu s rubom slike
    vidjeno = set()
    red = deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] +
                [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    while red:
        x, y = red.popleft()
        if (x, y) in vidjeno or not (0 <= x < w and 0 <= y < h):
            continue
        vidjeno.add((x, y))
        if not slicno(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        red.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    grb = slika.crop(slika.getbbox())
    izlaz = KORIJEN / "assets"
    izlaz.mkdir(exist_ok=True)
    v = 256
    grb.resize((round(grb.width * v / grb.height), v), Image.LANCZOS).save(izlaz / "grb.png", optimize=True)
    for vel in (32, 180):
        platno = Image.new("RGBA", (vel, vel), (0, 0, 0, 0))
        m = grb.copy()
        m.thumbnail((vel, vel), Image.LANCZOS)
        platno.paste(m, ((vel - m.width) // 2, (vel - m.height) // 2), m)
        platno.save(izlaz / f"favicon-{vel}.png", optimize=True)
    print("Grb spremljen:", grb.size)


if __name__ == "__main__":
    main()
