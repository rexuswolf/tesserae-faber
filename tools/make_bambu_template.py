"""
Generates src/bambu/<id>-template.json: Bambu Studio project settings for a Bambu Lab
A1 or A1 mini with Bambu's standard profile for its nozzle (0.4 mm: 0.20 mm layers;
0.2 mm: 0.10 mm layers) and PLA Basic, one filament per Midnight Mint colour. The
browser trims it to the filaments a project actually uses.

Run once per printer and nozzle (needs Bambu Studio installed):
  python3 tools/make_bambu_template.py <any.stl> [a1|a1mini|a1-n02|a1mini-n02]     (default a1)
"""
import json, os, subprocess, sys, tempfile, zipfile

APP = "/Applications/BambuStudio.app"
CLI = f"{APP}/Contents/MacOS/BambuStudio"
PROFILES = f"{APP}/Contents/Resources/profiles/BBL"
# template id -> (machine, process, filament profile, bed size in mm). The ids are the printer's
# (PRINTERS in src/bambu/plates.ts), plus "-n02" for the 0.2 mm nozzle (NOZZLES there).
PRINTERS = {
    "a1": ("Bambu Lab A1 0.4 nozzle", "0.20mm Standard @BBL A1", "Bambu PLA Basic @BBL A1", 256),
    "a1mini": ("Bambu Lab A1 mini 0.4 nozzle", "0.20mm Standard @BBL A1M", "Bambu PLA Basic @BBL A1M", 180),
    "a1-n02": ("Bambu Lab A1 0.2 nozzle", "0.10mm Standard @BBL A1 0.2 nozzle", "Bambu PLA Basic @BBL A1 0.2 nozzle", 256),
    "a1mini-n02": ("Bambu Lab A1 mini 0.2 nozzle", "0.10mm Standard @BBL A1M 0.2 nozzle", "Bambu PLA Basic @BBL A1M 0.2 nozzle", 180),
}
# Must match FILAMENT_SLOTS in src/bambu/bambu3mf.ts (order = filament number).
COLOURS = ["#1d1c21", "#2f86e0", "#b3191e", "#8a3d9e", "#d4a72c", "#3f9651", "#c9a227", "#a7adb4", "#9a6a3a", "#ece9e2"]
TEMPLATE_META = {"name", "instantiation", "type", "from", "setting_id"}


def resolve(kind, name, out_dir):
    chain, cur = [], name
    while cur:
        with open(f"{PROFILES}/{kind}/{cur}.json") as f:
            p = json.load(f)
        chain.append(p)
        cur = p.get("inherits")
    res = {}
    for p in reversed(chain):
        for t in p.get("include", []):
            with open(f"{PROFILES}/{kind}/{t}.json") as f:
                res.update({k: v for k, v in json.load(f).items() if k not in TEMPLATE_META})
        res.update(p)
    res.pop("include", None)
    res.update(name=name, inherits="", instantiation="true")
    path = os.path.join(out_dir, f"{kind}.json")
    json.dump(res, open(path, "w"))
    return path


def main(stl, printer="a1"):
    PRINTER, PROCESS, FILAMENT, bed = PRINTERS[printer]
    n = len(COLOURS)
    with tempfile.TemporaryDirectory() as tmp:
        assemble = {"plates": [{"plate_name": "t", "need_arrange": False, "objects": [
            {"path": os.path.abspath(stl), "count": 1, "filaments": [1], "assemble_index": [1], "pos_x": [bed / 2], "pos_y": [bed / 2], "pos_z": [0]}]}]}
        json.dump(assemble, open(f"{tmp}/a.json", "w"))
        fil = resolve("filament", FILAMENT, tmp)
        out = f"{tmp}/t.3mf"
        subprocess.run([CLI, "--load-settings", f"{resolve('machine', PRINTER, tmp)};{resolve('process', PROCESS, tmp)}",
                        "--load-filaments", ";".join([fil] * n), "--load-assemble-list", f"{tmp}/a.json",
                        "--export-3mf", "t.3mf", "--outputdir", tmp], check=True, capture_output=True, cwd=tmp)   # the CLI drops a result.json in its cwd
        s = json.loads(zipfile.ZipFile(out).read("Metadata/project_settings.config"))
    # The CLI sizes these for its own default filament count, which breaks slicing.
    s["filament_colour"] = COLOURS
    s["filament_map"] = ["1"] * n
    s["flush_volumes_vector"] = ["140"] * (2 * n)
    s["flush_volumes_matrix"] = ["0" if i == j else "400" for i in range(n) for j in range(n)]
    s["enable_prime_tower"] = "0"
    s["curr_bed_type"] = "Textured PEI Plate"
    per_filament = sorted(k for k, v in s.items() if isinstance(v, list) and len(v) == n)
    os.makedirs("src/bambu", exist_ok=True)
    out_path = f"src/bambu/{printer}-template.json"
    json.dump({"filaments": n, "perFilament": per_filament, "settings": s}, open(out_path, "w"), separators=(",", ":"))
    print(f"wrote {out_path}: {len(s)} settings, {len(per_filament)} per-filament")


if __name__ == "__main__":
    main(sys.argv[1], *sys.argv[2:3])
