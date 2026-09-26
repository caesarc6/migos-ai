import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { VideoProviderError } from "@/lib/video/errors";
import { detectFaces, type Face } from "@/lib/video/swap/detect";

const execFileAsync = promisify(execFile);

export const MOTION_SECONDS = 12;
export const MOTION_FPS = 16;

const CACHE = path.join(process.cwd(), ".cache", "motion");

export type MotionAssets = {
  sha256: string;
  videoPath: string;
  leftMaskPath: string;
  rightMaskPath: string;
  leftCoverage: number;
  rightCoverage: number;
  width: number;
  height: number;
  duration: number;
};

type CacheFile = MotionAssets & {
  videoUrl?: string;
  leftMaskUrl?: string;
  rightMaskUrl?: string;
};

export async function prepareMotionAssets(
  sourcePath: string,
  onProgress?: (message: string) => void,
): Promise<MotionAssets> {
  await mkdir(CACHE, { recursive: true });
  const sha256 = await hashFile(sourcePath);
  const cached = await readCache(sha256);
  if (cached && (await exists(cached.videoPath)) && (await exists(cached.leftMaskPath)) && (await exists(cached.rightMaskPath))) {
    onProgress?.("Using the saved source video and performer masks.");
    return cached;
  }

  onProgress?.("Preparing the fixed source video…");
  const videoPath = path.join(CACHE, `${sha256}.mp4`);
  const framesDir = path.join(CACHE, `${sha256}-frames`);
  const leftDir = path.join(CACHE, `${sha256}-left`);
  const rightDir = path.join(CACHE, `${sha256}-right`);
  await mkdir(framesDir, { recursive: true });
  await mkdir(leftDir, { recursive: true });
  await mkdir(rightDir, { recursive: true });

  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      sourcePath,
      "-t",
      String(MOTION_SECONDS),
      "-vf",
      `fps=${MOTION_FPS},scale=-2:480`,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      videoPath,
    ],
    { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  );

  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", videoPath, path.join(framesDir, "%05d.jpg")],
    { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  );

  const { readdir } = await import("node:fs/promises");
  const frames = (await readdir(framesDir)).filter((name) => name.endsWith(".jpg")).sort();
  if (frames.length < 17) {
    throw new VideoProviderError(
      "Migos.mp4 is too short for performer replacement. The motion model needs at least one second of video.",
      422,
    );
  }

  let leftHits = 0;
  let rightHits = 0;
  let width = 0;
  let height = 0;
  let leftTrack: Face | null = null;
  let rightTrack: Face | null = null;
  let leftMiss = 0;
  let rightMiss = 0;

  for (let index = 0; index < frames.length; index += 1) {
    if (index % 16 === 0) onProgress?.(`Masking performers, frame ${index + 1} of ${frames.length}…`);
    const file = path.join(framesDir, frames[index]!);
    const decoded = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    width = decoded.info.width;
    height = decoded.info.height;
    const faces = await detectFaces(new Uint8Array(decoded.data), width, height);
    const tracked = trackPair(leftTrack, rightTrack, faces);
    leftTrack = tracked.left;
    rightTrack = tracked.right;
    leftMiss = tracked.leftSeen ? 0 : leftMiss + 1;
    rightMiss = tracked.rightSeen ? 0 : rightMiss + 1;
    const paintLeft = leftTrack && leftMiss <= 8 ? leftTrack : null;
    const paintRight = rightTrack && rightMiss <= 8 ? rightTrack : null;
    if (paintLeft) leftHits += 1;
    if (paintRight) rightHits += 1;
    await writeFile(path.join(leftDir, frames[index]!), await maskJpeg(width, height, paintLeft));
    await writeFile(path.join(rightDir, frames[index]!), await maskJpeg(width, height, paintRight));
  }

  const leftMaskPath = path.join(CACHE, `${sha256}-left.mp4`);
  const rightMaskPath = path.join(CACHE, `${sha256}-right.mp4`);
  await encodeMask(leftDir, leftMaskPath);
  await encodeMask(rightDir, rightMaskPath);

  const assets: MotionAssets = {
    sha256,
    videoPath,
    leftMaskPath,
    rightMaskPath,
    leftCoverage: leftHits / frames.length,
    rightCoverage: rightHits / frames.length,
    width,
    height,
    duration: frames.length / MOTION_FPS,
  };
  await writeFile(path.join(CACHE, `${sha256}.json`), JSON.stringify(assets, null, 2));
  return assets;
}

