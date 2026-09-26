# AGENTS.md: viewer

The Voxolith viewer at https://voxolith.github.io/viewer/. It opens MagicaVoxel `.vox` models
(animated scenes play) and Minecraft `.mca` regions (with crop controls). A Particles mode cycles
the engine's effects. A Generate mode builds any registered generator's model from parameters,
a seed and a share code, at 10 or 100 voxels per metre; rigged models play their clips.

## Commands

```sh
bun run --cwd viewer dev          # https://localhost:5173 (self-signed cert)
bun run --cwd viewer build        # tsc --noEmit + vite build (what CI runs)
bun run --cwd viewer gen:samples  # regenerates public/samples/landscape*.vox (the xl one is gitignored)
bun run --cwd viewer render:vox   # headless CPU render of a .vox (tools/render-vox.ts)
```

Siblings needed: renderer, engine, generators.

## Map

- `src/main.ts`: UI wiring, file drop, samples, quality.
- `src/viewer.ts`: scene and camera.
- `src/generate.ts`: the Generate mode (generator registry, ParamSpecs, share codes, the scale
  picker).
- `src/rigged.ts`: clip playback.
- `tools/`: sample and model generators for `public/`.

## Notes

- 100 voxels per metre models are sparse (8³ bricks, `model.sparse`). `src/viewer.ts` loads
  them from their bricks; never make a dense copy of one.
- The generator registry is the engine's; a new generator shows up here by being registered, not
  by viewer code.

## App rules

- **Deployment.** Every push to `main` deploys to GitHub Pages under `/<repo>/`
  (`.github/workflows/pages.yml`). The workflow checks the sibling repos out alongside to satisfy
  `workspace:*` and builds with `BASE_PATH=/<repo>/`. Never hard-code absolute URLs: fetch with
  `import.meta.env.BASE_URL` and link pages relatively. CI's required job is `build`.
- **Vite.** `optimizeDeps: { exclude: ["@voxolith/renderer"] }` stays in `vite.config.ts`
  (the renderer ships raw TypeScript and imports shaders with `?raw`).
- **Input** comes from `@voxolith/engine/input` only, never raw listeners:
  - one `createInput(canvas, { loop })` per surface;
  - `prepareSurface(canvas)` instead of per-app `touch-action` CSS;
  - `makeOrbitController` / `makeLookController` for cameras;
  - `recogniseGestures` for taps, `makeActions` for game controls, `makeTouchControls` for
    on-screen sticks.
- **Render on demand.** Use `makeFrameLoop`: `invalidate()` on camera, scene or viewport changes,
  and `setContinuous(true)` only while something animates (water on screen counts). Quality is
  the engine's presets behind a select stored as `voxolith-quality`. Software adapters
  (`gpu.software`) warn and start on Low.
- **Branding.** `src/brand/tokens.css` and `src/brand/theme.ts` are generated copies from the
  private `branding` repo: never edit them here. Use the tokens (`--bg`, `--surface`,
  `--accent`, ...), never hex colours in CSS. Dark is the default theme.

## Working in the Voxolith repos

- **Layout.** Every Voxolith repo is checked out side by side under one bun workspace root, and
  depends on its siblings as `"workspace:*"`. Run `bun install` from that root, never inside a
  repo. [CONTRIBUTING](https://github.com/voxolith/.github/blob/main/CONTRIBUTING.md) lists
  which siblings each repo needs.
- **Toolchain: bun only.** There is no npm or node step anywhere. It is TypeScript 7 and Vite 8;
  scripts run `tsc`, `vite` and `bun tools/x.ts`. Use current dependency versions.
- **`tsconfig.base.json` is byte-identical in every repo**, because consumers compile the
  renderer's and engine's sources under their own flags. Change it everywhere or nowhere.
- **WebGPU, not WebGL.** Dev servers are HTTPS (`@vitejs/plugin-basic-ssl`), because WebGPU needs a
  secure context. Checks cannot see pixels: anything that changes what is drawn must be looked
  at in a WebGPU browser, with a before/after screenshot in the pull request.
- **Docs live on the site** ([voxolith.github.io](https://voxolith.github.io/docs/), repo
  `voxolith.github.io`). READMEs stay short and link there. The API reference is generated from
  the sources, so doc comments are published content: every exported symbol has a `/** */`, and
  entry files open with `@packageDocumentation`.
- **Credit research.** When an idea comes from a paper, cite it (authors, title, venue, DOI) in
  the code comment, in the docs (the page's References and `/docs/credits/`) and in the commit
  body. Check the citation against the paper or DataCite; don't cite from memory.
- **Prose.** British spelling in prose and comments (`colour`, `normalise`); identifiers follow the
  web platform (`lightColor`). "Voxolith" is capitalised in prose; lowercase is only for the
  wordmark.
- **Commits.** History is linear and read as prose:
  - The subject says what is now true, in plain words: no `feat:` prefixes, no trailing full
    stop, about 70 characters at most.
  - The body says why, what it costs and what it deliberately does not do, wrapped at about 72
    columns.
  - One change per commit. AI-assisted commits keep their `Co-Authored-By` trailer.
  - Pull requests are squash-merged or rebased; there are no merge commits.
  - Don't push, tag or publish unless asked.
- **Community files** (CONTRIBUTING with the AI policy, CODE_OF_CONDUCT, SECURITY, templates) live
  once in `voxolith/.github` and apply org-wide; don't copy them in here.
- **CI's job names are required checks** on `main` (rulesets). Renaming a job breaks merging.
