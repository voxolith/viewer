// CPU raytrace a .vox to PNG — a headless-safe way to eyeball a model when the
// GPU/WebGPU screenshot harness is unavailable (headless Chrome can't capture
// the WebGPU swapchain). DDA traversal + lambert + face tint, matching the
// engine's look closely enough to judge shape and palette.
//
// usage: bun tools/render-vox.ts <file.vox> <out.png> [yawDeg] [pitchDeg] [width]

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { parseVox } from "@voxolith/render/vox";

const [, , inPath, outPath, yawArg, pitchArg, widthArg] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: tsx tools/render-vox.ts <file.vox> <out.png> [yawDeg] [pitchDeg] [width]");
  process.exit(1);
}
const yaw = ((Number(yawArg ?? 35) * Math.PI) / 180);
const pitch = ((Number(pitchArg ?? 22) * Math.PI) / 180);
const IW = Number(widthArg ?? 800);
const IH = Math.round(IW * 0.62);

const model = parseVox(readFileSync(inPath).buffer as ArrayBuffer);
const { x: SX, y: SY, z: SZ } = model.size;
const grid = new Uint8Array(SX * SY * SZ);
for (const v of model.voxels) grid[(v.z * SY + v.y) * SX + v.x] = v.c;
const at = (x: number, y: number, z: number) =>
  x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ ? 0 : grid[(z * SY + y) * SX + x];

// Camera: orbit the model centre (vox files are Z-up; keep Z up on screen).
const cx = SX / 2, cy = SY / 2, cz = SZ / 2;
const radius = Math.hypot(SX, SY, SZ) * 1.1;
const eye = [
  cx + radius * Math.cos(pitch) * Math.sin(yaw),
  cy - radius * Math.cos(pitch) * Math.cos(yaw),
  cz + radius * Math.sin(pitch),
];
const fwd = norm([cx - eye[0], cy - eye[1], cz - eye[2]]);
const right = norm(cross(fwd, [0, 0, 1]));
const up = cross(right, fwd);
const FOV = (34 * Math.PI) / 180;
const half = Math.tan(FOV / 2);

const LIGHT = norm([0.45, -0.6, 0.75]);
const px = new Uint8Array(IW * IH * 3);

for (let j = 0; j < IH; j++)
  for (let i = 0; i < IW; i++) {
    const u = ((i + 0.5) / IW - 0.5) * 2 * half * (IW / IH);
    const v = (0.5 - (j + 0.5) / IH) * 2 * half;
    const dir = norm([
      fwd[0] + u * right[0] + v * up[0],
      fwd[1] + u * right[1] + v * up[1],
      fwd[2] + u * right[2] + v * up[2],
    ]);
    const hit = trace(eye, dir);
    const o = (j * IW + i) * 3;
    if (!hit) {
      const t = j / IH;
      px[o] = 24 + 10 * t; px[o + 1] = 26 + 10 * t; px[o + 2] = 32 + 12 * t;
      continue;
    }
    const p = hit.c * 4;
    const base = [model.palette[p], model.palette[p + 1], model.palette[p + 2]];
    const ndl = Math.max(0, hit.n[0] * LIGHT[0] + hit.n[1] * LIGHT[1] + hit.n[2] * LIGHT[2]);
    const faceTint = hit.n[2] > 0.5 ? 1.0 : Math.abs(hit.n[0]) > 0.5 ? 0.85 : 0.75;
    const shade = (0.35 + 0.65 * ndl) * faceTint;
    for (let k = 0; k < 3; k++) px[o + k] = Math.min(255, base[k] * shade + 12 * ndl);
  }

writeFileSync(outPath, png(IW, IH, px));
console.log(`rendered ${inPath} -> ${outPath} (${IW}x${IH}, yaw ${yawArg ?? 35}, pitch ${pitchArg ?? 22})`);

function trace(o: number[], d: number[]): { c: number; n: number[] } | null {
  // Enter the grid AABB, then Amanatides-Woo DDA.
  let t0 = 0, t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    const s = [SX, SY, SZ][a];
    const inv = 1 / d[a];
    let ta = (0 - o[a]) * inv, tb = (s - o[a]) * inv;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
  }
  if (t0 > t1) return null;
  const start = [o[0] + d[0] * (t0 + 1e-4), o[1] + d[1] * (t0 + 1e-4), o[2] + d[2] * (t0 + 1e-4)];
  let ix = Math.floor(start[0]), iy = Math.floor(start[1]), iz = Math.floor(start[2]);
  const step = d.map((v) => (v > 0 ? 1 : -1));
  const tDelta = d.map((v) => Math.abs(1 / v));
  const tMax = [0, 1, 2].map((a) => {
    const cell = [ix, iy, iz][a];
    const next = step[a] > 0 ? cell + 1 : cell;
    return t0 + (next - start[a]) / d[a] + tDelta[a] * (step[a] > 0 ? 0 : 1) * 0;
  });
  // Recompute tMax properly from the start point.
  for (let a = 0; a < 3; a++) {
    const cell = [ix, iy, iz][a];
    const bound = step[a] > 0 ? cell + 1 : cell;
    tMax[a] = t0 + (bound - start[a]) / d[a];
  }
  let n = [0, 0, 0];
  for (let s = 0; s < 1024; s++) {
    if (ix < 0 || iy < 0 || iz < 0 || ix >= SX || iy >= SY || iz >= SZ) return null;
    const c = at(ix, iy, iz);
    if (c) return { c, n };
    if (tMax[0] < tMax[1] && tMax[0] < tMax[2]) { ix += step[0]; tMax[0] += tDelta[0]; n = [-step[0], 0, 0]; }
    else if (tMax[1] < tMax[2]) { iy += step[1]; tMax[1] += tDelta[1]; n = [0, -step[1], 0]; }
    else { iz += step[2]; tMax[2] += tDelta[2]; n = [0, 0, -step[2]]; }
  }
  return null;
}

function norm(v: number[]): number[] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let j = 0; j < h; j++) {
    raw[j * (1 + w * 3)] = 0;
    rgb.subarray(j * w * 3, (j + 1) * w * 3).forEach((v, k) => (raw[j * (1 + w * 3) + 1 + k] = v));
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c;
}
