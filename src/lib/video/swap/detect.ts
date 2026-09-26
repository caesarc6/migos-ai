import sharp from "sharp";
import { loadFaceModels } from "@/lib/video/swap/models";

export type Face = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  kps: Array<[number, number]>;
};

const INPUT = 640;
const STRIDES = [8, 16, 32] as const;

type Session = {
  run: (feeds: { input: unknown }) => Promise<Record<string, { data: Float32Array; dims: readonly number[] }>>;
};

let sessionPromise: Promise<Session> | null = null;

export async function detectFaces(rgb: Uint8Array, width: number, height: number): Promise<Face[]> {
  const session = await detector();
  const { tensor, scale, padX, padY } = letterbox(rgb, width, height);
  const { Tensor } = await import("onnxruntime-node");
  const input = new Tensor("float32", tensor, [1, 3, INPUT, INPUT]);
  const out = await session.run({ input });
  const faces: Face[] = [];
  for (let level = 0; level < STRIDES.length; level += 1) {
    const stride = STRIDES[level]!;
    const scores = out[String(level)]?.data;
    const boxes = out[String(level + 3)]?.data;
    const kps = out[String(level + 6)]?.data;
    if (!scores || !boxes || !kps) continue;
    const grid = INPUT / stride;
    let anchor = 0;
    for (let y = 0; y < grid; y += 1) {
      for (let x = 0; x < grid; x += 1) {
        for (let duplicate = 0; duplicate < 2; duplicate += 1) {
          const score = sigmoid(scores[anchor] ?? 0);
          if (score >= 0.5) {
            const ax = x * stride;
            const ay = y * stride;
            const box = boxes.subarray(anchor * 4, anchor * 4 + 4);
            const points = kps.subarray(anchor * 10, anchor * 10 + 10);
            const x1 = (ax - (box[0] ?? 0) * stride - padX) / scale;
            const y1 = (ay - (box[1] ?? 0) * stride - padY) / scale;
            const x2 = (ax + (box[2] ?? 0) * stride - padX) / scale;
            const y2 = (ay + (box[3] ?? 0) * stride - padY) / scale;
            const landmarks: Array<[number, number]> = [];
            for (let k = 0; k < 5; k += 1) {
              landmarks.push([
                (ax + (points[k * 2] ?? 0) * stride - padX) / scale,
                (ay + (points[k * 2 + 1] ?? 0) * stride - padY) / scale,
              ]);
            }
            faces.push({ x1, y1, x2, y2, score, kps: landmarks });
          }
          anchor += 1;
        }
      }
    }
  }
  return nms(faces, 0.4).slice(0, 5);
}

export async function detectFacesInImage(image: Buffer): Promise<{ rgb: Uint8Array; width: number; height: number; faces: Face[] }> {
  const { data, info } = await sharp(image, { failOn: "none" })
    .rotate()
    .resize({ width: 960, height: 960, fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgb = new Uint8Array(data);
  const faces = await detectFaces(rgb, info.width, info.height);
  return { rgb, width: info.width, height: info.height, faces };
}

async function detector(): Promise<Session> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const models = await loadFaceModels();
      const ort = await import("onnxruntime-node");
      return (await ort.InferenceSession.create(models.detectPath, {
        executionProviders: ["cpu"],
      })) as unknown as Session;
    })().catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise as Promise<Session>;
}

function letterbox(rgb: Uint8Array, width: number, height: number) {
  const scale = INPUT / Math.max(width, height);
  const resizedW = Math.max(1, Math.round(width * scale));
  const resizedH = Math.max(1, Math.round(height * scale));
  const padX = Math.floor((INPUT - resizedW) / 2);
  const padY = Math.floor((INPUT - resizedH) / 2);
  const tensor = new Float32Array(3 * INPUT * INPUT);
  tensor.fill(-1);
  for (let y = 0; y < resizedH; y += 1) {
    const srcY = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < resizedW; x += 1) {
      const srcX = Math.min(width - 1, Math.floor(x / scale));
      const src = (srcY * width + srcX) * 3;
      const dx = x + padX;
      const dy = y + padY;
      tensor[0 * INPUT * INPUT + dy * INPUT + dx] = ((rgb[src] ?? 0) - 127.5) / 128;
      tensor[1 * INPUT * INPUT + dy * INPUT + dx] = ((rgb[src + 1] ?? 0) - 127.5) / 128;
      tensor[2 * INPUT * INPUT + dy * INPUT + dx] = ((rgb[src + 2] ?? 0) - 127.5) / 128;
    }
  }
  return { tensor, scale, padX, padY };
}

function sigmoid(value: number): number {
  if (value >= 0 && value <= 1) return value;
  return 1 / (1 + Math.exp(-value));
}

function nms(faces: Face[], threshold: number): Face[] {
  const ordered = [...faces].sort((a, b) => b.score - a.score);
  const kept: Face[] = [];
  for (const face of ordered) {
    if (kept.every((other) => iou(face, other) < threshold)) kept.push(face);
  }
  return kept;
}

function iou(a: Face, b: Face): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  return inter / (areaA + areaB - inter || 1);
}
