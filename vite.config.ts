import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@supabase") || id.includes("@tanstack")) {
            return "data-vendor";
          }

          if (id.includes("react-router") || id.includes("react-dom") || id.includes("react")) {
            return "react-vendor";
          }

          if (id.includes("lucide-react") || id.includes("class-variance-authority") || id.includes("clsx") || id.includes("tailwind-merge")) {
            return "ui-vendor";
          }

          return "vendor";
        },
      },
    },
  },
}));
