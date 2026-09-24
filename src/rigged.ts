// Clip playback for rigged generators, as the viewer's frame animator.
//
// Every frame of every clip is baked once (12 fps, the clips' own rate) with
// @voxolith/engine/animation, and all of them share one grid big enough for
// the widest pose, with the anchor fixed, so switching clips never moves the
// camera or rebuilds the renderer.

import { entityPalette, type Entity, type EntityModel } from "@voxolith/engine";
import { bakePose, poseMatrices, sampleClip } from "@voxolith/engine/animation";
import type { VoxSceneAnimator } from "@voxolith/renderer";

export const CLIP_FPS = 12;

export interface RigPlayer extends VoxSceneAnimator {
  clips: string[];
  clip(): string;
  setClip(id: string): void;
}

export function makeRigPlayer(entity: Entity): RigPlayer | null {
  const rig = entity.rig, clips = entity.clips;
  if (!rig || !clips?.length || !entity.model.bones) return null;
  const n = rig.bones.length;
  const frames = new Map<string, EntityModel[]>();
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of clips) {
    const count = Math.max(1, Math.round(c.duration * CLIP_FPS) + (c.loop ? 0 : 1));
    const list: EntityModel[] = [];
    for (let k = 0; k < count; k++) {
      const m = bakePose(entity.model, rig, poseMatrices(rig, sampleClip(c, k / CLIP_FPS, n)));
      list.push(m);
      const a = m.anchor;
      lo = [Math.min(lo[0], -a[0]), Math.min(lo[1], -a[1]), Math.min(lo[2], -a[2])];
      hi = [Math.max(hi[0], m.size.x - a[0]), Math.max(hi[1], m.size.y - a[1]), Math.max(hi[2], m.size.z - a[2])];
    }
    frames.set(c.id, list);
  }
  // Keep the model standing on the floor (y = 0) even if a pose dips below its feet.
  lo[1] = Math.min(lo[1], 0);
  const size = { x: Math.ceil(hi[0] - lo[0]) + 2, y: Math.ceil(hi[1] - lo[1]) + 2, z: Math.ceil(hi[2] - lo[2]) + 2 };
  const grid = new Uint8Array(size.x * size.y * size.z);
  const origin = [1 - lo[0], 1 - lo[1], 1 - lo[2]];
  let current = clips[0].id;
  const player: RigPlayer = {
    size,
    palette: entityPalette(entity.model, 1),
    get frameCount() {
      return frames.get(current)!.length;
    },
    clips: clips.map((c) => c.id),
    clip: () => current,
    setClip(id) {
      if (frames.has(id)) current = id;
    },
    frame(i) {
      grid.fill(0);
      const list = frames.get(current)!;
      const m = list[((i % list.length) + list.length) % list.length];
      const ox = Math.round(origin[0] - m.anchor[0]), oy = Math.round(origin[1] - m.anchor[1]), oz = Math.round(origin[2] - m.anchor[2]);
      const { x: sx, y: sy, z: sz } = m.size;
      for (let z = 0; z < sz; z++)
        for (let y = 0; y < sy; y++)
          for (let x = 0; x < sx; x++) {
            const v = m.data[x + y * sx + z * sx * sy];
            if (!v) continue;
            const gx = ox + x, gy = oy + y, gz = oz + z;
            if (gx < 0 || gy < 0 || gz < 0 || gx >= size.x || gy >= size.y || gz >= size.z) continue;
            grid[gx + gy * size.x + gz * size.x * size.y] = v;
          }
      return grid;
    },
  };
  return player;
}
