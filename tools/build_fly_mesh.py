#!/usr/bin/env python3
"""
Compile the flybody fruit fly into one web-weight mesh.

flybody (Google DeepMind / HHMI Janelia, Apache-2.0) ships the body as 85 OBJ
parts placed by a MuJoCo kinematic tree. MuJoCo is used here purely for its
forward kinematics: it places every part in the rest pose, and its own copy of
the mesh vertices is already scaled and re-centred consistently with the geom
frames. Each part is decimated with Open3D, merged, and tagged with a material
index so the viewer can colour the eyes, wings and cuticle separately.

    python3 tools/build_fly_mesh.py --xml <flybody/fruitfly.xml> --out web/public/fly/fly.bin.gz
"""
import argparse, gzip, re, struct, time
from pathlib import Path

import numpy as np

MAGIC = b"GFLYF001"
TARGET_TRIS = 40_000


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def main(xml: Path, out: Path):
    import mujoco, open3d as o3d

    model = mujoco.MjModel.from_xml_path(str(xml))
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)

    # Material colours straight from the model file.
    mats = {}
    for mt in re.finditer(r'<material name="([^"]+)"[^>]*rgba="([^"]+)"', xml.read_text()):
        mats[mt.group(1)] = [float(x) for x in mt.group(2).split()]
    mat_names = sorted(mats)
    log(f"materials: {mat_names}")

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
        t = data.geom_xpos[g]
        v = v @ R.T + t
        mat_id = int(model.geom_matid[g])
        mat = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_MATERIAL, mat_id) if mat_id >= 0 else "body"
        parts.append((v, f, mat_names.index(mat)))
        total_tris += len(f)
    log(f"{len(parts)} parts, {total_tris:,} triangles at source resolution")

    V, N, F, M = [], [], [], []
    base = 0
    for v, f, mi in parts:
        share = max(200, int(TARGET_TRIS * len(f) / total_tris))
        m = o3d.geometry.TriangleMesh(o3d.utility.Vector3dVector(v), o3d.utility.Vector3iVector(f))
        if len(f) > share:
            m = m.simplify_quadric_decimation(target_number_of_triangles=share)
        m.remove_degenerate_triangles(); m.remove_unreferenced_vertices()
        m.compute_vertex_normals()
        v2 = np.asarray(m.vertices); f2 = np.asarray(m.triangles)
        V.append(v2); N.append(np.asarray(m.vertex_normals)); F.append(f2 + base)
        M.append(np.full(len(v2), mi, dtype=np.uint8))
        base += len(v2)

    V = np.concatenate(V); N = np.concatenate(N); F = np.concatenate(F); M = np.concatenate(M)
    # Recentre on the body and scale so the fly is ~1 unit long. MuJoCo's frame
    # is x forward, z up; the viewer converts to its own convention on load.
    V -= (V.min(0) + V.max(0)) / 2
    V /= (V.max(0) - V.min(0)).max()
    log(f"merged: {len(V):,} vertices, {len(F):,} triangles")

    buf = bytearray(MAGIC)
    buf += struct.pack("<III", len(V), len(F), len(mat_names))
    for name in mat_names:
        rgba = mats[name]
        buf += struct.pack("<4f", *rgba)
    buf += V.astype(np.float32).tobytes()
    buf += N.astype(np.float32).tobytes()
    buf += M.tobytes()
    buf += bytes((-len(M)) % 4)                    # pad to 4-byte alignment
    buf += F.astype(np.uint32).tobytes()
    out.parent.mkdir(parents=True, exist_ok=True)
    gz = gzip.compress(bytes(buf), 9)
    out.write_bytes(gz)
    log(f"{out.name}: {len(buf)/1e6:.2f} MB raw -> {len(gz)/1e6:.2f} MB gzip")
    log(f"materials order: {mat_names}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--xml", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    main(a.xml, a.out)
