# 高松灯（tomori）模型参数标定

> 标定时间 2026-11-01 ~ 11-04，对应 `model/tomori/live2d_tomori_001_live_01.moc3`。
> 截图证据在 `docs/shots/`，四张均为 1400×900 视口下按 `420,110,240,220` 裁剪、2 倍缩放。

**结论一句话**：表情用官方 ADV 版的 **32 个 exp3 参数模板**，但**不能直接 `model.expression()`**——
exp3 会被 idle motion 的 146 条全参数曲线覆盖。正确做法是在 `beforeModelUpdate` 里把 exp3 的参数
作为「表情层」最后写入（见 3.1），这样眼睛、眉毛、腮红全部生效；实测 cry / smile / angry 辨识度很高。

---

## 1. 资产概况

| 项 | 值 |
|---|---|
| moc3 | 1.79 MB，MOC3 魔数，Version 3 |
| 贴图 | 2 张 **webp**（417 KB + 233 KB），pixi 6.5.10 直接加载无问题（已实测） |
| 参数 | 147 个（`coreModel._parameterIds`） |
| 动作 | 9 段 motion3：`mtn_idle_01`(4.0s) `mtn_action_01`(4.98s) `mtn_finish_01` `mtn_play01_01~03`(10.65s 各) `mtn_play02_01~03` |
| `physics3.json` | **无** |
| `cdi3.json` | **无** |
| `exp3.json` | **LIVE 版没有**；已从官方 ADV 版（sakiko.app 的 `001_adv-tomori_001_casual_spring_01`）补入 **32 个**到 `Expressions/` |
| model3 Groups | `EyeBlink = [ParamEyeLOpen, ParamEyeROpen]`、`LipSync = [ParamMouthOpenY]` |

动作是游戏演出用的（9 段），不是情绪动作。情绪靠**表情层**（第 3 节）解决。

---

## 2. 参数分组

### 2.1 头部与身体（`motion` 层会用到）

| 参数 | 范围 | 说明 |
|---|---|---|
| `ParamAngleX` / `ParamAngleY` / `ParamAngleZ` | ±30 | 头部左右 / 上下 / 倾斜 |
| `ParamHeadY` | — | 头部额外位移 |
| `ParamBodyAngleX` / `ParamBodyAngleY` / `ParamBodyAngleZ` | ±10（Y） | 身体角度 |
| `ParamBodyPositionX` / `ParamBodyPositionY` | — | 身体位移 |
| `ParamBreath` | 0..1 | 呼吸（idle 动作里已在用） |
| `ParamShoulderL` / `ParamShoulderR` | — | 肩 |
| `ParamChestX` / `ParamChestY` | — | 胸 |

### 2.2 眼睛（**强，优先用**）

| 参数 | 说明 |
|---|---|
| `ParamEyeLOpen` / `ParamEyeROpen` | 开合。`0.7` 显小、`1.3` 显大（实测有效，超范围会被 clamp） |
| `ParamEyeLSmile` / `ParamEyeRSmile` | **笑眼**（0..1），实测最有效的「笑」手段 |
| `ParamEyeBallX` / `ParamEyeBallY` | 眼球朝向 |
| `ParameyelidL` / `ParameyelidR` | 眼皮（未知语义，待试） |
| `ParamEyeLScsle` / `ParamEyeLScsle2` 等 | 眼睛缩放/高光，待试 |

### 2.3 眉毛（**强，表情辨识度主要靠它**）

| 参数 | 说明 |
|---|---|
| `ParamBrowLY` / `ParamBrowRY` | 眉毛上下 |
| `ParamBrowLAngle` / `ParamBrowRAngle` | 眉毛角度（皱眉/八字） |
| `ParamBrowLForm` / `ParamBrowRForm` | 眉毛形状 |
| `Param_angry_eyebrows` | 怒眉样式（0..1，实测有效） |
| `Param_sad_eyebrows` | 悲眉样式（实测有效，八字） |
| `Param_smile_eyebrows` | 笑眉 |
| `Param_fun_eyebrows` | 搞笑眉 |
| `Param_thinking_eyeeyebrows` | 思考眉 |
| `ParamBrowR_eyebrows` | 右眉附加 |

### 2.4 嘴（开合强，形状弱）

