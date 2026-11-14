# Iz PDF rasporeda Unikoma (stranice s kalendarima) izvlači datume odvoza po zonama.
# Pokretanje: python scripts/otpad/raspored_iz_pdf.py raspored.pdf izlaz.json
# Godina, brojevi stranica i boje vrsta otpada provjeriti za svaki novi PDF (Unikom ih može promijeniti).
import pdfplumber, json, re, sys
PDF=sys.argv[1]
BOJE={(0.1569,0.4667,0.3373):'mijesani',(0.1725,0.3412,0.6353):'papir',(0.9529,0.7373,0.0):'plastika',(0.6157,0.6196,0.6196):'staklo'}
MJ=['Siječanj','Veljača','Ožujak','Travanj','Svibanj','Lipanj','Srpanj','Kolovoz','Rujan','Listopad','Studeni','Prosinac']
def boja(c):
    if not c or len(c)!=3: return None
    for k,v in BOJE.items():
        if all(abs(a-b)<0.02 for a,b in zip(c,k)): return v
rez={}
with pdfplumber.open(PDF) as p:
    for pi,naziv in [(3,'Bilje I'),(4,'Bilje II'),(5,'Vardarac, Lug, Kopačevo, Kozjak, Zlatna Greda')]:
        pg=p.pages[pi]; words=pg.extract_words()
        zag=[w for w in words if w['text'] in MJ]
        # only first 12 headers (page 3 has a second mini legend calendar)
        zag=sorted(zag,key=lambda w:(round(w['top']/40),w['x0']))[:12]
        dani=[w for w in words if re.fullmatch(r'\d{1,2}',w['text'])]
        out={}
        for c in pg.curves + pg.rects:
            v=boja(c.get('non_stroking_color'))
            if not v: continue
            w_=c['x1']-c['x0']; h_=c['bottom']-c['top']
            if w_>20 or h_>20: continue
            cx=(c['x0']+c['x1'])/2; cy=(c['top']+c['bottom'])/2
            # day number nearest to the circle centre (half circles: centre shifted)
            d=min(dani,key=lambda w:((w['x0']+w['x1'])/2-cx)**2+((w['top']+w['bottom'])/2-cy)**2)
            dx=(d['x0']+d['x1'])/2; dy=(d['top']+d['bottom'])/2
            if abs(dx-cx)>12 or abs(dy-cy)>12: continue
            # month: header above in same column
            kand=[z for z in zag if z['top']<dy and abs((z['x0']+z['x1'])/2-dx)<70]
            if not kand: continue
            m=max(kand,key=lambda z:z['top'])
            mj=MJ.index(m['text'])+1
            datum=f"2026-{mj:02d}-{int(d['text']):02d}"
            out.setdefault(datum,set()).add(v)
        rez[naziv]={k:sorted(v) for k,v in sorted(out.items())}
        from collections import Counter
        print(naziv, len(out), Counter(x for s in out.values() for x in s), file=sys.stderr)
json.dump(rez,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
