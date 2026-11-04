# Amadeus 计划与接口规格

> 版本 0.1 · 2026-11-04
> 这份文档先定「接口」，再定「代码」。所有接口改动先进这里。

## 1. 目标与非目标

### 目标

1. **角色卡可生产**：CSP 输出一份 amadeus 能直接吃的角色卡（设定 + 反应倾向 + 动作库 + 舞台约束）。
2. **每句话同时有文字和动作**：模型输出正文时，按当前语境给出情绪标签与强度，客户端查表驱动 Live2D。
3. **动作用数据描述**：动作以 `motion3.json` / 参数轨道 / 语义指令三种形态存在，运行时按需选用。
4. **人设决定动作**：同一句「你怎么那么坏」，祥子愤怒、初华伤心——差别的来源是角色卡，不是模型心情。

### 非目标（第一版不做）

- 实时打断、流式语音对话（先做「说完一句、演一段」）
- 口型以外的精细面部捕捉（VTS 摄像头方案不接）
- 多角色同台
- 云端部署、多用户

## 2. 三层分工

```
┌─────────────┐   角色卡 JSON    ┌──────────────┐   语义指令    ┌─────────────┐
│  CSP 人格层  │ ───────────────→ │ Amadeus 运行时 │ ───────────→ │ Live2D 舞台 │
│  设定/倾向   │                  │  情绪解析/调度 │              │  渲染/口型  │
└─────────────┘                  └──────────────┘              └─────────────┘
                                        ↑
                                 鲸语编译器（按需）
                              语义指令 → 参数轨道
```

| 层 | 输入 | 输出 | 谁实现 |
|---|---|---|---|
| 人格层 | 角色名 + 作品 | 角色卡 | CSP（改造后） |
| 运行时 | 用户消息 + 角色卡 + 历史 | 正文 + 情绪指令 + 动作调用 | Amadeus 自己写 |
| 舞台 | 动作资源 | 画面 | pixi-live2d-display |

## 3. 角色卡 schema：`amadeus.character-card` v1

存放：`character/<角色名>/card.json`

```jsonc
{
  "format": "amadeus.character-card",
  "version": 1,
  "meta": {
    "name": "丰川祥子",
    "source": "BanG Dream! It's MyGO!!!!!",
    "skillVersion": "1.0.0",        // 来自 CSP
    "createdAt": "2026-11-04"
  },

  // ── 角色资料（CSP 01-setting）──
  "profile": {
    "age": "16",
    "sex": "女",
    "height": "158cm",
    "birthday": "02-14",
    "likes": "钢琴、红茶",
    "avatar": "assets/avatar.png",
    "portrait": "assets/portrait.png"
  },

  // ── 设定库（CSP 01/02/04/05 结构化）──
  // 不做全量注入，按关键词/触发条件检索
  "settingLibrary": {
    "version": "1.0.0",
    "entries": [
      {
        "id": "personality-core",
        "keywords": ["性格", "本人", "平时"],
        "trigger": "always",          // always / 关键词命中 / 场景出现
        "enabled": true,
        "weight": 10,                 // 注入优先级
        "content": "键盘手兼制作人，主导 CRYCHIC 与 Ave Mujica……"
      },
      {
        "id": "reaction-to-blame",
        "keywords": ["指责", "坏", "怪你"],
        "trigger": "keyword",
        "enabled": true,
        "weight": 8,
        "content": "被指责时先防御、抬下巴、声音变冷，很少直接示弱。"
      }
    ]
  },

  // ── 情绪词表（运行时只能从这里选）──
  "emotionLexicon": [
    "neutral", "joy", "anger", "sad", "surprise",
    "shy", "think", "pout", "troubled", "excited"
  ],

  // ── 反应规则：情绪 → 粗动作指令（这是「愤怒还是伤心」的答案）──
  // 只写粗维度，绝不写具体参数值
  "reactionRules": {
    "anger": {
      "when": "被指责、被轻视、被当成小孩子",
      "tilt": 0.35,            // -1..1，负=低头，正=抬头
      "smile": -0.4,           // -1..1
      "look": "away",          // away / at_user / down / side
      "gesture": "hand_on_chest",
      "duration": 2.4,
      "easing": "smoothstep"
    },
    "sad": {
      "when": "被冷落、提到过去、被拒绝",
      "tilt": -0.5,
      "smile": -0.2,
      "look": "down",
      "gesture": null,
      "duration": 3.0,
      "easing": "ease-out"
    }
  },

  // ── 动作库：预置动作，带 tag 供查表 ──
  "motionLibrary": [
    {
      "id": "anger_high",
      "tags": ["anger"],
      "file": "motions/anger_high.motion3.json",
      "duration": 2.4,
      "loop": false
    }
  ],

  // ── 舞台约束：来自鲸语 model_profile 的思路 ──
  "stage": {
    "modelDir": "model/祥子",
    "model3": "祥子.model3.json",
    "allowedGestures": ["hand_on_chest", "point"],
    "forbiddenParams": ["ParamBreath", "Param62"],
    "maxActionsPerMinute": 8,
    "defaultIdle": "motions/idle.motion3.json"
  },

  // ── 正则：把隐藏标记从正文里剥掉（ElecKoi regex_rules 思路）──
  "regexRules": [
    { "id": "strip-emotion", "pattern": "⟦emotion:[^⟧]*⟧", "displayOnly": true }
  ],

  // ── TTS 配置（GPT-SoVITS）──
  "tts": {
    "engine": "gpt-sovits",
    "model": "voices/祥子.pth",
    "refAudio": "voices/祥子_ref.wav",
    "refText": "……",
    "language": "zh"
  }
}
```

