#!/usr/bin/env python3
"""
Fetch the FOUND (never generated) game art that is not on Poly Haven:

  * playing cards  - Dmitry Fomin's CC0 "English pattern" SVG deck on Wikimedia
                     Commons + a CC0 card back derived from it        -> assets/cards/
  * xiangqi        - Wj654cj86's public-domain SVG piece faces + board  -> assets/xiangqi/
  * cowboy hats,   - poly.pizza glTF models (CC-BY 3.0, see LICENSE.md) -> assets/models/<name>/
    poker chips
  * paper texture  - ambientCG Paper001 (CC0)                           -> assets/tex/paper001/

Poly Haven items live in tools/fetch_assets.py. Both scripts are idempotent:
files that already exist are skipped.

    python3 tools/fetch_game_assets.py
"""
import io, json, re, sys, time, urllib.parse, urllib.request, zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web/public/assets"
UA = {"User-Agent": "gfly-fetch/1.0 (https://gfly.site; tianjiahe11@gmail.com)"}
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
PAUSE = 1.0  # seconds between Commons downloads; Commons throttles bots hard


# ---------------------------------------------------------------- Commons ---
RANKS = {"ace": "A", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
         "8": "8", "9": "9", "10": "10", "jack": "J", "queen": "Q", "king": "K"}
SUITS = {"spades": "S", "hearts": "H", "diamonds": "D", "clubs": "C"}

CARDS = {f"English_pattern_{r}_of_{s}.svg": f"cards/{R}{S}.svg"
         for r, R in RANKS.items() for s, S in SUITS.items()}
CARDS["Atlas_deck_card_back_blue_and_brown.svg"] = "cards/back.svg"  # CC0, Fomin-derived, same 360x540 box

# Wj654cj86's set: <piece><side>1  ; side l = light (red), d = dark (black)
XQ_PIECES = {"g": "general", "a": "advisor", "e": "elephant", "h": "horse",
             "r": "chariot", "c": "cannon", "s": "soldier"}
XIANGQI = {f"Xiangqi_{p}{side}1.svg": f"xiangqi/{colour}_{name}.svg"
           for p, name in XQ_PIECES.items()
           for side, colour in (("l", "red"), ("d", "black"))}
XIANGQI["Xiangqi_board.svg"] = "xiangqi/board.svg"            # same author, 900x1200, empty board
XIANGQI["Xiang_board_(empty).svg"] = "xiangqi/board_alt.svg"  # Roland Illig, PD, alternative

COMMONS = {**CARDS, **XIANGQI}


def http(url, headers=UA, tries=6, expect=None):
    """GET with exponential back-off. expect: bytes that must appear in the body."""
    delay = 2.0
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                data = r.read()
                ctype = r.headers.get("Content-Type", "")
            if b"Wikimedia Error" in data[:600] or (expect and expect not in data[:4000]):
                raise RuntimeError(f"throttled / unexpected body ({ctype})")
            return data, ctype
        except Exception as e:  # 429 / 503 / HTML error page
            if attempt == tries - 1:
                raise
            print(f"    retry {attempt + 1} after {delay:.0f}s: {e}")
            time.sleep(delay)
            delay *= 2


def commons_info(titles):
    """imageinfo for up to 50 File: titles -> {title: {url, license, artist}}"""
    q = urllib.parse.urlencode({
        "action": "query", "prop": "imageinfo", "format": "json",
        "iiprop": "url|extmetadata", "iiextmetadatafilter": "LicenseShortName|Artist|Credit",
        "titles": "|".join("File:" + t for t in titles)})
    data, _ = http(COMMONS_API + "?" + q, expect=b'"query"')
    info = {}
    for p in json.loads(data)["query"]["pages"].values():
        ii = p["imageinfo"][0]
        em = ii.get("extmetadata", {})
        strip = lambda s: re.sub(r"<[^>]+>", "", s).strip()
        info[p["title"].replace("File:", "").replace(" ", "_")] = {
            "url": ii["url"].split("?")[0],
            "license": em.get("LicenseShortName", {}).get("value", "?"),
            "artist": strip(em.get("Artist", {}).get("value", "?")),
            "page": f"https://commons.wikimedia.org/wiki/File:{p['title'][5:].replace(' ', '_')}",
        }
    return info


def fetch_commons():
    todo = {t: OUT / rel for t, rel in COMMONS.items() if not (OUT / rel).exists()}
    credits = {}
    titles = list(COMMONS)
    for i in range(0, len(titles), 50):
        credits.update(commons_info(titles[i:i + 50]))
    for title, dest in todo.items():
        meta = credits[title]
        print(f"  {title} [{meta['license']}, {meta['artist']}] -> {dest.relative_to(OUT)}")
        data, _ = http(meta["url"], expect=b"<svg")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        time.sleep(PAUSE)
    return credits


# ------------------------------------------------------------- poly.pizza ---
# poly.pizza serves the glb straight from static.poly.pizza/<uuid>.glb (the uuid is in
# the model page's <model-viewer src>). All CC-BY 3.0 unless noted.
POLY_PIZZA = {
    # local path                              uuid                                    page id       title / author
    "models/cowboy_hat/cowboy_hat.glb":      ("d7985d90-3621-4595-8321-25d39a25d47d", "aWzUlZtGLC0", "Cowboy hat / Poly by Google"),
    "models/cowboy_hat/cowboy_hat_02.glb":   ("e267f068-2de9-40d5-8748-f3e46ffbffc8", "jcXfae4GiZ",  "Cowboy Hat / J-Toastie"),
    "models/poker_chips/poker_chips.glb":    ("5f5b8ffe-35be-48d0-a7cb-94e48cc699f0", "2rWnR-y2ojS", "Poker Chips / Jarlan Perez"),
}


def fetch_poly_pizza():
    for rel, (uuid, page, who) in POLY_PIZZA.items():
        dest = OUT / rel
        if dest.exists():
            continue
        print(f"  poly.pizza/m/{page} ({who}) -> {rel}")
        data, _ = http(f"https://static.poly.pizza/{uuid}.glb", headers={"User-Agent": "Mozilla/5.0 gfly-fetch"})
        assert data[:4] == b"glTF", "not a glb"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)


# -------------------------------------------------------------- ambientCG ---
AMBIENTCG = {"Paper001": "paper001"}  # asset id -> tex/<folder>
ACG_MAPS = {"Color": "diffuse", "NormalGL": "nor_gl", "Roughness": "rough"}


def fetch_ambientcg():
    for asset, folder in AMBIENTCG.items():
        dest = OUT / "tex" / folder
        if all((dest / f"{m}.jpg").exists() for m in ACG_MAPS.values()):
            continue
        url = f"https://ambientcg.com/get?file={asset}_1K-JPG.zip"
        print(f"  ambientCG {asset} (CC0) -> tex/{folder}/")
        data, _ = http(url)
        dest.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for n in z.namelist():
                for key, local in ACG_MAPS.items():
                    if n.endswith(f"_{key}.jpg"):
                        (dest / f"{local}.jpg").write_bytes(z.read(n))


def main():
    print("Wikimedia Commons")
    credits = fetch_commons()
    print("poly.pizza")
    fetch_poly_pizza()
    print("ambientCG")
    fetch_ambientcg()
    # machine-readable credits next to the files (LICENSE.md is the human summary)
    (OUT / "commons_credits.json").write_text(json.dumps(
        {COMMONS[t]: v for t, v in credits.items() if t in COMMONS}, indent=1, ensure_ascii=False))
    print("done")


if __name__ == "__main__":
    sys.exit(main())
