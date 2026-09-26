import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { VideoProviderError } from "@/lib/video/errors";

type RecastPerformer = {
  name: string;
  image: Buffer;
  extraImages: Buffer[];
};

type RecastInput = {
  performers: [RecastPerformer, RecastPerformer];
};
import { detectFaces, type Face } from "@/lib/video/swap/detect";
import { identityFromImages } from "@/lib/video/swap/identity";
import { loadFaceModels } from "@/lib/video/swap/models";
import { paintIdentity } from "@/lib/video/swap/paste";

const execFileAsync = promisify(execFile);

const MAX_SECONDS = 30;
const OUTPUT_FPS = 20;

type SourceVideo = {
  path: string;
  duration: number;
  hasAudio: boolean;
};

type Track = {
  slot: 0 | 1;
  cx: number;
  cy: number;
  kps: Array<[number, number]>;
};

export async function recastPerformance(
  input: RecastInput,
  source: SourceVideo,
  onProgress?: (message: string) => void,
): Promise<{ data: Buffer; mimeType: string; filename: string }> {
  onProgress?.("Loading the face models…");
  await loadFaceModels(onProgress);
  const duration = Math.min(source.duration, MAX_SECONDS);
  const [first, second] = input.performers;
  onProgress?.(`Reading ${first.name}'s face…`);
  const leftIdentity = await identityFromImages([first.image, ...first.extraImages], first.name);
  onProgress?.(`Reading ${second.name}'s face…`);
  const rightIdentity = await identityFromImages([second.image, ...second.extraImages], second.name);

  const dir = path.join(os.tmpdir(), `migo-recast-${Date.now()}`);
  const framesDir = path.join(dir, "frames");
  const outDir = path.join(dir, "out");
  await mkdir(framesDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  try {
    onProgress?.("Decoding the performance…");
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source.path,
        "-t",
        duration.toFixed(3),
        "-vf",
        `fps=${OUTPUT_FPS},scale='min(960,iw)':-2`,
        path.join(framesDir, "%05d.jpg"),
      ],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const frames = (await readdir(framesDir)).filter((name) => name.endsWith(".jpg")).sort();
    if (frames.length === 0) {
      throw new VideoProviderError("Migos.mp4 did not produce any frames.", 422);
    }
    let tracks: Track[] = [];
    for (let index = 0; index < frames.length; index += 1) {
      const name = frames[index]!;
      if (index % 8 === 0 || index === frames.length - 1) {
        onProgress?.(`Recasting frame ${index + 1} of ${frames.length}…`);
      }
      const file = path.join(framesDir, name);
      const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const rgb = new Uint8Array(data);
      const faces = await detectFaces(rgb, info.width, info.height);
      tracks = assignTracks(tracks, faces);
      for (const track of tracks) {
        const face = faceFromTrack(track);
        const embedding = track.slot === 0 ? leftIdentity : rightIdentity;
        await paintIdentity(rgb, info.width, info.height, face, embedding);
        smoothInto(track, face.kps);
      }
      await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
        .jpeg({ quality: 92 })
        .toFile(path.join(outDir, name));
    }

    onProgress?.("Joining the frames with the original audio…");
    const outPath = path.join(dir, "migo-cut.mp4");
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      String(OUTPUT_FPS),
      "-i",
      path.join(outDir, "%05d.jpg"),
    ];
    if (source.hasAudio) {
      args.push("-t", duration.toFixed(3), "-i", source.path);
    }
    args.push(
      "-map",
      "0:v:0",
      ...(source.hasAudio ? ["-map", "1:a:0", "-c:a", "aac", "-b:a", "160k"] : []),
      "-t",
      duration.toFixed(3),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outPath,
    );
    await execFileAsync("ffmpeg", args, { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
    const video = await readFile(outPath);
    if (video.length < 1000) {
      throw new VideoProviderError("The performance could not be recast.", 500);
    }
    return { data: video, mimeType: "video/mp4", filename: "migo-cut.mp4" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assignTracks(previous: Track[], faces: Face[]): Track[] {
  const ranked = [...faces].sort((a, b) => area(b) - area(a)).slice(0, 2);
  if (previous.length === 0) {
    const ordered = [...ranked].sort((a, b) => center(a).cx - center(b).cx);
    return ordered.map((face, index) => ({
      slot: index === 0 ? 0 : 1,
      ...center(face),
      kps: face.kps.map((point) => [point[0], point[1]] as [number, number]),
    }));
  }
  const used = new Set<number>();
  const next: Track[] = [];
  for (const track of previous) {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < ranked.length; index += 1) {
      if (used.has(index)) continue;
      const point = center(ranked[index]!);
      const distance = Math.hypot(point.cx - track.cx, point.cy - track.cy);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }
    if (best >= 0 && bestDistance < 180) {
      used.add(best);
      const face = ranked[best]!;
      const point = center(face);
      next.push({
        slot: track.slot,
        cx: point.cx,
        cy: point.cy,
        kps: blendLandmarks(track.kps, face.kps),
      });
    }
  }
  return next;
}

function blendLandmarks(
  previous: Array<[number, number]>,
  next: Array<[number, number]>,
): Array<[number, number]> {
  return next.map((point, index) => {
    const prior = previous[index] ?? point;
    return [prior[0] * 0.35 + point[0] * 0.65, prior[1] * 0.35 + point[1] * 0.65];
  });
}

function smoothInto(track: Track, kps: Array<[number, number]>) {
  track.kps = kps;
}

function faceFromTrack(track: Track): Face {
  const xs = track.kps.map((point) => point[0]);
  const ys = track.kps.map((point) => point[1]);
  return {
    x1: Math.min(...xs),
    y1: Math.min(...ys),
    x2: Math.max(...xs),
    y2: Math.max(...ys),
    score: 1,
    kps: track.kps,
  };
}

function center(face: Face): { cx: number; cy: number } {
  return { cx: (face.x1 + face.x2) / 2, cy: (face.y1 + face.y2) / 2 };
}

function area(face: Face): number {
  return Math.max(0, face.x2 - face.x1) * Math.max(0, face.y2 - face.y1);
}
