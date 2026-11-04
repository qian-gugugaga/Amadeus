import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'

const logEl = document.getElementById('log')!
const controlsEl = document.getElementById('controls')!

function log(msg: string, isError = false) {
  const line = document.createElement('div')
  line.textContent = msg
  if (isError) line.id = 'error'
  logEl.appendChild(line)
  // eslint-disable-next-line no-console
  console.log(msg)
}

function fail(msg: string) {
  log('✗ ' + msg, true)
}

const MODEL_URL = '/model/tomori/live2d_tomori_001_live_01.model3.json'

// 要探的参数：情绪开关 + 头部姿态 + 口型
const PROBES = [
  'Paramangry',
  'Paramsad',
  'Paramsmile01',
  'Paramfun',
  'Paramsurprised_01',
  'ParamCheek',
  'ParamTear',
  'ParamMouthOpenY',
  'ParamMouthForm',
  'ParamAngleX',
  'ParamAngleY',
  'ParamAngleZ',
  'ParamBodyAngleY',
]

const state: Record<string, number> = {}

// 表情：参数目标表 + 淡入进度（exp3 只当作参数模板来源）
type Expr = {
  Name: string
  FadeInTime: number
  FadeOutTime: number
  Params: Record<string, number>
}
let expData: Expr[] = []
const exprTarget: Record<string, number> = {}
const fadingOut = new Set<string>()
const defaultOfParam = (id: string) => 0
let defaultOf: (id: string) => number = defaultOfParam
let exprFade = 0.4
let exprProgress = 0

function applyExpression(name: string | null) {
  const e = name ? expData.find((x) => x.Name === name) : undefined
  const keep = new Set(e ? Object.keys(e.Params) : [])
  // 淡出的目标必须是「参数默认值」，不是 0——EyeLOpen 的默认值是 1，淡到 0 会变成闭眼卡住
  for (const id of Object.keys(exprTarget)) {
    if (!keep.has(id)) {
      exprTarget[id] = defaultOf(id)
      fadingOut.add(id)
    }
  }
  if (e) {
    for (const [id, v] of Object.entries(e.Params)) {
      exprTarget[id] = v
      fadingOut.delete(id)
    }
  }
  exprFade = Math.max(0.05, e ? e.FadeInTime : 0.3)
  exprProgress = 0
}

