#!/usr/bin/env python3
"""
Automatski PRIJEDLOG obrisa grobnih mjesta iz snimke groblja dronom (Segment Anything, Meta AI).

Pokretanje (GitHub Actions -> "Grobna mjesta (prijedlog)"), ili lokalno:
    pip install -r scripts/groblja/requirements.txt
    python scripts/groblja/grobna_mjesta.py --groblje bilje

Ulaz:  pločice snimke data/groblja/<groblje>/21/{x}/{y}.webp (EPSG:3857, ~5 cm)
Izlaz: data/groblja/<groblje>_grobna_mjesta.geojson – pravokutnici (WGS84) s površinom i ocjenom pouzdanosti

Model segmentira sve jasno omeđene plohe na snimci; zadržavaju se one koje po veličini,
obliku i boji odgovaraju grobnom mjestu (kamena ploča/okvir, 1,3–9 m², pravokutnik).
Rezultat je polazište za grobni katastar: treba ga pregledati i ispraviti u QGIS-u
(spojiti, razdvojiti, dodati propuštena mjesta) prije povezivanja s grobnim očevidnikom.
"""
import argparse, json, math, pathlib, sys, time, urllib.request
import numpy as np
from PIL import Image

KORIJEN = pathlib.Path(__file__).resolve().parents[2]
R = 20037508.342789244
Z = 21
MODEL_URL = "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth"


def log(*a):
    print(*a, flush=True)


def mozaik(mapa):
    plocice = list((mapa / str(Z)).glob("*/*.webp"))
    xs = [int(p.parent.name) for p in plocice]; ys = [int(p.stem) for p in plocice]
    x0, y0 = min(xs), min(ys)
    slika = np.zeros(((max(ys) - y0 + 1) * 256, (max(xs) - x0 + 1) * 256, 4), np.uint8)
    for p, x, y in zip(plocice, xs, ys):
        slika[(y - y0) * 256:(y - y0 + 1) * 256, (x - x0) * 256:(x - x0 + 1) * 256] = np.array(Image.open(p).convert("RGBA"))
    vel = 2 * R / 2 ** Z / 256  # m (3857) po pikselu
    return slika, (-R + x0 * 256 * vel, R - y0 * 256 * vel), vel


