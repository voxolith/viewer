// Generates a '90 Lamborghini Diablo as a MagicaVoxel .vox into public/samples/.
// Run with:  bun run gen:diablo
//
// Same authoring scheme as gen-testarossa.ts (~1 voxel ≈ 4.5cm; real car
// 4460×2040×1105mm → 100×47×25 voxels), nose at +x, tail at x=0, Z-up.
// Signature details: blade-low pop-up nose, extreme cab-forward bubble canopy,
// big sloped side intakes ahead of the rear wheels, shoulder scoops, louvred
// engine deck, rear wing on pylons, quad centre exhausts, Giallo paint.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeVox } from "@voxolith/render/vox";

const C = {
  body: 1, seam: 2, trim: 3, glass: 4, tire: 5, hub: 6,
  tail: 7, amber: 8, badge: 9, grille: 10, silver: 11, well: 12,
} as const;
const COLORS: Record<number, [number, number, number]> = {
  [C.body]: [246, 202, 16], // Giallo
  [C.seam]: [188, 148, 12], // panel shut-lines / shading
  [C.trim]: [20, 20, 22], // black bumpers, intakes, wing pylons
  [C.glass]: [14, 18, 26],
  [C.tire]: [26, 26, 28],
  [C.hub]: [186, 188, 194],
  [C.tail]: [235, 30, 34],
  [C.amber]: [255, 170, 60],
  [C.badge]: [225, 175, 40],
  [C.grille]: [40, 40, 44],
  [C.well]: [28, 26, 28],
};

// Grid: x = length (0 tail .. L-1 nose), y = width (CY centre), z = up.
const L = 100, W = 47, H = 25, CY = 23;
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

// Plan half-width: wide squared tail + rear hips, waisted doors, wide front
// fenders, blade nose.
const hwAt = (x: number) =>
  Math.round(piecewise([[0, 21], [3, 22], [26, 23], [44, 20], [58, 19], [70, 20], [88, 20], [95, 18], [99, 14]], x));
// Body top (beltline/hood, greenhouse excluded): flat engine deck, high door
// shoulders, long plunging hood to a blade nose.
const topAt = (x: number) =>
  Math.round(piecewise([[0, 13], [32, 13], [50, 12], [64, 11], [84, 9], [93, 8], [99, 6]], x));
const botAt = (_x: number) => 3;

// Greenhouse top: huge windshield rake (x64→50), short roof, fast rear glass.
const gtopAt = (x: number) =>
  Math.round(piecewise([[32, 13], [40, 20], [42, 21], [48, 21], [50, 20], [64, 11]], x));
const ghwAt = (z: number) => Math.round(13 - Math.max(0, z - 12) * 0.4); // tumblehome

const FRONT_AXLE = 77, REAR_AXLE = 18, AXLE_Z = 6, WHEEL_R = 6.5;

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
  // Tire + 5-hole "telephone dial" hub (outer face), dark brake shadow behind.
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

// --- Side intakes: big sloped ducts ahead of the rear wheels -------------------
for (let z = 5; z <= 11; z++) {
  const x0 = 28 + (11 - z); // leading edge rakes back as it rises
  for (let x = x0; x <= 39; x++)
    for (const s of [1, -1]) {
      for (let y = CY; y >= 0; y--)
        if (get(x, s * y, z)) {
          set(x, s * y, z, 0); // recess one voxel deep
          set(x, s * (y - 1), z, C.trim);
          break;
        }
    }
}
// Shoulder scoops on the rear deck, behind the side glass.
for (let x = 33; x <= 39; x++)
  for (const s of [1, -1])
    for (let y = 13; y <= 17; y++)
      if (get(x, s * y, 13)) set(x, s * y, 13, C.trim);

