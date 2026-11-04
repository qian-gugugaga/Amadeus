// 打开页面并收集它发出的网络请求，用于定位真实资源 URL。
// 用法：node tools/net.mjs <url> [filter]  （filter 为空则全打印）
const [url, filter = ''] = process.argv.slice(2)
if (!url) {
  console.error('usage: node tools/net.mjs <url> [filter]')
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

const urls = new Set()
let seq = 0
const pending = new Map()
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.method === 'Network.requestWillBeSent') urls.add(msg.params.request.url)
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

await send('Network.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1400,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
})
await send('Page.navigate', { url })
await new Promise((r) => setTimeout(r, 12000))

for (const u of [...urls]) {
  if (!filter || u.includes(filter)) console.log(u)
}
ws.close()
