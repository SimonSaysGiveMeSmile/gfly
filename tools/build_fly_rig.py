#!/usr/bin/env python3
"""
Compile the flybody fruit fly into a rigged, web-weight skinned mesh.

flybody (Google DeepMind / HHMI Janelia, Apache-2.0) is a MuJoCo model: 67
articulated bodies hung off a free-floating thorax by 102 hinge joints, with
85 OBJ parts. An earlier script baked all of that into one frozen statue. This
one keeps the articulation: it exports the body tree (rest position and
orientation of every body relative to its parent), every hinge joint (axis
and range, in the body's own frame), and every mesh part decimated and tagged
with the body it belongs to. The browser rebuilds the tree as a three.js
skeleton and drives the joints itself, so the same rig walks, flies, grooms
or holds any pose you ask for.

Coordinates stay in MuJoCo's frame (x forward, y left, z up), scaled so the
fly is one unit long from the front of the head to the tip of the abdomen.
The viewer applies the axis swap.

    python3 tools/build_fly_rig.py --xml <flybody/fruitfly.xml> --out web/public/fly/fly-rig.bin.gz
"""
import argparse, gzip, json, re, struct, time
from pathlib import Path

import numpy as np

MAGIC = b"GFLYR001"
TARGET_TRIS = 44_000


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main(xml: Path, out: Path):
    import mujoco, open3d as o3d

    model = mujoco.MjModel.from_xml_path(str(xml))
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)          # rest pose: all hinges at 0
    name = lambda kind, i: mujoco.mj_id2name(model, kind, i)
    BODY, JOINT, MAT = mujoco.mjtObj.mjOBJ_BODY, mujoco.mjtObj.mjOBJ_JOINT, mujoco.mjtObj.mjOBJ_MATERIAL

    mats = {}
    for mt in re.finditer(r'<material name="([^"]+)"[^>]*rgba="([^"]+)"', xml.read_text()):
        mats[mt.group(1)] = [float(x) for x in mt.group(2).split()]
    mat_names = sorted(mats)

    # ---- geometry, one decimated chunk per mesh geom, in the REST WORLD frame
    # (that is what a skinned mesh wants: bind-pose vertices + a bone index).
    parts = []
    total_tris = 0
    for g in range(model.ngeom):
        if model.geom_type[g] != mujoco.mjtGeom.mjGEOM_MESH:
            continue
        mid = int(model.geom_dataid[g])
        va, vn = model.mesh_vertadr[mid], model.mesh_vertnum[mid]
        fa, fn = model.mesh_faceadr[mid], model.mesh_facenum[mid]
        v = model.mesh_vert[va:va + vn].astype(np.float64)
        f = model.mesh_face[fa:fa + fn].astype(np.int32)
        R = data.geom_xmat[g].reshape(3, 3)
        v = v @ R.T + data.geom_xpos[g]
        mat_id = int(model.geom_matid[g])
        mat = name(MAT, mat_id) if mat_id >= 0 else "body"
        parts.append((v, f, mat_names.index(mat), int(model.geom_bodyid[g]), name(mujoco.mjtObj.mjOBJ_GEOM, g) or ""))
        total_tris += len(f)
    log(f"{len(parts)} parts, {total_tris:,} triangles at source resolution")

    V, N, F, M, B = [], [], [], [], []
    base = 0
    for v, f, mi, bi, gname in parts:
        share = max(200, int(TARGET_TRIS * len(f) / total_tris))
        m = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(v), o3d.utility.Vector3iVector(f))
        if len(f) > share:
            m = m.simplify_quadric_decimation(target_number_of_triangles=share)
        m.remove_degenerate_triangles(); m.remove_unreferenced_vertices()
        m.compute_vertex_normals()
        v2 = np.asarray(m.vertices); f2 = np.asarray(m.triangles)
        # The markings (black stripes, red eyes, ocelli, bristles) are separate
        # shells lying on the cuticle. Decimation moves both surfaces a hair,
        # so they z-fight; lift the overlay off the body by a fraction of a
        # per cent of body length and it draws cleanly.
        if any(k in gname for k in ("black", "red", "ocelli", "bristle")):
            v2 = v2 + np.asarray(m.vertex_normals) * 0.0006
        V.append(v2); N.append(np.asarray(m.vertex_normals)); F.append(f2 + base)
        M.append(np.full(len(v2), mi, dtype=np.uint8))
        B.append(np.full(len(v2), bi, dtype=np.uint8))
        base += len(v2)
    V = np.concatenate(V); N = np.concatenate(N); F = np.concatenate(F)
    M = np.concatenate(M); B = np.concatenate(B)

    # Scale: body length (head tip to abdomen tip) = 1. Legs and wings stick
    # out further; that is fine, the viewer scales the whole rig.
    body_mask = np.isin(B, [b for b in range(model.nbody)
                            if (name(BODY, b) or "").split("_")[0] in ("thorax", "head", "abdomen", "rostrum", "haustellum")])
    xmin, xmax = V[body_mask, 0].min(), V[body_mask, 0].max()
    scale = 1.0 / (xmax - xmin)
    centre = np.array([(xmin + xmax) / 2, 0.0, 0.0])
    log(f"body length {xmax - xmin:.4f} model units -> scale {scale:.3f}")
    Vs = (V - centre) * scale

    # ---- the tree. Body-local rest transforms come straight from the model.
    bodies = []
    for b in range(model.nbody):
        joints = []
        for j in range(model.body_jntadr[b], model.body_jntadr[b] + model.body_jntnum[b]):
            if model.jnt_type[j] != mujoco.mjtJoint.mjJNT_HINGE:
                continue
            joints.append({
                "name": name(JOINT, j),
                "axis": [round(float(x), 5) for x in model.jnt_axis[j]],
                "range": [round(float(x), 4) for x in model.jnt_range[j]],
            })
        parent = int(model.body_parentid[b])
        pos = model.body_pos[b] * scale
        if parent == 0 and b != 0:
            pos = (model.body_pos[b] - centre) * scale       # root sits at the origin
        bodies.append({
            "name": name(BODY, b),
            "parent": parent if b != 0 else -1,
            "pos": [round(float(x), 6) for x in pos],
            "quat": [round(float(x), 6) for x in model.body_quat[b]],  # w x y z
            "joints": joints,
        })
    njoints = sum(len(b["joints"]) for b in bodies)
    log(f"{len(bodies)} bodies, {njoints} hinge joints")

    header = {
        "scale": scale,
        "materials": [{"name": n, "rgba": mats[n]} for n in mat_names],
        "bodies": bodies,
    }
    hjson = json.dumps(header, separators=(",", ":")).encode()
    buf = bytearray(MAGIC)
    buf += struct.pack("<I", len(hjson)) + hjson + bytes((-len(hjson)) % 4)
    buf += struct.pack("<II", len(Vs), len(F))
    buf += Vs.astype(np.float32).tobytes()
    buf += N.astype(np.float32).tobytes()
    buf += M.tobytes() + bytes((-len(M)) % 4)
    buf += B.tobytes() + bytes((-len(B)) % 4)
    buf += F.astype(np.uint32).tobytes()
    out.parent.mkdir(parents=True, exist_ok=True)
    gz = gzip.compress(bytes(buf), 9)
    out.write_bytes(gz)
    log(f"merged: {len(Vs):,} vertices, {len(F):,} triangles")
    log(f"{out.name}: {len(buf)/1e6:.2f} MB raw -> {len(gz)/1e6:.2f} MB gzip")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--xml", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    main(a.xml, a.out)
