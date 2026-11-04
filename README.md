# Amadeus

一个「能看、会演」的角色扮演伴侣。

目标不是「能对话的 Live2D 皮肤」，而是：**角色有自己的设定与反应倾向，每说一句话，身体和表情跟着一起变。**

```
用户: "你怎么那么坏"
   ↓
LLM（CSP 角色设定 + 对话上下文）
   ↓ 正文 + 情绪指令
"你怎么那么坏……我什么时候对你坏了？"   { emotion: "sad", intensity: 0.5 }
   ↓                        ↓
TTS 音频（未接）          情绪 → 表情 + 动作 → Live2D
```

## 由三块拼成

| 层 | 来源 | 负责什么 |
|---|---|---|
| 人格层 | [CSP](https://github.com/qian-gugugaga/Character_Skill_Producer) | 角色设定、行为模式、事实与记忆底座 |
| 表演层 | [鲸语](https://github.com/InariNGT-Ofiicial/jingyu-live2d-agent) | 语义动作 IR + 编译器 → 受约束的参数轨道（尚未接入，目前用官方 motion） |
| 客户端层 | 参考 [ElecKoi](https://github.com/eleckoi/ElecKoi) | 数据所有权、角色卡格式、插件切法（只学架构，不抄代码） |

三块的共同点：**都不让模型自由发挥，而是把它的输出收窄到可校验的结构里。**

## 当前进度（2026-11-04）

已跑通端到端：

1. **模型**：高松灯剧情立绘版（ADV），63 段动作 × 32 个官方表情，含物理
2. **表情层**：按参数表在 `beforeModelUpdate` 最后写入，压过 motion 与 eyeBlink
3. **对话**：DeepSeek V4.1 Flash，一次调用返回 `{ text, emotion, intensity }`
4. **驱动**：情绪 → 表情 + 动作，动作结束自动回 idle

未做：口型（无 TTS）、对话历史持久化、intensity 分级影响幅度、Ave Mujica 时期数据。

## 跑起来

### 1. 模型资产（不进仓库）

Live2D 模型有第三方版权、体积大，本仓库不含。需要自备并放到：

```
app/public/model/adv-tomori/    默认（对话立绘版，63 动作 + 32 表情）
app/public/model/tomori/        ?model=live 切换（演出服版，9 动作）
app/public/live2dcubismcore.min.js
```

Cubism Core 从 [Live2D 官网](https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js) 下载。
模型需含 `*.model3.json`（ADV 版文件名 `adv_live2d_tomori_001_live_01.model3.json`）。

### 2. 配置

`app/.env.local`（已被 git 忽略）：

```ini
AMADEUS_API_KEY=sk-xxxxxxxx
AMADEUS_BASE_URL=https://api.deepseek.com
AMADEUS_MODEL=deepseek-flash
```

不配 key 也能启动，`/api/chat` 会返回 mock 回复。

### 3. 启动

```bash
cd app
npm install
npm run dev      # http://127.0.0.1:5199/
```

## 目录

```
app/
  src/main.ts              页面与 Live2D 舞台（表情层、动作、对话区）
  server/chat.ts           /api/chat 中转（key 只留服务端）
  server/character/        角色设定与记忆（tomori.md）
  public/data/             emotions.json（情绪→表情/动作映射）
docs/
  PLAN.md                  总计划与接口规格
  model-tomori.md          模型参数、表情层机制、LIVE/ADV 对照
  shots/                   验证截图
tools/
  shot.mjs                 无头截图/连拍（CDP）
  grid.py                  截图拼图
```

## 已知限制

- 动作是剧情立绘的小幅身体语言，情绪主要靠表情承载
- 表情是参数快照，模型缺的少数参数（泪珠、冷汗、眼部特效）会静默跳过
- 角色记忆截止到 Ave Mujica 两件事，其余剧情会说「不知道」（宁缺不编）
