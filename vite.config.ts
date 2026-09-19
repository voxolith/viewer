import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? "/",
  // WebGPU needs a secure context; basic-ssl serves HTTPS on localhost + LAN.
  plugins: [basicSsl()],
  // @voxolith/renderer ships raw TypeScript with `?raw` shader imports; it must be
  // compiled with the app rather than pre-bundled.
  optimizeDeps: { exclude: ["@voxolith/renderer"] },
  server: {
    host: true,
  },
});
