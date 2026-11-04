// 在页面里执行表达式并把结果打印出来（调试用）。
// 用法：node tools/eval.mjs <url> "<expression>"
// 前提：Edge/Chrome 已带 --remote-debugging-port=9222 --headless 启动。
const [url, expression] = process.argv.slice(2)
if (!url || !expression) {
  console.error('usage: node tools/eval.mjs <url> "<expression>"')
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

// 等模型就绪
const deadline = Date.now() + 30000
let ready = false
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 400))
  const r = await send('Runtime.evaluate', {
    expression: `!!window.__amadeus`,
    returnByValue: true,
  })
  if (r.result?.result?.value) {
    ready = true
    break
  }
}
if (!ready) console.error('timeout waiting for window.__amadeus')

const r = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
})
if (r.result?.exceptionDetails) {
  console.error(JSON.stringify(r.result.exceptionDetails, null, 2))
} else {
  console.log(JSON.stringify(r.result?.result?.value, null, 2))
}
ws.close()
