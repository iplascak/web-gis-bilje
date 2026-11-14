#!/bin/bash
# Izrezivanje velikih poligona na granicu općine i pojednostavljenje (~2 m) – manje datoteke za preglednik.
set -e
cd data/bioportal
for f in zasticena_podrucja natura_ptice natura_stanista ramsar rezervat_biosfere upravljacke_zone stanista_2016 obnova_prirode; do
  [ -f $f.geojson ] || continue
  ogr2ogr -f GeoJSON /tmp/$f.geojson $f.geojson -clipdst ../granica_opcine.geojson -simplify 0.00002 -nlt PROMOTE_TO_MULTI -lco COORDINATE_PRECISION=6 -lco RFC7946=YES
  mv /tmp/$f.geojson $f.geojson
  echo "$f: $(du -k $f.geojson | cut -f1) kB"
done
rm -f osjetljivost_solar.geojson osjetljivost_vjetar.geojson
