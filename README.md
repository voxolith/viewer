<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup-dark.svg">
    <img alt="Voxolith — WebGPU voxel engine" src="https://raw.githubusercontent.com/voxolith/.github/main/profile/lockup.svg" width="420">
  </picture>
</p>

# Voxolith Viewer

A MagicaVoxel-style browser viewer for `.vox` models and Minecraft `.mca` regions, rendered
with [`@voxolith/renderer`](https://github.com/voxolith/renderer) (WebGPU).

- Drop or open a `.vox`, or pick a bundled sample
- Drag to orbit, wheel to zoom; shows dimensions, voxel count and the palette in use
- Animated multi-frame `.vox` scenes play back with frame controls
- Minecraft `.mca` regions load with crop controls
- A Particles mode cycles the engine's explosion and muzzle-flash effects

## Requirements

- [bun](https://bun.sh) 1.4 or newer
- A WebGPU-capable browser (Chrome, Edge, Safari 26+, Firefox with WebGPU enabled)

## Run

```sh
bun install
bun run dev
```

Open the printed `https://localhost:5173` URL and accept the self-signed certificate. WebGPU needs a
secure context, which the `@vitejs/plugin-basic-ssl` plugin provides on localhost and LAN.

## Performance

The toolbar's quality dropdown switches the engine presets (Low: no shadows or ambient occlusion,
short ray cap; Medium; High). The choice is remembered and shared with the editor. The viewer
renders on demand: a static model only redraws when you orbit, zoom, load or resize, and the
resolution adapts to the frame time while you interact (add `?perf` to the URL for the overlay,
which also names the WebGPU adapter).

If the viewer is slow on a machine with a capable GPU, check the adapter: the viewer shows a
warning when the browser hands it a software (CPU) WebGPU implementation. On Linux Chrome look at
`chrome://gpu` under WebGPU and enable Vulkan via `chrome://flags/#enable-vulkan`.

## Samples

Small samples live in `public/samples/` and are committed. Two are not:

- `landscape-xl.vox` (23 MB) is procedural. Regenerate it with `bun run gen:samples`.
- `r.0.0.mca` is any Minecraft region file. Copy one from a world's `region/` folder to
  `public/samples/r.0.0.mca` to enable the Minecraft sample.

## Tools

Headless bun scripts in `tools/`:

| script | purpose |
|---|---|
| `bun run gen:samples` | procedural landscapes (`landscape.vox`, `landscape-xl.vox`) |
| `bun run gen:testarossa` | the voxel Testarossa sample |
| `bun run gen:diablo` | the voxel Diablo sample |
| `bun run render:vox <in.vox> <out.png>` | CPU raytrace a model to PNG for headless checks |

## Local development with the engine

This repo depends on `@voxolith/renderer` as `workspace:*`. Clone it next to this one and run
`bun install` from a workspace root that lists both folders, so the engine resolves to the local
checkout. Once the engine is on npm, swap the dependency to a version range.

## Deploy

Every push to `main` builds the app and publishes it to GitHub Pages at
<https://voxolith.github.io/viewer/> via `.github/workflows/pages.yml`. The workflow checks out
`voxolith/renderer` next to the app and builds with `BASE_PATH=/viewer/`, so asset and fetch URLs
resolve under the project path. Run the same locally with `BASE_PATH=/viewer/ bun run build`.

## Theming

The UI uses the Voxolith design tokens in `src/brand/tokens.css` (dark navy by default, a paper
light theme via `prefers-color-scheme` or the toolbar toggle, persisted in `localStorage`). Those
files and the favicons are generated from the private `voxolith/branding` repo; edit them there
and re-run its sync script rather than here.

## License

MIT