export async function rememberUpload(
  sha256: string,
  urls: { videoUrl?: string; leftMaskUrl?: string; rightMaskUrl?: string },
): Promise<void> {
  const file = path.join(CACHE, `${sha256}.json`);
  const current = JSON.parse(await readFile(file, "utf8")) as CacheFile;
  await writeFile(file, JSON.stringify({ ...current, ...urls }, null, 2));
}

export async function readUploads(sha256: string): Promise<{ videoUrl?: string; leftMaskUrl?: string; rightMaskUrl?: string }> {
  const cached = await readCache(sha256);
  return {
    videoUrl: cached?.videoUrl,
    leftMaskUrl: cached?.leftMaskUrl,
    rightMaskUrl: cached?.rightMaskUrl,
  };
}

async function readCache(sha256: string): Promise<CacheFile | null> {
  try {
    return JSON.parse(await readFile(path.join(CACHE, `${sha256}.json`), "utf8")) as CacheFile;
  } catch {
    return null;
  }
}

async function encodeMask(framesDir: string, dest: string): Promise<void> {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      String(MOTION_FPS),
      "-start_number",
      "1",
      "-i",
      path.join(framesDir, "%05d.jpg"),
      "-c:v",
      "libx264",
      "-crf",
      "12",
      "-pix_fmt",
      "yuv420p",
      dest,
    ],
    { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  );
}

async function maskJpeg(width: number, height: number, face: Face | null): Promise<Buffer> {
  const rgb = Buffer.alloc(width * height * 3);
  if (face) paintBody(rgb, width, height, face);
  return sharp(rgb, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

function paintBody(rgb: Buffer, width: number, height: number, face: Face): void {
  const fw = Math.max(8, face.x2 - face.x1);
  const fh = Math.max(8, face.y2 - face.y1);
  const cx = (face.x1 + face.x2) / 2;
  const cy = face.y1 + fh * 1.6;
  const rx = fw * 1.35;
  const ry = fh * 2.6;
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(height - 1, Math.ceil(cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(width - 1, Math.ceil(cx + rx));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const index = (y * width + x) * 3;
      rgb[index] = 255;
      rgb[index + 1] = 255;
      rgb[index + 2] = 255;
    }
  }
}

function trackPair(
  previousLeft: Face | null,
  previousRight: Face | null,
  faces: Face[],
): { left: Face | null; right: Face | null; leftSeen: boolean; rightSeen: boolean } {
  const ranked = [...faces].sort((a, b) => area(b) - area(a)).slice(0, 2);
  const used = new Set<number>();
  const nearest = (previous: Face | null): Face | null => {
    if (!previous) return null;
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < ranked.length; index += 1) {
      if (used.has(index)) continue;
      const distance = Math.hypot(center(ranked[index]!) - center(previous), midY(ranked[index]!) - midY(previous));
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }
    if (best >= 0 && bestDistance < 220) {
      used.add(best);
      return ranked[best]!;
    }
    return null;
  };

  if (!previousLeft && !previousRight) {
    const ordered = [...ranked].sort((a, b) => center(a) - center(b));
    return {
      left: ordered[0] ?? null,
      right: ordered[1] ?? null,
      leftSeen: Boolean(ordered[0]),
      rightSeen: Boolean(ordered[1]),
    };
  }

  const seenLeft = nearest(previousLeft);
  const seenRight = nearest(previousRight);
  const remaining = ranked.filter((_, index) => !used.has(index)).sort((a, b) => center(a) - center(b));
  const left = seenLeft ?? previousLeft ?? remaining.shift() ?? null;
  const right = seenRight ?? previousRight ?? remaining.shift() ?? null;
  return {
    left,
    right,
    leftSeen: Boolean(seenLeft) || (!previousLeft && left !== null),
    rightSeen: Boolean(seenRight) || (!previousRight && right !== null),
  };
}

function center(face: Face): number {
  return (face.x1 + face.x2) / 2;
}

function midY(face: Face): number {
  return (face.y1 + face.y2) / 2;
}

function area(face: Face): number {
  return Math.max(0, face.x2 - face.x1) * Math.max(0, face.y2 - face.y1);
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function hashFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
