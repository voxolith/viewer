// Turns a parsed .vox model into something the @voxolith/renderer engine can render: crop to
// the occupied bounding box (so world-baked models frame nicely), convert the
// MagicaVoxel Z-up axis to the engine's Y-up, and copy the file palette so the
// rendered colours match the source.

import type { VoxModel, Vec3 } from "@voxolith/renderer";

export interface ViewModel {
  /** Engine grid size (cropped + Y-up). */
  size: { x: number; y: number; z: number };
  data: Uint8Array;
  palette: Float32Array; // 256 × vec4
  /** Original MagicaVoxel dimensions (x, y, z) for display. */
  srcSize: { x: number; y: number; z: number };
  voxelCount: number;
  /** Distinct palette indices used, with their RGB (for the swatch strip). */
  usedColors: { index: number; rgb: [number, number, number] }[];
}

export function toViewModel(m: VoxModel): ViewModel {
  // Occupied AABB in model coords.
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (const v of m.voxels) {
    if (v.x < minx) minx = v.x;
    if (v.x > maxx) maxx = v.x;
    if (v.y < miny) miny = v.y;
    if (v.y > maxy) maxy = v.y;
    if (v.z < minz) minz = v.z;
    if (v.z > maxz) maxz = v.z;
  }
  if (!isFinite(minx)) {
    minx = miny = minz = 0;
    maxx = maxy = maxz = 0;
  }

  // Z-up (model) → Y-up (engine): X=x, Y=z, Z=y.
  const gx = maxx - minx + 1;
  const gy = maxz - minz + 1;
  const gz = maxy - miny + 1;
  const data = new Uint8Array(gx * gy * gz);
  const used = new Set<number>();
  for (const v of m.voxels) {
    const wx = v.x - minx;
    const wy = v.z - minz;
    const wz = v.y - miny;
    data[wx + wy * gx + wz * gx * gy] = v.c;
    used.add(v.c);
  }

  const palette = new Float32Array(256 * 4);
  for (let i = 1; i < 256; i++) {
    if (m.palette[i * 4 + 3] === 0) continue;
    palette[i * 4 + 0] = m.palette[i * 4 + 0] / 255;
    palette[i * 4 + 1] = m.palette[i * 4 + 1] / 255;
    palette[i * 4 + 2] = m.palette[i * 4 + 2] / 255;
    palette[i * 4 + 3] = 1;
  }

  const usedColors = [...used]
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      rgb: [
        m.palette[index * 4 + 0],
        m.palette[index * 4 + 1],
        m.palette[index * 4 + 2],
      ] as [number, number, number],
    }));

  return {
    size: { x: gx, y: gy, z: gz },
    data,
    palette,
    srcSize: { x: m.size.x, y: m.size.y, z: m.size.z },
    voxelCount: m.voxels.length,
    usedColors,
  };
}

/** A look-at target (model centre) + a distance that frames the whole model. */
export function framing(size: { x: number; y: number; z: number }): {
  target: Vec3;
  distance: number;
} {
  const max = Math.max(size.x, size.y, size.z);
  return {
    target: [size.x / 2, size.y / 2, size.z / 2],
    distance: max * 2.2 + 16,
  };
}
