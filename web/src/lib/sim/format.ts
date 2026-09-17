/**
 * Readers for the binaries emitted by tools/build_connectome.py.
 *
 * Both blocks are laid out so every typed array can be a zero-copy view over
 * the decompressed buffer - no per-element parsing, which matters when the
 * edge list is six million entries long.
 */

export interface NeuronTable {
  n: number;
  /** MaleCNS bodyId per index. */
  bodyId: Float64Array;
  /** Soma position in 8 nm voxels, xyz interleaved. */
  soma: Int32Array;
  /** Index into manifest.types. */
  type: Uint16Array;
  /** Index into manifest.superclasses. */
  superclass: Uint8Array;
  /** Index into manifest.neurotransmitters. */
  nt: Uint8Array;
  /** +1 excitatory, -1 inhibitory, 0 unknown. */
  sign: Int8Array;
  /** Optic-lobe column coordinates, -1 where the cell has none. */
  hex1: Int16Array;
  hex2: Int16Array;
  /** 0 unknown, 1 left, 2 right. */
  side: Uint8Array;
}

export interface GraphTable {
  n: number;
  edges: number;
  threshold: number;
  offsets: Uint32Array;
  targets: Uint32Array;
  weights: Uint16Array;
}

function checkMagic(buf: ArrayBuffer, expected: string) {
  const got = new TextDecoder().decode(new Uint8Array(buf, 0, 8));
  if (got !== expected) {
    throw new Error(`bad connectome file: expected ${expected}, got ${got}`);
  }
}

export function readNeurons(buf: ArrayBuffer): NeuronTable {
  checkMagic(buf, "GFLYN002");
  const n = new Uint32Array(buf, 8, 1)[0];
  // Header is padded to 16 bytes so the float64 block is 8-byte aligned, and
  // the 2-byte fields are grouped ahead of the 1-byte ones so every view below
  // lands on its natural boundary.
  let o = 16;
  const bodyId = new Float64Array(buf, o, n); o += 8 * n;
  const soma = new Int32Array(buf, o, n * 3); o += 12 * n;
  const type = new Uint16Array(buf, o, n); o += 2 * n;
  const hex1 = new Int16Array(buf, o, n); o += 2 * n;
  const hex2 = new Int16Array(buf, o, n); o += 2 * n;
  const superclass = new Uint8Array(buf, o, n); o += n;
  const nt = new Uint8Array(buf, o, n); o += n;
  const sign = new Int8Array(buf, o, n); o += n;
  const side = new Uint8Array(buf, o, n);
  return { n, bodyId, soma, type, superclass, nt, sign, hex1, hex2, side };
}

export function readGraph(buf: ArrayBuffer): GraphTable {
  checkMagic(buf, "GFLYG001");
  const head = new Uint32Array(buf, 8, 4);
  const n = head[0], edges = head[1], threshold = head[2];
  let o = 24;
  const offsets = new Uint32Array(buf, o, n + 1); o += 4 * (n + 1);
  const targets = new Uint32Array(buf, o, edges); o += 4 * edges;
  const weights = new Uint16Array(buf, o, edges);
  return { n, edges, threshold, offsets, targets, weights };
}

/** Fetch and gunzip one of the connectome blocks. */
export async function fetchBlock(
  url: string,
  onProgress?: (received: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`failed to fetch ${url}: ${res.status}`);

  const total = Number(res.headers.get("content-length") ?? 0);
  let received = 0;
  const counted = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      onProgress?.(received, total);
      controller.enqueue(chunk);
    },
  });

  // The files are stored gzipped and served as octet-stream, so we own the
  // decompression rather than relying on transfer encoding.
  // DecompressionStream is typed as accepting BufferSource rather than the
  // Uint8Array the fetch body yields, so the pair needs a nudge to line up.
  const gunzip = new DecompressionStream("gzip") as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
  const stream = res.body.pipeThrough(counted).pipeThrough(gunzip);
  return new Response(stream as unknown as BodyInit).arrayBuffer();
}