async function main() {
  if (!(window as any).Live2DCubismCore) {
    fail('Live2DCubismCore 未加载（检查 /live2dcubismcore.min.js）')
    return
  }
  log('core: ' + ((window as any).Live2DCubismCore.Version?.csmGetVersion?.() ?? 'ok'))

  Live2DModel.registerTicker(PIXI.Ticker)

  const app = new PIXI.Application({
    view: document.getElementById('stage') as HTMLCanvasElement,
    resizeTo: document.getElementById('stage-box') as HTMLElement,
    antialias: true,
    backgroundAlpha: 0,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  })

  log('pixi: ' + PIXI.VERSION)

  let model: Live2DModel
  try {
    model = await Live2DModel.from(MODEL_URL, { autoInteract: false })
    log('✓ 模型加载成功  ' + Math.round(model.width) + '×' + Math.round(model.height))
  } catch (e) {
    fail('模型加载失败：' + (e as Error).message)
    return
  }

  app.stage.addChild(model)

  // 让模型底部对齐舞台底部、水平居中
  const fit = () => {
    const s = Math.min(
      (app.screen.height * 0.96) / model.height,
      (app.screen.width * 0.96) / model.width,
    )
    model.scale.set(s)
    model.anchor.set(0.5, 1)
    model.x = app.screen.width / 2
    model.y = app.screen.height
  }
  fit()
  window.addEventListener('resize', fit)

  // 支持 ?set=Paramangry:1,ParamMouthForm:-0.6 直接预设参数（调试/截图用）
  const preset = new URLSearchParams(location.search).get('set')
  if (preset) {
    for (const pair of preset.split(',')) {
      const [id, raw] = pair.split(':')
      const v = Number(raw)
      if (id && Number.isFinite(v)) {
        state[id] = v
        log(`· 预设 ${id} = ${v}`)
      }
    }
  }

  const im = model.internalModel as any
  const core = im.coreModel
  ;(window as any).__amadeus = { model, core, state }

  // 该模型没有 physics/cdi，参数表从 core 直接读（147 个参数）
  const available = new Set<string>((core._parameterIds as string[]) ?? [])
  const readParam = (id: string): number | undefined => {
    if (!available.has(id)) return undefined
    try {
      const i = core.getParameterIndex(id)
      return i < 0 ? undefined : core.getParameterValueByIndex(i)
    } catch {
      return undefined
    }
  }
  const writeParam = (id: string, v: number) => {
    if (!available.has(id)) return false
    try {
      core.setParameterValueById(id, v)
      return true
    } catch {
      return false
    }
  }

  // 参数默认值：表情淡出时回到这里，而不是 0
  defaultOf = (id: string) => {
    if (!available.has(id)) return 0
    try {
      const i = core.getParameterIndex(id)
      return i < 0 ? 0 : core.getParameterDefaultValue(i)
    } catch {
      return 0
    }
  }

  // 参数注入点：每帧在模型 update 前覆盖
  im.on('beforeModelUpdate', (dt: number) => {
    for (const id of Object.keys(state)) {
      const v = state[id]
      if (v === undefined) continue
      writeParam(id, v)
    }
    // 表情层：最后写入，压过 idle motion（idle 是 146 条全参数曲线）
    const ids = Object.keys(exprTarget)
    if (ids.length) {
      exprProgress = Math.min(1, exprProgress + (Number.isFinite(dt) ? dt : 0.016) / exprFade)
      const k = Math.min(1, exprProgress)
      for (const id of ids) {
        const target = exprTarget[id]
        const cur = readParam(id)
        if (cur === undefined) continue
        const v = cur + (target - cur) * k
        // 淡出项到位后交还给 motion / 眨眼，避免永久压住参数
        if (fadingOut.has(id) && Math.abs(v - target) < 0.01) {
          delete exprTarget[id]
          fadingOut.delete(id)
          continue
        }
        writeParam(id, v)
      }
    }
  })

  // 建滑块
  for (const id of PROBES) {
    let index = -1
    try {
      index = core.getParameterIndex(id)
    } catch {
      index = -1
    }
    if (index < 0) {
      log(`· ${id} 不存在于该模型`)
      continue
    }
    const min = core.getParameterMinimumValue(index)
    const max = core.getParameterMaximumValue(index)
    const def = core.getParameterDefaultValue(index)
    // 预设优先；未预设时只显示默认值，不写进 state（否则每帧压住 idle 的动作）
    const initial = state[id] ?? def

    const row = document.createElement('div')
    row.className = 'row'
    row.innerHTML = `<label><span>${id}</span><b>${initial.toFixed(2)}</b></label>`
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = '0.01'
    input.value = String(initial)
    input.addEventListener('input', () => {
      state[id] = Number(input.value)
      ;(row.querySelector('b') as HTMLElement).textContent = Number(input.value).toFixed(2)
    })
    row.appendChild(input)
    controlsEl.appendChild(row)
    log(`· ${id}  [${min} .. ${max}]  default ${def}`)
  }

  // 动作按钮
  document.querySelectorAll<HTMLButtonElement>('button[data-motion]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.motion!
      try {
        await model.motion(name)
        log('▶ ' + name)
      } catch (e) {
        fail('动作播放失败 ' + name + '：' + (e as Error).message)
      }
    })
  })

  // 表情：官方 ADV 版 32 个 exp3 的参数表，由本页在 beforeModelUpdate 写入
  try {
    const res = await fetch('/data/expressions.json')
    expData = await res.json()
    log(`· 表情 ${expData.length} 个（参数模板）`)
  } catch (e) {
    fail('表情表加载失败：' + (e as Error).message)
  }

  if (expData.length) {
    const box = document.createElement('div')
    box.className = 'row'
    box.innerHTML = '<label><span>表情 expr</span></label>'
    const sel = document.createElement('select')
    const none = document.createElement('option')
    none.value = ''
    none.textContent = `（无 / 共 ${expData.length} 个）`
    sel.appendChild(none)
    for (const e of expData) {
      const o = document.createElement('option')
      o.value = e.Name
      o.textContent = e.Name.replace(/^exp_/, '')
      sel.appendChild(o)
    }
    sel.addEventListener('change', () => {
      applyExpression(sel.value || null)
      log('表情 ' + (sel.value || '清除'))
    })
    box.appendChild(sel)
    controlsEl.appendChild(box)

    // ?exp=angry01 —— 截图/自动化用
    const expParam = new URLSearchParams(location.search).get('exp')
    if (expParam) {
      const hit = expData.find((e) => e.Name === expParam || e.Name === 'exp_' + expParam)
      if (hit) {
        sel.value = hit.Name
        applyExpression(hit.Name)
      } else {
        fail('表情不存在：' + expParam)
      }
    }
  }

  // 情绪闭集 → 表情映射
  const emotionMap = new Map<string, { label: string; exp: string; motion: string | null }>()
  try {
    const res = await fetch('/data/emotions.json')
    const j = await res.json()
    for (const e of j.emotions) emotionMap.set(e.id, e)
    log(`· 情绪 ${emotionMap.size} 个`)
  } catch (e) {
    fail('情绪表加载失败：' + (e as Error).message)
  }

  // 对话 → /api/chat → 文字 + 表情
  const msgsEl = document.getElementById('messages')!
  const chatForm = document.getElementById('chat-form') as HTMLFormElement
  const chatInput = document.getElementById('chat-input') as HTMLInputElement
  const history: { role: string; content: string }[] = []
  let busy = false

  const pushMsg = (kind: 'user' | 'ai', text: string, tag?: string) => {
    const d = document.createElement('div')
    d.className = 'msg ' + kind
    d.textContent = text
    if (tag) {
      const s = document.createElement('span')
      s.className = 'tag'
      s.textContent = tag
      d.appendChild(s)
    }
    msgsEl.appendChild(d)
    msgsEl.scrollTop = msgsEl.scrollHeight
  }

  async function send(text: string) {
    busy = true
    pushMsg('user', text)
    history.push({ role: 'user', content: text })
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) }),
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const reply = await res.json()
      if (reply.error) throw new Error(reply.error)
      pushMsg('ai', String(reply.text), `${reply.emotion} · ${Number(reply.intensity).toFixed(2)}`)
      history.push({ role: 'assistant', content: String(reply.text) })
      const emo = emotionMap.get(String(reply.emotion))
      applyExpression(emo?.exp ?? null)
      log(`回复 ${reply.emotion}/${reply.intensity} → ${emo?.exp ?? '无'}${reply.mock ? ' (mock)' : ''}`)
    } catch (e) {
      fail('对话失败：' + (e as Error).message)
    } finally {
      busy = false
    }
  }

  chatForm.addEventListener('submit', (ev) => {
    ev.preventDefault()
    const text = chatInput.value.trim()
    if (!text || busy) return
    chatInput.value = ''
    void send(text)
  })

  // idle 播完自动续（该模型的 idle 是 Loop=False）
  model.on('motionEnded', (name: string) => {
    if (name === 'mtn_idle_01') {
      setTimeout(() => model.motion('mtn_idle_01').catch(() => {}), 50)
    }
  })

  try {
    await model.motion('mtn_idle_01')
    log('▶ mtn_idle_01')
  } catch (e) {
    fail('idle 播放失败：' + (e as Error).message)
  }
}

main().catch((e) => fail('未捕获错误：' + (e as Error).message))
