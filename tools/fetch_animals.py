#!/usr/bin/env python3
"""
Fetch the FOUND (never generated) rigged + animated animal bodies used by the
"body pack" (swap the fly for a dog / cat / bird):

  * poly.pizza  - Quaternius' CC0 animals, served as .glb straight from
                  static.poly.pizza/<ResourceID>.glb (the id is in the model
                  page's embedded "model" JSON)                -> assets/animals/{dog,cat}/
  * gobkit.com  - Gobkit free animal packs (CC0), plain .glb   -> assets/animals/bird/

All CC0 1.0; credits are in web/public/assets/LICENSE.md.  Idempotent: files
that already exist are skipped.  Prints a one-line rig summary per file when
tools/gltf_rig_info.py is importable (it always is, it sits next to this file).

    python3 tools/fetch_animals.py            # fetch what is missing
    python3 tools/fetch_animals.py --force    # re-download everything
"""
import sys, time, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web/public/assets/animals"
UA = {"User-Agent": "Mozilla/5.0 gfly-fetch/1.0 (https://gfly.site; tianjiahe11@gmail.com)"}

# local path            url                                                              title / author / page
ANIMALS = {
    # -- dog -------------------------------------------------------------------------------------------------
    "dog/dog.glb":       ("https://static.poly.pizza/de55d76a-f578-4979-97ff-2a62edac32f3.glb",
                          "Dog / Quaternius / https://poly.pizza/m/2kUk0QqpCg"),          # 16 joints, Idle Walk Run Jump...
    "dog/shiba_inu.glb": ("https://static.poly.pizza/ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77.glb",
                          "Shiba Inu / Quaternius / https://poly.pizza/m/y4wdQpg767"),    # 46 joints, Idle Walk Gallop...
    # -- cat -------------------------------------------------------------------------------------------------
    "cat/cat.glb":       ("https://static.poly.pizza/67f5e3fe-37ee-4c86-95c8-d269d8c9f8ba.glb",
                          "Cat / Quaternius / https://poly.pizza/m/qKICY6xla2"),          # same 16-joint rig as dog.glb
    # -- bird ------------------------------------------------------------------------------------------------
    "bird/blue_jay.glb": ("https://gobkit.com/freebies/animalB/Blue.glb",
                          "Blue (blue jay) / Gobkit Free Animal Pack B / https://gobkit.com/freebies"),
    "bird/owl.glb":      ("https://gobkit.com/freebies/animalB/Owl.glb",
                          "Owl / Gobkit Free Animal Pack B / https://gobkit.com/freebies"),
}


def http(url, tries=4):
    delay = 2.0
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except Exception as e:
            if attempt == tries - 1:
                raise
            print(f"    retry {attempt + 1} after {delay:.0f}s: {e}")
            time.sleep(delay)
            delay *= 2


def main(argv):
    force = "--force" in argv
    for rel, (url, who) in ANIMALS.items():
        dest = OUT / rel
        if dest.exists() and not force:
            print(f"  have {rel}")
            continue
        print(f"  {who}\n    {url} -> {rel}")
        data = http(url)
        assert data[:4] == b"glTF", f"{url}: not a binary glTF"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from gltf_bounds import load
        for rel in ANIMALS:
            doc = load(OUT / rel)
            joints = sum(len(s.get("joints", [])) for s in doc.get("skins", []))
            clips = [a.get("name", "?").split("|")[-1] for a in doc.get("animations", [])]
            print(f"  {rel:20s} {(OUT / rel).stat().st_size / 1e6:.2f} MB  joints={joints:3d}  clips={clips}")
    except Exception as e:  # summary is a nicety only
        print(f"  (rig summary skipped: {e})")
    print("done")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
