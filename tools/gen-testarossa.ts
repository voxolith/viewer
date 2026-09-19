// Generates an '84 Ferrari Testarossa as a MagicaVoxel .vox into public/samples/.
// Run with:  bun run gen:testarossa
//
// Authored at ~1 voxel ≈ 4.5cm (real car 4485×1976×1130mm → 100×44×25 voxels),
// nose at +x, tail at x=0. MagicaVoxel is Z-up (the viewer maps z -> engine Y).
// Signature details: full-width wedge with rear hips wider than the nose, door
// strakes rising into the rear intakes, pop-up headlight seams, the single high
// "monospecchio" mirror on the driver A-pillar, louvred engine deck, and the
// full-width slatted tail grille with light bars.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeVox } from "@voxolith/render/vox";

const C = {
  body: 1, seam: 2, trim: 3, glass: 4, tire: 5, hub: 6,
  tail: 7, amber: 8, badge: 9, grille: 10, silver: 11, well: 12,
} as const;
const COLORS: Record<number, [number, number, number]> = {
  [C.body]: [219, 24, 32], // Rosso Corsa
  [C.seam]: [148, 12, 20], // panel shut-lines / shading
  [C.trim]: [22, 22, 24], // black bumpers, sills, slats
  [C.glass]: [16, 20, 28],
  [C.tire]: [26, 26, 28],
  [C.hub]: [188, 190, 196],
  [C.tail]: [255, 36, 40],
  [C.amber]: [255, 170, 60],
  [C.badge]: [252, 208, 36],
  [C.grille]: [40, 40, 44],
  [C.well]: [30, 28, 30],
};

// Grid: x = length (0 tail .. L-1 nose), y = width (CY centre), z = up.
const L = 100, W = 45, H = 26, CY = 22;
const grid = new Uint8Array(L * W * H);
const inB = (x: number, y: number, z: number) =>
  x >= 0 && x < L && y >= -CY && y <= CY && z >= 0 && z < H;
const set = (x: number, y: number, z: number, c: number) => {
  if (inB(x, y, z)) grid[(z * W + (y + CY)) * L + x] = c;
};
const get = (x: number, y: number, z: number): number =>
  inB(x, y, z) ? grid[(z * W + (y + CY)) * L + x] : 0;

