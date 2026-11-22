import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 前端只与自己的后端说话，/api 转发到 Node 服务
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    fs: {
      // 厂商定义放在仓库根的 shared/ 里，前后端共用同一份
      allow: [repoRoot]
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET || "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // 组件库单独打包，更新业务代码时不用让用户重新下载组件库
        manualChunks: {
          "element-plus": ["element-plus", "@element-plus/icons-vue"]
        }
      }
    }
  }
});
