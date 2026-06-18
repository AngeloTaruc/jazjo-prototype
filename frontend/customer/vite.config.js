import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const customerRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(customerRoot, "../..");

export default defineConfig({
  root: customerRoot,
  base: "/customer-app/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(projectRoot, "public/customer-app"),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000"
    }
  }
});
