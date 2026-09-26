import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { VideoProviderError } from "@/lib/video/errors";
import type { GenerateInput, GenerateResult, PerformerInput } from "@/lib/video/provider";
import { MOTION_FPS, prepareMotionAssets, readUploads, rememberUpload, type MotionAssets } from "@/lib/video/motion/assets";

const execFileAsync = promisify(execFile);

export const FAL_MOTION_MODEL = "fal-ai/wan-vace-14b/inpainting";
const PRICE_PER_SECOND = 0.04;
const UPLOAD_URL = "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3";
const ONE_YEAR_SECONDS = 31_536_000;

type FalQueue = {
  request_id: string;
  status_url: string;
  response_url: string;
};

type FalStatus = {
  status?: string;
  error?: string;
};

export async function replaceBothPerformers(
  input: GenerateInput,
  sourcePath: string,
  onProgress?: (message: string) => void,
): Promise<GenerateResult> {
  const key = process.env.FAL_KEY?.trim() ?? "";
  if (!key) {
    throw new VideoProviderError(
      "Set FAL_KEY to replace both performers. 480p is about $0.04 per second for each person. Migos.mp4 is uploaded once and reused.",
      501,
    );
  }

  const assets = await prepareMotionAssets(sourcePath, onProgress);
  const frames = Math.round(assets.duration * MOTION_FPS);
  if (frames < 17 || frames > 241) {
    throw new VideoProviderError(
      `This model needs 17 to 241 frames. The prepared clip has ${frames}.`,
      422,
    );
  }

  const [first, second] = input.performers;
  const passes = [
    { performer: first, coverage: assets.leftCoverage, mask: "left" as const },
    { performer: second, coverage: assets.rightCoverage, mask: "right" as const },
  ];
  const billable = passes.filter((pass) => pass.coverage >= 0.2);
  if (billable.length === 0) {
    throw new VideoProviderError(
      "Neither performer was visible enough to replace. Person 1 is the face that starts on the left.",
      422,
    );
  }

  const uploads = await readUploads(assets.sha256);
  const videoUrl = uploads.videoUrl ?? (await uploadOnce(key, assets.videoPath, "video/mp4", "Migos.mp4", onProgress));
  const leftMaskUrl =
    uploads.leftMaskUrl ?? (await uploadOnce(key, assets.leftMaskPath, "video/mp4", "left-mask.mp4", onProgress));
  const rightMaskUrl =
    uploads.rightMaskUrl ?? (await uploadOnce(key, assets.rightMaskPath, "video/mp4", "right-mask.mp4", onProgress));
  if (!uploads.videoUrl || !uploads.leftMaskUrl || !uploads.rightMaskUrl) {
    await rememberUpload(assets.sha256, { videoUrl, leftMaskUrl, rightMaskUrl });
  }

  const estimate = (assets.duration * PRICE_PER_SECOND * billable.length).toFixed(2);
  onProgress?.(`Replacing one performer at a time. This run is about $${estimate} at 480p.`);

  const replaced: Array<Buffer | null> = [];
  for (const pass of passes) {
    if (pass.coverage < 0.2) {
      onProgress?.(`${pass.performer.name} was not in enough of the clip, so that performer stays original.`);
      replaced.push(null);
      continue;
    }
    onProgress?.(`Replacing ${pass.performer.name} in the source video…`);
    const imageUrls = await uploadPerformer(key, pass.performer);
    const maskUrl = pass.mask === "left" ? leftMaskUrl : rightMaskUrl;
    const url = await inpaint(key, videoUrl, maskUrl, imageUrls, pass.performer);
    replaced.push(await download(url));
  }

  onProgress?.("Placing both performers back on the original shot…");
  const data = await composite(assets, replaced[0] ?? null, replaced[1] ?? null);
  return { data, mimeType: "video/mp4", filename: "migo-cut.mp4", mode: "motion" };
}

