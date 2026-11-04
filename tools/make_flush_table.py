#!/usr/bin/env python3
"""Writes src/bambu/flush.json: how much to purge (mm³) between each pair of the app's
filaments, as Bambu Studio's own "auto-calculate" computes it.

A faithful port of Bambu Studio's FlushVolCalculator (src/libslic3r/FlushVolCalc.cpp and
FlushVolPredictor.cpp, v2.x): for a pair of colours in its measured table
(resources/flush/flush_data_standard.txt) it takes the measured value, otherwise its
colour formula (HSV distance and luminance); then adds the nozzle's volume (92 mm³ on the
A1 and A1 mini) and caps at 900. PLA to PLA has no entry in its material-pair table.

    python3 tools/make_flush_table.py [path/to/flush_data_standard.txt]

The colours come from FILAMENT_SLOTS in src/bambu/plates.js.
"""
import json, math, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(sys.argv[1] if len(sys.argv) > 1 else "/Applications/BambuStudio.app/Contents/Resources/flush/flush_data_standard.txt")
NOZZLE_VOLUME = 92       # nozzle_volume in both printer templates
MAX_FLUSH = 900          # g_max_flush_volume


def rgb(hexstr):
    return tuple(int(hexstr[i:i + 2], 16) for i in (1, 3, 5))


# ---- the measured table: a colour matches a listed one within CIEDE2000 5.0
def lab(c):
    def gamma(x):
        return ((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92
    R, G, B = (gamma(v / 255) * 100 for v in c)
    x = 0.412453 * R + 0.357580 * G + 0.180423 * B
    y = 0.212671 * R + 0.715160 * G + 0.072169 * B
    z = 0.019334 * R + 0.119193 * G + 0.950227 * B
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 0.137931
    xn, yn, zn = f(x / 95.0489), f(y / 100), f(z / 108.8840)
    return 116 * yn - 16, 500 * (xn - yn), 200 * (yn - zn)


def de2000(c1, c2):
    (l1, a1, b1), (l2, a2, b2) = lab(c1), lab(c2)
    p25 = 25 ** 7
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cm = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cm ** 7 / (Cm ** 7 + p25)))
    pa1, pa2 = (1 + G) * a1, (1 + G) * a2
    pc1, pc2 = math.hypot(pa1, b1), math.hypot(pa2, b2)
    h = lambda a, b: 0 if a == 0 and b == 0 else math.atan2(b, a) % (2 * math.pi)
    ph1, ph2 = h(pa1, b1), h(pa2, b2)
    dL, dC = l2 - l1, pc2 - pc1
    if pc1 * pc2 == 0:
        dH = 0
    else:
        d = ph2 - ph1
        if d < -math.pi: d += 2 * math.pi
        elif d > math.pi: d -= 2 * math.pi
        dH = 2 * math.sqrt(pc1 * pc2) * math.sin(d / 2)
    Lm, Cpm, Hs = (l1 + l2) / 2, (pc1 + pc2) / 2, ph1 + ph2
    if pc1 * pc2 == 0: Hm = Hs
    elif abs(ph1 - ph2) <= math.pi: Hm = Hs / 2
    else: Hm = (Hs + 2 * math.pi) / 2 if Hs < 2 * math.pi else (Hs - 2 * math.pi) / 2
    r = math.radians
    T = 1 - 0.17 * math.cos(Hm - r(30)) + 0.24 * math.cos(2 * Hm) + 0.32 * math.cos(3 * Hm + r(6)) - 0.2 * math.cos(4 * Hm - r(63))
    dth = r(30) * math.exp(-(((Hm - r(275)) / r(25)) ** 2))
    RC = 2 * math.sqrt(Cpm ** 7 / (Cpm ** 7 + p25))
    SL = 1 + 0.015 * (Lm - 50) ** 2 / math.sqrt(20 + (Lm - 50) ** 2)
    SC, SH = 1 + 0.045 * Cpm, 1 + 0.015 * Cpm * T
    RT = -math.sin(2 * dth) * RC
    return math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH))


def load_table(path):
    lines = path.read_text().split("\n")
    colours = [rgb(c) for c in lines[1].split()]
    table = {}
    for line in lines[3:]:
        if line.strip():
            a, b, v = line.split()
            table[(rgb(a), rgb(b))] = float(v)
    return colours, table


def measured(colours, table, src, dst):
    sim = lambda c: next((x for x in colours if de2000(x, c) <= 5.0), None)
    a, b = sim(src), sim(dst)
    return table.get((a, b)) if a and b else None


# ---- the colour formula (calc_flush_vol_rgb)
def hsv(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    d = mx - mn
    if abs(d) < 0.001: h = 0.0
    elif mx == r: h = 60 * math.fmod((g - b) / d, 6)
    elif mx == g: h = 60 * ((b - r) / d + 2)
    else: h = 60 * ((r - g) / d + 4)
    s = 0.0 if abs(mx) < 0.001 else d / mx
    return h, s, mx


def formula(src, dst):
    s, d = [v / 255 for v in src], [v / 255 for v in dst]
    h1, s1, v1 = hsv(*s)
    h2, s2, v2 = hsv(*d)
    dx = math.cos(math.radians(h1)) * s1 * v1 - math.cos(math.radians(h2)) * s2 * v2
    dy = math.sin(math.radians(h1)) * s1 * v1 - math.sin(math.radians(h2)) * s2 * v2
    hs = min(1.2, math.hypot(dx, dy))
    lum = lambda r, g, b: r * 0.3 + g * 0.59 + b * 0.11
    fl, tl = lum(*s), lum(*d)
    if tl >= fl:
        lf = (tl - fl) ** 0.7 * 560
    else:
        lf = (fl - tl) * 80
        hs = min(0.67 * v2 + 0.33 * v1, hs)
    hf = 230 * hs
    return max(math.sqrt(hf * hf + lf * lf - 2 * hf * lf * math.cos(math.radians(120))), 60)


def main():
    slots = re.findall(r'hex: "(#[0-9a-f]{6})", name: "(\w+)"', (ROOT / "src/bambu/plates.js").read_text())
    colours, table = load_table(DATA)
    matrix = []
    for sh, _ in slots:
        row = []
        for dh, _ in slots:
            if sh == dh:
                row.append(0); continue
            v = measured(colours, table, rgb(sh), rgb(dh))
            v = formula(rgb(sh), rgb(dh)) if v is None else v
            row.append(min(int(v + NOZZLE_VOLUME), MAX_FLUSH))
        matrix.append(row)
    out = {"comment": "Purge (mm³) from row filament to column filament, as Bambu Studio's auto-calculate; written by tools/make_flush_table.py",
           "filaments": [n for _, n in slots], "matrix": matrix}
    (ROOT / "src/bambu/flush.json").write_text(json.dumps(out, indent=1) + "\n")
    w = max(len(n) for _, n in slots)
    print(" " * (w + 1) + " ".join(f"{n[:6]:>6}" for _, n in slots))
    for (_, n), row in zip(slots, matrix):
        print(f"{n:>{w}} " + " ".join(f"{v:6d}" for v in row))


if __name__ == "__main__":
    main()
