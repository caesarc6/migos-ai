/** 2x3 affine: [x', y'] = M * [x, y, 1]. Row-major, 6 numbers. */
export type Affine = [number, number, number, number, number, number];

const ARCFACE_DST: Array<[number, number]> = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

export function alignTemplate(size: number): Array<[number, number]> {
  const ratio = size % 112 === 0 ? size / 112 : size / 128;
  const diffX = size % 112 === 0 ? 0 : 8 * ratio;
  return ARCFACE_DST.map(([x, y]) => [x * ratio + diffX, y * ratio]);
}

/** Map `from` points onto `to` points with rotation, uniform scale, and translation. */
export function estimateSimilarity(from: Array<[number, number]>, to: Array<[number, number]>): Affine {
  const n = from.length;
  let mx = 0;
  let my = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    mx += from[i]![0];
    my += from[i]![1];
    dx += to[i]![0];
    dy += to[i]![1];
  }
  mx /= n;
  my /= n;
  dx /= n;
  dy /= n;

  let varFrom = 0;
  let c00 = 0;
  let c01 = 0;
  let c10 = 0;
  let c11 = 0;
  for (let i = 0; i < n; i += 1) {
    const sx = from[i]![0] - mx;
    const sy = from[i]![1] - my;
    const tx = to[i]![0] - dx;
    const ty = to[i]![1] - dy;
    varFrom += sx * sx + sy * sy;
    c00 += tx * sx;
    c01 += tx * sy;
    c10 += ty * sx;
    c11 += ty * sy;
  }
  varFrom /= n;
  c00 /= n;
  c01 /= n;
  c10 /= n;
  c11 /= n;

  const { u00, u01, u10, u11, s0, s1, v00, v01, v10, v11 } = svd2(c00, c01, c10, c11);
  const detU = u00 * u11 - u01 * u10;
  const detV = v00 * v11 - v01 * v10;
  const d1 = detU * detV < 0 ? -1 : 1;
  const r00 = u00 * v00 + u01 * d1 * v01;
  const r01 = u00 * v10 + u01 * d1 * v11;
  const r10 = u10 * v00 + u11 * d1 * v01;
  const r11 = u10 * v10 + u11 * d1 * v11;
  const scale = (s0 + d1 * s1) / (varFrom || 1);
  const t0 = dx - scale * (r00 * mx + r01 * my);
  const t1 = dy - scale * (r10 * mx + r11 * my);
  return [scale * r00, scale * r01, t0, scale * r10, scale * r11, t1];
}

export function invertAffine(m: Affine): Affine {
  const [a, b, tx, c, d, ty] = m;
  const det = a * d - b * c || 1e-8;
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, -(ia * tx + ib * ty), ic, id, -(ic * tx + id * ty)];
}

export function sampleRgb(
  rgb: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number] {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const wx = x - x0;
  const wy = y - y0;
  const i00 = (y0 * width + x0) * 3;
  const i10 = (y0 * width + x1) * 3;
  const i01 = (y1 * width + x0) * 3;
  const i11 = (y1 * width + x1) * 3;
  const channel = (offset: number) => {
    const top = (rgb[i00 + offset] ?? 0) * (1 - wx) + (rgb[i10 + offset] ?? 0) * wx;
    const bottom = (rgb[i01 + offset] ?? 0) * (1 - wx) + (rgb[i11 + offset] ?? 0) * wx;
    return top * (1 - wy) + bottom * wy;
  };
  return [channel(0), channel(1), channel(2)];
}

function svd2(a: number, b: number, c: number, d: number) {
  const e = (a + d) / 2;
  const f = (a - d) / 2;
  const g = (b + c) / 2;
  const h = (b - c) / 2;
  const q = Math.hypot(e, h);
  const r = Math.hypot(f, g);
  const sx = q + r;
  const sy = q - r;
  const a1 = Math.atan2(g, f);
  const a2 = Math.atan2(h, e);
  const theta = (a2 - a1) / 2;
  const phi = (a2 + a1) / 2;
  const cu = Math.cos(phi);
  const su = Math.sin(phi);
  const cv = Math.cos(theta);
  const sv = Math.sin(theta);
  return {
    u00: cu,
    u01: -su,
    u10: su,
    u11: cu,
    s0: Math.abs(sx),
    s1: Math.abs(sy),
    v00: cv,
    v01: -sv,
    v10: sv,
    v11: cv,
  };
}