function piecewise(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

// Plan half-width: wide squared tail + rear hips (widest), waisted doors,
// front fenders, tapered rounded nose.
const hwAt = (x: number) =>
  Math.round(piecewise([[0, 20], [2, 21], [6, 22], [34, 22], [46, 18], [66, 18], [74, 19], [88, 19], [94, 17], [97, 15], [99, 12]], x));
// Body top (beltline/hood, greenhouse excluded): high flat deck, dropping
// beltline through the doors, long wedge hood to a low nose.
const topAt = (x: number) =>
  Math.round(piecewise([[0, 14], [30, 14], [46, 13], [58, 12], [84, 11], [92, 10], [96, 9], [99, 8]], x));
const botAt = (x: number) => 3;

// Greenhouse top: raked windshield (x60→51), flat roof, fastback rear glass.
const gtopAt = (x: number) =>
  Math.round(piecewise([[30, 14], [38, 21], [40, 22], [48, 22], [51, 21], [60, 12]], x));
const ghwAt = (z: number) => Math.round(14 - Math.max(0, z - 13) * 0.35); // tumblehome

const FRONT_AXLE = 78, REAR_AXLE = 21, AXLE_Z = 6, WHEEL_R = 6.5;

// --- Body shell ---------------------------------------------------------------
for (let x = 0; x < L; x++) {
  const hw = hwAt(x), top = topAt(x), bot = botAt(x);
  for (let z = bot; z <= top; z++) {
    const rhw = z === top || z === bot ? hw - 1 : hw; // shoulder + sill tuck
    for (let y = -rhw; y <= rhw; y++) set(x, y, z, C.body);
  }
}

// --- Wheel arches + wheels -----------------------------------------------------
for (const ax of [REAR_AXLE, FRONT_AXLE]) {
  const hwA = hwAt(ax);
  const wellY = hwA - 6; // inner wall of the wheel well
  for (let x = ax - 9; x <= ax + 9; x++)
    for (let z = 0; z <= 13; z++) {
      if ((x - ax) ** 2 + (z - AXLE_Z) ** 2 > 8.2 ** 2) continue;
      for (let y = wellY; y <= CY; y++) {
        set(x, y, z, 0);
        set(x, -y, z, 0);
      }
      set(x, wellY, z, get(x, wellY - 1, z) ? C.well : 0);
      set(x, -wellY, z, get(x, -(wellY - 1), z) ? C.well : 0);
    }
  // Tire + 5-spoke hub (outer face), dark brake shadow behind.
  const outer = hwA - 2;
  for (let x = ax - 7; x <= ax + 7; x++)
    for (let z = 0; z <= 13; z++) {
      const r = Math.hypot(x - ax, z - AXLE_Z);
      if (r > WHEEL_R + 0.2) continue;
      for (let i = 0; i <= 4; i++) {
        const yi = outer - i;
        const edge = i === 0 || i === 4;
        if (r > 3.8) {
          if (!(edge && r > 6.0)) { set(x, yi, z, C.tire); set(x, -yi, z, C.tire); }
        } else if (i === 0) {
          const a = Math.atan2(z - AXLE_Z, x - ax);
          const spoke = ((a / (Math.PI * 2)) * 5 + 5.5) % 1;
          const hole = r > 1.7 && r < 3.5 && spoke < 0.32;
          const c = r < 1.0 ? C.badge : hole ? C.trim : C.hub;
          set(x, outer, z, c); set(x, -outer, z, c);
        } else {
          set(x, yi, z, C.trim); set(x, -yi, z, C.trim);
        }
      }
    }
}

// --- Side strakes (door + rear-intake "cheese grater", rising to the rear) ----
for (let x = 36; x <= 64; x++)
  for (let z = 5; z <= 11; z++) {
    if ((z + Math.round((x - 36) * 0.07)) % 2 !== 0) continue;
    for (const s of [1, -1]) {
      for (let y = CY; y >= 0; y--)
        if (get(x, s * y, z)) { set(x, s * y, z, C.trim); break; }
    }
  }

// --- Greenhouse ----------------------------------------------------------------
for (let x = 30; x <= 60; x++) {
  const gtop = gtopAt(x), base = topAt(x) + 1;
  for (let z = base; z <= gtop; z++) {
    const ghw = ghwAt(z);
    for (let y = -ghw; y <= ghw; y++) set(x, y, z, C.glass);
  }
  if (gtop === 22) for (let y = -ghwAt(22); y <= ghwAt(22); y++) set(x, y, 22, C.body); // roof cap
}
// Rear flying-buttress edges framing the back glass.
for (let x = 30; x <= 35; x++)
  for (let z = topAt(x) + 1; z <= gtopAt(x); z++) {
    const ghw = ghwAt(z);
    for (const s of [1, -1]) { set(x, s * ghw, z, C.body); set(x, s * (ghw - 1), z, C.body); }
  }

// --- Monospecchio: single high mirror on the driver (left) A-pillar ------------
for (let y = -12; y >= -14; y--) set(54, y, 20, C.body);
for (let x = 53; x <= 55; x++)
  for (let y = -16; y <= -15; y++)
    for (let z = 19; z <= 22; z++) set(x, y, z, x === 53 ? C.glass : C.body);

// --- Nose ----------------------------------------------------------------------
{
  const nose = L - 1;
  // Black bumper band, wrapping the front corners; splitter lip below.
  for (let x = 93; x <= nose; x++) {
    const hw = hwAt(x);
    for (let z = 3; z <= 5; z++) {
      if (x === nose) for (let y = -hw + 1; y <= hw - 1; y++) set(x, y, z, C.trim);
      else { set(x, hw, z, C.trim); set(x, -hw, z, C.trim); }
    }
    for (let y = -hw + 2; y <= hw - 2; y++) set(x, y, 2, C.trim);
  }
  // Grille slot, amber corner indicators, Cavallino badge.
  for (let y = -8; y <= 8; y++) set(nose, y, 6, C.grille);
  for (const s of [1, -1]) for (let y = 9; y <= 11; y++) set(nose, s * y, 7, C.amber);
  set(nose, 0, 8, C.badge);
  // Pop-up headlight shut-lines on the hood.
  for (let x = 88; x <= 94; x++)
    for (const s of [1, -1])
      for (let y = 8; y <= 14; y++) {
        const z = topAt(x);
        const border = x === 88 || x === 94 || y === 8 || y === 14;
        if (border && get(x, s * y, z)) set(x, s * y, z, C.seam);
      }
}

// --- Engine deck: recessed longitudinal louvres between the buttresses ---------
for (let x = 8; x <= 27; x++)
  for (let y = -12; y <= 12; y++) {
    set(x, y, 14, 0);
    set(x, y, 13, (y % 2 === 0) ? C.trim : C.body);
  }

// --- Tail ----------------------------------------------------------------------
for (let x = 0; x <= 4; x++) {
  const hw = hwAt(x);
  for (let z = 3; z <= 4; z++) {
    if (x === 0) for (let y = -hw + 1; y <= hw - 1; y++) set(x, y, z, C.trim);
    else { set(x, hw, z, C.trim); set(x, -hw, z, C.trim); }
  }
}
for (let z = 5; z <= 12; z++) for (let y = -19; y <= 19; y++) set(0, y, z, C.trim); // slatted grille panel
for (const z of [7, 10]) for (let y = -18; y <= 18; y++) set(0, y, z, C.tail); // light bars behind the slats
set(0, 0, 13, C.badge);
for (const y of [-9, -8, -6, -5, 5, 6, 8, 9]) set(0, y, 3, C.silver); // twin exhaust pairs

// --- Sills ---------------------------------------------------------------------
for (let x = 12; x <= 88; x++)
  for (const s of [1, -1])
    for (let y = CY; y >= 0; y--)
      if (get(x, s * y, 3)) { set(x, s * y, 3, C.trim); break; }

// --- Write ---------------------------------------------------------------------
const voxels: [number, number, number, number][] = [];
for (let z = 0; z < H; z++)
  for (let y = 0; y < W; y++)
    for (let x = 0; x < L; x++) {
      const c = grid[(z * W + y) * L + x];
      if (c) voxels.push([x, y, z, c]);
    }

const buf = writeVox({ x: L, y: W, z: H }, voxels, (i) => COLORS[i] ?? null);
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../public/samples/testarossa.vox");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, new Uint8Array(buf));
console.log(`wrote ${out}: ${voxels.length} voxels, grid ${L}×${W}×${H}`);
