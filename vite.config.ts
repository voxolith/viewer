import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  // WebGPU needs a secure context; basic-ssl serves HTTPS on localhost + LAN.
  plugins: [basicSsl()],
  // @voxolith/render ships raw TypeScript with `?raw` shader imports; it must be
  // compiled with the app rather than pre-bundled.
  optimizeDeps: { exclude: ["@voxolith/render"] },
  server: {
    host: true,
  },
});
