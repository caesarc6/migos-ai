import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cutOutCharacter } from "@/lib/video/cutout";
import { VideoProviderError } from "@/lib/video/errors";

const execFileAsync = promisify(execFile);

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
];

export type PerformerInput = {
  name: string;
  styleNote: string;
  image: Buffer;
  mimeType: string;
};

export type GenerateInput = {
  performers: [PerformerInput, PerformerInput];
};

export type GenerateResult = {
  data: Buffer;
  mimeType: string;
  filename: string;
};

export interface VideoProvider {
  readonly id: "mock" | "external";
  generate(input: GenerateInput): Promise<GenerateResult>;
}

export { VideoProviderError } from "@/lib/video/errors";

/**
 * Unset or `VIDEO_PROVIDER=mock` mattes both photos with MODNet and composites the cutouts.
 * `VIDEO_PROVIDER=external` is an env-gated stub and never calls a paid video API.
 */
export function getVideoProvider(): VideoProvider {
  const mode = (process.env.VIDEO_PROVIDER ?? "mock").trim().toLowerCase();
  if (mode === "external") return new ExternalVideoProvider();
  if (mode === "mock" || mode === "") return new LocalVideoProvider();
  throw new VideoProviderError(
    `Unknown VIDEO_PROVIDER "${mode}". Use mock or external.`,
    500,
  );
}

class ExternalVideoProvider implements VideoProvider {
  readonly id = "external" as const;

  async generate(): Promise<GenerateResult> {
    const key = process.env.VIDEO_API_KEY?.trim() ?? "";
    const url = process.env.VIDEO_API_URL?.trim() ?? "";
    if (!key || !url) {
      throw new VideoProviderError("provider not configured", 501);
    }
    // A live adapter would call `url` with `key` here. This stub must not
    // place that request or invent a successful render.
    throw new VideoProviderError("provider not configured", 501);
  }
}

class LocalVideoProvider implements VideoProvider {
  readonly id = "mock" as const;

  async generate(input: GenerateInput): Promise<GenerateResult> {
    const cutouts = await withCutouts(input);
    if (await ffmpegAvailable()) {
      try {
        return await renderMp4(cutouts);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error("MIGO ffmpeg render failed; using HTML preview.", detail.slice(-800));
      }
    }
    return renderHtmlPreview(cutouts);
  }
}

