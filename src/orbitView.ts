// Free turntable orbit: drag to rotate (yaw + pitch), wheel to zoom. The viewer
// reads yaw()/pitch()/distance() each frame and feeds them to the engine camera.

export interface OrbitView {
  yaw(): number;
  pitch(): number;
  distance(): number;
  setDistance(d: number): void;
}

export interface OrbitOptions {
  yaw: number;
  pitch: number;
  distance: number;
  minDistance: number;
  maxDistance: number;
  sensitivity?: number; // degrees per pixel
}

export function makeOrbitView(el: HTMLElement, opts: OrbitOptions): OrbitView {
  const sens = opts.sensitivity ?? 0.4;
  let yaw = opts.yaw;
  let pitch = opts.pitch;
  let dist = opts.distance;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const clampDist = (d: number) =>
    Math.max(opts.minDistance, Math.min(opts.maxDistance, d));

  el.addEventListener("pointerdown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * sens;
    pitch = Math.max(3, Math.min(87, pitch + (e.clientY - lastY) * sens));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const end = () => {
    dragging = false;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      dist = clampDist(dist * (1 + Math.sign(e.deltaY) * 0.1));
    },
    { passive: false },
  );

  return {
    yaw: () => yaw,
    pitch: () => pitch,
    distance: () => dist,
    setDistance: (d: number) => {
      dist = clampDist(d);
    },
  };
}
