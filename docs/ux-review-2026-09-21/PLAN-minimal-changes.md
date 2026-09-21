# UX 评审落地方案（小改版 · 在现有代码上修）

配套文档：[产品定位与新手创作体验优化方案](./README.md)。本文件只给**实施方案**，不含代码改动。

## 0. 总原则

- **只做 P0**（文档 §10：会误导操作与费用认知的问题），P1/P2 另排期。
- **不大动结构**：不新增路由、不新增页面级组件、不改状态机；复用现有基础设施
  （`useAuthDialog` 的 `intent`、`useChatStudio` 的 computed、现有文案位与样式）。
- 改动归为三类：**① 文案替换 ② 条件/禁用逻辑 ③ 给现有 intent 加一个字段**。
- 不碰画布、不碰后端；不实现持久草稿、公共社区、链接撤销（属 P2）。

## 1. P0 逐项方案

### P0-01 登录/注册入口模式与校验统一
- 现状：`app.vue:591/598` 登录与注册都调 `openDialog({ reason: 'account' })`；
  `HgAuthDialog.vue:30-35` 的 `watch(open)` 恒把 `tab` 置为 `login`；
  弹窗注册只判非空（`HgAuthDialog.vue:61-79`），而独立注册页有密码规则 + 协议勾选
  （`register.vue:19,27-34`）。
- 改法：`AuthDialogIntent` 增加 `mode?: 'login' | 'register'`；`app.vue` 两个按钮分别传 mode；
  `HgAuthDialog` 的 `watch(open)` 改为 `tab = intent.mode ?? 'login'`；
  弹窗注册复用同一密码正则（≥8 位含字母数字）与「同意条款」勾选。
- 改动面：`useAuthDialog.ts`(+1 字段)、`app.vue`(2 处传参)、`HgAuthDialog.vue`(watch + 注册表单)。**不新增组件**。

### P0-02 认证后返回原操作
- 现状：`login.vue:18`、`register.vue:41` 成功后 `navigateTo('/')`；弹窗成功后仅 `close()`。
- 改法：独立页读 `route.query.redirect` 跳回（**只放行站内以 `/` 开头**，防开放重定向）；
  从受保护页去登录时带上 `redirect=当前路径`（抽一个 `goLogin()` 收敛调用点，避免逐页改）；
  弹窗成功后若 `intent.resume` 为站内路径则 `navigateTo(resume)`，否则 `close()` 由调用方原位恢复。
- 改动面：`login.vue`、`register.vue`、`HgAuthDialog.vue`、各「跳登录」处改用 `goLogin()`。
- 注意：`useAuthDialog` 已有 `resume?` 字段，无需新增数据结构。

### P0-03 视频输入要求提前可见
- 现状：`useChatStudio.ts:1102-1104` 仅在提交时抛「请先上传首帧」；`canSend`(`:455`) 视频模式不要求首帧。
- 改法：`canSend` 增加 `mode !== 'video' || referenceCount > 0`；新增 `sendBlockReason` computed，
  绑定按钮 `title` 与输入区可见提示（复用现有 `notice` / `.tool-hint` 样式）。
- 改动面：`useChatStudio.ts`(1 个 computed + 改 canSend)、`HgChatComposer.vue`(title/提示绑定)。**不新增组件**。

### P0-04 按钮含义与收费边界统一
- 现状：`HgChatComposer.vue:512` 恒为「发送」；`landing` 变体只交接草稿(`emit submit`)，`chat` 才建付费任务。
- 改法：按 `variant` 改标签——`landing`＝「下一步：确认生成」，`chat`＝「确认生成」；
  重试/重新加载结果的措辞由 `HgTaskCard` 的 status 驱动，仅需核对文案。
- 改动面：`HgChatComposer.vue`(1 行标签) + `HgTaskCard.vue` 文案核对。零结构改动。

### P0-05 移除不实或未经核验的承诺
- 现状（逐条）：
  - `effects.vue:181` 「所有生成内容仅你可见」、`:190` 「图像自动删除」、`:191` 「私密处理」。
  - `tool/[code].vue:705` `{{ cost || 8 }}` —— 固定兜底值覆盖真实零费用。
  - `useChatStudio.ts:913` 「生成失败，积分已退回」。
  - `register.vue:66` 「20 积分免费开始」。
  - `HgAuthDialog.vue:198/263` 「当前草稿已保留」、`:268` 「当前登录态：未登录」。
  - 假链接 `href="#"`：`login.vue:82`、`register.vue:100`、`HgAuthDialog.vue:197`。
- 改法：文案替换为**可被当前能力验证**的表述（隐私/删除承诺按文档 §12 待核验，先改中性/操作化）；
  cost 行区分「缺失」与「0」（缺失→「费用待确认」+重试，0→显示 0）；退款改为「费用状态确认中」；
  删除内部状态行；`href="#"` 改真实路由或改为非链接文本。
- 改动面：纯文案 + cost 行一个三元；无结构改动。

### P0-06 修正误导入口
- 现状：`index.vue:753-762` 「更多作品」→ `/works`（个人库）；`pages/` 下**没有**公共作品列表路由。
- 改法：最小改法是**就地展开探索流**（点一下把 explore 分页拉全）或改文案为「继续加载更多」，
  不再跳个人库。（新建公共列表页超出「不大动结构」，留 P2。）
- 改动面：`index.vue`(1 处入口行为)。

### P0-07 完整反馈与草稿保护
- 现状：`useComposerDraft.ts` 为模块级 `ref`，**仅内存**、仅客户端路由跳转有效；弹窗文案却称「草稿已保留」。
- 改法：文案与实际一致——「当前输入已在本页面保留」；提交失败保留输入（抽查 `useChatStudio` 失败分支）。
  持久化草稿属 P2，不在本轮。
- 改动面：文案。

## 2. 建议分批与顺序

| 批次 | 内容 | 特点 |
| --- | --- | --- |
| A | P0-05、P0-04(标签)、P0-07、P0-06 | 纯文案/单点行为，低风险，可一起过 |
| B | P0-03、P0-01、P0-02 | 小逻辑：computed、intent 字段、redirect/resume |

每批可独立验收；先 A 后 B，避免一次动太多。

## 3. 本轮明确不做

- 画布、后端、真实报价/退款契约、默认可见性核验（文档 §12 待确认项）。
- 持久草稿、公共社区浏览、分享链接与撤销、同款复用（P2）。
- 不伪造尚未核验的能力（分享链接、同款、退款语义）。

## 4. 需确认的两点

1. **P0-05 隐私/删除口径**：默认可见性契约未核验，`effects.vue` 那三条承诺替换成什么表述？
   建议先用中性/操作化（如「完成后可预览、下载」「默认仅自己可见（以实际权限为准）」）。
2. **P0-06 入口**：接受「就地展开探索流」，还是坚持新建公共作品列表页（后者不满足小改版约束）？
