// Generates procedural landscape .vox files into public/samples/ as heavy test
// scenes for the viewer + engine. Run with:  bun run gen:samples
//   - landscape.vox     ~0.5M voxels (quick)
//   - landscape-xl.vox  ~5–6M voxels (10× bigger; near the .vox 255-per-axis cap)
//
// MagicaVoxel is Z-up, so height runs along z here; the viewer maps z -> engine Y.
// NOTE: .vox XYZI coords are single bytes, so no axis may exceed 255.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeVox } from "@voxolith/renderer/vox";

// Palette (1-based).
const C = {
  water: 1, sand: 2, grass: 3, grassD: 4, rock: 5, snow: 6, dirt: 7,
  trunk: 8, leaf: 9, leafD: 10,
} as const;
const COLORS: Record<number, [number, number, number]> = {
  [C.water]: [58, 124, 196],
  [C.sand]: [223, 207, 148],
  [C.grass]: [96, 150, 70],
  [C.grassD]: [80, 132, 58],
  [C.rock]: [132, 128, 120],
  [C.snow]: [236, 240, 246],
  [C.dirt]: [120, 92, 62],
  [C.trunk]: [120, 86, 56],
  [C.leaf]: [92, 156, 84],
  [C.leafD]: [70, 128, 66],
};

function hash2(ix: number, iy: number): number {
  const h = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}
function fractal(x: number, y: number, scale: number): number {
  let n = 0, amp = 1, freq = 1 / scale, norm = 0;
  for (let o = 0; o < 4; o++) {
    n += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return n / norm;
}

interface SceneCfg {
  sx: number;
  sy: number;
  sz: number;
  water: number;
  base: number; // min terrain height
  range: number; // height variation added to base
  noiseScale: number; // larger = broader features
  treeStep: number; // tree grid spacing (smaller = denser)
}

function buildScene(cfg: SceneCfg): [number, number, number, number][] {
  const { sx, sy, sz, water, base, range, noiseScale, treeStep } = cfg;
  const vox: [number, number, number, number][] = [];
  const solid = new Uint8Array(sx * sy * sz);
  const set = (x: number, y: number, z: number, c: number) => {
    if (x < 0 || x >= sx || y < 0 || y >= sy || z < 0 || z >= sz) return;
    const i = x + y * sx + z * sx * sy;
    if (solid[i]) return;
    solid[i] = 1;
    vox.push([x, y, z, c]);
  };

  const hgt = new Int32Array(sx * sy);
  for (let y = 0; y < sy; y++)
    for (let x = 0; x < sx; x++) {
      const h = Math.max(2, Math.min(sz - 2, Math.round(base + fractal(x, y, noiseScale) * range)));
      hgt[x + y * sx] = h;
      for (let z = 0; z <= h; z++) {
        let mat: number;
        if (z < h - 3) mat = C.rock;
        else if (z < h - 1) mat = C.dirt;
        else if (h <= water + 1) mat = C.sand;
        else if (h >= sz - 14) mat = C.snow;
        else if (h >= sz - 22) mat = C.rock;
        else mat = (x + y) % 2 === 0 ? C.grass : C.grassD;
        set(x, y, z, mat);
      }
      for (let z = h + 1; z <= water; z++) set(x, y, z, C.water);
    }

  // Scatter chunky trees on grassy mid-altitude land (deterministic).
  for (let y = 6; y < sy - 6; y += treeStep)
    for (let x = 6; x < sx - 6; x += treeStep) {
      const jx = x + Math.floor(hash2(x, y) * 5) - 2;
      const jy = y + Math.floor(hash2(y, x) * 5) - 2;
      const h = hgt[jx + jy * sx];
      if (h <= water + 2 || h >= sz - 18) continue;
      if (hash2(jx * 3, jy * 3) > 0.45) continue;
      const trunkH = 4 + Math.floor(hash2(jx, jy) * 3);
      for (let z = h + 1; z <= h + trunkH; z++) set(jx, jy, z, C.trunk);
      const cz = h + trunkH + 2, r = 3;
      for (let dz = -r; dz <= r; dz++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++)
            if (dx * dx + dy * dy + dz * dz <= r * r)
              set(jx + dx, jy + dy, cz + dz, (dx + dy + dz) % 2 === 0 ? C.leaf : C.leafD);
    }

  return vox;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../public/samples");
mkdirSync(outDir, { recursive: true });

function emit(name: string, cfg: SceneCfg) {
  const vox = buildScene(cfg);
  const bytes = writeVox({ x: cfg.sx, y: cfg.sy, z: cfg.sz }, vox, (i) => COLORS[i] ?? null);
  writeFileSync(resolve(outDir, name), Buffer.from(bytes));
  console.log(
    `Wrote ${name}: ${vox.length.toLocaleString()} voxels (${cfg.sx}x${cfg.sy}x${cfg.sz}), ${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB`,
  );
}

emit("landscape.vox", {
  sx: 144, sy: 144, sz: 56, water: 8, base: 2, range: 44, noiseScale: 44, treeStep: 7,
});
// ~10× bigger: a near-max 252² footprint with tall, broad terrain.
emit("landscape-xl.vox", {
  sx: 252, sy: 252, sz: 152, water: 22, base: 26, range: 120, noiseScale: 80, treeStep: 9,
});
