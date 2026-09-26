import fs from "node:fs/promises";
import path from "node:path";
import { templateVideoPath } from "@/lib/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 200 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "The upload could not be read. If the clip is over 200 MB, export a smaller MP4." }, { status: 400 });
  }

  const video = form.get("video");
  if (!(video instanceof File) || video.size === 0) {
    return Response.json({ error: "Choose an MP4 to use as the source performance." }, { status: 400 });
  }
  if (video.size > MAX_BYTES) {
    return Response.json({ error: "That clip is over 200 MB. Export a smaller MP4." }, { status: 413 });
  }

  const filename = video.name.toLowerCase();
  const mime = video.type.toLowerCase();
  const extensionOk = filename.endsWith(".mp4") || filename.endsWith(".m4v") || filename.endsWith(".mov");
  const mimeOk =
    mime === "" ||
    mime === "video/mp4" ||
    mime === "application/mp4" ||
    mime === "video/quicktime" ||
    mime === "application/octet-stream";
  if (!extensionOk || !mimeOk) {
    return Response.json({ error: "Use an MP4. A QuickTime .mov works when it is H.264." }, { status: 400 });
  }

  const data = Buffer.from(await video.arrayBuffer());
  if (!isIsoBmff(data)) {
    return Response.json({ error: "That file is not an MP4." }, { status: 400 });
  }

  const dest = templateVideoPath();
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const temporary = `${dest}.upload`;
  try {
    await fs.writeFile(temporary, data);
    await fs.rename(temporary, dest);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    console.error("MIGO template save failed", error);
    return Response.json({ error: "The source clip could not be saved." }, { status: 500 });
  }

  return Response.json({ ok: true, bytes: data.length });
}

function isIsoBmff(data: Buffer): boolean {
  if (data.length < 12) return false;
  return data.subarray(0, Math.min(data.length, 64)).includes("ftyp");
}
