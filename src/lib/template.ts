import fs from "node:fs";
import path from "node:path";

export function hasTemplateVideo(): boolean {
  return fs.existsSync(path.join(process.cwd(), "public", "templates", "performance.mp4"));
}
