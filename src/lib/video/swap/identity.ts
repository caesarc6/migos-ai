import { VideoProviderError } from "@/lib/video/errors";
import { detectFacesInImage, type Face } from "@/lib/video/swap/detect";
import { alignTemplate, estimateSimilarity, sampleRgb, type Affine } from "@/lib/video/swap/math";
import { loadFaceModels } from "@/lib/video/swap/models";

type Session = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>;
};

let recognizePromise: Promise<Session> | null = null;
let swapPromise: Promise<Session> | null = null;
let emapPromise: Promise<Float32Array> | null = null;

export async function identityFromImages(images: Buffer[], label: string): Promise<Float32Array> {
  const embeddings: Float32Array[] = [];
  for (const image of images) {
    const decoded = await detectFacesInImage(image);
    const face = largest(decoded.faces);
    if (!face) {
      throw new VideoProviderError(
        `${label} needs a photo with a clearly visible face. Use a front-facing picture.`,
        422,
      );
    }
    embeddings.push(await embedFace(decoded.rgb, decoded.width, decoded.height, face));
  }
  return normalize(meanEmbeddings(embeddings));
}

export async function swappedFace(alignedRgb: Uint8Array, embedding: Float32Array): Promise<Uint8Array> {
  const session = await swapper();
  const emap = await identityMatrix();
  const source = applyEmap(embedding, emap);
  const target = new Float32Array(3 * 128 * 128);
  for (let i = 0; i < 128 * 128; i += 1) {
    target[i] = (alignedRgb[i * 3] ?? 0) / 255;
    target[128 * 128 + i] = (alignedRgb[i * 3 + 1] ?? 0) / 255;
    target[2 * 128 * 128 + i] = (alignedRgb[i * 3 + 2] ?? 0) / 255;
  }
  const { Tensor } = await import("onnxruntime-node");
  const out = await session.run({
    target: new Tensor("float32", target, [1, 3, 128, 128]),
    source: new Tensor("float32", source, [1, 512]),
  });
  const data = out.output?.data;
  if (!data) throw new Error("face swap returned no image");
  const rgb = new Uint8Array(128 * 128 * 3);
  for (let i = 0; i < 128 * 128; i += 1) {
    rgb[i * 3] = clampByte((data[i] ?? 0) * 255);
    rgb[i * 3 + 1] = clampByte((data[128 * 128 + i] ?? 0) * 255);
    rgb[i * 3 + 2] = clampByte((data[2 * 128 * 128 + i] ?? 0) * 255);
  }
  return rgb;
}

export function alignFace(
  rgb: Uint8Array,
  width: number,
  height: number,
  face: Face,
  size: number,
): { rgb: Uint8Array; matrix: Affine } {
  const matrix = estimateSimilarity(face.kps, alignTemplate(size));
  const out = new Uint8Array(size * size * 3);
  const inverse = invertCached(matrix);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = inverse[0] * x + inverse[1] * y + inverse[2];
      const sy = inverse[3] * x + inverse[4] * y + inverse[5];
      const [r, g, b] = sampleRgb(rgb, width, height, sx, sy);
      const index = (y * size + x) * 3;
      out[index] = r;
      out[index + 1] = g;
      out[index + 2] = b;
    }
  }
  return { rgb: out, matrix };
}

function invertCached(matrix: Affine): Affine {
  const [a, b, tx, c, d, ty] = matrix;
  const det = a * d - b * c || 1e-8;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, -(ia * tx + ib * ty), ic, id, -(ic * tx + id * ty)];
}

async function embedFace(rgb: Uint8Array, width: number, height: number, face: Face): Promise<Float32Array> {
  const aligned = alignFace(rgb, width, height, face, 112).rgb;
  const tensor = new Float32Array(3 * 112 * 112);
  for (let i = 0; i < 112 * 112; i += 1) {
    tensor[i] = ((aligned[i * 3] ?? 0) - 127.5) / 127.5;
    tensor[112 * 112 + i] = ((aligned[i * 3 + 1] ?? 0) - 127.5) / 127.5;
    tensor[2 * 112 * 112 + i] = ((aligned[i * 3 + 2] ?? 0) - 127.5) / 127.5;
  }
  const session = await recognizer();
  const { Tensor } = await import("onnxruntime-node");
  const out = await session.run({ input: new Tensor("float32", tensor, [1, 3, 112, 112]) });
  const raw = out.output?.data;
  if (!raw || raw.length < 512) throw new Error("identity model returned no embedding");
  return normalize(raw.subarray(0, 512));
}

function meanEmbeddings(list: Float32Array[]): Float32Array {
  const mean = new Float32Array(512);
  for (const embedding of list) {
    for (let i = 0; i < 512; i += 1) mean[i] = (mean[i] ?? 0) + (embedding[i] ?? 0);
  }
  for (let i = 0; i < 512; i += 1) mean[i] = (mean[i] ?? 0) / list.length;
  return mean;
}

function normalize(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += (vector[i] ?? 0) ** 2;
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) out[i] = (vector[i] ?? 0) / norm;
  return out;
}

function applyEmap(embedding: Float32Array, emap: Float32Array): Float32Array {
  const out = new Float32Array(512);
  for (let column = 0; column < 512; column += 1) {
    let sum = 0;
    for (let row = 0; row < 512; row += 1) sum += (embedding[row] ?? 0) * (emap[row * 512 + column] ?? 0);
    out[column] = sum;
  }
  return normalize(out);
}

function largest(faces: Face[]): Face | null {
  return faces.reduce<Face | null>((best, face) => {
    const area = Math.max(0, face.x2 - face.x1) * Math.max(0, face.y2 - face.y1);
    if (!best) return face;
    const bestArea = Math.max(0, best.x2 - best.x1) * Math.max(0, best.y2 - best.y1);
    return area > bestArea ? face : best;
  }, null);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function recognizer(): Promise<Session> {
  if (!recognizePromise) {
    recognizePromise = openSession("recognize").catch((error: unknown) => {
      recognizePromise = null;
      throw error;
    });
  }
  return recognizePromise;
}

async function swapper(): Promise<Session> {
  if (!swapPromise) {
    swapPromise = openSession("swap").catch((error: unknown) => {
      swapPromise = null;
      throw error;
    });
  }
  return swapPromise;
}

async function identityMatrix(): Promise<Float32Array> {
  if (!emapPromise) emapPromise = loadFaceModels().then((models) => models.emap);
  return emapPromise;
}

async function openSession(kind: "recognize" | "swap"): Promise<Session> {
  const models = await loadFaceModels();
  const ort = await import("onnxruntime-node");
  return (await ort.InferenceSession.create(kind === "recognize" ? models.recognizePath : models.swapPath, {
    executionProviders: ["cpu"],
  })) as unknown as Session;
}
