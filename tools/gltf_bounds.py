#!/usr/bin/env python3
"""
Print the node tree of a .gltf/.glb with per-node POSITION bounds, so pieces can
be placed by code without opening Blender.

    python3 tools/gltf_bounds.py web/public/assets/models/chess_set/chess_set.gltf

For each node that carries a mesh: name, local translation/scale (if any) and the
min/max of its primitives' POSITION accessors (local space; the node transform is
NOT applied unless it is a plain translation, which is added for convenience).
"""
import json, struct, sys
from pathlib import Path


def load(path: Path):
    data = path.read_bytes()
    if data[:4] == b"glTF":  # .glb container
        _, _, length = struct.unpack_from("<III", data, 0)
        off, doc, bin_ = 12, None, None
        while off < length:
            clen, ctype = struct.unpack_from("<II", data, off)
            chunk = data[off + 8: off + 8 + clen]
            if ctype == 0x4E4F534A:
                doc = json.loads(chunk)
            elif ctype == 0x004E4942:
                bin_ = chunk
            off += 8 + clen
        return doc
    return json.loads(data)


def bounds(doc, path: Path):
    acc = doc.get("accessors", [])
    meshes = doc.get("meshes", [])
    nodes = doc.get("nodes", [])
    out = []
    for i, n in enumerate(nodes):
        if "mesh" not in n:
            continue
        mn = [float("inf")] * 3
        mx = [float("-inf")] * 3
        tris = 0
        for p in meshes[n["mesh"]]["primitives"]:
            a = acc[p["attributes"]["POSITION"]]
            mn = [min(a, b) for a, b in zip(mn, a["min"])]
            mx = [max(a, b) for a, b in zip(mx, a["max"])]
            if "indices" in p:
                tris += acc[p["indices"]]["count"] // 3
        t = n.get("translation", [0, 0, 0])
        s = n.get("scale")
        r = n.get("rotation")
        out.append((n.get("name", f"node{i}"), meshes[n["mesh"]].get("name"), mn, mx, t, s, r, tris))
    return out


def main():
    for arg in sys.argv[1:]:
        path = Path(arg)
        doc = load(path)
        print(f"# {path}")
        print(f"  nodes={len(doc.get('nodes', []))} meshes={len(doc.get('meshes', []))} "
              f"materials={[m.get('name') for m in doc.get('materials', [])]}")
        for name, mesh, mn, mx, t, s, r, tris in bounds(doc, path):
            f = lambda v: "(" + ", ".join(f"{x:.3f}" for x in v) + ")"
            extra = ""
            if any(t):
                extra += f" translation={f(t)} -> world-ish min={f([a+b for a,b in zip(mn,t)])} max={f([a+b for a,b in zip(mx,t)])}"
            if s and s != [1, 1, 1]:
                extra += f" scale={f(s)}"
            if r and r != [0, 0, 0, 1]:
                extra += f" rot={f(r)}"
            print(f"  {name:32s} mesh={mesh!s:28s} tris={tris:6d} min={f(mn)} max={f(mx)}{extra}")


if __name__ == "__main__":
    main()