async function withCutouts(input: GenerateInput): Promise<GenerateInput> {
  const cutouts: PerformerInput[] = [];
  for (const performer of input.performers) {
    const image = await cutOutCharacter(performer.image);
    cutouts.push({ ...performer, image, mimeType: "image/png" });
  }
  return { performers: [cutouts[0]!, cutouts[1]!] };
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

async function renderMp4(input: GenerateInput): Promise<GenerateResult> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "migo-"));
  try {
    const [first, second] = input.performers;
    const leftPath = path.join(dir, "left.png");
    const rightPath = path.join(dir, "right.png");
    const scriptPath = path.join(dir, "filter.txt");
    const outPath = path.join(dir, "cut.mp4");
    await writeFile(leftPath, first.image);
    await writeFile(rightPath, second.image);
    await writeFile(scriptPath, buildFilter(input), "utf8");

    await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-t",
        "5",
        "-r",
        "24",
        "-i",
        "color=c=0x100e0c:s=1280x720",
        "-loop",
        "1",
        "-t",
        "5",
        "-i",
        leftPath,
        "-loop",
        "1",
        "-t",
        "5",
        "-i",
        rightPath,
        "-filter_complex_script",
        scriptPath,
        "-map",
        "[out]",
        "-t",
        "5",
        "-r",
        "24",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outPath,
      ],
      { timeout: 45_000, maxBuffer: 4 * 1024 * 1024 },
    );

    const data = await readFile(outPath);
    if (data.length < 1000) {
      throw new Error("ffmpeg wrote an empty video");
    }
    return {
      data,
      mimeType: "video/mp4",
      filename: "migo-cut.mp4",
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function buildFilter(input: GenerateInput): string {
  const font = findFont();
  const [first, second] = input.performers;
  const leftName = stageLabel(first.name, "Performer 1", 18);
  const rightName = stageLabel(second.name, "Performer 2", 18);
  const leftStyle = stageLabel(first.styleNote, "", 34);
  const rightStyle = stageLabel(second.styleNote, "", 34);

  const lines = [
    "[1:v]scale=w=460:h=560:force_original_aspect_ratio=decrease,format=rgba[left]",
    "[2:v]scale=w=460:h=560:force_original_aspect_ratio=decrease,format=rgba[right]",
    "[0:v]drawbox=x=70:y=36:w=460:h=520:color=0xF0A202@0.08:t=fill,drawbox=x=750:y=36:w=460:h=520:color=0xC23B22@0.08:t=fill,drawbox=x=0:y=608:w=1280:h=112:color=0x140E0B:t=fill,drawbox=x=632:y=250:w=16:h=270:color=0xC9B59A:t=fill,drawbox=x=592:y=508:w=96:h=12:color=0x8C7355:t=fill,drawbox=x=606:y=168:w=68:h=96:color=0x241C16:t=fill,drawbox=x=618:y=182:w=44:h=64:color=0xE7D7C3:t=fill,drawbox=x=622:y=204:w=36:h=8:color=0x241C16:t=fill,drawbox=x=622:y=222:w=36:h=8:color=0x241C16:t=fill[bg]",
    "[bg][left]overlay=x='250-overlay_w/2+14*sin(2*PI*t*0.85)':y='600-overlay_h+18*sin(2*PI*t*1.45)':format=auto[v1]",
    "[v1][right]overlay=x='1030-overlay_w/2+14*sin(2*PI*t*0.85+PI)':y='600-overlay_h+18*sin(2*PI*t*1.45+1.2)':format=auto[v2]",
  ];

  if (!font) {
    lines.push("[v2]format=yuv420p[out]");
    return lines.join(";\n");
  }

  const draws = [
    drawtext(font, "MIGO", 30, "0xF6E7C1", "48", "26"),
    drawtext(font, "RAP + DANCE", 20, "0xE2B15A", "168", "34"),
    drawtext(font, "ON THE MIC", 18, "0xC9B59A", "1000", "34"),
    drawtext(font, leftName, 28, "0xF3EAD7", "120", "632"),
    drawtext(font, rightName, 28, "0xF3EAD7", "860", "632"),
  ];
  if (leftStyle) draws.push(drawtext(font, leftStyle, 16, "0xC9B59A", "120", "668"));
  if (rightStyle) draws.push(drawtext(font, rightStyle, 16, "0xC9B59A", "860", "668"));
  lines.push(`[v2]${draws.join(",")}[out]`);
  return lines.join(";\n");
}

function drawtext(
  font: string,
  text: string,
  size: number,
  color: string,
  x: string,
  y: string,
): string {
  return `drawtext=fontfile=${font}:text='${text}':fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}`;
}

function findFont(): string | null {
  return FONT_CANDIDATES.find((file) => existsSync(file)) ?? null;
}

function stageLabel(value: string, fallback: string, max: number): string {
  const cleaned = value
    .replace(/[\r\n\t]/g, " ")
    .replace(/'/g, "\u2019")
    .replace(/[%\\:;,[\]=]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return cleaned.length > 0 ? cleaned : fallback;
}

function renderHtmlPreview(input: GenerateInput): GenerateResult {
  const [first, second] = input.performers;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MIGO cut — ${escapeHtml(first.name)} and ${escapeHtml(second.name)}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #100e0c;
      color: #f3ead7;
      font-family: Georgia, "Times New Roman", serif;
    }
    #run { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px;
    }
    .mark { letter-spacing: 0.18em; font-size: 14px; }
    label {
      cursor: pointer;
      border: 1px solid rgba(243, 234, 215, 0.35);
      border-radius: 999px;
      padding: 8px 14px;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 13px;
    }
    #run:checked ~ .top .when-paused { display: none; }
    #run:not(:checked) ~ .top .when-playing { display: none; }
    #run:not(:checked) ~ .frame .person img { animation-play-state: paused; }
    .frame {
      margin: 0 16px 16px;
      aspect-ratio: 16 / 9;
      border-radius: 18px;
      overflow: hidden;
      background:
        radial-gradient(ellipse at 50% 0%, rgba(240, 162, 2, 0.38), transparent 58%),
        #140f0c;
    }
    .cast {
      height: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 6vw;
      padding: 5% 6% 8%;
    }
    .person {
      width: 28%;
      height: 100%;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      text-align: center;
    }
    .person img {
      height: 72%;
      width: auto;
      max-width: 100%;
      object-fit: contain;
      background: transparent;
      filter: drop-shadow(0 16px 10px rgba(0, 0, 0, 0.45));
      transform-origin: center bottom;
    }
    @keyframes sway {
      0%, 100% { transform: translateY(0) rotate(-2deg); }
      50% { transform: translateY(-7%) rotate(2deg); }
    }
    .left img { animation: sway 0.85s ease-in-out infinite; }
    .right img { animation: sway 0.85s ease-in-out infinite reverse; }
    figcaption { margin-top: 8px; font-size: clamp(14px, 2vw, 22px); }
    .note {
      margin: 4px 0 0;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 12px;
      color: #c9b59a;
    }
    .mic { width: 72px; align-self: center; }
    .credit {
      padding: 0 20px 28px;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 13px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #c9b59a;
    }
    @media (prefers-reduced-motion: reduce) {
      .person img { animation: none !important; }
    }
  </style>
</head>
<body>
  <input id="run" type="checkbox" checked />
  <header class="top">
    <div class="mark">MIGO · RAP + DANCE</div>
    <label for="run"><span class="when-playing">Pause</span><span class="when-paused">Play</span></label>
  </header>
  <div class="frame">
    <div class="cast">
      ${performerFigure(first, "left")}
      <div class="mic" aria-hidden="true">
        <svg viewBox="0 0 72 180" width="72" height="180">
          <rect x="32" y="62" width="8" height="90" rx="4" fill="#d9c7a4"/>
          <rect x="16" y="146" width="40" height="8" rx="3" fill="#8a704f"/>
          <ellipse cx="36" cy="50" rx="20" ry="28" fill="#161311" stroke="#e7d7c1" stroke-width="4"/>
          <ellipse cx="36" cy="50" rx="10" ry="16" fill="#efe4d4"/>
        </svg>
      </div>
      ${performerFigure(second, "right")}
    </div>
  </div>
  <p class="credit">Cutouts on the mic · ${escapeHtml(first.name)} + ${escapeHtml(second.name)}</p>
</body>
</html>
`;
  return {
    data: Buffer.from(html, "utf8"),
    mimeType: "text/html; charset=utf-8",
    filename: "migo-cut.html",
  };
}

function performerFigure(performer: PerformerInput, side: "left" | "right"): string {
  const src = `data:image/png;base64,${performer.image.toString("base64")}`;
  const note = performer.styleNote.trim();
  return `<figure class="person ${side}">
    <img src="${src}" alt="${escapeHtml(performer.name)}" />
    <figcaption>${escapeHtml(performer.name)}</figcaption>
    ${note ? `<p class="note">${escapeHtml(note)}</p>` : ""}
  </figure>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
