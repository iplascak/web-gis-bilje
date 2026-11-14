# Web GIS Općine Bilje

Besplatni web GIS portal Općine Bilje, izrađen isključivo s alatima otvorenog koda.
Portal je statički: nema servera ni baze koju treba održavati, a hostira se besplatno (GitHub Pages).

## Struktura

```
index.html            – stranica portala
css/app.css           – izgled
js/app.js             – logika karte (ne treba je dirati za nove slojeve)
config/portal.json    – naslov, početni prikaz, podloge
config/layers.json    – GRUPE I SLOJEVI (moduli) ← ovdje se dodaju novi slojevi
data/                 – vlastiti podaci (GeoJSON, WGS84 / EPSG:4326)
lib/                  – OpenLayers i proj4 (lokalne kopije, bez vanjskih ovisnosti)
```

## Kako pokrenuti na svom računalu

U mapi projekta pokrenite:

```
python -m http.server 8000
```

i otvorite http://localhost:8000 u pregledniku.
(Dvoklik na index.html neće raditi jer preglednik ne dopušta učitavanje podataka s diska.)

## Kako dodati novi sloj (modul)

1. U QGIS-u pripremite sloj i izvezite ga kao **GeoJSON** s koordinatnim sustavom **EPSG:4326**
   (desni klik na sloj → Export → Save Features As…). Spremite ga u mapu `data/`.
2. U `config/layers.json` dodajte zapis u popis `slojevi`, npr.:

```json
{
  "id": "igralista",
  "naziv": "Dječja igrališta",
  "grupa": "osnovno",
  "tip": "geojson",
  "url": "data/igralista.geojson",
  "vidljivo": false,
  "stil": { "geometrija": "tocka", "boja": "#db2777" },
  "skocniProzor": {
    "naslov": "naziv",
    "polja": [ { "polje": "opremljenost", "oznaka": "Oprema" } ]
  },
  "opis": "Javna dječja igrališta na području općine.",
  "izvor": "Općina Bilje",
  "azurirano": "2026-11"
}
```

3. Po potrebi dodajte novu grupu u popis `grupe`.

### Mogućnosti stila

- `geometrija`: `tocka`, `linija` ili `poligon`
- `boja`, `velicina` (točke), `debljina` (linije i rubovi), `rub` i `ispuna` (poligoni)
- `kategorije`: boja prema vrijednosti polja (vidi sloj `projekti`)

### Formati u skočnom prozoru

`eur`, `datum`, `postotak`, `kategorija`, `poveznica`

### WMS slojevi (vanjski servisi)

`"tip": "wms"` s `url`, `wmsSlojevi` i `projekcija` (za DGU servise `EPSG:3765`).

## Objava na internetu (GitHub Pages, besplatno)

1. Napravite repozitorij na GitHubu (po mogućnosti u organizaciji Općine Bilje).
2. Učitajte sve datoteke projekta.
3. Settings → Pages → Source: *Deploy from a branch* → `main` / root.
4. Portal je dostupan na `https://<korisnik>.github.io/<repozitorij>/`.
   Kasnije se može povezati poddomena, npr. `gis.bilje.hr`.

## Izvori podataka

| Podatak | Izvor | Uvjeti |
|---|---|---|
| Karta | OpenStreetMap | © OpenStreetMap suradnici (ODbL) |
| Ortofoto 2023. | Državna geodetska uprava, WMS | Otvorena dozvola (data.gov.hr) |
| Katastarske čestice | DGU, INSPIRE WMS | Uz prihvaćanje uvjeta korištenja DGU-a |
| Granica općine | geoBoundaries | CC BY 4.0 – **privremeno**, zamijeniti službenom granicom |
| Projekti | Općina Bilje | **trenutno izmišljeni primjeri** |

## Napomena

Portal je informativnog karaktera i nema pravnu snagu.

## Licenca

Kod: MIT (vidi LICENSE). Podaci: prema uvjetima pojedinog izvora.

## Projekti (tablica)

Projekti se uređuju u `data/izvori/projekti.csv` (Excel → Spremi kao CSV UTF-8, razdjelnik `;`).
Nakon izmjene pokrenite `python scripts/projekti.py`, koji izrađuje `data/projekti.geojson`.
Za točnu lokaciju upišite stupce `lon` i `lat`; inače se projekt smješta u središte naselja.

## "Što je na ovoj lokaciji?"

Provjere u izvještaju definirane su u `config/portal.json` → `lokacija.provjere`.
Vrste: `poligon` (točka unutar objekta sloja) i `wmsPiksel` (razred iz WMS karte prema legendi).

## Poveznice

Gumb **Podijeli** kopira poveznicu oblika `#v=zoom/lon/lat&p=podloga&s=sloj1,sloj2&l=lon,lat`
(`l` otvara izvještaj o lokaciji).

## Tjedna provjera servisa

`.github/workflows/provjera-servisa.yml` svakog ponedjeljka pokreće `scripts/provjera_servisa.py`.
Ako neki izvor ne radi, otvara se issue s oznakom `provjera-servisa` (GitHub šalje e-mail).
Ručno pokretanje: Actions → Tjedna provjera servisa → Run workflow.

## Elementarne nepogode (satelitska analiza)

1. U `config/nepogode.json` kopirajte postojeći zapis i promijenite `id`, `naziv`, `vrsta`, `opis` i `analiza`:
   - suša / toplinski val: `"metoda": "ndvi_anomalija"`, `godina`, `razdoblje` (MM-DD), `referentne_godine`
   - tuča / oluja / požar: `"metoda": "ndvi_promjena"`, `"prije": ["2027-06-01","2027-06-20"]`, `"poslije": ["2027-06-25","2027-07-15"]`
2. Status postavite na `ceka_obradu` i spremite (commit).
3. GitHub → Actions → **Analiza elementarne nepogode** → Run workflow → upišite `id`.
4. Za nekoliko minuta karta i ARKOD parcele pojavljuju se u grupi *Elementarne nepogode*,
   a nepogoda i u izvještaju "Što je na ovoj lokaciji?".

Podaci: Copernicus Sentinel-2 L2A preko javnog STAC kataloga Earth Search (besplatno). Svaka analiza
ostavlja `manifest.json` s popisom snimaka, processing baselineom i primijenjenim pomakom.
