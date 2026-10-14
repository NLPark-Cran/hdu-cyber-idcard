import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  build: {
    // 字体以 data URI 内联，保证 html-to-image 导出时能同步嵌入文字（且避免导出卡死）
    assetsInlineLimit: 100 * 1024,
  },
  server: {
    port: 3000,
    proxy: {
      "/api": "http://127.0.0.1:8377",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
