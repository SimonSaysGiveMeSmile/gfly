#!/usr/bin/env python3
"""
Fetch the third-party art the site uses, so nothing on screen is invented here.

Everything comes from Poly Haven (CC0): light probes, surface textures and
furniture models. The mahjong tiles are FluffyStuff's riichi-mahjong-tiles
(CC0) and are fetched by hand from GitHub; see web/public/mahjong/LICENSE.md.

    python3 tools/fetch_assets.py            # writes into web/public/assets
"""
import json, sys, urllib.request
from pathlib import Path

API = "https://api.polyhaven.com/files/"
OUT = Path(__file__).resolve().parent.parent / "web/public/assets"

HDRIS = {"studio_small_09": "1k", "chinese_garden": "1k"}
TEXTURES = {"velour_velvet": ("1k", ["Diffuse", "nor_gl", "Rough"]),
            "wood_table_001": ("1k", ["Diffuse", "nor_gl", "Rough"])}
MODELS = {"chinese_tea_table": "1k", "chinese_stool": "1k", "chinese_armchair": "1k"}


UA = {"User-Agent": "gfly-fetch/1.0 (+https://gfly.site)"}


def get(url, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return
    print(f"  {url.split('/')[-1]} -> {dest.relative_to(OUT)}")
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        dest.write_bytes(r.read())


def files(asset):
    with urllib.request.urlopen(urllib.request.Request(API + asset, headers=UA)) as r:
        return json.load(r)


def main():
    for name, res in HDRIS.items():
        f = files(name)["hdri"][res]["hdr"]
        get(f["url"], OUT / "hdri" / f"{name}_{res}.hdr")

    for name, (res, maps) in TEXTURES.items():
        f = files(name)
        for m in maps:
            entry = f[m][res]["jpg"]
            get(entry["url"], OUT / "tex" / name / f"{m.lower()}.jpg")

    for name, res in MODELS.items():
        f = files(name)["gltf"][res]["gltf"]
        base = OUT / "models" / name
        get(f["url"], base / f"{name}.gltf")
        for rel, inc in f.get("include", {}).items():
            get(inc["url"], base / rel)

    (OUT / "LICENSE.md").write_text(
        "All files under this directory are from Poly Haven (https://polyhaven.com), CC0 1.0.\n"
        "Fetched by tools/fetch_assets.py.\n")
    print("done")


if __name__ == "__main__":
    sys.exit(main())
