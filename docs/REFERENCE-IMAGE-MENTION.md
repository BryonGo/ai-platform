# 参考图引用（@图N）：行为、编号规则与措辞实测

日期：2026-09-15（2026-09-16 补：视频的角色编号「首帧 / 参考图N」与切模式重标）。
适用：对话创作页 `/create`（图片与视频模式共用同一个输入器）。

## 1. 它是什么

在输入框里打 `@` → 弹出「引用哪张参考图？」（列出当前已上传的参考图）→ 选中后插入
一个原子 chip「图N」。序列化进提示词时 chip 变成「参考图N」：

```
参考 @图1 的光线，@图2 的构图
→ 提交给上游的 prompt: "参考 参考图1 的光线，参考图2 的构图"
```

编号 N 的含义是**唯一**的：参考图条（输入框上方）里的第 N 张 = 提交载荷 `refAssetIds`
的第 N 项 = 后端任务 `snapshot.inputs` 的第 N 项 = 上游按顺序收到的第 N 张图。

## 2. 编号规则（与用户确认过）

- 删除某张参考图**不重编号**：删掉图2 之后，原来的图3 仍然叫图3。
- 提示词原文**不做任何替换**，不悄悄改写用户的措辞。
- 提交前若提示词里引用了已不存在的编号，提示一句就继续（不打断、不阻断提交）：

  > 提示词里的 @图2 已不存在（当前 1 张参考图），生成结果可能不符合预期。

  为什么这样定：静默重编号会悄悄改掉语义（「参考 @图2 的光线」在删图后会指向另一张图），
  而直接阻断提交又会让用户为了改一个字重来一遍。

实现位置：识别与措辞在 `app/utils/image-ref.ts`（`imageRefWording` / `imageRefLabel` /
`imageRefSnapshot` / `applyImageRefRoles` / `missingImageRefs`），提交前校验在
`app/composables/useChatStudio.ts` 的 `submitGeneration()` 开头。

### 2.1 视频是另一套编号：第 1 张是首帧（2026-09-16 补）

本地视频（MiniMax H3，`minimax-h3-fl2va`）的工作流是 `first_frame` + `ref_images.ref_image_0/1/2…`
两组**并列**输入（见 aicodcms `internal/platform/task/workflow/i2v.go`），因此：

| 图条里的第 N 张 | 上游图位 | chip / 面板标签 | 序列化进提示词的措辞 |
| --- | --- | --- | --- |
| 第 1 张 | `first_frame` | 首帧 | 首帧 |
| 第 2 张 | `ref_image_0` | 参考1 | 参考图1 |
| 第 3 张 | `ref_image_1` | 参考2 | 参考图2 |

不这样分的后果：用户写「参考图2 的姿势」，上游那一层其实把这句话套到了**第三张**上
（`ref_image_1`）—— 出图会变，但看着"也能用"，几乎查不出原因。

两点实现口径：

- 措辞在**提交时**按当前模式算（`applyImageRefRoles`），不是插入时定死：图片 ↔ 视频可以
  来回切（切模式不清空已加的图），只有提交时的模式才是这次要发给上游的身份。
- 切模式时编辑器会把已插入的 chip 重新标注（`promptEditor.vue` 的 `relabelImageRefs`，
  由 `HgChatComposer` 监听 `mode` 触发）：界面上的编号与提交时的编号必须始终是同一套。
- 用户消息里的图也标角色角标（「角色：首帧 / 参考1」，`create.vue`）——
  回头翻聊天记录时，一排缩略图也要看得出哪张是干啥的。

## 3. 上游措辞：定稿「参考图N」（有实测依据）

上游只按顺序收到几张图、看不到我们的编号，所以编号最终必须落成一句上游读得懂的话。
「第 N 张」这类指代能不能被认对，只能真实调用验证。

**2026-09-15 实测**：对照图 图1=红方块、图2=蓝圆形、图3=绿三角；提示词要求
「只画一个图形：参考图N 里的那个形状，不要画参考图1/2 里的图形」；判定标准是
画出来的图形**是否等于它该引用的那一点**（引用图2 → 必须是蓝圆形，画成红方块即失败）。

| 模型（协议） | 中文「参考图2」 | 英文 the 2nd reference image | 中文「参考图3」（传 3 张） |
| --- | --- | --- | --- |
| Seedream 5.0 Pro（`ark_image`） | ✅ 蓝圆形 | ✅ 蓝圆形 | ✅ 绿三角 |
| GPT Image 2（`openai_image`） | ✅ 蓝圆形 | ✅ 蓝圆形 | ✅ 绿三角 |
| Nano Banana 2（`openai_image`） | ✅ 蓝圆形 | ✅ 蓝圆形 | 未测 |

结论：中文「参考图N」在三家模型上都准确对号（8/8），2 图与 3 图场景均成立；
英文措辞同样成立。**因此不做按模型分化的措辞**，统一用「参考图N」。

- 换措辞只需要改 `app/utils/image-ref.ts` 的 `imageRefWording()`，
  同时改同文件的 `IMAGE_REF_RE`（两者必须同步）。
- 复现/扩展实测：`aicodcms/hack/aiword`（走平台自己的协议层与凭据，
  每次都是真实出图、会计费）：

  ```bash
  cd aicodcms
  GF_GCFG_FILE=manifest/config/config.dev.yaml go run ./hack/aiword \
    --run=seedream5pro:6b3c2d9a-3e6a-4d9a-8c8d-0f6d7a2e1001:zh
  ```

## 4. 前后端张数上限（已逐项核对一致）

| 场景 | 前端上限 | 后端 |
| --- | --- | --- |
| 云端模型参考图 | 模型 `capabilities.maxInputs`（为 0 时不显示该入口） | 建任务按 `maxInputs` 严格校验 |
| 云端模型出图张数 | 模型 `capabilities.maxOutputs` | 按 `maxOutputs` 校验 |
| 本地底模 / 工具 | 1 张 | 工作流只接一张输入图 |
| 视频（本地 comfy，MiniMax H3） | 1 + 9 = 10 张（1 首帧 + 9 参考图，`VIDEO_REF_MAX`） | `workflow.MaxRefImages = 9`，建单时超限直接拒绝 |
| 视频（云端 seedance） | 1 张（中转站未验证多图，前端先收紧） | 接口按 `inputs` 整组下发 |

## 5. 同轮一并移除的旧行为

角色 / 服装 / 背景 / 姿势 / 画风（含「成人」分类）那一级**超级标签**菜单，在图片与视频
模式都已删除：图片创作里用户要引用的是**自己传的图**，与站点远端标签库无关。
`app/components/prompt/snippetPicker.vue` 已随之下线；编辑器里的 `@` 触发改为直接
emit `open-category='imageref'`，由 `HgImageRefPicker.vue` 承载。
