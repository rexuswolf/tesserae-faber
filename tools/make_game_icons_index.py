#!/usr/bin/env python3
"""Writes public/game-icons.json: every icon in game-icons.net's repository
(github.com/game-icons/icons) as "author/name", for the workshop's icon search. The icons
themselves are fetched from the repository when chosen. Needs the GitHub CLI (gh).
The "badges" set is left out: those are drawn on a 256-unit canvas inside a filled disc,
so they'd come out as a solid coin, not an icon.

    python3 tools/make_game_icons_index.py
"""
import json, subprocess
from pathlib import Path

tree = json.loads(subprocess.run(["gh", "api", "repos/game-icons/icons/git/trees/master?recursive=1"], check=True, capture_output=True, text=True).stdout)
icons = sorted(t["path"][:-4] for t in tree["tree"] if t["path"].endswith(".svg") and t["path"].count("/") == 1
               and not t["path"].startswith("badges/"))
out = Path(__file__).resolve().parent.parent / "public" / "game-icons.json"
out.write_text(json.dumps(icons, separators=(",", ":")))
print(f"wrote {out}: {len(icons)} icons, {out.stat().st_size // 1024} KB, truncated={tree.get('truncated')}")
