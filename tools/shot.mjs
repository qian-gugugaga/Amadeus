// 用 CDP 截图：等页面日志出现指定文本后再拍，避免拍到「加载中」。
// 用法：node tools/shot.mjs <url> <out.png> [等待文本]
// 前提：Edge/Chrome 已带 --remote-debugging-port=9222 --headless 启动。
import { writeFileSync } from 'node:fs'

const [url, out, waitText = '✓ 模型加载成功'] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: node tools/shot.mjs <url> <out.png> [waitText]')
  process.exit(2)
}

const base = process.env.CDP || 'http://127.0.0.1:9222'
const targets = await (await fetch(`${base}/json/list`)).json()
const page = targets.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true })
  ws.addEventListener('error', rej, { once: true })
})

let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
})
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq
    pending.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Page.navigate', { url })

const clipArg = process.argv[5] // "x,y,w,h"
let clip
if (clipArg) {
  const [x, y, width, height] = clipArg.split(',').map(Number)
  clip = { x, y, width, height, scale: 2 }
}

const deadline = Date.now() + 30000
let ok = false
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 400))
  const r = await send('Runtime.evaluate', {
    expression: `document.querySelector('#log')?.textContent || ''`,
    returnByValue: true,
  })
  if ((r.result?.result?.value || '').includes(waitText)) {
    ok = true
    break
  }
}
if (!ok) console.error(`timeout waiting for: ${waitText}`)

// 表情淡入需要时间，默认再等 1.2s 让 exp3 应用完成
const settle = Number(process.argv[6] ?? 1200)
const js = process.argv[7]
if (js) {
  const r = await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) console.error('eval error', JSON.stringify(r.result.exceptionDetails))
}
await new Promise((r) => setTimeout(r, settle))

const shot = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' })
writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log(ok ? 'ok' : 'timeout', '->', out)
ws.close()
