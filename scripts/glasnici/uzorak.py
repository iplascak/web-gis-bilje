import pathlib, re, sys
m = pathlib.Path(sys.argv[1]); rez = []
for f in sorted(m.glob("*.txt")):
    t = f.read_text(encoding="utf-8", errors="ignore")
    rez.append((len(re.findall(r"(?i)kapitaln", t)), len(t), f.name))
rez.sort(reverse=True)
for r in rez[:40]: print("## ", r)
print("## prazni (sken?):", [n for c, l, n in rez if l < 3000][:80])
najbolji = m / rez[0][2]
red = [r for r in najbolji.read_text(encoding="utf-8", errors="ignore").split("\n") if re.search(r"(?i)kapitaln", r)]
for r in red[:50]: print("| ", r[:160])