// --- Greenhouse ----------------------------------------------------------------
for (let x = 32; x <= 64; x++) {
  const gtop = gtopAt(x), base = topAt(x) + 1;
  for (let z = base; z <= gtop; z++) {
    const ghw = ghwAt(z);
    for (let y = -ghw; y <= ghw; y++) set(x, y, z, C.glass);
  }
  if (gtop === 21) for (let y = -ghwAt(21); y <= ghwAt(21); y++) set(x, y, 21, C.body); // roof cap
}

// --- Door mirrors (both sides, low on the A-pillar) -----------------------------
for (const s of [1, -1]) {
  for (let y = 11; y <= 14; y++) set(57, s * y, 15, C.body);
  for (let x = 55; x <= 57; x++)
    for (let y = 15; y <= 16; y++)
      for (let z = 14; z <= 16; z++) set(x, s * y, z, x === 55 ? C.glass : C.body);
}

// --- Nose ----------------------------------------------------------------------
{
  const nose = L - 1;
  // Black bumper band wrapping the corners; splitter lip below.
  for (let x = 92; x <= nose; x++) {
    const hw = hwAt(x);
    for (let z = 3; z <= 4; z++) {
      if (x === nose) for (let y = -hw + 1; y <= hw - 1; y++) set(x, y, z, C.trim);
      else { set(x, hw, z, C.trim); set(x, -hw, z, C.trim); }
    }
    for (let y = -hw + 2; y <= hw - 2; y++) set(x, y, 2, C.trim);
  }
  // Grille slot, amber corner indicators, badge.
  for (let y = -7; y <= 7; y++) set(nose, y, 5, C.grille);
  for (const s of [1, -1]) for (let y = 9; y <= 11; y++) set(nose, s * y, 5, C.amber);
  set(nose, 0, 6, C.badge);
  // Pop-up headlight shut-lines on the plunging hood.
  for (let x = 85; x <= 92; x++)
    for (const s of [1, -1])
      for (let y = 7; y <= 13; y++) {
        const z = topAt(x);
        const border = x === 85 || x === 92 || y === 7 || y === 13;
        if (border && get(x, s * y, z)) set(x, s * y, z, C.seam);
      }
}

// --- Engine deck: recessed longitudinal louvres --------------------------------
for (let x = 10; x <= 28; x++)
  for (let y = -11; y <= 11; y++) set(x, y, 13, (y % 2 === 0) ? C.trim : C.body);

// --- Rear wing on pylons ---------------------------------------------------------
for (const s of [1, -1])
  for (let x = 5; x <= 7; x++)
    for (let z = 14; z <= 16; z++) set(x, s * 11, z, C.trim);
for (let x = 3; x <= 8; x++)
  for (let y = -19; y <= 19; y++) {
    set(x, y, 17, C.body);
    if (Math.abs(y) >= 18) set(x, y, 16, C.trim); // endplates
  }

// --- Tail ----------------------------------------------------------------------
for (let x = 0; x <= 4; x++) {
  const hw = hwAt(x);
  for (let z = 3; z <= 4; z++) {
    if (x === 0) for (let y = -hw + 1; y <= hw - 1; y++) set(x, y, z, C.trim);
    else { set(x, hw, z, C.trim); set(x, -hw, z, C.trim); }
  }
}
for (let z = 5; z <= 12; z++) for (let y = -20; y <= 20; y++) set(0, y, z, C.trim); // black tail panel
for (const s of [1, -1]) {
  for (let y = 9; y <= 16; y++) for (let z = 8; z <= 10; z++) set(0, s * y, z, C.tail); // lamp clusters
  for (let y = 9; y <= 12; y++) set(0, s * y, 6, C.amber); // reversing/indicator strip
}
set(0, 0, 12, C.badge);
for (const y of [-5, -4, -2, -1, 1, 2, 4, 5]) for (let z = 4; z <= 5; z++) set(0, y, z, C.silver); // quad exhausts

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
const out = resolve(here, "../public/samples/diablo.vox");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, new Uint8Array(buf));
console.log(`wrote ${out}: ${voxels.length} voxels, grid ${L}×${W}×${H}`);
