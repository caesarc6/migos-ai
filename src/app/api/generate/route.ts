import { CUTOUT_MODEL } from "@/lib/video/cutout";
import { VideoProviderError } from "@/lib/video/errors";
import { readJob, startJob } from "@/lib/video/jobs";
import type { GenerateInput, PerformerInput } from "@/lib/video/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_NAME = 40;
const MAX_STYLE = 140;

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("job") ?? "";
  const job = readJob(id);
  if (!job) return Response.json({ error: "That render is no longer available." }, { status: 404 });
  if (url.searchParams.get("download") === "1") {
    if (job.status !== "done" || !job.result) {
      return Response.json({ error: "The render is not ready yet." }, { status: 409 });
    }
    const result = job.result;
    return new Response(new Uint8Array(result.data), {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": `inline; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Migo-Filename": result.filename,
        "X-Migo-Model": result.mode === "recast" ? "inswapper_128" : CUTOUT_MODEL,
        "X-Migo-Mode": result.mode,
      },
    });
  }
  return Response.json({
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error ?? null,
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "The upload could not be read." }, { status: 400 });
  }

  try {
    const input = await readGenerateInput(form);
    const jobId = startJob(input);
    return Response.json({ jobId }, { status: 202 });
  } catch (error) {
    if (error instanceof VideoProviderError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("MIGO generate failed", error);
    return Response.json({ error: "The cut could not be rendered." }, { status: 500 });
  }
}

async function readGenerateInput(form: FormData): Promise<GenerateInput> {
  const first = await readPerformer(form, 1);
  const second = await readPerformer(form, 2);
  return { performers: [first, second] };
}

async function readPerformer(form: FormData, index: 1 | 2): Promise<PerformerInput> {
  const label = `Performer ${index}`;
  const name = readLine(form.get(`performer${index}Name`), MAX_NAME);
  const styleNote = readLine(form.get(`performer${index}Style`), MAX_STYLE);
  if (!name) {
    throw new VideoProviderError(`${label} needs a short name.`, 400);
  }
  const image = await readImage(form.get(`performer${index}Image`), label);
  const extraValue = form.get(`performer${index}Extra`);
  const extraImages: Buffer[] = [];
  if (extraValue instanceof File && extraValue.size > 0) {
    const extra = await readImage(extraValue, `${label} extra reference`);
    extraImages.push(extra.data);
  }
  return { name, styleNote, image: image.data, mimeType: image.mimeType, extraImages };
}

function readLine(value: FormDataEntryValue | null, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function readImage(
  value: FormDataEntryValue | null,
  label: string,
): Promise<{ data: Buffer; mimeType: string }> {
  if (!(value instanceof File) || value.size === 0) {
    throw new VideoProviderError(`${label} needs a reference image.`, 400);
  }
  if (value.size > MAX_IMAGE_BYTES) {
    throw new VideoProviderError(`${label} image must be 8 MB or smaller.`, 400);
  }
  const data = Buffer.from(await value.arrayBuffer());
  const mimeType = normalizeMime(value.type, data);
  if (!mimeType) {
    throw new VideoProviderError(`${label} image must be a PNG, JPG, WEBP, or GIF.`, 400);
  }
  return { data, mimeType };
}

function normalizeMime(type: string, data: Buffer): string | null {
  const declared = type === "image/jpg" ? "image/jpeg" : type;
  if (ALLOWED_MIME.has(declared) && declared !== "image/jpg") {
    return declared === "image/jpeg" || declared.startsWith("image/") ? declared : null;
  }
  return sniffMime(data);
}

function sniffMime(data: Buffer): string | null {
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (data.length >= 6 && data.subarray(0, 4).toString("ascii") === "GIF8") {
    return "image/gif";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
