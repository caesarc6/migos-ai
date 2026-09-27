import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { templateVideoPath } from "@/lib/template";
import { VideoProviderError } from "@/lib/video/errors";
import { replaceBothPerformers } from "@/lib/video/motion/fal";

const execFileAsync = promisify(execFile);

export type PerformerInput = {
  name: string;
  styleNote: string;
  image: Buffer;
  mimeType: string;
  extraImages: Buffer[];
};

export type GenerateInput = {
  performers: [PerformerInput, PerformerInput];
};

export type GenerateResult = {
  data: Buffer;
  mimeType: string;
  filename: string;
  mode: "motion";
};

export interface VideoProvider {
  readonly id: "fal";
  generate(input: GenerateInput, onProgress?: (message: string) => void): Promise<GenerateResult>;
}

export { VideoProviderError } from "@/lib/video/errors";

const MISSING_FAL =
  "Set VIDEO_PROVIDER=fal and FAL_KEY in .env.local, then restart the server. MIGO replaces the two performers in the first 12 seconds of Migos.mp4 and leaves the rest of the shot, timing, and audio. It does not swap faces when Fal is not configured.";

/** Throws before any Fal request when the paid path is not selected or the key is absent. */
export function assertMotionConfigured(): void {
  const mode = (process.env.VIDEO_PROVIDER ?? "").trim().toLowerCase();
  const key = process.env.FAL_KEY?.trim() ?? "";
  if (mode !== "fal" || !key) {
    throw new VideoProviderError(MISSING_FAL, 501);
  }
}

export function getVideoProvider(): VideoProvider {
  assertMotionConfigured();
  return new FalMotionProvider();
}

class FalMotionProvider implements VideoProvider {
  readonly id = "fal" as const;

  async generate(input: GenerateInput, onProgress?: (message: string) => void): Promise<GenerateResult> {
    assertMotionConfigured();
    const source = await probeTemplate();
    if (!source) {
      throw new VideoProviderError(
        "Add Migos.mp4 first. Performer replacement only edits that clip and leaves the rest of the shot alone.",
        422,
      );
    }
    if (!(await ffmpegAvailable())) {
      throw new VideoProviderError("ffmpeg is required to prepare Migos.mp4 for performer replacement.", 500);
    }
    return replaceBothPerformers(input, source.path, onProgress);
  }
}

async function ffmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-hide_banner", "-version"], {
      timeout: 4000,
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function probeTemplate(): Promise<{ path: string } | null> {
  const file = templateVideoPath();
  if (!existsSync(file)) return null;
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
      { timeout: 8000, maxBuffer: 2 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>;
    };
    const video = parsed.streams?.find((stream) => stream.codec_type === "video");
    const duration = Number(parsed.format?.duration ?? video?.duration ?? 0);
    const width = Number(video?.width ?? 0);
    const height = Number(video?.height ?? 0);
    if (!video || !Number.isFinite(duration) || duration < 0.4 || width < 16 || height < 16) return null;
    return { path: file };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("MIGO could not read Migos.mp4", detail.slice(-800));
    throw new VideoProviderError("Migos.mp4 is in the project, but it could not be read as a video.", 422);
  }
}