### 字段规则

- `emotionLexicon` 是**闭集**：运行时输出超出词表的标签一律按 `neutral` 处理，并记日志。
- `reactionRules` 的每个值都是粗维度（幅度档位、方向枚举），**禁止出现 `ParamAngleX: 12.7` 这种**。参数级细节归引擎。
- `settingLibrary.entries[].content` 是散文，但 `keywords`/`trigger`/`weight` 是机读的——这是 CSP 从「一份 SKILL.md」升级成「可检索设定库」的关键。
- `stage.forbiddenParams` 来自模型物理文件，编译器会拒绝直接驱动它们（鲸语 `PHYSICS_OUTPUTS` 的同一思路）。

## 4. 运行时协议：一句话 → 三个产物

### 4.1 一次请求

**调用 1（主，流式）**：带角色卡人格 + 检索到的设定条目 → 输出正文。

**调用 2（副，非流式，可与调用 1 并行）**：输入「最近 3 轮 + 本轮用户话」→ 只输出：

```json
{ "emotion": "anger", "intensity": 0.75 }
```

两条线解耦的理由：正文流式输出（延迟低），情绪解析失败不影响对话；情绪可以单独换模型/加 few-shot 调优。

### 4.2 时序

```
用户消息
  ├─→ [调用1 主模型] ──流式──→ 正文上屏 ──→ TTS 生成音频 ──→ 口型
  └─→ [调用2 情绪]  ──非流式──→ {emotion,intensity}
                                    ↓
                         查 reactionRules[emotion]
                                    ↓
                   选 motionLibrary（tag 匹配，按强度分档）
                                    ↓
                         startMotion() 播放身体/表情
                                    ↓
                        音频时长驱动 ParamMouthOpenY（口型线）
```

### 4.3 降级

| 失败 | 处理 |
|---|---|
| 情绪 JSON 解析失败 | 用 `neutral`，只保留呼吸与轻微视线 |
| 命中词表外标签 | 映射到 `neutral`，记一条日志 |
| 没有匹配的 motion | 用 `stage.defaultIdle` |
| TTS 失败 | 正文照常显示，口型静止 |

### 4.4 情绪强度分档

