import { defineConfig, type Plugin } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { handleChat } from './server/chat'

// 从 app/.env.local 读配置（key 只留在服务端，不进前端）
function loadLocalEnv() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    const value = m[2].replace(/^["']|["']$/g, '')
    if (!process.env[m[1]]) process.env[m[1]] = value
  }
}
loadLocalEnv()

// /api/chat：本地中转，避免把 key 放进前端
function chatApi(): Plugin {
  return {
    name: 'amadeus-chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => void handleChat(req, res))
    },
  }
}

export default defineConfig({
  plugins: [chatApi()],
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
