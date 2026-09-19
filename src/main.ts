// Voxolith Viewer — a MagicaVoxel-style browser .vox viewer rendered with the
// @voxolith/render engine. Drop or open a .vox (or pick a bundled sample), orbit with drag, zoom
// with the wheel. Shows model dimensions, voxel count, and the palette in use.

import "./styles.css";
import {
  initGpu,
  resizeToDisplay,
  showUnsupportedScreen,
  WebGPUUnsupportedError,
  createRenderer,
  type Renderer,
  makeCamera,
  makePerf,
  OccupancyGrid,
  parseVoxScene,
  voxSceneAnimator,
  packMaterials,
  buildMinecraftRegion,
  type VoxScene,
  type VoxSceneAnimator,
  makeExplosion,
  makeMuzzleFlash,
  type VoxEffect,
  type Vec3,
} from "@voxolith/render";
import { makeOrbitView } from "./orbitView";
import { toViewModel, framing, type ViewModel } from "./viewer";

// Cyclable particle effects for Particles mode.
const EFFECTS: { name: string; make: () => VoxEffect }[] = [
  { name: "Explosion · S", make: () => makeExplosion({ size: "small" }) },
  { name: "Explosion · M", make: () => makeExplosion({ size: "medium" }) },
  { name: "Explosion · L", make: () => makeExplosion({ size: "large" }) },
  { name: "Muzzle · star", make: () => makeMuzzleFlash({ type: "star" }) },
  { name: "Muzzle · cone", make: () => makeMuzzleFlash({ type: "cone" }) },
  { name: "Muzzle · bloom", make: () => makeMuzzleFlash({ type: "bloom" }) },
];

const SAMPLES: { label: string; file: string }[] = [
  { label: "Testarossa — '84", file: "testarossa.vox" },
  { label: "Diablo — '90", file: "diablo.vox" },
  { label: "Cat — sit", file: "cat-sit.vox" },
  { label: "Cat — stand", file: "cat-stand.vox" },
  { label: "Cat — sleep", file: "cat-sleep.vox" },
  { label: "Carpet — hexagon", file: "carpet-hexagon-3.vox" },
  { label: "Chair — armchair", file: "chair-2.vox" },
  { label: "Closet — wardrobe", file: "closet-0.vox" },
  { label: "Curtain — closed", file: "curtain-2-closed.vox" },
  { label: "Landscape — large (565k)", file: "landscape.vox" },
  { label: "Landscape XL — huge (5.8M)", file: "landscape-xl.vox" },
  { label: "Minecraft — region (.mca)", file: "r.0.0.mca" },
];

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Neutral studio lighting (no sky sun disc — a calm dark backdrop).
const SUN = norm([0.5, 0.85, 0.35]);
const ENV = {
  lightDir: SUN,
  lightColor: [1.0, 0.98, 0.94] as Vec3,
  ambientSky: [0.5, 0.53, 0.6] as Vec3,
  ambientGround: [0.3, 0.29, 0.27] as Vec3,
  sunDir: SUN,
  moonDir: [0, -1, 0] as Vec3,
  sunColor: [1, 0.96, 0.85] as Vec3,
  moonColor: [0, 0, 0] as Vec3,
  skyTop: [0.15, 0.16, 0.19] as Vec3,
  skyHorizon: [0.27, 0.29, 0.33] as Vec3,
  nightFactor: 0,
  sunIntensity: 0,
  moonIntensity: 0,
};

