// Generator mode: build a model from parameters, tweak it, share it as a code.
//
// The whole UI is derived from the generator's own `params` declaration — this
// file knows nothing about trees. Add a ParamSpec to a generator and a control
// appears; register another generator and it shows up in the picker. That is
// the point of the contract: the thing a person can tweak, the thing a UI can
// show and the thing a share code carries are the same set by construction.

import {
  clampToSpec,
  decodeState,
  encodeState,
  entityPalette,
  fingerprint,
  generateFromState,
  getParam,
  listGenerators,
  withParam,
  type Entity,
  type EntityGenerator,
  type ParamSpec,
} from "@voxolith/engine";
import { registerBushGenerators } from "@voxolith/gen-bush";
import { registerGrassGenerators } from "@voxolith/gen-grass";
import { registerTreeGenerators } from "@voxolith/gen-tree";

export interface GeneratedModel {
  entity: Entity;
  /** Ready to paste into a URL or a chat. */
  code: string;
  /** Short identity, for the filename of an export. */
  fingerprint: string;
  ms: number;
}

export interface GeneratorUi {
  /** Goes in the toolbar. */
  toolbar: HTMLElement;
  /** The parameter panel, shown only in generator mode. */
  panel: HTMLElement;
  setVisible(visible: boolean): void;
  /** Adopt a share code; returns false (and explains) if it cannot be read. */
  load(code: string): boolean;
  /** Build from the current state. */
  rebuild(): void;
  current(): GeneratedModel | null;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function makeGeneratorUi(onModel: (m: GeneratedModel) => void): GeneratorUi {
  // Importing a generator package and registering it is the whole integration:
  // the picker, the controls and the share codes all come from the registry.
  registerTreeGenerators();
  registerBushGenerators();
  registerGrassGenerators();
  const generators = listGenerators();

  let gen = generators[0] as EntityGenerator<unknown>;
  let params: unknown = structuredClone(gen.defaults);
  let seed = 1;
  let latest: GeneratedModel | null = null;

  // --- toolbar --------------------------------------------------------------
  const toolbar = el("span");
  toolbar.hidden = true;

  const genSel = el("select", "vv-select") as HTMLSelectElement;
  for (const g of generators) {
    const o = el("option") as HTMLOptionElement;
    o.value = g.id;
    o.textContent = g.name;
    genSel.append(o);
  }

  const seedWrap = el("label", "vv-fps", "seed ");
  const seedInput = el("input") as HTMLInputElement;
  seedInput.type = "number";
  seedInput.min = "0";
  seedInput.value = String(seed);
  seedWrap.append(seedInput);

  const diceBtn = el("button", "vv-btn", "🎲") as HTMLButtonElement;
  diceBtn.title = "New seed";
  const resetBtn = el("button", "vv-btn", "Reset") as HTMLButtonElement;
  resetBtn.title = "Back to this generator's defaults";
  toolbar.append(genSel, seedWrap, diceBtn, resetBtn);

  // --- panel ----------------------------------------------------------------
  const panel = el("div", "panel vv-gen");
  panel.hidden = true;

  const groups = el("div", "vv-gen-groups");
  const status = el("div", "vv-gen-status");

  const shareRow = el("div", "vv-gen-share");
  const codeInput = el("input", "vv-gen-code") as HTMLInputElement;
  codeInput.spellcheck = false;
  codeInput.setAttribute("aria-label", "Share code");
  codeInput.placeholder = "paste a code…";
  const copyBtn = el("button", "vv-btn", "Copy") as HTMLButtonElement;
  const applyBtn = el("button", "vv-btn", "Load") as HTMLButtonElement;
  shareRow.append(codeInput, copyBtn, applyBtn);

  panel.append(groups, status, shareRow);

  // --- control building -----------------------------------------------------

  /** One row per ParamSpec. Rebuilt whenever the generator changes. */
  function buildControls(): void {
    groups.textContent = "";
    const byGroup = new Map<string, ParamSpec[]>();
    for (const spec of gen.params) {
      const g = spec.group ?? "Parameters";
      const list = byGroup.get(g);
      if (list) list.push(spec);
      else byGroup.set(g, [spec]);
    }

    for (const [name, specs] of byGroup) {
      const section = el("div", "vv-gen-group");
      section.append(el("h4", undefined, name));
      for (const spec of specs) section.append(controlFor(spec));
      groups.append(section);
    }
  }

  function controlFor(spec: ParamSpec): HTMLElement {
    const row = el("label", "vv-gen-row");
    row.append(el("span", "vv-gen-label", spec.label));
    if (spec.help) row.title = spec.help;
    const value = getParam(params, spec.path);

    if (spec.kind === "bool") {
      const cb = el("input") as HTMLInputElement;
      cb.type = "checkbox";
      cb.checked = Boolean(value);
      cb.addEventListener("change", () => set(spec.path, cb.checked));
      row.append(cb);
      return row;
    }

    if (spec.kind === "enum") {
      const sel = el("select", "vv-select") as HTMLSelectElement;
      for (const opt of spec.options) {
        const o = el("option") as HTMLOptionElement;
        o.value = opt;
        o.textContent = opt;
        sel.append(o);
      }
      sel.value = String(value);
      sel.addEventListener("change", () => set(spec.path, sel.value));
      row.append(sel);
      return row;
    }

    const step = spec.kind === "int" ? 1 : (spec.step ?? (spec.max - spec.min) / 100);
    const range = el("input", "vv-gen-range") as HTMLInputElement;
    range.type = "range";
    range.min = String(spec.min);
    range.max = String(spec.max);
    range.step = String(step);
    range.value = String(value);
    const out = el("output", "vv-gen-value", String(value));
    // Track while dragging, rebuild on release: an oak takes a couple of
    // hundred milliseconds, so regenerating per input event would fight the
    // drag. `input` updates the readout, `change` fires when the slider is let
    // go (and on keyboard/step changes).
    range.addEventListener("input", () => {
      out.textContent = range.value;
    });
    range.addEventListener("change", () => {
      // Also refresh the readout: `change` fires for keyboard and programmatic
      // updates that never produce an `input` event.
      out.textContent = range.value;
      set(spec.path, Number(range.value));
    });
    row.append(range, out);
    return row;
  }

  function set(path: string, value: unknown): void {
    const spec = gen.params.find((p) => p.path === path);
    params = withParam(params, path, spec ? clampToSpec(spec, value) : value);
    rebuild();
  }

  // --- generation -----------------------------------------------------------

  function rebuild(): void {
    const t0 = performance.now();
    let entity: Entity;
    try {
      entity = generateFromState({ generator: gen.id, version: gen.version, seed, params });
    } catch (err) {
      status.textContent = `Generation failed: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    const code = encodeState(gen, { seed, params });
    const ms = performance.now() - t0;
    latest = { entity, code, fingerprint: fingerprint(code), ms };
    codeInput.value = code;
    const voxels = entity.model.data.reduce((n, v) => n + (v ? 1 : 0), 0);
    const { x, y, z } = entity.model.size;
    status.textContent = `${x}×${y}×${z} · ${voxels.toLocaleString()} voxels · ${ms.toFixed(0)} ms · ${latest.fingerprint}`;
    // Keep the address bar in step, so the page URL is itself the share link.
    const url = new URL(location.href);
    url.searchParams.set("gen", code);
    history.replaceState(null, "", url);
    onModel(latest);
  }

  function selectGenerator(id: string, keepParams = false): void {
    const next = generators.find((g) => g.id === id);
    if (!next) return;
    gen = next as EntityGenerator<unknown>;
    genSel.value = id;
    if (!keepParams) params = structuredClone(gen.defaults);
    buildControls();
  }

  function load(code: string): boolean {
    try {
      const state = decodeState(code.trim());
      selectGenerator(state.generator);
      params = state.params;
      seed = state.seed;
      seedInput.value = String(seed);
      buildControls();
      rebuild();
      return true;
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  // --- wiring ---------------------------------------------------------------
  genSel.addEventListener("change", () => {
    selectGenerator(genSel.value);
    rebuild();
  });
  seedInput.addEventListener("change", () => {
    seed = Math.max(0, Math.floor(Number(seedInput.value) || 0));
    rebuild();
  });
  diceBtn.addEventListener("click", () => {
    seed = (Math.random() * 0xffffff) >>> 0;
    seedInput.value = String(seed);
    rebuild();
  });
  resetBtn.addEventListener("click", () => {
    params = structuredClone(gen.defaults);
    buildControls();
    rebuild();
  });
  copyBtn.addEventListener("click", () => {
    void navigator.clipboard?.writeText(codeInput.value).then(
      () => {
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
      },
      () => codeInput.select(),
    );
  });
  applyBtn.addEventListener("click", () => load(codeInput.value));
  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load(codeInput.value);
  });

  buildControls();

  return {
    toolbar,
    panel,
    setVisible(visible) {
      toolbar.hidden = !visible;
      panel.hidden = !visible;
    },
    load,
    rebuild,
    current: () => latest,
  };
}

/**
 * Present a generated entity the way the viewer presents a loaded `.vox`, so
 * generator mode reuses the whole existing display path — framing, the palette
 * strip, the info line.
 */
export function entityToView(entity: Entity): {
  size: { x: number; y: number; z: number };
  data: Uint8Array;
  palette: Float32Array;
  srcSize: { x: number; y: number; z: number };
  voxelCount: number;
  usedColors: { index: number; rgb: [number, number, number] }[];
} {
  const { model } = entity;
  const used = new Set<number>();
  let count = 0;
  for (const v of model.data) {
    if (!v) continue;
    count++;
    used.add(v);
  }
  return {
    size: model.size,
    data: model.data,
    palette: entityPalette(model, 1),
    srcSize: model.size,
    voxelCount: count,
    // Role `i` occupies slot `i + 1`, matching entityPalette.
    usedColors: [...used].sort((a, b) => a - b).map((index) => ({
      index,
      rgb: (model.roles[index - 1]?.color ?? [1, 0, 1]) as [number, number, number],
    })),
  };
}
