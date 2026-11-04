// /api/chat 的最小实现：一次调用 → { text, emotion, intensity, gesture }
// 没有配 key 时返回 mock，保证「输入文字 → 回复 + 表情」这条链路可以先跑通。
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const EMOTION_IDS = [
  'neutral',
  'joy',
  'laugh',
  'anger',
  'sad',
  'cry',
  'surprise',
  'shy',
  'think',
  'pain',
] as const

export type EmotionId = (typeof EMOTION_IDS)[number]

export interface Reply {
  text: string
  emotion: EmotionId
  intensity: number
  gesture: string
}

// 人设与事实底座：改 server/character/tomori.md 即可，不用动代码
const CHARACTER = (() => {
  try {
    return readFileSync(fileURLToPath(new URL('./character/tomori.md', import.meta.url)), 'utf8')
  } catch {
    return ''
  }
})()

const SYSTEM_PROMPT = `${CHARACTER}

## 七、输出格式

你在和用户对话。只输出一个 JSON 对象，不要解释、不要 markdown 代码块：
{"text":"你对用户说的话","emotion":"<情绪>","intensity":<0到1的小数>,"gesture":"none"}

emotion 只能取：${EMOTION_IDS.join(' / ')}。
intensity：0.3 以下轻微、0.3~0.7 明显、0.7 以上强烈。
gesture 现在固定写 "none"。

三条铁律：
1. 第四节「记忆」里写了的事，就是你真经历过的；没写的事，你不知道，就说不确定或不知道。
2. 同一个问题问两次，答案必须一致——不许这次说「不知道」下次说「我记得」。
3. 用户提到时间点（「那时候」「当时」「CRYCHIC 的时候」）就按第五节的时间线回答，不要用后来的知识。`

interface Config {
  apiKey: string
  baseUrl: string
  model: string
}

function readConfig(): Config {
  const env = (globalThis as any).process?.env ?? {}
  return {
    apiKey: env.AMADEUS_API_KEY || '',
    baseUrl: (env.AMADEUS_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: env.AMADEUS_MODEL || 'deepseek-chat',
  }
}

function parseReply(raw: string): Reply {
  let text = raw.trim()
  // 容忍模型包了 ```json ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)
  const obj = JSON.parse(text) as Partial<Reply>

  const reply = String(obj.text ?? '').trim()
  if (!reply) throw new Error('text 为空')

  const emotion = EMOTION_IDS.includes(obj.emotion as EmotionId)
    ? (obj.emotion as EmotionId)
    : 'neutral'
  const intensity = Math.max(0, Math.min(1, Number(obj.intensity ?? 0.5)))
  const gesture = typeof obj.gesture === 'string' && obj.gesture ? obj.gesture : 'none'
  return { text: reply, emotion, intensity, gesture }
}

async function callModel(cfg: Config, messages: unknown[]): Promise<Reply> {
  const res = await fetch(cfg.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + cfg.apiKey,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: 0.8,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`模型返回 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as any
  const content: string = data?.choices?.[0]?.message?.content ?? ''
  return parseReply(content)
}

async function replyTo(message: string, history: { role: string; content: string }[]): Promise<Reply> {
  const cfg = readConfig()
  if (!cfg.apiKey) return mockReply(message)

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-8).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 2000),
    })),
    { role: 'user', content: message.slice(0, 2000) },
  ]

  // 只重试一次：把上次的解析错误回灌，仍失败就降级成中性
  try {
    return await callModel(cfg, messages)
  } catch (first) {
    try {
      return await callModel(cfg, [
        ...messages,
        { role: 'user', content: `上次输出不合规：${String(first).slice(0, 200)}。只返回合法 JSON。` },
      ])
    } catch {
      return { text: '……（走神了）', emotion: 'think', intensity: 0.4, gesture: 'none' }
    }
  }
}

// 无 key 时的假回复：能演示链路，也能看出解析对不对
function mockReply(message: string): Reply {
  const t = message.toLowerCase()
  if (/坏|讨厌|笨蛋|烦/.test(message)) {
    return { text: '……你才坏。', emotion: 'anger', intensity: 0.7, gesture: 'none' }
  }
  if (/喜欢|可爱|好棒|厉害/.test(message)) {
    return { text: '啊……谢谢。', emotion: 'shy', intensity: 0.6, gesture: 'none' }
  }
  if (/吗|为什么|怎么/.test(message) || t.length === 0) {
    return { text: '嗯……让我想想。', emotion: 'think', intensity: 0.4, gesture: 'none' }
  }
  if (/难过|伤心|累/.test(message)) {
    return { text: '……我也，有点。', emotion: 'sad', intensity: 0.5, gesture: 'none' }
  }
  return { text: '嗯。', emotion: 'neutral', intensity: 0.3, gesture: 'none' }
}

export async function handleChat(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('POST only')
    return
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  let body: any = {}
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'invalid json' }))
    return
  }

  const message = String(body?.message ?? '').trim()
  if (!message) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'message 为空' }))
    return
  }

  try {
    const reply = await replyTo(message, Array.isArray(body?.history) ? body.history : [])
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ...reply, mock: !readConfig().apiKey }))
  } catch (e) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(e).slice(0, 300) }))
  }
}
