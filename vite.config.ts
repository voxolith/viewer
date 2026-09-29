import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { serviceWorker } from "@voxolith/engine/vite";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? "/",
  // WebGPU needs a secure context; basic-ssl serves HTTPS on localhost + LAN.
  // serviceWorker() emits sw.js on build only: the bundle is precached, and samples are
  // cached as they are opened, so a second visit (and a sample seen before) works offline.
  plugins: [
    basicSsl(),
    serviceWorker({
      name: "viewer",
      runtime: [{ match: "samples/" }],
      include: [
        "manifest.webmanifest",
        "favicon.svg",
        "favicon-32.png",
        "apple-touch-icon.png",
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/icon-maskable-512.png",
        "brand/logo-mark.svg",
      ],
    }),
  ],
  // @voxolith/renderer ships raw TypeScript with `?raw` shader imports; it must be
  // compiled with the app rather than pre-bundled.
  optimizeDeps: { exclude: ["@voxolith/renderer"] },
  server: {
    host: true,
  },
});
