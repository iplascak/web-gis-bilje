import pathlib, re, sys
m = pathlib.Path(sys.argv[1])
def pokazi(ime, rx, n=70):
    t = (m / ime).read_text(encoding="utf-8", errors="ignore").split("\n")
    pog = [r for r in t if re.search(rx, r)]
    print("####", ime, len(pog))
    for r in pog[:n]: print("| ", r[:170])
pokazi("PRORACUN_2025.pdf.txt", r"(?i)projekt|\b[KT]\d{5,7}\b")
pokazi("SLGL8-2025.pdf.txt", r"(?i)izgradnja|rekonstrukcija|uređenje|nabava|izrada|sanacija|energetsk", 90)
