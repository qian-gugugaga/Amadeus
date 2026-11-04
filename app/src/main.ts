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

async function main() {
  if (!(window as any).Live2DCubismCore) {
    fail('Live2DCubismCore 未加载（检查 /live2dcubismcore.min.js）')
    return
  }
  log('core: ' + ((window as any).Live2DCubismCore.Version?.csmGetVersion?.() ?? 'ok'))

  Live2DModel.registerTicker(PIXI.Ticker)

  const app = new PIXI.Application({
    view: document.getElementById('stage') as HTMLCanvasElement,
    resizeTo: document.getElementById('stage-wrap') as HTMLElement,
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

  // 参数注入点：每帧在模型 update 前覆盖
  im.on('beforeModelUpdate', () => {
    for (const id of Object.keys(state)) {
      const v = state[id]
      if (v === undefined) continue
      try {
        core.setParameterValueById(id, v)
      } catch {
        /* 参数不存在时忽略 */
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
    // 预设优先，否则记默认值
    const initial = state[id] ?? def
    state[id] = initial

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
