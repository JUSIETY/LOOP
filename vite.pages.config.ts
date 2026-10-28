import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./pages-client", import.meta.url)),
  base: process.env.VITE_PAGES_BASE || "/loop-ai-recycling/",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  define: {
    "import.meta.env.VITE_API_BASE": JSON.stringify(
      process.env.VITE_API_BASE || "https://loop-ai-recycling-20261021.peppylion1.chatgpt.site",
    ),
  },
  build: {
    outDir: fileURLToPath(new URL("./docs", import.meta.url)),
    emptyOutDir: true,
    target: "es2020",
  },
});
