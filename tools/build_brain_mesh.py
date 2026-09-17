#!/usr/bin/env python3
"""
Compile the official MaleCNS neuropil shells into web-weight meshes.

Source: gs://flyem-male-cns/rois/brain-shell-with-lamina-v2.1/mesh/all_brain.ngmesh
        gs://flyem-male-cns/rois/vnc-shell-v2/mesh/vnc-shell.ngmesh
Both are Janelia / Google Research, CC-BY 4.0. Neuroglancer legacy mesh format:
uint32 vertex count, float32 xyz vertices in nm, then uint32 triangle indices.

The brain shell is 3.1M triangles; a browser wants ~60k. Coordinates are kept
in the release's native nm frame (soma positions in neurons.bin are 8 nm voxels
of the same frame), so the point cloud and the shell line up with no fitting.

    python3 tools/build_brain_mesh.py --src <dir> --out web/public/brain
"""
import argparse, gzip, struct, time
from pathlib import Path

import numpy as np

MAGIC = b"GFLYM001"


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def read_ngmesh(path: Path):
    b = path.read_bytes()
    nv = struct.unpack_from("<I", b, 0)[0]
    verts = np.frombuffer(b, "<f4", nv * 3, 4).reshape(nv, 3).copy()
    rest = 4 + 12 * nv
    ntri = (len(b) - rest) // 12
    tris = np.frombuffer(b, "<u4", ntri * 3, rest).reshape(ntri, 3).copy()
    return verts, tris


def vertex_normals(v, f):
    n = np.zeros_like(v)
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    fn = np.cross(b - a, c - a)
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    ln[ln == 0] = 1
    return n / ln


def compile_mesh(src: Path, out: Path, target_tris: int):
    import open3d as o3d
    log(f"reading {src.name}")
    v, f = read_ngmesh(src)
    log(f"  {len(v):,} vertices, {len(f):,} triangles")

    # The shells are not edge-manifold (they are unions of many closed
    # surfaces), which stalls edge-collapse implementations that refuse to
    # touch non-manifold edges. Open3D's quadric decimation tolerates it.
    m = o3d.geometry.TriangleMesh(
        o3d.utility.Vector3dVector(v.astype(np.float64)),
        o3d.utility.Vector3iVector(f.astype(np.int32)),
    )
    m = m.simplify_quadric_decimation(target_number_of_triangles=target_tris)
    m.remove_degenerate_triangles()
    m.remove_unreferenced_vertices()
    m.compute_vertex_normals()
    v2 = (np.asarray(m.vertices) / 8.0).astype(np.float32)   # 8 nm voxels, like somaLocation
    n2 = np.asarray(m.vertex_normals).astype(np.float32)
    f2 = np.asarray(m.triangles).astype(np.uint32)
    log(f"  decimated to {len(v2):,} vertices, {len(f2):,} triangles")

    buf = bytearray(MAGIC)
    buf += struct.pack("<II", len(v2), len(f2))
    buf += v2.tobytes()
    buf += n2.tobytes()
    buf += f2.tobytes()
    data = gzip.compress(bytes(buf), 9)
    out.write_bytes(data)
    log(f"  {out.name}: {len(buf)/1e6:.1f} MB raw -> {len(data)/1e6:.2f} MB gzip")
    lo, hi = v2.min(0), v2.max(0)
    log(f"  bbox (8nm voxels) {lo.astype(int)} .. {hi.astype(int)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    compile_mesh(a.src / "all_brain.ngmesh", a.out / "brain-shell.bin.gz", 60_000)
    compile_mesh(a.src / "vnc-shell.ngmesh", a.out / "vnc-shell.bin.gz", 30_000)
