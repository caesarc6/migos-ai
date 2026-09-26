import fs from "node:fs";
import path from "node:path";

export function templateVideoPath(): string {
  return path.join(process.cwd(), "public", "templates", "Migos.mp4");
}

export function hasTemplateVideo(): boolean {
  return fs.existsSync(templateVideoPath());
}

export function templateVideoVersion(): string | null {
  try {
    return String(fs.statSync(templateVideoPath()).mtimeMs);
  } catch {
    return null;
  }
}
