# Amadeus

一个「能看、能听、会演」的角色扮演伴侣。

目标不是「能对话的 Live2D 皮肤」，而是：**角色有自己的设定与反应倾向，每说一句话，身体和表情跟着一起变。**

```
用户: "你怎么那么坏"
   ↓
LLM（带角色卡人格 + 当前上下文）
   ↓ 正文 + 情绪指令
"你怎么那么坏……我什么时候对你坏了？"   { emotion: "anger", intensity: 0.75 }
   ↓                        ↓
TTS 音频                  动作查表 → Live2D
   ↓                        ↓
口型（音频驱动）          身体/表情（文本驱动）
```

身体和表情归文本管，口型归音频管——两条线必须分开。

## 由三块拼成

| 层 | 来源 | 负责什么 |
|---|---|---|
| 人格层 | **CSP** | 角色设定、行为模式、对被指责时是愤怒还是伤心的反应倾向 |
| 表演层 | **鲸语**（jingyu-live2d-agent） | 语义动作 IR + 编译器 → 受约束的 Live2D 参数轨道 |
| 客户端层 | 参考 **ElecKoi** | 数据所有权、会话、角色卡格式、插件切法（学架构，不抄代码） |

三块的共同点：**都不让模型自由发挥，而是把它的输出收窄到可校验的结构里。**

## 目录规划

```
D:\Amadeus\
  README.md
  docs/
    PLAN.md                 总计划与接口规格
  character/                角色卡（amadeus.character-card v1）
    <角色名>/
      card.json
      setting-library.json
      motions/              motion3.json 动作库
  app/                      Electron + React + Vite 客户端
    main/                   主进程
    renderer/               界面 + Live2D 舞台
  runtime/                  情绪解析、动作调度、协议层
  scripts/                  角色卡生成、验证
```

目前只有文档，代码目录按阶段逐个建。

## 当前状态

- **2026-11-04** 建项目，`git init` 完成，尚无代码。
- 旧原型在 `D:\文件\csp\amadeus`：Electron 33 + React 19 + Vite 6 + TS 5.7 + pixi-live2d-display 0.4 + pixi.js 6.5，有 demo 角色与 GPT-SoVITS 接入，**未迁移**。是否复用其中代码另议。
- 参考仓库（只读）：`jingyu-live2d-agent`、`ElecKoi` 都在 `C:\Users\86182\Documents\deepseek-harness\default-workspace\` 下。

## 技术栈

未最终确定，默认建议与旧原型对齐（迁移成本最低）：

- Electron 33 / React 19 / Vite 6 / TypeScript 5.7
- pixi.js 6.5 + pixi-live2d-display 0.4（Cubism 4）
- 需要自备 Live2D Cubism SDK for Web core（`live2dcubismcore.min.js`）与角色 `.model3.json`

## 下一步

1. 定稿 `amadeus.character-card` v1（见 `docs/PLAN.md` 第 3 节）
2. **先验情绪**：一句话 → 情绪标签，20 句测试，一致率 ≥ 80% 才接 Live2D
3. 再接动作与渲染
