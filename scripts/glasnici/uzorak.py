import pathlib, re, sys
m = pathlib.Path(sys.argv[1])
for ime in ["ODLUKA_O_IZVRSENJU_PRORACUNA_2023.pdf.txt", "SLGL9-2020.pdf.txt"]:
    t = (m / ime).read_text(encoding="utf-8", errors="ignore").split("\n")
    pog = [r for r in t if re.search(r"apitaln|[KT]\d{4,7}\b|Program ", r)]
    print("####", ime, len(t), len(pog))
    for r in pog[:60]: print("|", r[:150])