def piksel_u_lonlat(px, py, ishod, vel):
    x = ishod[0] + px * vel; y = ishod[1] - py * vel
    lon = x / R * 180; lat = math.degrees(2 * math.atan(math.exp(y / R * math.pi)) - math.pi / 2)
    return [round(lon, 7), round(lat, 7)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--groblje", required=True)
    ap.add_argument("--plocica", type=int, default=1024)
    ap.add_argument("--tocke", type=int, default=40, help="točaka po stranici pločice (gušće = sporije, više grobova)")
    a = ap.parse_args()
    import cv2, torch
    from segment_anything import sam_model_registry, SamAutomaticMaskGenerator

    mapa = KORIJEN / "data/groblja" / a.groblje
    slika, ishod, vel = mozaik(mapa)
    lat0 = math.degrees(2 * math.atan(math.exp(ishod[1] / R * math.pi)) - math.pi / 2)
    m_po_px = vel * math.cos(math.radians(lat0))  # stvarni metri po pikselu
    log(f"Mozaik {slika.shape[1]}x{slika.shape[0]} px, {m_po_px * 100:.1f} cm/px")

    model_put = pathlib.Path("/tmp/sam_vit_b.pth")
    if not model_put.exists():
        log("Preuzimam model…"); urllib.request.urlretrieve(MODEL_URL, model_put)
    torch.set_num_threads(4)
    sam = sam_model_registry["vit_b"](checkpoint=str(model_put)); sam.eval()
    gen = SamAutomaticMaskGenerator(sam, points_per_side=a.tocke, pred_iou_thresh=0.84,
                                    stability_score_thresh=0.88, min_mask_region_area=int(0.8 / m_po_px ** 2),
                                    points_per_batch=128)
    rgb = slika[..., :3]; alfa = slika[..., 3]
    h, w = alfa.shape
    korak = a.plocica - 160
    kandidati = []
    a_min, a_max = 1.3 / m_po_px ** 2, 9.0 / m_po_px ** 2
    t0 = time.time()
    for y0 in range(0, max(h - 160, 1), korak):
        for x0 in range(0, max(w - 160, 1), korak):
            al = alfa[y0:y0 + a.plocica, x0:x0 + a.plocica]
            if (al > 0).mean() < 0.15:
                continue
            isjecak = np.ascontiguousarray(rgb[y0:y0 + a.plocica, x0:x0 + a.plocica])
            with torch.no_grad():
                maske = gen.generate(isjecak)
            for mk in maske:
                seg = mk["segmentation"]; povrsina = int(seg.sum())
                if not (a_min <= povrsina <= a_max):
                    continue
                kont, _ = cv2.findContours(seg.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                c = max(kont, key=cv2.contourArea)
                (cx, cy), (rw, rh), kut = cv2.minAreaRect(c)
                if rw * rh == 0:
                    continue
                duga, kratka = max(rw, rh) * m_po_px, min(rw, rh) * m_po_px
                pravokutnost = povrsina / (rw * rh)
                if pravokutnost < 0.78 or not (1.5 <= duga <= 3.8) or not (0.6 <= kratka <= 2.6) or duga / kratka > 3.5:
                    continue
                boja = isjecak[seg].astype(int)
                r_, g_, b_ = boja[:, 0].mean(), boja[:, 1].mean(), boja[:, 2].mean()
                zeleno = np.mean((boja[:, 1] > boja[:, 0] + 8) & (boja[:, 1] > boja[:, 2] + 8))
                if zeleno > 0.45:  # travnjak, živica
                    continue
                # rub pločice: objekt možda presječen -> preskoči (pokriva ga susjedna pločica)
                xs, ys = np.nonzero(seg.any(0))[0], np.nonzero(seg.any(1))[0]
                if (xs.min() < 3 and x0 > 0) or (ys.min() < 3 and y0 > 0) or \
                   (xs.max() > seg.shape[1] - 4 and x0 + a.plocica < w) or (ys.max() > seg.shape[0] - 4 and y0 + a.plocica < h):
                    continue
                kutovi = cv2.boxPoints(((cx + x0, cy + y0), (rw, rh), kut))
                kandidati.append({"kutovi": kutovi, "povrsina": povrsina,
                                  "ocjena": float(mk["predicted_iou"] * mk["stability_score"] * pravokutnost),
                                  "duga": duga, "kratka": kratka})
            log(f"  pločica {x0},{y0}: ukupno kandidata {len(kandidati)} ({time.time() - t0:.0f} s)")

    # uklanjanje preklapanja: zadrži bolji od dva pravokutnika koji se preklapaju > 35 %
    import shapely.geometry as sg
    from shapely.strtree import STRtree
    kandidati.sort(key=lambda k: -k["ocjena"])
    poli = [sg.Polygon(k["kutovi"]) for k in kandidati]
    stablo = STRtree(poli)
    zadrzani, iskljuceni = [], set()
    for i, p in enumerate(poli):
        if i in iskljuceni:
            continue
        zadrzani.append(i)
        for j in stablo.query(p):
            j = int(j)
            if j != i and j not in iskljuceni:
                presjek = p.intersection(poli[j]).area
                if presjek > 0.35 * min(p.area, poli[j].area):
                    iskljuceni.add(j)
    znacajke = []
    for n, i in enumerate(zadrzani, 1):
        k = kandidati[i]
        prsten = [piksel_u_lonlat(float(x), float(y), ishod, vel) for x, y in k["kutovi"]]
        prsten.append(prsten[0])
        znacajke.append({"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [prsten]},
                         "properties": {"oznaka": f"P{n}", "duzina_m": round(k["duga"], 2), "sirina_m": round(k["kratka"], 2),
                                        "povrsina_m2": round(k["duga"] * k["kratka"], 2),
                                        "pouzdanost": round(k["ocjena"], 2), "izvor": "automatski prijedlog (SAM)"}})
    izlaz = KORIJEN / "data/groblja" / f"{a.groblje}_grobna_mjesta.geojson"
    izlaz.write_text(json.dumps({"type": "FeatureCollection", "features": znacajke}, ensure_ascii=False, separators=(",", ":")))
    log(f"Gotovo: {len(znacajke)} grobnih mjesta (od {len(kandidati)} kandidata) -> {izlaz.relative_to(KORIJEN)}")


if __name__ == "__main__":
    main()
