import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const allowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);
const allowAllHosts = allowedHosts.some((host) => ["*", "all", "true"].includes(host.toLowerCase()));

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: allowAllHosts ? true : allowedHosts.length > 0 ? allowedHosts : undefined,
    proxy: {
      "/api": {
        target: process.env.VITE_BACKEND_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true
      }
    }
  }
});
