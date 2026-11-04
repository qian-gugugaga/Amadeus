import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    watch: {
      // 工具写文件时会留下 .main.ts.xxx.tmpdir/，未忽略会让 watcher 抛 EBUSY 直接崩
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
  build: {
    target: 'es2020',
  },
})