`intensity` 不直接喂参数，先分三档：`<0.33` 低、`0.33~0.66` 中、`>0.66` 高。每档对应不同 motion 或不同幅度。**宁可分档，不要连续值**——连续值会让动作看起来抽搐。

## 5. Live2D 动作文件的三种形态

| 形态 | 结构 | 消费方 | 灵活度 | 何时用 |
|---|---|---|---|---|
| **A 参数轨道** | `{tracks:[{param, points:[[t,v],…]}]}` | 自写引擎逐帧 setParameterValueById | 最高 | 精确编排一场戏 |
| **B motion3.json** | Live2D 官方动作格式 | pixi-live2d-display 原生 | 中 | 预置动作库、动态生成 |
| **C 语义指令** | `{emotion,intensity,gesture}` | 查表播放 | 低 | 日常 95% 的场景 |

**选择：C 为主，B 为动作库载体，A 只在需要时用。**

- 日常句子 → C（查表，0 延迟）
- CSP 产出的角色卡自带 B 格式动作库
- 需要「一句话里连续三个动作」这种编排 → 调鲸语编译器生成 A

> 待验证：pixi-live2d-display 能否在运行时注册内存中的 `CubismMotion`（而不是从磁盘加载）。这条不成立的话，B 只能靠「写进模型目录 + reload」实现。

## 6. 阶段计划

| 阶段 | 内容 | 工期 | 出口条件 |
|---|---|---|---|
| **P0** 骨架 | 技术栈确认、Electron 壳、一个能跑的空舞台 | 0.5d | `npm run dev` 出窗口 |
| **P1** 情绪验证 | 不分 Live2D，纯文本：20 句测试 → 情绪 JSON | 1d | 一致率 ≥ 80% |
| **P2** 角色卡 | schema 定稿 + 祥子角色卡 + 设定库检索 | 1d | 校验脚本通过 |
| **P3** 舞台 | pixi-live2d-display 加载模型、idle 循环、口型接口 | 2d | 模型能呼吸、能眨眼 |
| **P4** 查表动作 | reactionRules → motionLibrary → startMotion | 1.5d | 情绪能驱动一段动作 |
| **P5** 动态动作（选做） | 接鲸语编译器，生成 A 形态轨道 | 2d | 一句话连续编排 |

**P1 提前**的理由：这个项目最可能死在情绪稳定性上，而不是死在 Live2D 集成上。先花一天确认那条线通不通，再投入渲染。

## 7. 验收

**E1 情绪（P1 出口）**
- 20 句测试台词，人判一致率 ≥ 80%
- JSON 解析成功率 100%
- 正文污染率 0（正文里不允许残留任何标记）

**E2 动作（P4 出口）**
- 8 段动作，去掉文字和角色特征后盲测，能认出是哪个角色 ≥ 70%
- 同一情绪连续触发 5 次，动作不重复抽搐

**E3 端到端（P5 后）**
- 一句话输入到画面上出动作 ≤ 2s
- 连续 20 句不崩、不卡、不卡动作

## 8. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| 情绪误判 | 动作与台词不搭，比没有动作更差 | 词表小 + reactionRules + few-shot；E1 不过就停 |
| 动作生硬 | 像提线木偶 | 只用粗维度、默认缓动、保留呼吸、限每秒动作数 |
| 延迟 | 二次调用 +200~500ms | 与 TTS 并行；预置动作表 |
| 口型与音频不同步 | 出戏 | 口型只由音频驱动，不由文本生成 |
| 模型资产缺失 | 无法验证视觉效果 | 先用合成模型/公皮跑通逻辑，真模型后可替换 |
| AGPL 污染 | 发布受限 | 只读 ElecKoi 文档，不抄代码 |

## 9. 待拍板

1. **技术栈**：Electron 自研（与旧原型一致）/ 做成 DSH 插件 / 纯 Web。
2. **模型资产**：用合成模型先跑逻辑，还是先拿到角色皮。
3. **旧原型代码**：迁移、参考、还是重写。
4. **TTS**：本地 GPT-SoVITS，还是先接云 API。
