import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@assets": path.resolve(__dirname, "../frontend/assets"),
    },
  },
  build: {
    outDir: "../frontend",
    emptyOutDir: false, // don't wipe the assets folder — only update index.html + assets
  },
});