async function inpaint(
  key: string,
  videoUrl: string,
  maskUrl: string,
  imageUrls: string[],
  performer: PerformerInput,
): Promise<string> {
  const note = performer.styleNote.trim();
  const submitted = await falJson<FalQueue>(key, `https://queue.fal.run/${FAL_MOTION_MODEL}`, {
    prompt: [
      `Replace only the masked performer with ${performer.name} from the reference image.`,
      "Keep the same body motion, hands, head movement, camera, lighting, and background.",
      "Do not change the other person, the set, or the framing.",
      "Photorealistic.",
      note ? `Wardrobe and performance note: ${note}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    video_url: videoUrl,
    mask_video_url: maskUrl,
    ref_image_urls: imageUrls,
    resolution: "480p",
    acceleration: "regular",
    match_input_num_frames: true,
    match_input_frames_per_second: true,
    enable_safety_checker: true,
  });
  if (!submitted.status_url || !submitted.response_url) {
    throw new VideoProviderError("The motion model did not accept the performer pass.", 502);
  }

  const started = Date.now();
  for (;;) {
    if (Date.now() - started > 8 * 60 * 1000) {
      throw new VideoProviderError("The motion model took too long. The source clip is capped at 12 seconds.", 504);
    }
    await delay(4000);
    const status = await falJson<FalStatus>(key, submitted.status_url, undefined, "GET");
    const state = (status.status ?? "").toUpperCase();
    if (state === "COMPLETED") break;
    if (state === "FAILED" || state === "ERROR" || status.error) {
      throw new VideoProviderError("The motion model could not replace that performer.", 502);
    }
  }

  const result = await falJson<{ video?: { url?: string } }>(key, submitted.response_url, undefined, "GET");
  const url = result.video?.url;
  if (!url) throw new VideoProviderError("The motion model returned no video.", 502);
  return url;
}

async function composite(assets: MotionAssets, left: Buffer | null, right: Buffer | null): Promise<Buffer> {
  if (!left && !right) {
    throw new VideoProviderError("Neither performer was visible enough to replace.", 422);
  }
  const dir = path.join(os.tmpdir(), `migo-motion-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  try {
    const layers = [
      { video: left, mask: assets.leftMaskPath },
      { video: right, mask: assets.rightMaskPath },
    ].filter((layer): layer is { video: Buffer; mask: string } => layer.video !== null);

    const inputs = ["-i", assets.videoPath];
    const filters: string[] = [];
    let current = "0:v";
    let nextInput = 1;
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index]!;
      const file = path.join(dir, `pass-${index}.mp4`);
      await writeFile(file, layer.video);
      inputs.push("-i", file, "-i", layer.mask);
      const videoIndex = nextInput;
      const maskIndex = nextInput + 1;
      nextInput += 2;
      const tag = index === layers.length - 1 ? "merged" : `v${videoIndex}`;
      filters.push(
        `[${videoIndex}:v]scale=${assets.width}:${assets.height}:flags=bicubic,format=gbrp[rep${videoIndex}]`,
        `[${maskIndex}:v]scale=${assets.width}:${assets.height},format=gray,format=gbrp[m${videoIndex}]`,
        `[${current}]format=gbrp[base${videoIndex}]`,
        `[base${videoIndex}][rep${videoIndex}][m${videoIndex}]maskedmerge[${tag}]`,
      );
      current = tag;
    }
    filters.push("[merged]format=yuv420p[out]");

    const out = path.join(dir, "cut.mp4");
    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        ...inputs,
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[out]",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        out,
      ],
      { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return await readFile(out);
  } catch (error) {
    if (error instanceof VideoProviderError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    console.error("MIGO composite failed", detail.slice(-800));
    throw new VideoProviderError("The replaced performers could not be placed back on the original shot.", 500);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function uploadPerformer(key: string, performer: PerformerInput): Promise<string[]> {
  const urls = [await uploadBytes(key, performer.image, performer.mimeType, `${slug(performer.name)}.png`)];
  for (let index = 0; index < performer.extraImages.length; index += 1) {
    const extra = performer.extraImages[index]!;
    urls.push(await uploadBytes(key, extra, sniffMime(extra), `${slug(performer.name)}-extra-${index + 1}.png`));
  }
  return urls;
}

async function uploadOnce(
  key: string,
  file: string,
  contentType: string,
  name: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  onProgress?.(`Uploading ${name} once. Later recasts reuse it.`);
  return uploadBytes(key, await readFile(file), contentType, name);
}

async function uploadBytes(key: string, bytes: Buffer, contentType: string, name: string): Promise<string> {
  const initiated = await falJson<{ upload_url?: string; file_url?: string }>(
    key,
    UPLOAD_URL,
    { file_name: name, content_type: contentType },
    "POST",
    { "X-Fal-Object-Lifecycle": JSON.stringify({ expiration_duration_seconds: ONE_YEAR_SECONDS }) },
  );
  if (!initiated.upload_url || !initiated.file_url) {
    throw new VideoProviderError("The motion host rejected the file upload.", 502);
  }
  const put = await fetch(initiated.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(bytes),
  });
  if (!put.ok) throw new VideoProviderError("The motion host could not store a file for the performer pass.", 502);
  return initiated.file_url;
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new VideoProviderError("The finished performer pass could not be downloaded.", 502);
  return Buffer.from(await response.arrayBuffer());
}

async function falJson<T>(
  key: string,
  url: string,
  body?: unknown,
  method = "POST",
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Key ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    console.error("MIGO fal request failed", response.status, text.slice(0, 800));
    const detail = readFalDetail(text);
    throw new VideoProviderError(
      detail
        ? `The motion model request was rejected: ${detail.slice(0, 180)}`
        : "The motion model request was rejected. Check FAL_KEY and the account balance.",
      502,
    );
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new VideoProviderError("The motion model returned an unreadable response.", 502);
  }
}

function readFalDetail(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as {
      detail?: string | Array<{ msg?: string }>;
      message?: string;
      error?: string;
    };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      const message = parsed.detail
        .map((item) => item.msg)
        .filter((item): item is string => Boolean(item))
        .join(" ");
      if (message) return message;
    }
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    return null;
  }
  return null;
}

function sniffMime(data: Buffer): string {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 6 && data.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "image/png";
}

function slug(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "performer";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