| 参数 | 范围 | 说明 |
|---|---|---|
| `ParamMouthOpenY` | 0..1 | **强**，张嘴/说话口型 |
| `ParamMouthForm` | -1..1 | **弱**，实测 -1 / +0.8 变化很小 |
| `ParamMouthside` / `ParamMouthupdawn` | — | 嘴角左右/上下，待试 |
| `ParamMouthStrength` | — | 嘴部力度，待试 |

### 2.5 表情开关（单独用弱，但属于 exp3 的一部分）

`Paramsmile01` `Paramangry` `Paramsad` `Paramsad_01` `Paramfun` `Paramsurprised_01` `ParamCheek`
`ParamCheek2` `ParamCheek3` —— 均为 0..1。单独置 1 只改眉毛一小块，因为官方是**整套值一起给**的
（见 3.1）。单独用它们等于只给了一半信号。

### 2.6 眼泪 / 红晕 / 抖动

| 参数 | 实测 |
|---|---|
| `ParamTear` | 属于 cry01 参数组；本模型**没有泪珠贴图**，所以只出「闭眼忍哭」不出眼泪 |
| `Param_tears_puru` | 泪光抖动 |
| `ParamCheek*` | 红晕，exp3 里给的幅度很大，效果明显 |
| `ParamEyeRShakingX/Y` `ParamEyeLShakingX2/3` `ParameyeLlashShakingX` 等 | 眼部抖动 |

### 2.7 手（语义未知，必须肉眼逐个试）

- 右手：`hand_R_01` ~ `hand_R_10`（10 种手势）、`paramArmR01` ~ `paramArmR07`、`paramArmR_layer/2/3`、`paramArmR_Handform`、`paramArmRFuku`
- 左手：`hand_L_08`、`hand_L_09`（只有 2 种）、`paramArmL01` ~ `paramArmL06`、`paramArmL_layer*`、`paramArmLFuku`、`paramArmLFuku2`、`paramMiku`

编号和手势的对应关系**没有文档**，只能逐个置 1 截图看。这是 P3 阶段的活。

### 2.8 没有物理，所以下面这些要自己算

`ParamHairFront` / `HairFront2` / `HairFront3` / `HairFrontY` / `HairFrontY2`
`ParamHairSide` / `Side2` / `Side3` / `SideY` / `SideY2`
`ParamHairBack` / `Back2` / `Back3` / `BackY` / `BackY2`
`ParamSkirtFuwa1`、`ParamOuter01` / `Outer02` / `OuterFuwa01` / `OuterFuwa02`、`ParamClothes03`
`ParamFluffy` / `Fluffy2A` / `Fluffy2B`、`ParamEarring` / `ParamEarringFuwa`

做法可以照抄鲸语 `web/engine.mjs` 的 `applyIdle`：用头部角度做输入，延迟几帧、加阻尼，
生成头发/裙子的跟随摆动。**这是「有生命感」和「纸片人」的分界线**，别省。

---

## 3. 表情层机制（核心）

### 3.1 为什么不能直接播 exp3

`mtn_idle_01` 有 **146 条曲线**，把 `ParamAngle*`、`ParamEyeLOpen`、`Paramsmile01`、`Paramangry`、
`ParamTear`、`ParamMouthForm`、所有 `hand_R_*` / `paramArmR*` / `ParamHair*` / `ParamSkirtFuwa1`
全写了一遍。Cubism 的 motion 每帧覆盖它涉及的参数，所以：

- `model.expression('exp_cry01.exp3')` 应用后，下一帧 idle 曲线就把眼睛写回 1 → 闭眼失效；
- 停掉 motion 后 `eyeBlink` 又接管（pixi 源码：`if (!motionUpdated) this.eyeBlink.updateParameters(...)`）；
- 唯一稳的写入点是 `internalModel.on('beforeModelUpdate')`，它在 motion / expression / eyeBlink 之后。

### 3.2 正确写法

表情不交给 `expressionManager`，而是转成「参数目标表」自己写：

```ts
// 1) 构建期把 exp3 转成参数表 → app/public/model/tomori/expressions.json
//    { Name, FadeInTime, FadeOutTime, Params: { ParamEyeLOpen: 0, ... } }   // 每条 63 个参数
// 2) 切换表情只改目标表，不调 model.expression()
// 3) 每帧在 beforeModelUpdate 里按 FadeInTime 插值写入 —— 最后写入 = 最高优先级
```

