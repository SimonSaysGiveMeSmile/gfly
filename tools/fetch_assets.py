#!/usr/bin/env python3
"""
Fetch the third-party art the site uses, so nothing on screen is invented here.

Everything here comes from Poly Haven (CC0): light probes, surface textures and
furniture/prop models. The mahjong tiles are FluffyStuff's riichi-mahjong-tiles
(CC0) and are fetched by hand from GitHub; see web/public/mahjong/LICENSE.md.
Non-Poly-Haven game art (playing cards, xiangqi pieces, cowboy hats, poker
chips, paper texture) is fetched by tools/fetch_game_assets.py.

    python3 tools/fetch_assets.py            # writes into web/public/assets
"""
import json, sys, urllib.request
from pathlib import Path

API = "https://api.polyhaven.com/files/"
OUT = Path(__file__).resolve().parent.parent / "web/public/assets"

HDRIS = {
    "studio_small_09": "1k",     # lab / default probe
    "chinese_garden": "1k",      # mahjong + xiangqi rooms
    "cowboy_town_saloon": "1k",  # poker room (wild-west saloon interior)
}
# Each texture is saved as tex/<name>/{diffuse,nor_gl,rough}.jpg. Poly Haven names
# the colour map differently per asset (Diffuse / diff / col1 / coll1 ...), so the
# local map name maps to a list of API keys tried in order.
TEXTURES = {
    "velour_velvet": "1k",    # mahjong table cloth
    "wood_table_001": "1k",   # generic table wood
    "book_pattern": "1k",     # olive-green woven cotton -> poker felt
    "leather_red_02": "1k",   # poker table rail / saloon leather
}
MAP_KEYS = {"diffuse": ["Diffuse", "diff", "col1", "coll1", "Color"],
            "nor_gl": ["nor_gl"],
            "rough": ["Rough", "rough"]}
MODELS = {
    # mahjong / xiangqi (Chinese furniture)
    "chinese_tea_table": "1k", "chinese_stool": "1k", "chinese_armchair": "1k",
    # western chess
    "chess_set": "1k",
    # poker saloon
    "round_wooden_table_01": "1k", "bar_chair_round_01": "1k", "wine_barrel_01": "1k",
    "wooden_lantern_01": "1k", "wine_bottles_01": "1k", "vintage_oil_lamp": "1k",
    # sudoku desk
    "desk_lamp_arm_01": "1k", "binder_notebook": "1k",
}


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

    for name, res in TEXTURES.items():
        f = files(name)
        for local, keys in MAP_KEYS.items():
            key = next((k for k in keys if k in f), None)
            if key is None:
                print(f"  !! {name}: no {local} map among {list(f)}")
                continue
            get(f[key][res]["jpg"]["url"], OUT / "tex" / name / f"{local}.jpg")

    for name, res in MODELS.items():
        f = files(name)["gltf"][res]["gltf"]
        base = OUT / "models" / name
        get(f["url"], base / f"{name}.gltf")
        for rel, inc in f.get("include", {}).items():
            get(inc["url"], base / rel)

    # Attribution lives in web/public/assets/LICENSE.md (hand-maintained; it also
    # covers the non-Poly-Haven sources fetched by tools/fetch_game_assets.py).
    print("done")


if __name__ == "__main__":
    sys.exit(main())
