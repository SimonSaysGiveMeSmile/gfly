#!/usr/bin/env python3
"""
Turn the Janelia/Google MaleCNS v1.0 release into binaries a browser can eat.

The published tables are 0.5-13 GB of Apache Arrow and the bucket serves no
CORS headers, so the browser can never touch them directly. This script runs
once, offline, and emits a compact CSR graph plus a neuron metadata block that
ship as ordinary static assets next to the app.

    python3 tools/build_connectome.py --src <dir-with-feathers> --out web/public/connectome

Source files (download once, ~560 MB):
    connectome-weights-male-cns-v1.0-minconf-0.5-significant-only.feather
    body-annotations-male-cns-v1.0-minconf-0.5.feather
    body-neurotransmitters-male-cns-v1.0.feather
"""
import argparse, gzip, json, struct, sys, time
from pathlib import Path

import numpy as np
import pyarrow.feather as feather

MAGIC_GRAPH = b"GFLYG001"
MAGIC_NODES = b"GFLYN002"

# Drosophila sign convention, following Shiu et al. 2024 whole-brain LIF model:
# acetylcholine is excitatory, GABA and glutamate (via GluCl) are inhibitory,
# monoamines are modulatory and carried as excitatory-but-weak.
NT_SIGN = {
    "acetylcholine": 1, "gaba": -1, "glutamate": -1,
    "dopamine": 1, "octopamine": 1, "serotonin": 1, "unknown": 0,
}
NT_ORDER = ["unknown", "acetylcholine", "gaba", "glutamate",
            "dopamine", "octopamine", "serotonin"]


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def build(src: Path, out: Path, tiers):
    out.mkdir(parents=True, exist_ok=True)

    # ---- edges -------------------------------------------------------------
    wpath = src / "connectome-weights-male-cns-v1.0-minconf-0.5-significant-only.feather"
    log(f"reading {wpath.name}")
    tbl = feather.read_table(wpath, columns=["body_pre", "body_post", "weight"])
    pre = tbl["body_pre"].to_numpy()
    post = tbl["body_post"].to_numpy()
    wgt = tbl["weight"].to_numpy()
    log(f"  {len(wgt):,} significant connections, {wgt.sum():,} synapses")

    base = min(tiers)
    keep = wgt >= base
    pre, post, wgt = pre[keep], post[keep], wgt[keep]
    log(f"  base threshold >={base}: {len(wgt):,} edges retained")

    # Dense index shared by every tier so neuron ids stay stable between them.
    bodies = np.unique(np.concatenate([pre, post]))
    n = len(bodies)
    log(f"  {n:,} neurons in graph")
    pre_i = np.searchsorted(bodies, pre).astype(np.uint32)
    post_i = np.searchsorted(bodies, post).astype(np.uint32)

    # ---- annotations -------------------------------------------------------
    log("reading annotations")
    ann = feather.read_table(
        src / "body-annotations-male-cns-v1.0-minconf-0.5.feather",
        columns=["bodyId", "type", "instance", "superclass", "somaLocation",
                 "status", "somaSide", "assignedOlHex1", "assignedOlHex2"],
    ).to_pydict()
    by_body = {b: i for i, b in enumerate(ann["bodyId"])}

    types, type_ids = ["unknown"], {"unknown": 0}
    supers, super_ids = ["unknown"], {"unknown": 0}
    type_of = np.zeros(n, dtype=np.uint16)
    super_of = np.zeros(n, dtype=np.uint8)
    soma = np.zeros((n, 3), dtype=np.int32)
    # Optic-lobe column coordinates. These are the fly's retinotopic map: each
    # (hex1, hex2) pair is one ommatidial column, so the lamina cells carrying
    # them form a usable image plane. -1 means the cell has no column.
    hex1 = np.full(n, -1, dtype=np.int16)
    hex2 = np.full(n, -1, dtype=np.int16)
    side = np.zeros(n, dtype=np.uint8)   # 0 unknown, 1 left, 2 right
    instances = [None] * n

    for i, body in enumerate(bodies):
        j = by_body.get(int(body))
        if j is None:
            continue
        t = ann["type"][j] or ann["instance"][j] or "unknown"
        if t not in type_ids:
            type_ids[t] = len(types); types.append(t)
        type_of[i] = type_ids[t]
        sc = ann["superclass"][j] or "unknown"
        if sc not in super_ids:
            super_ids[sc] = len(supers); supers.append(sc)
        super_of[i] = super_ids[sc]
        loc = ann["somaLocation"][j]
        if loc:
            soma[i] = loc

        h1, h2 = ann["assignedOlHex1"][j], ann["assignedOlHex2"][j]
        if h1 is not None and h2 is not None:
            hex1[i], hex2[i] = int(h1), int(h2)

        # Photoreceptors and many optic-lobe cells have no soma in the volume,
        # so laterality falls back to the _L/_R suffix on the instance name.
        inst = ann["instance"][j] or ""
        sd = ann["somaSide"][j] or (inst[-1] if inst[-2:-1] == "_" else "")
        side[i] = {"L": 1, "R": 2}.get(sd, 0)
        instances[i] = ann["instance"][j]

    # ---- neurotransmitters -------------------------------------------------
    log("reading neurotransmitters")
    nt_tbl = feather.read_table(
        src / "body-neurotransmitters-male-cns-v1.0.feather",
        columns=["body", "consensus_nt"],
    ).to_pydict()
    nt_by_body = dict(zip(nt_tbl["body"], nt_tbl["consensus_nt"]))
    nt_of = np.zeros(n, dtype=np.uint8)
    sign_of = np.zeros(n, dtype=np.int8)
    for i, body in enumerate(bodies):
        nt = (nt_by_body.get(int(body)) or "unknown").lower()
        if nt not in NT_ORDER:
            nt = "unknown"
        nt_of[i] = NT_ORDER.index(nt)
        sign_of[i] = NT_SIGN[nt]
    log(f"  excitatory {int((sign_of > 0).sum()):,} | "
        f"inhibitory {int((sign_of < 0).sum()):,} | "
        f"unknown {int((sign_of == 0).sum()):,}")

    # ---- neuron block ------------------------------------------------------
    nodes = bytearray(MAGIC_NODES)
    # Pad the header to 16 bytes so the float64 body ids that follow land on an
    # 8-byte boundary; browsers refuse to create a Float64Array otherwise.
    nodes += struct.pack("<II", n, 0)
    nodes += bodies.astype(np.float64).tobytes()   # exact: ids are < 2^53
    nodes += soma.astype(np.int32).tobytes()
    nodes += type_of.tobytes()
    nodes += hex1.tobytes()
    nodes += hex2.tobytes()
    nodes += super_of.tobytes()
    nodes += nt_of.tobytes()
    nodes += sign_of.tobytes()
    nodes += side.tobytes()
    write_gz(out / "neurons.bin.gz", bytes(nodes))

    # ---- one CSR per tier --------------------------------------------------
    manifest_tiers = []
    for th in sorted(tiers):
        m = wgt >= th
        s, d, w = pre_i[m], post_i[m], wgt[m]
        order = np.lexsort((d, s))
        s, d, w = s[order], d[order], w[order]
        offsets = np.zeros(n + 1, dtype=np.uint32)
        np.add.at(offsets, s.astype(np.int64) + 1, 1)
        np.cumsum(offsets, out=offsets)

        buf = bytearray(MAGIC_GRAPH)
        buf += struct.pack("<IIII", n, len(w), th, 0)
        buf += offsets.tobytes()
        buf += d.astype(np.uint32).tobytes()
        buf += w.astype(np.uint16).tobytes()
        name = f"graph-t{th}.bin.gz"
        size = write_gz(out / name, bytes(buf))
        manifest_tiers.append({
            "threshold": th, "file": name, "edges": int(len(w)),
            "synapses": int(w.sum()), "bytesGzip": size, "bytesRaw": len(buf),
        })

    manifest = {
        "dataset": "MaleCNS v1.0 (Janelia / Google Research)",
        "license": "CC-BY 4.0",
        "source": "https://male-cns.janelia.org/download/",
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "neurons": n,
        "columnCells": int((hex1 >= 0).sum()),
        "neuronFile": "neurons.bin.gz",
        "tiers": manifest_tiers,
        "types": types,
        "superclasses": supers,
        "neurotransmitters": NT_ORDER,
        "ntSign": [NT_SIGN[k] for k in NT_ORDER],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    log(f"manifest.json  ({len(types):,} cell types)")

    # Instance names are only needed when a user inspects one neuron, so they
    # live in their own lazily-fetched file rather than the hot path.
    (out / "instances.json.gz").write_bytes(
        gzip.compress(json.dumps(instances).encode(), 9))
    log("done")


def write_gz(path: Path, raw: bytes) -> int:
    data = gzip.compress(raw, 9)
    path.write_bytes(data)
    log(f"{path.name:22s} {len(raw)/1e6:7.1f} MB raw -> {len(data)/1e6:6.1f} MB gzip")
    return len(data)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--tiers", type=int, nargs="+", default=[5, 10])
    a = ap.parse_args()
    build(a.src, a.out, a.tiers)