两个 pixi 0.4 的坑：

- `internalModel.parameters` **不存在**，参数 id 表要读 `coreModel._parameterIds`；
- 表情参数里有 15 个本模型没有（`ParamTear2` `ParamTears0~3` `ParamPale` `ParamFaceshadow`
  `ParamSweat` `ParamEmo1~4` `ParamFaceEyeOff` `Param_thinking_eyeeyebrows2/3` 等），写入前要过滤。

### 3.3 效果对照（实测）

| 表情 | 观感 |
|---|---|
| `exp_cry01` | 闭眼 + 八字眉 + 腮红，**像在忍哭**（本模型无泪珠贴图，没有眼泪） |
| `exp_smile02` | 弯月笑眼 + 大片腮红，**最讨喜** |
| `exp_angry01` | 瞪眼 + 怒眉 + 张嘴，辨识度最高 |
| `exp_sad01` | 八字眉 + 眼半睁，偏「委屈」，强度弱（依赖缺失的泪珠） |

---

## 4. 降级组合（手搭参数，没有 exp3 时用）

对应截图为 `docs/shots/` 下的文件，同一机位、同一亮度。

| 情绪 | 参数组合 | 截图 | 实际观感 |
|---|---|---|---|
| `neutral` | 全默认（idle 在播） | `neutral.png` | 平视、圆眼、平嘴 |
| `smile` | `ParamEyeLSmile=0.7, ParamEyeRSmile=0.7, Param_smile_eyebrows=1, ParamMouthForm=0.8, ParamCheek=0.4` | `smile.png` | **弯月笑眼**很明显，眉毛变柔和，嘴角略上 |
| `angry` | `Param_angry_eyebrows=1, ParamMouthForm=-1` | `angry.png` | 眉毛压低内收（有效），嘴形变化很弱 |
| `sad` | `Paramsad=1, Param_sad_eyebrows=1, ParamEyeLOpen=0.7, ParamEyeROpen=0.7` | `sad.png` | 八字眉 + 眼睛变小，凑合；**眼泪参数没生效** |
| `surprised` | `Paramsurprised_01=1, ParamEyeLOpen=1.3, ParamEyeROpen=1.3, ParamMouthOpenY=0.6` | `surprised.png` | **瞪眼 + 张嘴**辨识度最高 |

---

## 5. 已知的坑

1. **exp3 必须走表情层**：直接 `model.expression()` 会被 idle motion 覆盖（见 3.1）。
2. **`ParamMouthForm` 几乎无效**：嘴形主要靠 `ParamMouthOpenY` 开合，想表达「撇嘴」
   得靠头角度 + 眉毛，或者干脆不做。
3. **本模型没有泪珠贴图**：哭泣只能用「闭眼 + 八字眉 + 腮红」（即 cry01 的参数），眼泪做不出来。
4. **idle motion 会写 `ParamAngleX/Y/Z`、`ParamBreath`**：想强制某个头角度，要在
   `beforeModelUpdate` 里覆盖，且注意 motion 可能每帧重设（实测我的覆盖是生效的，
   因为 pixi 的 `beforeModelUpdate` 在 motion 之后）。
5. **没有 physics3**：头发完全不动的话非常假，务必自己写跟随。

---

## 6. 落在项目里的方式

- 这张映射表属于**引擎侧资产**，跟具体模型绑定，放在 `model/<name>/params.md` 或本文档。
- 角色卡（`docs/PLAN.md` 的 `amadeus.character-card` v1）只写**粗维度**：
  `{ emotion: "angry", intensity: "high" }` → 引擎查这张表拿到表情名/参数。
- 换模型 = 重写这张表，角色卡不动。这是把「模型适配」和「角色人格」解耦的关键。

## 7. 还没做的

- [ ] `hand_R_01` ~ `hand_R_10` 逐个截图，建手势索引
- [ ] 头发/裙子跟随（照鲸语 `applyIdle` 移植）
- [ ] 眼睛抖动组参数（`ShakingX` 等）的语义
- [ ] 9 段 motion 的语义标注（哪段适合当「点头」「转身」）
- [ ] 表情强度分级（现在只有 0/1，需要按 intensity 缩放参数组）
