import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const TRACK_MODEL = "Xenova/detr-resnet-50";

export type Body = {
  cx: number;
  cy: number;
  w: number;
  h: number;
};

export type TrackSample = {
  t: number;
  left: Body;
  right: Body;
};

const DEFAULT_LEFT: Body = { cx: 0.3, cy: 0.58, w: 0.26, h: 0.72 };
const DEFAULT_RIGHT: Body = { cx: 0.7, cy: 0.58, w: 0.26, h: 0.72 };

type Detector = (
  image: string,
  options: { threshold: number; percentage: boolean },
) => Promise<Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>>;

let detectorPromise: Promise<Detector> | null = null;

export async function locatePerformers(videoPath: string, duration: number): Promise<TrackSample[]> {
  const fallback = [{ t: 0, left: DEFAULT_LEFT, right: DEFAULT_RIGHT }];
  const dir = await mkdtemp(path.join(os.tmpdir(), "migo-track-"));
  try {
    const detector = await getDetector();
    const samples: TrackSample[] = [];
    for (const time of sampleTimes(duration)) {
      const framePath = path.join(dir, `frame-${samples.length}.jpg`);
      try {
        await execFileAsync(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            time.toFixed(3),
            "-i",
            videoPath,
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2",
            framePath,
          ],
          { timeout: 20_000, maxBuffer: 2 * 1024 * 1024 },
        );
        const found = await detector(framePath, { threshold: 0.5, percentage: true });
        samples.push({ t: time, ...pairBodies(found) });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("MIGO skipped a tracking frame", detail.slice(-400));
      }
    }
    if (samples.length === 0) return fallback;
    return stabilize(samples);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("MIGO performer tracking failed; using stage positions.", detail.slice(-800));
    return fallback;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function sampleTimes(duration: number): number[] {
  const count = duration <= 6 ? 4 : duration <= 30 ? 8 : 12;
  const start = Math.min(0.2, duration * 0.04);
  const end = Math.max(start + 0.05, duration - Math.min(0.2, duration * 0.04));
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / Math.max(count - 1, 1));
}

function pairBodies(
  found: Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>,
): { left: Body; right: Body } {
  const people = found
    .filter((item) => item.label.toLowerCase() === "person" && item.score >= 0.5)
    .map((item) => clampBody(boxToBody(item.box)))
    .filter((body) => body.h >= 0.18 && body.w >= 0.06)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, 2);

  if (people.length === 0) return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
  if (people.length === 1) {
    const person = people[0]!;
    const other = person.cx < 0.5 ? DEFAULT_RIGHT : DEFAULT_LEFT;
    return person.cx <= other.cx ? { left: person, right: other } : { left: other, right: person };
  }
  const [first, second] = people[0]!.cx <= people[1]!.cx ? [people[0]!, people[1]!] : [people[1]!, people[0]!];
  return { left: first, right: second };
}

function boxToBody(box: { xmin: number; ymin: number; xmax: number; ymax: number }): Body {
  const w = Math.max(0, box.xmax - box.xmin);
  const h = Math.max(0, box.ymax - box.ymin);
  return { cx: box.xmin + w / 2, cy: box.ymin + h / 2, w, h };
}

function clampBody(body: Body): Body {
  const w = clamp(body.w, 0.12, 0.72);
  const h = clamp(body.h, 0.2, 0.96);
  return {
    cx: clamp(body.cx, w / 2, 1 - w / 2),
    cy: clamp(body.cy, h / 2, 1 - h / 2),
    w,
    h,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stabilize(samples: TrackSample[]): TrackSample[] {
  const stable: TrackSample[] = [samples[0]!];
  for (let index = 1; index < samples.length; index += 1) {
    const previous = stable[index - 1]!;
    const current = samples[index]!;
    const direct = gap(previous.left, current.left) + gap(previous.right, current.right);
    const swapped = gap(previous.left, current.right) + gap(previous.right, current.left);
    stable.push(
      swapped + 0.08 < direct
        ? { t: current.t, left: current.right, right: current.left }
        : current,
    );
  }
  return stable;
}

function gap(a: Body, b: Body): number {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

async function getDetector(): Promise<Detector> {
  if (!detectorPromise) {
    detectorPromise = loadDetector().catch((error: unknown) => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

async function loadDetector(): Promise<Detector> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = path.join(os.tmpdir(), "migo-modnet");
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  const detector = await pipeline("object-detection", TRACK_MODEL, {
    dtype: "q8",
    progress_callback: (update: { status?: string; file?: string; progress?: number }) => {
      if (update.status === "progress" && update.file && typeof update.progress === "number") {
        console.log(`MIGO people model ${update.file}: ${Math.round(update.progress)}%`);
      }
    },
  });
  return detector as Detector;
}
