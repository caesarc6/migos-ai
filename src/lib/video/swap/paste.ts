import type { Face } from "@/lib/video/swap/detect";
import { alignFace, swappedFace } from "@/lib/video/swap/identity";
import { sampleRgb } from "@/lib/video/swap/math";

export async function paintIdentity(
  rgb: Uint8Array,
  width: number,
  height: number,
  face: Face,
  embedding: Float32Array,
): Promise<void> {
  const aligned = alignFace(rgb, width, height, face, 128);
  const generated = matchColor(await swappedFace(aligned.rgb, embedding), aligned.rgb);
  const [a, b, tx, c, d, ty] = aligned.matrix;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  const inverse = invert(aligned.matrix);
  for (const [x, y] of [
    [0, 0],
    [127, 0],
    [0, 127],
    [127, 127],
  ] as const) {
    const px = inverse[0] * x + inverse[1] * y + inverse[2];
    const py = inverse[3] * x + inverse[4] * y + inverse[5];
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(width - 1, Math.ceil(maxX));
  const y1 = Math.min(height - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const u = a * x + b * y + tx;
      const v = c * x + d * y + ty;
      const alpha = faceMask(u, v);
      if (alpha <= 0) continue;
      const [r, g, bch] = sampleRgb(generated, 128, 128, u, v);
      const index = (y * width + x) * 3;
      rgb[index] = blend(rgb[index] ?? 0, r, alpha);
      rgb[index + 1] = blend(rgb[index + 1] ?? 0, g, alpha);
      rgb[index + 2] = blend(rgb[index + 2] ?? 0, bch, alpha);
    }
  }
}

function matchColor(generated: Uint8Array, original: Uint8Array): Uint8Array {
  const out = new Uint8Array(generated.length);
  for (let channel = 0; channel < 3; channel += 1) {
    let meanG = 0;
    let meanO = 0;
    let count = 0;
    for (let i = 0; i < 128 * 128; i += 1) {
      if (faceMask(i % 128, Math.floor(i / 128)) < 0.6) continue;
      meanG += generated[i * 3 + channel] ?? 0;
      meanO += original[i * 3 + channel] ?? 0;
      count += 1;
    }
    meanG /= count || 1;
    meanO /= count || 1;
    let varG = 0;
    let varO = 0;
    for (let i = 0; i < 128 * 128; i += 1) {
      if (faceMask(i % 128, Math.floor(i / 128)) < 0.6) continue;
      varG += ((generated[i * 3 + channel] ?? 0) - meanG) ** 2;
      varO += ((original[i * 3 + channel] ?? 0) - meanO) ** 2;
    }
    const stdG = Math.sqrt(varG / (count || 1)) || 1;
    const stdO = Math.sqrt(varO / (count || 1)) || 1;
    for (let i = 0; i < 128 * 128; i += 1) {
      const value = (((generated[i * 3 + channel] ?? 0) - meanG) / stdG) * stdO + meanO;
      out[i * 3 + channel] = Math.max(0, Math.min(255, Math.round(value)));
    }
  }
  return out;
}

function faceMask(x: number, y: number): number {
  const nx = (x - 63) / 56;
  const ny = (y - 72) / 68;
  const distance = Math.hypot(nx, ny);
  if (distance >= 1) return 0;
  if (distance <= 0.62) return 1;
  return (1 - distance) / 0.38;
}

function blend(base: number, next: number, alpha: number): number {
  return Math.round(base * (1 - alpha) + next * alpha);
}

function invert(matrix: [number, number, number, number, number, number]) {
  const [a, b, tx, c, d, ty] = matrix;
  const det = a * d - b * c || 1e-8;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, -(ia * tx + ib * ty), ic, id, -(ic * tx + id * ty)] as const;
}
