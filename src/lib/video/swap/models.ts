import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { VideoProviderError } from "@/lib/video/errors";

const MODEL_DIR = path.join(process.cwd(), ".cache", "faces");

const FILES = {
  detect: {
    name: "scrfd_2.5g.onnx",
    url: "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/scrfd_2.5g.onnx",
    sha256: "2c07342347cef21a619c49dd5664fb8c09570ae9eda5bff3e385c11eafc45ada",
  },
  recognize: {
    name: "arcface_w600k_r50.onnx",
    url: "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/arcface_w600k_r50.onnx",
    sha256: "f1f79dc3b0b79a69f94799af1fffebff09fbd78fd96a275fd8f0cbbea23270d1",
  },
  swap: {
    name: "inswapper_128.onnx",
    url: "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0/inswapper_128.onnx",
    sha256: "a290273ed497312095dac48cdef20feec9d5208298223dd01288ab202b54bea7",
  },
} as const;

export type FaceModels = {
  detectPath: string;
  recognizePath: string;
  swapPath: string;
  emap: Float32Array;
};

let modelsPromise: Promise<FaceModels> | null = null;

export function loadFaceModels(onProgress?: (message: string) => void): Promise<FaceModels> {
  if (!modelsPromise) {
    modelsPromise = ensureModels(onProgress).catch((error: unknown) => {
      modelsPromise = null;
      throw error;
    });
  }
  return modelsPromise;
}

async function ensureModels(onProgress?: (message: string) => void): Promise<FaceModels> {
  await mkdir(MODEL_DIR, { recursive: true });
  const detectPath = await ensureFile(FILES.detect, onProgress);
  const recognizePath = await ensureFile(FILES.recognize, onProgress);
  const swapPath = await ensureFile(FILES.swap, onProgress);
  const emap = await readMatrix(path.join(process.cwd(), "src/lib/video/swap/inswapper-emap.bin"));
  return { detectPath, recognizePath, swapPath, emap };
}

async function ensureFile(
  file: { name: string; url: string; sha256: string },
  onProgress?: (message: string) => void,
): Promise<string> {
  const dest = path.join(MODEL_DIR, file.name);
  if (await matchesHash(dest, file.sha256)) return dest;
  onProgress?.(`Downloading ${file.name}…`);
  const temporary = `${dest}.download`;
  const response = await fetch(file.url);
  if (!response.ok || !response.body) {
    throw new VideoProviderError(`Could not download the face model ${file.name}.`, 503);
  }
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(temporary));
  if (!(await matchesHash(temporary, file.sha256))) {
    await rm(temporary, { force: true });
    throw new VideoProviderError(`The download for ${file.name} did not match its checksum.`, 503);
  }
  await rename(temporary, dest);
  return dest;
}

async function readMatrix(file: string): Promise<Float32Array> {
  const bytes = await readFile(file).catch(() => null);
  if (!bytes || bytes.byteLength !== 512 * 512 * 4) {
    throw new VideoProviderError("The face-swap identity matrix is missing.", 500);
  }
  const matrix = new Float32Array(512 * 512);
  matrix.set(new Float32Array(bytes.buffer, bytes.byteOffset, 512 * 512));
  return matrix;
}

async function matchesHash(file: string, sha256: string): Promise<boolean> {
  try {
    await access(file);
  } catch {
    return false;
  }
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex") === sha256;
}
