#!/usr/bin/env python3
"""
Describe the RIG of a .gltf/.glb: node tree, skin joints, animation clips, mesh
bounds and scene-root transforms, so an animal body can be wired up (bone names,
forward axis, clip names) without opening Blender.

    python3 tools/gltf_rig_info.py web/public/assets/animals/dog/dog.glb [more.glb ...]

Prints, per file:
  * scenes and their root nodes (with any translation / rotation / scale)
  * the node tree; each line shows [J] when the node is a joint of some skin,
    [M] when it carries a mesh, and the number of children (joint-children for
    joints).  Local TRS is shown when it is not identity.
  * skins: name, root (skeleton), joint count, joint names
  * animations: name, duration (max keyframe time across samplers), number of
    channels and which nodes / paths they drive
  * meshes: per-primitive POSITION bounds and triangle count, plus the union
    bound in the node's local space (rest pose; skinning is NOT applied)

Reuses the .glb/.gltf loader of tools/gltf_bounds.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gltf_bounds import load  # noqa: E402  (.glb / .gltf -> json dict)


def fmt(v):
    return "(" + ", ".join(f"{x:.3f}" for x in v) + ")"


def quat_to_mat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def local_matrix(n):
    """4x4 (row-major, column vectors) local transform of a node."""
    if "matrix" in n:
        m = n["matrix"]  # glTF matrices are column-major
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    t = n.get("translation", [0, 0, 0])
    r = quat_to_mat(n.get("rotation", [0, 0, 0, 1]))
    sc = n.get("scale", [1, 1, 1])
    return [[r[i][j] * sc[j] for j in range(3)] + [t[i]] for i in range(3)] + [[0, 0, 0, 1]]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def apply(m, v):
    return [m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2] + m[i][3] for i in range(3)]


def trs(n):
    parts = []
    if "matrix" in n:
        parts.append("matrix=" + fmt(n["matrix"]))
    t = n.get("translation")
    r = n.get("rotation")
    s = n.get("scale")
    if t and any(abs(x) > 1e-9 for x in t):
        parts.append("t=" + fmt(t))
    if r and any(abs(a - b) > 1e-9 for a, b in zip(r, [0, 0, 0, 1])):
        parts.append("r=" + fmt(r))
    if s and any(abs(x - 1) > 1e-9 for x in s):
        parts.append("s=" + fmt(s))
    return " ".join(parts)


def accessor_max_time(doc, idx):
    a = doc["accessors"][idx]
    if "max" in a:
        return float(a["max"][0])
    return float("nan")


def main():
    for arg in sys.argv[1:]:
        path = Path(arg)
        doc = load(path)
        nodes = doc.get("nodes", [])
        meshes = doc.get("meshes", [])
        skins = doc.get("skins", [])
        anims = doc.get("animations", [])
        acc = doc.get("accessors", [])
        name = lambda i: nodes[i].get("name", f"node{i}")

        joint_of = {}  # node index -> skin index
        for si, sk in enumerate(skins):
            for j in sk.get("joints", []):
                joint_of.setdefault(j, si)

        print(f"# {path}  ({path.stat().st_size / 1e6:.2f} MB)")
        print(f"  asset.generator={doc.get('asset', {}).get('generator')!r}"
              f"  nodes={len(nodes)} meshes={len(meshes)} skins={len(skins)} animations={len(anims)}"
              f"  materials={[m.get('name') for m in doc.get('materials', [])]}")

        # ---- scenes / roots --------------------------------------------------
        for si, sc in enumerate(doc.get("scenes", [])):
            print(f"  scene[{si}] {sc.get('name')!r} roots:")
            for r in sc.get("nodes", []):
                print(f"    {name(r)}  {trs(nodes[r])}")

        # ---- node tree -------------------------------------------------------
        print("  node tree  ([J]=skin joint, [M]=mesh, n=children / joint-children):")
        children_of = {i: n.get("children", []) for i, n in enumerate(nodes)}
        is_child = {c for cs in children_of.values() for c in cs}

        world = {}

        def build(i, parent):
            world[i] = matmul(parent, local_matrix(nodes[i]))
            for c in children_of[i]:
                build(c, world[i])

        ident = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]
        for i in range(len(nodes)):
            if i not in is_child:
                build(i, ident)

        def walk(i, depth):
            n = nodes[i]
            tags = ""
            if i in joint_of:
                jc = sum(1 for c in children_of[i] if c in joint_of)
                tags += f"[J skin{joint_of[i]} jc={jc}]"
            if "mesh" in n:
                m = meshes[n["mesh"]]
                tags += f"[M {m.get('name')!r} prims={len(m['primitives'])}" + (f" skin={n['skin']}" if "skin" in n else "") + "]"
            print(f"    {'  ' * depth}{name(i)}  n={len(children_of[i])} {tags} {trs(n)}")
            for c in children_of[i]:
                walk(c, depth + 1)

        for i in range(len(nodes)):
            if i not in is_child:
                walk(i, 0)

        # ---- skins -----------------------------------------------------------
        for si, sk in enumerate(skins):
            js = sk.get("joints", [])
            root = sk.get("skeleton")
            print(f"  skin[{si}] {sk.get('name')!r} skeleton_root={name(root) if root is not None else None!r} joints={len(js)}")
            print("    " + ", ".join(name(j) for j in js))

        # ---- animations ------------------------------------------------------
        for ai, an in enumerate(anims):
            dur = max((accessor_max_time(doc, s["input"]) for s in an.get("samplers", [])), default=0.0)
            targets = {}
            for ch in an.get("channels", []):
                t = ch["target"]
                targets.setdefault(t.get("node"), set()).add(t["path"])
            print(f"  animation[{ai}] {an.get('name')!r} duration={dur:.3f}s channels={len(an.get('channels', []))} nodes={len(targets)}")
            drives = ", ".join(f"{name(n)}:{'/'.join(sorted(p))}" for n, p in list(targets.items())[:12])
            more = "" if len(targets) <= 12 else f" ... (+{len(targets) - 12} more)"
            print(f"    drives {drives}{more}")

        # ---- meshes ----------------------------------------------------------
        for i, n in enumerate(nodes):
            if "mesh" not in n:
                continue
            m = meshes[n["mesh"]]
            mn = [float("inf")] * 3
            mx = [float("-inf")] * 3
            tris = 0
            for p in m["primitives"]:
                a = acc[p["attributes"]["POSITION"]]
                mn = [min(x, y) for x, y in zip(mn, a["min"])]
                mx = [max(x, y) for x, y in zip(mx, a["max"])]
                tris += acc[p["indices"]]["count"] // 3 if "indices" in p else a["count"] // 3
            size = [b - a for a, b in zip(mn, mx)]
            print(f"  mesh node {name(i)!r} tris={tris} local min={fmt(mn)} max={fmt(mx)} size={fmt(size)}"
                  + ("  (skinned: bounds are the bind pose)" if "skin" in n else ""))
            # world-space (scene) bounds: node chain transform applied to the 8 bbox corners
            corners = [apply(world[i], [mn[0] if a else mx[0], mn[1] if b else mx[1], mn[2] if c else mx[2]])
                       for a in (0, 1) for b in (0, 1) for c in (0, 1)]
            wmn = [min(c[k] for c in corners) for k in range(3)]
            wmx = [max(c[k] for c in corners) for k in range(3)]
            wsize = [b - a for a, b in zip(wmn, wmx)]
            up = "xyz"[wsize.index(max(wsize))]
            print(f"    world min={fmt(wmn)} max={fmt(wmx)} size={fmt(wsize)}  (glTF is +Y up; longest axis={up})")

        # ---- where the skeleton points (helps find the forward axis) --------
        for si, sk in enumerate(skins):
            js = sk.get("joints", [])
            pick = {}
            for j in js:
                nm = name(j).lower()
                for key in ("head", "tail", "root", "hips", "body", "spine"):
                    if key in nm and key not in pick and not nm.endswith("_end"):
                        pick[key] = j
            if pick:
                pos = ", ".join(f"{name(j)}={fmt(apply(world[j], [0, 0, 0]))}" for j in pick.values())
                print(f"  skin[{si}] joint world positions (rest pose): {pos}")
                if "head" in pick and "tail" in pick:
                    h = apply(world[pick["head"]], [0, 0, 0])
                    t = apply(world[pick["tail"]], [0, 0, 0])
                    d = [a - b for a, b in zip(h, t)]
                    ax = max((0, 2), key=lambda k: abs(d[k]))  # horizontal axes only (+Y is up)
                    print(f"    head - tail = {fmt(d)} -> animal faces {'+' if d[ax] > 0 else '-'}{'xyz'[ax]} (world, ignoring Y)")
        print()


if __name__ == "__main__":
    main()
