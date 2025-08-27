import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: ["uuid"],  // добавьте здесь пакет uuid
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