async function main() {
  const canvas = document.getElementById("scene") as HTMLCanvasElement | null;
  const hud = document.getElementById("hud");
  if (!canvas || !hud) throw new Error("Missing #scene / #hud");

  let gpu;
  try {
    gpu = await initGpu(canvas);
  } catch (err) {
    if (err instanceof WebGPUUnsupportedError) {
      showUnsupportedScreen(err.message, { appName: "Voxolith Viewer", emoji: "🧊" });
      return;
    }
    throw err;
  }

  hud.innerHTML = `
    <div class="panel vv-toolbar">
      <div class="vv-title">Voxolith Viewer <small>· @voxolith/render</small></div>
      <div class="vv-seg">
        <button class="vv-seg-btn active" id="vv-mode-model">Model</button>
        <button class="vv-seg-btn" id="vv-mode-fx">Particles</button>
      </div>
      <span id="vv-model-ctrls">
        <button class="vv-btn" id="vv-open">Open .vox</button>
        <select class="vv-select" id="vv-sample">
          <option value="" disabled selected>Samples…</option>
          ${SAMPLES.map((s) => `<option value="${s.file}">${s.label}</option>`).join("")}
        </select>
        <span id="vv-anim" hidden>
          <button class="vv-btn" id="vv-play">⏸</button>
          <span class="vv-fx-name" id="vv-frame">1/1</span>
          <label class="vv-fps">fps <input id="vv-fps" type="number" min="1" max="30" value="8" /></label>
        </span>
        <span id="vv-mca" hidden>
          <label class="vv-fps">crop <input id="vv-mca-size" type="number" min="32" max="320" step="16" value="256" /></label>
          <label class="vv-fps">x <input id="vv-mca-x" type="number" min="0" max="511" value="256" /></label>
          <label class="vv-fps">z <input id="vv-mca-z" type="number" min="0" max="511" value="256" /></label>
          <label class="vv-fps">ds
            <select class="vv-select" id="vv-mca-ds"><option>1</option><option>2</option><option>4</option></select>
          </label>
        </span>
      </span>
      <span id="vv-fx-ctrls" hidden>
        <button class="vv-btn" id="vv-fx-prev">◀</button>
        <span class="vv-fx-name" id="vv-fx-name"></span>
        <button class="vv-btn" id="vv-fx-next">▶</button>
      </span>
      <input type="file" id="vv-file" accept=".vox,.mca" hidden />
    </div>
    <div class="panel vv-info" id="vv-info" hidden></div>
    <div class="panel vv-palette" id="vv-palette" hidden></div>
    <div class="vv-hint" id="vv-hint"><div>Drop a <b>.vox</b> file here<br>or use <b>Open</b> / the sample list</div></div>`;

  const infoEl = hud.querySelector("#vv-info") as HTMLElement;
  const paletteEl = hud.querySelector("#vv-palette") as HTMLElement;
  const hintEl = hud.querySelector("#vv-hint") as HTMLElement;
  const fileInput = hud.querySelector("#vv-file") as HTMLInputElement;
  const modelCtrls = hud.querySelector("#vv-model-ctrls") as HTMLElement;
  const fxCtrls = hud.querySelector("#vv-fx-ctrls") as HTMLElement;
  const modeModelBtn = hud.querySelector("#vv-mode-model") as HTMLElement;
  const modeFxBtn = hud.querySelector("#vv-mode-fx") as HTMLElement;
  const fxNameEl = hud.querySelector("#vv-fx-name") as HTMLElement;
  const animEl = hud.querySelector("#vv-anim") as HTMLElement;
  const playBtn = hud.querySelector("#vv-play") as HTMLButtonElement;
  const frameEl = hud.querySelector("#vv-frame") as HTMLElement;
  const fpsInput = hud.querySelector("#vv-fps") as HTMLInputElement;
  const mcaEl = hud.querySelector("#vv-mca") as HTMLElement;
  const mcaSize = hud.querySelector("#vv-mca-size") as HTMLInputElement;
  const mcaX = hud.querySelector("#vv-mca-x") as HTMLInputElement;
  const mcaZ = hud.querySelector("#vv-mca-z") as HTMLInputElement;
  const mcaDs = hud.querySelector("#vv-mca-ds") as HTMLSelectElement;

  const orbit = makeOrbitView(canvas, {
    yaw: 35,
    pitch: 28,
    distance: 120,
    minDistance: 6,
    maxDistance: 1400,
  });
  const camera = makeCamera({ target: [0, 0, 0], distance: 120, pitchDeg: 30, fovDeg: 32 });

  let renderer: Renderer | null = null;
  let occupancy: OccupancyGrid | null = null;
  let target: Vec3 = [0, 0, 0];

  type Mode = "model" | "particles";
  let mode: Mode = "model";
  let currentVm: ViewModel | null = null;
  let currentScene: VoxScene | null = null;
  let currentName = "";
  let effect: VoxEffect | null = null;
  let effectIdx = 0;
  // Animation playback (extended .vox scenes).
  let animator: VoxSceneAnimator | null = null;
  let frameIdx = 0;
  let playing = true;
  let fps = 8;
  let animAccum = 0;
  // Minecraft region (kept for re-cropping via the controls).
  let currentMcaBytes: Uint8Array | null = null;

  function updateModeUI() {
    modelCtrls.hidden = mode !== "model";
    fxCtrls.hidden = mode !== "particles";
    modeModelBtn.classList.toggle("active", mode === "model");
    modeFxBtn.classList.toggle("active", mode === "particles");
    fxNameEl.textContent = EFFECTS[effectIdx].name;
  }

  const updateFrameLabel = () => {
    if (animator) frameEl.textContent = `${frameIdx + 1}/${animator.frameCount}`;
  };

  async function setModel(vm: ViewModel, name: string) {
    mode = "model";
    effect = null;
    animator = null;
    currentVm = vm;
    currentScene = null;
    currentName = name;
    animEl.hidden = true;
    mcaEl.hidden = true;
    currentMcaBytes = null;
    updateModeUI();
    // A fresh renderer per load (the grid size changes); fine for a viewer.
    // (The WESL shader links once on the first call, then it's cached.)
    const r = await createRenderer(gpu!, { size: vm.size, data: vm.data, palette: vm.palette });
    r.setFloor({
      enabled: true,
      y: 0,
      colorA: [0.22, 0.23, 0.27],
      colorB: [0.17, 0.18, 0.21],
    });
    occupancy = new OccupancyGrid(vm.size, vm.data);
    r.updateCoarse(occupancy.data);
    renderer = r;

    const f = framing(vm.size);
    target = f.target;
    orbit.setDistance(f.distance);

    infoEl.hidden = false;
    paletteEl.hidden = false;
    hintEl.hidden = true;
    infoEl.innerHTML = `
      <div class="name">${name}</div>
      <div class="row"><span>Size</span><span>${vm.srcSize.x}×${vm.srcSize.y}×${vm.srcSize.z}</span></div>
      <div class="row"><span>Voxels</span><span>${vm.voxelCount.toLocaleString()}</span></div>
      <div class="row"><span>Colours</span><span>${vm.usedColors.length}</span></div>`;
    paletteEl.innerHTML = vm.usedColors
      .map(
        (c) =>
          `<div class="vv-swatch" title="#${c.index} rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})" style="background:rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})"></div>`,
      )
      .join("");
  }

  // Extended scene (multi-model / scene graph / keyframe animation).
  async function setScene(scene: VoxScene, name: string) {
    mode = "model";
    effect = null;
    currentScene = scene;
    currentVm = null;
    currentName = name;
    mcaEl.hidden = true;
    currentMcaBytes = null;
    const anim = voxSceneAnimator(scene);
    animator = anim;
    frameIdx = 0;
    animAccum = 0;
    updateModeUI();

    const animated = anim.frameCount > 1;
    const r = await createRenderer(gpu!, {
      size: anim.size,
      data: anim.frame(0),
      palette: anim.palette,
      materials: packMaterials(scene),
    });
    r.setFloor({ enabled: true, y: 0, colorA: [0.22, 0.23, 0.27], colorB: [0.17, 0.18, 0.21] });
    if (animated) {
      // Frames move each tick, so the coarse grid can't stay valid; single-step
      // DDA + clip to the whole (content-roaming) grid.
      r.setDebug(1);
      r.setClipBounds([0, 0, 0], [anim.size.x - 1, anim.size.y - 1, anim.size.z - 1]);
      occupancy = null;
    } else {
      // Static scene (e.g. a multi-model mansion): build coarse occupancy so rays
      // fast-forward through empty space and reach far-side voxels within the step
      // cap. Constructor-scanned occupied-AABB clip is kept (tighter = faster).
      occupancy = new OccupancyGrid(anim.size, anim.frame(0));
      r.updateCoarse(occupancy.data);
    }
    renderer = r;

    const f = framing(anim.size);
    target = f.target;
    orbit.setDistance(f.distance);

    animEl.hidden = !animated;
    playing = true;
    playBtn.textContent = "⏸";
    infoEl.hidden = false;
    paletteEl.hidden = true;
    hintEl.hidden = true;
    infoEl.innerHTML = `
      <div class="name">${name}</div>
      <div class="row"><span>Models</span><span>${scene.models.length}</span></div>
      <div class="row"><span>Frames</span><span>${anim.frameCount}</span></div>
      <div class="row"><span>Stage</span><span>${anim.size.x}×${anim.size.y}×${anim.size.z}</span></div>`;
    updateFrameLabel();
  }

  // Minecraft region: crop → grid, using the current crop controls. Static, Y-up,
  // coarse-on (like the mansion) so far-side terrain renders within the step cap.
  async function renderMca(name: string) {
    if (!currentMcaBytes) return;
    mode = "model";
    effect = null;
    animator = null;
    currentVm = null;
    currentScene = null;
    currentName = name;
    updateModeUI();
    animEl.hidden = true;
    mcaEl.hidden = false;
    infoEl.hidden = false;
    paletteEl.hidden = true;
    hintEl.hidden = true;
    infoEl.innerHTML = `<div class="name">${name}</div><div class="row"><span>Building…</span></div>`;

    const size = Math.max(32, Math.min(320, Number(mcaSize.value) || 256));
    const cx = Math.max(0, Math.min(511, Number(mcaX.value) || 256));
    const cz = Math.max(0, Math.min(511, Number(mcaZ.value) || 256));
    const ds = Number(mcaDs.value) || 1;
    const half = size >> 1;
    const x0 = cx - half, z0 = cz - half;
    const sc = await buildMinecraftRegion(currentMcaBytes, {
      x0, x1: x0 + size - 1, z0, z1: z0 + size - 1, downsample: ds,
    });

    const r = await createRenderer(gpu!, {
      size: sc.size, data: sc.data, palette: sc.palette, materials: sc.materials,
    });
    r.setFloor({ enabled: true, y: 0, colorA: [0.22, 0.23, 0.27], colorB: [0.17, 0.18, 0.21] });
    occupancy = new OccupancyGrid(sc.size, sc.data);
    r.updateCoarse(occupancy.data);
    renderer = r;

    const f = framing(sc.size);
    target = f.target;
    orbit.setDistance(f.distance);
    infoEl.innerHTML = `
      <div class="name">${name}</div>
      <div class="row"><span>Size</span><span>${sc.size.x}×${sc.size.y}×${sc.size.z}</span></div>
      <div class="row"><span>Voxels</span><span>${sc.meta.voxels.toLocaleString()}</span></div>
      <div class="row"><span>Chunks</span><span>${sc.meta.chunks}</span></div>
      <div class="row"><span>Colours</span><span>${sc.meta.colours}</span></div>`;
  }

  function showError(msg: string) {
    infoEl.hidden = false;
    infoEl.innerHTML = `<div class="name" style="color:#ff8d8d">Failed to load</div><div class="row"><span>${msg}</span></div>`;
  }

  // --- Particles mode -------------------------------------------------------
  async function enterParticles() {
    mode = "particles";
    updateModeUI();
    const eff = EFFECTS[effectIdx].make();
    effect = eff;
    const r = await createRenderer(gpu!, {
      size: eff.size,
      data: eff.data,
      palette: eff.palette,
    });
    r.setFloor({ enabled: true, y: 0, colorA: [0.22, 0.23, 0.27], colorB: [0.17, 0.18, 0.21] });
    r.setDebug(1); // transient voxels change every frame → skip coarse empty-space skipping
    r.setClipBounds([0, 0, 0], [eff.size.x - 1, eff.size.y - 1, eff.size.z - 1]);
    occupancy = null;
    renderer = r;

    const f = framing(eff.size);
    target = f.target;
    orbit.setDistance(f.distance);

    infoEl.hidden = false;
    paletteEl.hidden = true;
    hintEl.hidden = true;
    infoEl.innerHTML = `
      <div class="name">${EFFECTS[effectIdx].name}</div>
      <div class="row"><span>Stage</span><span>${eff.size.x}³</span></div>
      <div class="row"><span>Controls</span><span>drag orbit · ◀▶ cycle</span></div>`;
  }

  async function enterModel() {
    if (currentMcaBytes) {
      await renderMca(currentName);
    } else if (currentScene) {
      await setScene(currentScene, currentName);
    } else if (currentVm) {
      await setModel(currentVm, currentName);
    } else {
      mode = "model";
      effect = null;
      animator = null;
      renderer = null;
      animEl.hidden = true;
      updateModeUI();
      infoEl.hidden = true;
      paletteEl.hidden = true;
      hintEl.hidden = false;
    }
  }

  const cycleEffect = (dir: number) => {
    effectIdx = (effectIdx + dir + EFFECTS.length) % EFFECTS.length;
    void enterParticles(); // rebuild the stage for the new (or replayed) effect
  };

  modeModelBtn.addEventListener("click", () => void enterModel());
  modeFxBtn.addEventListener("click", () => void enterParticles());
  hud.querySelector("#vv-fx-prev")!.addEventListener("click", () => cycleEffect(-1));
  hud.querySelector("#vv-fx-next")!.addEventListener("click", () => cycleEffect(1));

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "⏸" : "▶";
  });
  fpsInput.addEventListener("change", () => {
    const v = Number(fpsInput.value);
    if (v >= 1 && v <= 60) fps = v;
  });
  // Re-crop the current Minecraft region when any crop control changes.
  for (const el of [mcaSize, mcaX, mcaZ, mcaDs]) {
    el.addEventListener("change", () => {
      if (currentMcaBytes) void renderMca(currentName);
    });
  }

  const IDENTITY9 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  async function loadBuffer(buf: ArrayBuffer, name: string) {
    try {
      if (name.toLowerCase().endsWith(".mca")) {
        currentMcaBytes = new Uint8Array(buf);
        mcaSize.value = "256"; mcaX.value = "256"; mcaZ.value = "256"; mcaDs.value = "1";
        await renderMca(name);
        return;
      }
      const scene = parseVoxScene(buf);
      const pl = scene.sample(0);
      const plain =
        scene.frameCount === 1 &&
        scene.models.length === 1 &&
        pl.length === 1 &&
        pl[0].trans.every((v) => v === 0) &&
        pl[0].rot.every((v, i) => v === IDENTITY9[i]);
      if (plain) await setModel(toViewModel(scene.models[0]), name);
      else await setScene(scene, name);
    } catch (e) {
      showError(String((e as Error)?.message ?? e));
    }
  }
  const loadFile = (file: File) =>
    file.arrayBuffer().then((b) => loadBuffer(b, file.name));
  const loadSample = async (file: string) => {
    const res = await fetch(`/samples/${file}`);
    if (!res.ok) return showError(`${file}: ${res.status}`);
    loadBuffer(await res.arrayBuffer(), file);
  };

  hud.querySelector("#vv-open")!.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
  });
  hud.querySelector("#vv-sample")!.addEventListener("change", (e) => {
    const f = (e.target as HTMLSelectElement).value;
    if (f) loadSample(f);
  });

  // Drag-and-drop a .vox anywhere onto the page.
  const app = document.getElementById("app")!;
  document.addEventListener("dragover", (e) => {
    e.preventDefault();
    app.classList.add("vv-drop");
  });
  document.addEventListener("dragleave", (e) => {
    if (e.relatedTarget === null) app.classList.remove("vv-drop");
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    app.classList.remove("vv-drop");
    const file = e.dataTransfer?.files?.[0];
    if (file) loadFile(file);
  });

  const perf = makePerf({
    enabled: new URLSearchParams(location.search).has("perf"),
    scale: gpu.renderScale,
  });

  let last = performance.now();
  function loop(now: number) {
    requestAnimationFrame(loop);
    const dtMs = now - last;
    if (dtMs < 1000 / 60 - 1) return;
    last = now;
    const dt = Math.min(0.05, dtMs / 1000);
    perf.frame(now);
    gpu!.renderScale = perf.scale();
    resizeToDisplay(gpu!);
    if (mode === "particles" && effect && renderer) {
      effect.tick(dt);
      renderer.updateVoxels(effect.data);
    } else if (mode === "model" && animator && renderer && playing && animator.frameCount > 1) {
      animAccum += dt;
      const step = 1 / fps;
      let changed = false;
      while (animAccum >= step) {
        animAccum -= step;
        frameIdx = (frameIdx + 1) % animator.frameCount;
        changed = true;
      }
      if (changed) {
        renderer.updateVoxels(animator.frame(frameIdx));
        updateFrameLabel();
      }
    }
    if (renderer) {
      renderer.render({
        ...camera(orbit.yaw(), orbit.distance(), target, orbit.pitch()),
        ...ENV,
      });
    }
  }
  requestAnimationFrame(loop);

  // Start with a sample so the viewer isn't empty (?file=<name> overrides).
  const qFile = new URLSearchParams(location.search).get("file");
  loadSample(qFile && SAMPLES.some((s) => s.file === qFile) ? qFile : SAMPLES[0].file);
}

main().catch((err) => {
  console.error(err);
  showUnsupportedScreen("An unexpected error occurred while starting up.", {
    appName: "Voxolith Viewer",
    emoji: "🧊",
  });
});
