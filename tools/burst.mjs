// 连拍：播放一个动作，隔固定间隔连拍 N 帧，用来看动作到底动没动。
// 用法：node tools/burst.mjs <url> <outPrefix> <count> <intervalMs> "<js>"
import { writeFileSync } from 'node:fs'

const [url, prefix, countArg = '6', intervalArg = '400', js] = process.argv.slice(2)
if (!url || !prefix) {
  console.error('usage: node tools/burst.mjs <url> <outPrefix> <count> <intervalMs> "<js>"')
  process.exit(2)
}
const count = Number(countArg)
const interval = Number(intervalArg)

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
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url })

const deadline = Date.now() + 30000
let ok = false
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 400))
  const r = await send('Runtime.evaluate', {
    expression: `document.querySelector('#log')?.textContent || ''`,
    returnByValue: true,
  })
  if ((r.result?.result?.value || '').includes('✓ 模型加载成功')) {
    ok = true
    break
  }
}
if (!ok) throw new Error('model did not load')

await new Promise((r) => setTimeout(r, 600)) // 等控件建好
if (js) {
  const r = await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) console.error('eval error', JSON.stringify(r.result.exceptionDetails))
}

for (let i = 0; i < count; i++) {
  await new Promise((r) => setTimeout(r, interval))
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const out = `${prefix}-${i}.png`
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
  console.log('frame', i, '->', out)
}
ws.close()
