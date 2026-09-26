import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { VideoProviderError } from "@/lib/video/errors";

export const CUTOUT_MODEL = "Xenova/modnet";

type RgbaImage = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
};

type Segmenter = (image: Blob) => Promise<RgbaImage>;

let segmenterPromise: Promise<Segmenter> | null = null;

export async function cutOutCharacter(image: Buffer): Promise<Buffer> {
  const prepared = await sharp(image, { failOn: "none" })
    .rotate()
    .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const segmenter = await getSegmenter();
  const blob = new Blob([new Uint8Array(prepared)], { type: "image/png" });
  let matte: RgbaImage;
  try {
    matte = await segmenter(blob);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("MIGO portrait matting failed", detail.slice(-800));
    throw new VideoProviderError(
      "The portrait model could not cut this character out. Try a clearer reference photo.",
      422,
    );
  }

  if (matte.channels !== 4 || matte.width < 8 || matte.height < 8) {
    throw new VideoProviderError(
      "The portrait model did not return a character cutout.",
      422,
    );
  }

  const cutout = await sharp(Buffer.from(matte.data), {
    raw: {
      width: matte.width,
      height: matte.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  const trimmed = await sharp(cutout)
    .trim({ threshold: 12 })
    .png()
    .toBuffer()
    .catch(() => cutout);

  const sized = await sharp(trimmed)
    .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  await assertCutout(sized);
  return sized;
}

async function getSegmenter(): Promise<Segmenter> {
  if (!segmenterPromise) {
    segmenterPromise = loadSegmenter().catch((error: unknown) => {
      segmenterPromise = null;
      const detail = error instanceof Error ? error.message : String(error);
      console.error("MIGO could not load the portrait model", detail.slice(-800));
      throw new VideoProviderError(
        "The portrait model could not be loaded. The first cut downloads it from Hugging Face and does not need an API key.",
        503,
      );
    });
  }
  return segmenterPromise;
}

async function loadSegmenter(): Promise<Segmenter> {
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = path.join(os.tmpdir(), "migo-modnet");
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  const segmenter = await pipeline("background-removal", CUTOUT_MODEL, {
    dtype: "fp32",
    progress_callback: (update: { status?: string; file?: string; progress?: number }) => {
      if (update.status === "progress" && update.file && typeof update.progress === "number") {
        console.log(`MIGO model ${update.file}: ${Math.round(update.progress)}%`);
      }
    },
  });
  return segmenter as Segmenter;
}

async function assertCutout(png: Buffer): Promise<void> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  if (!pixels) {
    throw new VideoProviderError("The character cutout was empty.", 422);
  }
  let transparent = 0;
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i] ?? 0;
    if (alpha < 24) transparent += 1;
    else if (alpha > 220) opaque += 1;
  }
  if (transparent / pixels < 0.04 || opaque / pixels < 0.02) {
    throw new VideoProviderError(
      "The portrait model could not separate this character from the photo. Use a reference where the figure is visible against the background.",
      422,
    );
  }
}
