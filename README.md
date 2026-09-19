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

## License

MIT
