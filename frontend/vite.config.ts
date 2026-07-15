import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1"
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
           
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,               
        drop_debugger: true                
      }
    },
    rollupOptions: {
      output: {
               
        manualChunks: {
          "react-vendor": ["react", "react-dom"]
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});

