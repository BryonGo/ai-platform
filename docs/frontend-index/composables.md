# 组合式函数方法索引（最重要）

<!-- BEGIN GENERATED:composables -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

本文件列出 `app/composables/` 下每个文件的导出符号，以及返回对象型组合式函数（`useXxx()` / `createXxx()`）的**全部成员**。
只需要一个符号时不要整份读：`node scripts/gen-frontend-index.mjs --grep <关键词>`。

## app/composables/useAdultGate.ts
- 导出函数/常量：`useAdultGate()` L38
- 导出类型 1 个 → 字段见 `types.md`（`AdultGateStatus`）

### `useAdultGate()` — L38 · 返回 8 个成员
- `status` · L40 · ref `useState<AdultGateStatus>` — useState：SSR 与客户端共享同一份状态，且页面间不重复请求
- `loaded` · L41 · ref `useState<boolean>`
- `pending` · L42 · ref `useState<boolean>`
- `error` · L43 · ref `useState<string>`
- `refresh()` · L46 · `/platform/age/status` — 拉取服务端口径
- `confirm()` · L59 · `/platform/age/confirm` — 一键确认已满 18 岁
- `setAdultMode(enabled: boolean)` · L74 · `/account/adult-mode` — 开启/关闭成人内容显示
- `reset()` · L91 · `/platform/age/reset` — 清除本浏览器的入口确认（换人使用 / 排查问题）

## app/composables/useApi.ts
- 导出函数/常量：`friendlyMessage(errorKey: string, fallback: string): string` L82 — friendlyMessage 取用户可读文案：优先用错误键映射，未登记的键回落到后端 message · `useAuthSession()` L93 · `apiBase(): string` L147 — apiBase 返回 API 前缀 · `siteCode(): string` L156 · `apiRequest<T = unknown>(path: string, opts: { method?: string, body?: unknown, form?: FormData } = {}): Promise<T>` L161
- 导出类型 2 个 → 字段见 `types.md`（`ApiEnvelope` · `PlatformErrorDetails`）

### `useAuthSession()` — L93 · 返回 5 个成员
- `token` · L94 · ref `useState<string>`
- `uid` · L95 · ref `useState<number>`
- `load()` · L121
- `save(t: string, userId: number)` · L127
- `clear()` · L131

## app/composables/useAppVersions.ts
- 导出函数/常量：`useAppVersions()` L59 — 取版本（默认同一会话只打一次接口
- 导出类型 1 个 → 字段见 `types.md`（`BackendVersionInfo`）

### `useAppVersions()` — L59 · 返回 8 个成员 — 取版本（默认同一会话只打一次接口
- `load(force = false): Promise<void>` · L60

## app/composables/useAuthDialog.ts
- 导出函数/常量：`goLogin(): Promise<void>` L24 — 去登录页并带上来源：登录成功后回到当前页，不用重新找到原来的入口 · `useAuthDialog()` L33
- 导出类型 1 个 → 字段见 `types.md`（`AuthDialogIntent`）

### `useAuthDialog()` — L33 · 返回 4 个成员
- `open` · L34 · ref `useState<boolean>`
- `intent` · L35 · ref `useState<AuthDialogIntent>`
- `openDialog(next: AuthDialogIntent = { reason: 'account' })` · L37
- `closeDialog()` · L42

## app/composables/useAutoPlayVideo.ts
- 导出函数/常量：`const vAutoPlayVideo: Directive<HTMLVideoElement, AutoPlayVideoOptions | undefined> = {` L142 — v-auto-play-video：贴在卡片里的 `<video>` 上即可 · `videoFirstFrameSrc(url: string, at = 0.1): string` L155 — 首帧地址：给 URL 挂一个媒体片段 `#t=0.1`，浏览器会 seek 到 0.1s 并把那一帧画出来 · `looksLikeVideoUrl(url: string): boolean` L166 — 判断一个地址是不是视频（管理员在封面里直接填 mp4 时用）
- 导出类型 1 个 → 字段见 `types.md`（`AutoPlayVideoOptions`）

## app/composables/useCanvasApi.ts
- 导出函数/常量：`toCanvasRun(run: ServerRun): CanvasRun` L114 — 服务端 run → 前端模型 · `toCanvasArtifact(a: ServerArtifact): CanvasArtifact` L129 — 服务端产物 → 前端模型（多带的 mediaAssetId / runId 一并带上） · `useCanvasApi()` L152
- 导出类型 7 个 → 字段见 `types.md`（`CanvasGraphSummary` · `CanvasTemplateItem` · `ServerRun` · `ServerArtifactItem` · `ServerArtifact` · `CanvasGraphView` …）

### `useCanvasApi()` — L152 · 返回 18 个成员
- `listTemplates(): Promise<CanvasTemplateItem[]>` · L159 · `/canvas/template/list` — 本站**运营下发的模板**（只读）
- `toTemplateInfos(items: CanvasTemplateItem[]): CanvasTemplateInfo[]` · L173 — 站点模板 → 起始面板要的模型
- `getTemplate(id: string): Promise<{ id: string, graph: CanvasGraph | null }>` · L183 · `/canvas/template/detail?id=…` — 取一条运营模板的结构（套用）
- `listGraphs(product = '', owner: { type?: string, id?: string } = {}): Promise<CanvasGraphSummary[]>` · L196 · `/canvas/graph/list…` — 列图
- `getGraph(id: string): Promise<{ summary: CanvasGraphSummary, graph: CanvasGraph, runs: CanvasRun[], artifacts: CanvasArtifact[] }>` · L215 — 一次拿全：图 + runs + artifacts（全部转成前端模型）
- `saveGraph(in_: { id?: string, title: string, product?: string, ownerType?: string, ownerId?: string, graph: CanvasGraph, revision?: number, deletedNodeIds?: string[], deletedEdgeIds?: string[] }): Promise<CanvasGraphSummary>` · L237 — 新建（id 为空）或保存整张图
- `deleteGraph(id: string): Promise<unknown>` · L270 · `/canvas/graph/del` — 软删自己的图
- `listGraphsPaged(product = '', owner: { type?: string, id?: string } = {}, page: { page?: number, size?: number, keyword?: string, sort?: string, ownerType?: string } = {}): Promise<{ list: CanvasGraphSummary[], total: number }>` · L280 · `/canvas/graph/list…` — 分页列图（「我的画布」列表页用）：带关键词与命中总数
- `renameGraph(id: string, title: string): Promise<unknown>` · L307 · `/canvas/graph/rename` — 只改标题
- `duplicateGraph(id: string, title = ''): Promise<{ graph: CanvasGraphSummary }>` · L317 · `/canvas/graph/duplicate` — 复制一张图（另存一份）
- `runPlan(id: string): Promise<CanvasPlanNode[]>` · L327 · `/canvas/run/plan?id=…` — 「运行全部」的执行计划：服务端按拓扑序算出**脏**节点，前端只负责循环
- `runNodeStream(in_: { id: string, nodeId: string, force?: boolean, baseArtifactId?: string, instruction?: string, priority?: number }, handlers: { onDelta?: (text: string) => void, onArtifact?: (payload: { run?: ServerRun, artifact?: ServerArtifact, artifacts?: ServerArtifact[], cached?: boolean }) => void, onQueued?: (payload: { run?: ServerRun }) => void, onError?: (message: string) => void }, signal?: AbortSignal): Promise<void>` · L338 · `…` — 跑一个节点：响应是 SSE 流
- `pickArtifact(in_: { id: string, nodeId: string, slot: string, artifactId: string, item?: number }): Promise<number>` · L407 — 选定产物版本（写进图 JSON 并推进 revision，返回新 revision）
- `reviewArtifact(in_: { id: string, artifactId: string, review: CanvasReview }): Promise<unknown>` · L427 — 审核产物（approved / rejected / pending）
- `delArtifact(in_: { id: string, artifactId: string }): Promise<unknown>` · L439 · `/canvas/artifact/del` — 删产物（被选定的不允许删 —— 要删先改选）
- `saveArtifact(in_: { id: string, nodeId: string, slot: string, type?: string, rows?: unknown, text?: string, note?: string }): Promise<ServerArtifact>` · L447 — 手工改完存新版本（分镜表逐行编辑）
- `subscribeEvents(onEvent: (event: string, data: Record<string, unknown>) => void, signal: AbortSignal): Promise<void>` · L479 · `…` — 订阅平台事件流（`/platform/events`）：任务完成/失败时刷新整图
- `exportNode(in_: { id: string, nodeId: string }): Promise<{ exportId: string, status: string, total: number, failures?: string[] }>` · L495 — 导出节点运行（打包成 ZIP，异步）

## app/composables/useCanvasHistory.ts
- 导出函数/常量：`useCanvasHistory(opts: { graph: Ref<CanvasGraph>, artifacts: Ref<CanvasArtifact[]>, selectedId: Ref<string>, toast: (text: string) => void, remeasure: () => void })` L22
- 导出类型 1 个 → 字段见 `types.md`（`CanvasSnapshot`）

## app/composables/useCanvasRows.ts
- 导出函数/常量：`useCanvasRows(opts: { graph: Ref<CanvasGraph>, artifacts: Ref<CanvasArtifact[]>, toast: (text: string) => void })` L15

## app/composables/useCanvasSlots.ts
- 导出函数/常量：`useCanvasSlots()` L15

### `useCanvasSlots()` — L15 · 返回 4 个成员
- `activeSlots` · L16 · ref
- `activeSlotOf(node: CanvasNode): string` · L19 — 这个节点当前看的是哪一口（记过就用记的，否则该类型声明的第一口）
- `setActiveSlot(nodeId: string, slot: string): void` · L26
- `clearSlots(): void` · L32 — 换图（新建 / 套模板 / 打开另一张）时清掉：记的是上一张图里某个节点的槽位

## app/composables/useChatStudio.ts
- 导出函数/常量：`createChatStudio()` L144 · `provideChatStudio()` L1467 · `splitNegativePrompt(text: string)` L1484 — splitNegativePrompt 把用户写在正向提示词里的「负面词 …」拆出来 · `useChatStudio()` L1496
- 导出类型 6 个 → 字段见 `types.md`（`StudioStatus` · `StudioAsset` · `RunMeta` · `StudioAttachment` · `StudioMessage` · `ChatStudio`）

### `createChatStudio()` — L144 · 返回 84 个成员
- **输入器状态**
  - `mode` · L153 · ref `ref<ComposerMode>`
  - `imageRefFirstFrame` · L162 · computed `computed` — `@` 图引用是否按「首帧 + 参考图」编号（视频模式）
  - `tools` · L169 · composable `useToolCatalog` — 前端只认 code：提示词预置、LoRA 文件名、工作流名都由后端从库里取并在建任务时 冻结进快照
  - `activeTool` · L170 · ref `ref<string>`
  - `activeTemplate` · L171 · ref `ref<string>`
  - `toolInfo` · L172 · computed `computed`
  - `toolTemplates` · L173 · computed `computed`
  - `toolNeedsImage` · L175 · computed `computed` — 该工具是否需要先选图（决定引用区是否显示、以及能否发送）
  - `setTool(code: string)` · L178 — 切换工具：连带把模式切到工具所属类别，并清掉不适用的模板
  - `setTemplate(code: string)` · L185
  - `promptModel` · L190 · ref `ref<Prompt>` — 提示词：结构化 parts（@角色/@服装/@背景/@姿势/@画风 插入 snippet 节点）， 提交任务时用 promptText() 取纯文本（与旧创…
  - `prompt` · L199 · computed `computed` — 提交用的纯文本
  - `ratio` · L202 · ref `ref` — 初始画幅：手机竖屏
  - `count` · L203 · ref `ref`
  - `resolution` · L205 · ref `ref` — 输出分辨率：1K / 2K（即梦口径）
  - `seconds` · L206 · ref `ref`
  - `modelId` · L207 · ref `ref`
  - `characterId` · L208 · ref `ref`
  - `references` · L215 · ref `ref<StudioReference[]>`
  - `catalog` · L216 · ref `ref<Catalog | null>`
  - `characters` · L217 · ref `ref<CharacterItem[]>`
  - `notice` · L218 · ref `ref`
  - `duplicate` · L226 · ref `ref<{ existing: StudioMessage, dims: string[], meta: RunMeta, text: string } | null>` — 重复提交确认（参考图面板 03 / 交接文档 G3 第二层）
  - `selectedLoras` · L232 · ref `ref<{ id: string, weight: number }[]>` — 已选 LoRA（提交时进 createTask.loras）
  - `loraOptions` · L233 · computed `computed`
  - `sampling` · L251 · ref `ref<{ steps: number, sampler: string, scheduler: string, cfg: number } | null>` — 采样参数：只在所选模型真的支持时（catalog.models[].sampling）才有值
  - `modelOptions` · L253 · computed `computed`
  - `selectedModel` · L254 · computed `computed`
  - `supportedQualities` · L268 · computed `computed<string[]>`
  - `supportedCloudRatios` · L277 · computed `computed<string[]>`
  - `sizeOptions` · L288 · computed `computed<{ ratio: string, size: string }[]>` — 画幅选项（比例 + 该档位下的像素尺寸）
  - `sizeLabel` · L316 · computed `computed` — 面板「分辨率」那一行：当前比例（× 清晰度）= 多少像素
  - `durationList` · L321 · computed `computed`
  - `selectedCharacter` · L322 · computed `computed`
  - `countMax` · L350 · computed `computed` — 数量上限：云端模型声明的 capabilities.maxOutputs（后台可配）
  - `referenceMax` · L428 · computed `computed` — 参考图上限：跟模型能力走
  - `referenceRoles` · L445 · computed `computed<string[]>` — 这一镜是否有"首帧之外"的角色分配
  - `referenceAllowed` · L450 · computed `computed`
  - `referenceCount` · L451 · computed `computed`
  - `canAddReference` · L452 · computed `computed`
  - `referenceOverflow` · L461 · computed `computed` — 已选参考图超过当前模型上限
  - `quote` · L463 · computed `computed`
  - `costText` · L468 · computed `computed`
  - `canSend` · L472 · computed `computed` — 超限时不许发：先把"图比模型能收的多"这件事解决掉（换模型或删图）
  - `sendBlockReason` · L488 · computed `computed` — 不能发时用一句人话说明还缺什么（按钮 title 与输入区提示共用，避免只说"发不了"）
- **会话与消息**
  - `sessions` · L499 · ref `ref<SessionItem[]>`
  - `sessionsLoading` · L500 · ref `ref`
  - `sessionQuery` · L501 · ref `ref`
  - `activeSessionId` · L502 · ref `ref<string>`
  - `historyLoading` · L503 · ref `ref`
  - `messages` · L504 · ref `ref<StudioMessage[]>`
  - `ready` · L505 · ref `ref`
  - `filteredSessions` · L507 · computed `computed`
  - `groupedSessions` · L514 · computed `computed` — 按「今天 / 昨天 / 更早」分组，供历史侧栏使用
  - `activeSession` · L531 · computed `computed`
  - `runningMessages` · L534 · computed `computed` — 当前会话中仍在跑的任务（顶部概况与状态问答都读它）
  - `runningTask` · L535 · computed `computed`
  - `previewOpen` · L538 · ref `ref` — 产物面板：默认跟随最后一条有产物的任务
  - `previewIndex` · L540 · ref `ref`
  - `previewMessage` · L542 · computed `computed`
  - `previewAssets` · L547 · computed `computed`
  - `previewAsset` · L548 · computed `computed`
  - `openPreview(messageId: string, index = 0)` · L550
- **数据加载**
  - `refreshAssetUrls()` · L630 — 重新解析当前会话里已展示产物的签名地址（预签名过期自愈用）
  - `openSession(id: string)` · L670 — 打开历史会话：分页读完整任务并重建消息
  - `newSession()` · L748
  - `renameSession(id: string, title: string)` · L774
  - `archiveSession(id: string)` · L781 — 归档语义：后端是归档，不是物理删除（交接文档：不要伪装成删除、不级联删资产）
- **生成**
  - `uploadReference(file: File)` · L799
  - `addReferenceFiles(files: File[])` · L817 — 追加参考图（多选时一次多张）
  - `addReferenceFromAsset(asset: StudioAsset, name = '素材')` · L834 — 素材库选图 / 「继续修改」：沿用它的 assetId，不重复上传
  - `setReferenceFromAsset(asset: StudioAsset)` · L844 — 把已有产物设为下一步的引用对象（「继续修改」/「生成视频」用）—— 单张语义，替换整组
  - `removeReference(index: number)` · L849
  - `clearReferences()` · L855
  - `statusLabel(status?: StudioStatus)` · L878
  - `confirmDuplicate()` · L1003 — 用户确认「仍要再次生成」：用**新的 clientKey** 建任务（确认后再次生成是合法新任务）
  - `dismissDuplicate()` · L1011 — 取消确认：不建任务、不扣款，描述仍在输入框里
  - `viewDuplicate()` · L1016 — 「查看已有任务」：直接打开该任务的产物，不做任何新提交
  - `send()` · L1024
  - `cancel(message: StudioMessage)` · L1231
  - `retry(message: StudioMessage)` · L1249
- **初始化**
  - `init(opts: { withSessions?: boolean } = {})` · L1378 — @param opts.withSessions=false 只准备输入器（首页用法）：不读会话列表、不重建消息、 也不消费草稿 —— 首页只负责把这次输入…

### `useChatStudio()` — L1496 · 返回 1 个成员
- `studio` · L1497 · value `inject`

## app/composables/useComposerDraft.ts
- 导出函数/常量：`useComposerDraft()` L41
- 导出类型 1 个 → 字段见 `types.md`（`ComposerDraft`）

### `useComposerDraft()` — L41 · 返回 2 个成员
- `setDraft(d: ComposerDraft)` · L42
- `takeDraft()` · L46

## app/composables/useGlowPointer.ts
- 导出函数/常量：`useGlowPointer()` L3 — 互动鎏光的指针跟随：把指针位置写进 --mx/--my，样式层再用径向渐变画亮点

### `useGlowPointer()` — L3 · 返回 1 个成员 — 互动鎏光的指针跟随：把指针位置写进 --mx/--my，样式层再用径向渐变画亮点
- `onGlowPointerMove(event: PointerEvent)` · L4

## app/composables/useHougongApi.ts
- 导出函数/常量：`useHougongApi()` L987
- 导出类型 73 个 → 字段见 `types.md`（`AuthResult` · `AppearanceItem` · `OutfitItem` · `ActorTaxonomy` · `ActorMediaSlot` · `ActorMediaSlotKey` …）

### `useHougongApi()` — L987 · 返回 109 个成员
- `login(email: string, password: string, turnstileToken?: string): Promise<AuthResult>` · L995 · `/account/auth/login` — 登录只认邮箱（后端口径，2026-09）：用户名是自动生成、可自行修改的展示名， 不再作为登录标识，所以这里发的字段就是 email，而不是过去的 acco…
- `register(input: { email: string, password: string, turnstileToken?: string }): Promise<AuthResult>` · L1013 · `/account/auth/register` — 邮箱注册
- `getProfile(): Promise<ProfileInfo>` · L1030 · `/account/profile` — 当前账号信息（用户名/邮箱/展示名）
- `updateUsername(username: string): Promise<{ username: string, nickname: string }>` · L1038 · `/account/profile/edit` — 改用户名
- `logout()` · L1045
- `listCharacters(): Promise<CharacterItem[]>` · L1049
- `getCharacter(id: string | number): Promise<CharacterItem>` · L1054
- `createCharacter(input: CharacterInput): Promise<CharacterItem>` · L1061 — 角色创建/更新（字段对齐后端 CharacterInputData
- `updateCharacter(id: number | string, input: CharacterInput): Promise<CharacterItem>` · L1066
- `setCharacterCover(id: number | string, assetId: number | string): Promise<CharacterItem>` · L1072 — 指定 / 清除角色封面（assetId=0 恢复自动：取最近作品产物），返回更新后的角色
- `deleteCharacter(id: number | string): Promise<void>` · L1082 · `/hougong/characters/…` — 删除角色：后端软删
- **演员库（平台演员，只读；收藏与复制到我的演员）**
  - `listActors(q: ActorListQuery = {}): Promise<ActorListResult>` · L1097 · `/hougong/actors…` — 平台演员列表
  - `getActor(id: string | number): Promise<ActorDetail>` · L1112 · `/hougong/actors/…` — 平台演员详情：actor + media + outfits + voice + 当前账号是否收藏
  - `favoriteActor(id: string | number, favorite = true): Promise<{ favorited: boolean }>` · L1118 · `/hougong/actors/…` — 收藏（POST）/ 取消收藏（DELETE）平台演员，返回操作后的收藏态
  - `cloneActor(id: string | number): Promise<{ characterId: string }>` · L1127 · `/hougong/actors/…` — 把平台演员复制到「我的演员」，返回新建的角色 id（雪花字符串）
- **演员资产生成（actor-generation）**
  - `startActorGeneration(characterId: string | number, input: ActorGenStartInput): Promise<ActorGenRun>` · L1141 · `/hougong/characters/…` — 发起一次生成运行（会创建 4 个 t2i 任务，可能产生费用）
  - `getLatestActorGeneration(characterId: string | number): Promise<ActorGenRun | null>` · L1157 · `/hougong/characters/…` — 该角色最近一次运行
  - `getActorGeneration(characterId: string | number, runId: string): Promise<ActorGenRun>` · L1163 · `/hougong/characters/…` — 指定运行的状态（轮询用）
  - `retryActorGeneration(characterId: string | number, runId: string): Promise<ActorGenRun>` · L1171 · `/hougong/characters/…` — 只对失败的 role 重试（逐 role、各自计费）
  - `listWorks(): Promise<WorkItem[]>` · L1180 · `/hougong/works`
  - `getHougongWork(id: string | number): Promise<WorkItem>` · L1186 · `/hougong/works/…` — 后宫作品详情/收藏（与 /platform/work 的发布作品区分开）
  - `favoriteHougongWork(id: string | number, favorite: boolean): Promise<WorkItem>` · L1190 · `/hougong/works/…`
  - `deleteHougongWork(id: string | number): Promise<void>` · L1194 · `/hougong/works/…`
  - `listStories(): Promise<StoryItem[]>` · L1198 · `/hougong/stories`
  - `getHougongStory(id: string | number): Promise<StoryItem>` · L1203 · `/hougong/stories/…`
  - `updateStoryClips(id: string | number, clips: { workId: number, order: number, note: string }[]): Promise<StoryItem>` · L1208 · `/hougong/stories/…` — 整理片段：全量替换（按数组顺序重排 order
- **集（画布·集）：画布按 ownerType=episode 挂图，集本身由产品管**
  - `listEpisodes(storyId: string | number): Promise<EpisodeItem[]>` · L1213 · `/hougong/stories/…`
  - `createEpisode(storyId: string | number, body: { idx?: number, title?: string } = {}): Promise<EpisodeItem>` · L1219 · `/hougong/stories/…` — 新建一集：`idx` 不传 = 服务端取"这一故事下一个"，`title` 空 = "第 N 集"
  - `updateEpisode(id: string | number, body: { title?: string, status?: string, budgetCredits?: number }): Promise<EpisodeItem>` · L1224 · `/hougong/episodes/…` — 改一集：只改给到的字段（改名不会把状态退回 todo）
  - `deleteEpisode(id: string | number): Promise<void>` · L1228 · `/hougong/episodes/…`
  - `listTasks(): Promise<HougongTask[]>` · L1232 · `/hougong/tasks`
  - `wallet(): Promise<{ balance: number, holds: number }>` · L1237 · `/account/credits`
  - `listTools(): Promise<ToolCatalogItem[]>` · L1249 · `/hougong/tools` — 创作工具目录（本站已启用的工具与模板）
  - `getCatalog(includeUnavailable = false): Promise<Catalog>` · L1254 · `/platform/catalog…`
  - `optimizePrompt(prompt: string, modelId: string): Promise<string>` · L1259 · `/hougong/prompt/optimize`
  - `translatePrompt(prompt: string, target = 'en'): Promise<string>` · L1264 · `/hougong/prompt/translate`
  - `uploadAsset(file: File): Promise<{ assetId: string, width: number, height: number, mimeType: string }>` · L1272 · `/platform/asset` — 上传资产
  - `createTask(input: { clientKey: string, type: string, prompt: string, negativePrompt?: string, ratio?: string, width?: number, height?: number, count?: number, durationSeconds?: number, seed?: number, sampling?: { steps: number, sampler: string, scheduler: string, cfg: number, denoise?: number }, loras?: { name: string, weight: number }[], modelId?: string, quality?: string, engine?: string, characterId?: string, refAssetIds?: string[], tool?: string, template?: string }): Promise<HougongTask>` · L1281
  - `getTask(id: number | string): Promise<HougongTask>` · L1307 · `/hougong/tasks/…`
  - `cancelTask(id: number | string): Promise<{ status: string }>` · L1311 · `/hougong/tasks/…`
  - `retryTask(id: number | string, clientKey: string): Promise<{ id: number, status: string }>` · L1318 · `/hougong/tasks/…` — 重试任务
  - `createWork(input: WorkCreateInput): Promise<WorkItem>` · L1322 · `/hougong/works`
  - `setWorkVisibility(id: number | string, visibility: 'private' | 'unlisted' | 'public', contentRating?: 'sfw' | 'r15' | 'r18'): Promise<WorkItem>` · L1327 · `/hougong/works/…` — 修改作品可见性（可选一并改分级）
- **生成会话（workspace）**
  - `listSessions(page = 1, pageSize = 20): Promise<SessionItem[]>` · L1339 · `/platform/session?page=…`
  - `createSession(title?: string): Promise<SessionItem>` · L1343 · `/platform/session`
  - `getSession(id: string): Promise<SessionItem>` · L1347 · `/platform/session/…`
  - `renameSession(id: string, title: string): Promise<SessionItem>` · L1350 · `/platform/session/…`
  - `archiveSession(id: string): Promise<SessionItem>` · L1353 · `/platform/session/…`
  - `listSessionTasks(id: string, page = 1, pageSize = 20): Promise<HougongTask[]>` · L1356 · `/platform/session/…`
- **快捷词（snippet）**
  - `snippetCategories(): Promise<SnippetCategory[]>` · L1362 · `/platform/snippet/categories`
  - `snippetList(input: { category: string, subcategory?: string, query?: string, cursor?: string, limit?: number }): Promise<{ items: SnippetItem[], nextCursor?: string }>` · L1366 · `/platform/snippet…`
- **资产库（asset）**
  - `listAssets(q: { hidden?: boolean, kind?: string, origin?: string, scope?: 'all' | 'permanent' | 'temp', keyword?: string, sort?: 'new' | 'old' | 'large', duplicates?: boolean, page?: number, pageSize?: number } = {}): Promise<{ items: AssetItem[], total: number }>` · L1384 — 资产库列表
  - `batchAssets(ids: string[], action: 'delete' | 'hide' | 'unhide'): Promise<{ ok: boolean, affected: number, failed: { id: string, reason: string }[] }>` · L1422 · `/platform/asset/batch` — 批量操作资产（删除/隐藏/恢复）
  - `dedupeAssets(dryRun = false): Promise<{ groups: number, deleted: number, kept: number, mergedTasks?: number }>` · L1435 — 清理重复素材（同内容多行）
  - `removeAsset(id: string): Promise<void>` · L1444 · `/platform/asset/…`
  - `setAssetHidden(id: string, hidden: boolean): Promise<void>` · L1447 · `/platform/asset/…`
  - `saveAsset(id: string): Promise<AssetItem>` · L1456 · `/platform/asset/…` — saveAsset 把临时生成产物「保存到我的资产」：后端把 scope 置为 permanent（幂等）
  - `assetSelect(page = 1, pageSize = 20): Promise<AssetChoice[]>` · L1460 · `/platform/asset/select?page=…`
  - `assetSelectByIds(ids: string[]): Promise<AssetChoice[]>` · L1464 · `/platform/asset/selectByIds`
  - `assetDownloadUrl(id: string): Promise<{ url: string, expiresAt: string }>` · L1472 · `/platform/asset/…` — assetDownloadUrl 取资产的原图下载地址（签发限时 URL）
- **导出（工程包）**
  - `createExport(items: { assetId: string, relPath?: string }[], sourceKind?: string, sourceId?: string): Promise<{ exportId: string }>` · L1479 · `/platform/export` — 把一组资产按 relPath 打成 ZIP，**异步**执行：创建后轮询 getExport 到 succeeded， 再取 downloadUrl
  - `getExport(id: string): Promise<{ found: boolean, task?: ExportTask }>` · L1489 · `/platform/export/…`
  - `listExports(page = 1, pageSize = 20): Promise<ExportTask[]>` · L1492 · `/platform/export?page=…`
- **发布（work/post/comment/tag/report）**
  - `listWorksFeed(page = 1, pageSize = 20, scope: 'explore' | 'owned' | 'favorites' = 'explore'): Promise<{ items: PublicationWork[], total: number }>` · L1505 · `/platform/work?scope=…` — 作品流（灵感广场）
  - `getWork(id: string): Promise<PublicationWork>` · L1515 · `/platform/work/…`
  - `getWorkEditor(id?: string | number): Promise<WorkEditor | null>` · L1525 · `/platform/work/edit…` — 取作品编辑器（缺省 id 取当前草稿，可能为 null）
  - `saveWorkDraft(input: WorkSaveInput): Promise<WorkEditor | null>` · L1536 · `/platform/work/edit` — 保存作品草稿（不发布）
  - `publishWork(id?: string | number): Promise<PublicationWork>` · L1552 · `/platform/work/publish` — 发布作品（缺省 id 发布当前草稿），返回发布后的作品详情（含 coverUrl）
  - `unpublishWork(id: string | number): Promise<void>` · L1558 · `/platform/work/…` — 取消发布（published → unpublished）
  - `setWorkHidden(id: string | number, hidden: boolean): Promise<void>` · L1563 · `/platform/work/…` — 隐藏/恢复作品（作者本人或管理员）
  - `deleteWork(id: string | number): Promise<void>` · L1568 · `/platform/work/…` — 删除作品
  - `listMyPublishedWorks(page = 1, pageSize = 20): Promise<{ items: PublicationWork[], total: number }>` · L1573 — 我发布的作品（scope=owned，含草稿/未发布/隐藏状态）
  - `listPosts(page = 1, pageSize = 20): Promise<PublicationPost[]>` · L1577 · `/platform/post?page=…`
  - `listComments(targetKind: string, targetId: string): Promise<PublicationComment[]>` · L1581 · `/platform/comment?targetKind=…`
  - `createComment(input: { targetKind: string, targetId: string, content: string, parentId?: string }): Promise<PublicationComment>` · L1585 · `/platform/comment`
  - `react(input: { targetKind: string, targetId: string, kind: string }): Promise<void>` · L1588 · `/platform/interaction/reaction`
  - `searchTags(query: string): Promise<PlatformTag[]>` · L1591 · `/platform/tag/search?query=…`
  - `createTag(name: string): Promise<PlatformTag>` · L1595 · `/platform/tag` — 创建标签（POST /platform/tag）
  - `report(input: { targetKind: string, targetId: string, reason: string, detail?: string }): Promise<void>` · L1598 · `/platform/report`
- **经济（wallet/invite/membership/checkout/transaction/creator）**
  - `walletBalance(): Promise<EconomyWallet>` · L1603 · `/platform/economy/wallet`
  - `claimDaily(): Promise<EconomyWallet>` · L1606 · `/platform/economy/wallet/claim`
  - `walletLedger(asset?: string, kind?: string, page = 1, pageSize = 20): Promise<WalletLedgerItem[]>` · L1609 · `/platform/economy/wallet/ledger…`
  - `invite(): Promise<Invite>` · L1616 · `/platform/economy/invite`
  - `membership(): Promise<Membership>` · L1619 · `/platform/economy/membership`
  - `creator(): Promise<Creator>` · L1622 · `/platform/economy/creator`
  - `submitCreator(input: { direction: string, statement: string, workIds: string[], agreed: boolean }): Promise<Creator>` · L1625 · `/platform/economy/creator/submit`
  - `modelCreator(): Promise<ModelCreator>` · L1628 · `/platform/economy/model-creator`
  - `submitModelCreator(input: { platform: string, profileUrl: string, resourceUrls: string[], agreed: boolean }): Promise<ModelCreator>` · L1631 · `/platform/economy/model-creator/submit`
  - `listTransactions(page = 1, pageSize = 20): Promise<Transaction[]>` · L1634 · `/platform/economy/transaction?page=…`
  - `checkoutCreate(purchase: { kind: string, yuan?: number, tier?: string, choice?: string }, clientKey = 'web-' + Date.now()): Promise<Purchase>` · L1638 · `/platform/economy/checkout`
  - `checkoutGet(id: string): Promise<Purchase>` · L1641 · `/platform/economy/checkout/…`
- **通知（notification）**
  - `unreadNotifications(): Promise<number>` · L1646 · `/platform/notification/unread`
  - `listNotifications(page = 1, pageSize = 20): Promise<NotificationItem[]>` · L1650 · `/platform/notification/list?page=…`
  - `markNotificationsRead(notificationIds?: string[], all = false): Promise<void>` · L1654 · `/platform/notification/mark-read`
- **模型（model：目录 + 我的模型 + 发布）**
  - `modelList(input: { type?: string, family?: string, category?: string, cursor?: string, limit?: number } = {}): Promise<{ items: ModelListItem[], nextCursor?: string }>` · L1659 · `/platform/model/list…`
  - `modelGet(id: string): Promise<ModelDetail>` · L1668 · `/platform/model/get?id=…`
  - `modelFacets(): Promise<ModelFacets>` · L1671 · `/platform/model/facets`
  - `mineModels(state?: string, cursor?: string, limit = 50): Promise<{ items: MineListItem[], nextCursor?: string }>` · L1674 · `/platform/model/mine/list…`
  - `mineModel(id: string): Promise<MineModel>` · L1680 · `/platform/model/mine/get?id=…`
  - `createModel(): Promise<MineModel>` · L1683 · `/platform/model/create`
  - `saveModel(id: string, draft: ModelDraftInput): Promise<MineModel>` · L1686 · `/platform/model/save`
  - `submitModel(id: string): Promise<MineModel>` · L1689 · `/platform/model/submit`
  - `withdrawModel(id: string): Promise<MineModel>` · L1692 · `/platform/model/withdraw`
  - `setModelHidden(id: string, hidden: boolean): Promise<MineModel>` · L1695 · `/platform/model/setHidden`
  - `removeModel(id: string): Promise<void>` · L1698 · `/platform/model/remove?id=…`
  - `modelCatalog(input: { type?: string, family?: string, category?: string } = {}): Promise<{ items: ModelListItem[] }>` · L1702 · `/platform/model/catalog…` — 模型目录（公开，按类型/族/分类过滤）
  - `prepareModelFile(modelId: string, name: string, bytes: number): Promise<{ id: string, url: string, expiresAt: string }>` · L1713 · `/platform/model/file/prepare` — prepareModelFile 模型文件上传第一步：后端签发限时 PUT 地址
  - `completeModelFile(modelId: string): Promise<{ ok: boolean }>` · L1717 · `/platform/model/file/complete` — completeModelFile 模型文件上传收尾（后端校验对象确实落地后置 ok）
  - `subscribeTaskEvents(onEvent: (event: string, data: Record<string, unknown>) => void): ()` · L1730 — subscribeTaskEvents 订阅平台任务事件流（GET /api/v1/platform/events，产品中立 SSE）

## app/composables/useIsNarrow.ts
- 导出函数/常量：`useIsNarrow(query = '(max-width: 640px)')` L3 — 窄屏判定：移动端要把模型/参数从 popover 换成底部面板（交互图面板 04）

## app/composables/useMediaRefresh.ts
- 导出函数/常量：`signedUrlExpiresAt(url: string): number | null` L42 — 解析签名地址的过期时刻（毫秒） · `isSignedUrl(url: string): boolean` L71 — 是不是（能解析出到期时间的）签名地址 · `signedUrlExpired(url: string, skewMs = REFRESH_SKEW_MS): boolean` L76 — 该地址是否已过期（或将在 skewMs 内过期） · `mediaRefreshEpoch(): Ref<number>` L91 — 当前是否需要刷新（给调试/测试用） · `requestMediaRefresh(reason: string): boolean` L99 — 请求一次"重新取数" · `useMediaAutoRefresh(loader: () => unknown | Promise<unknown>)` L129 — 页面把"重新取数"挂上来：媒体过期或加载失败时会被调用 · `hasExpiredMediaInDom(root: ParentNode = document): boolean` L138 — DOM 里是否已有过期的签名媒体（切回标签页时扫一遍用）

## app/composables/useModelCatalog.ts
- 导出函数/常量：`quoteImage(catalog: Catalog | null, ratio: string, count = 1): number | null` L58 — 单次生成的报价：与后端计费内核口径一致（图片按画幅，视频按时长优先、回落画幅单档） · `quoteVideo(catalog: Catalog | null, ratio: string, seconds: number): number | null` L64 · `quote(catalog: Catalog | null, mode: ComposerMode, query: PriceQuery): number | null` L73 · `quoteModel(catalog: Catalog | null, option: UserModelOption | undefined, query: PriceQuery)` L86 — 按**所选模型**报价，并返回统一单位 · `durationOptions(model: UserModelOption | undefined, catalog: Catalog | null): number[]` L137 — 该视频模型支持的时长档（秒） · `buildModelOptions(catalog: Catalog | null, mode: ComposerMode): UserModelOption[]` L152 — 构建用户可选的模型清单 · `videoSizeFor(catalog: Catalog | null, modelId: string, ratio: string): [number, number] | null` L213 — 视频输出尺寸：只认**模型自带**的分辨率表（catalog.videoModels[].resolutions） · `videoRatios(catalog: Catalog | null, modelId: string): string[]` L220 — 该视频模型支持哪些比例 · `cloudQualities(catalog: Catalog | null, modelId: string): string[]` L232 — 云端模型支持的清晰度档：来自模型行 capabilities（后台可配） · `cloudRatioOptions(catalog: Catalog | null, modelId: string, quality: string)` L250 — 云端模型在指定清晰度下支持的比例**及其像素尺寸** · `cloudDefaultQuality(catalog: Catalog | null, modelId: string): string` L265 — 后台声明的默认清晰度（为空时调用方回落到第一档） · `cloudDefaultRatio(catalog: Catalog | null, modelId: string): string` L280 — 后台声明的默认画幅（为空时调用方回落到竖屏） · `const PORTRAIT_RATIO = '9:16'` L291 — portraitFallback 竖屏兜底画幅 · `pickRatio(supported: string[], preferred: string): string` L299 — pickRatio 选默认画幅：模型声明的 → 竖屏兜底 → 支持列表第一个 · `cloudRatios(catalog: Catalog | null, modelId: string, quality: string): string[]` L307 — 云端模型在指定清晰度下支持的比例（该档没声明比例时返回空数组=不限制） · `defaultVideoModel(options: UserModelOption[]): string` L318 — 视频模式的默认模型：优先 MiniMax H3（运营主推），否则第一个可用视频模型
- 导出类型 4 个 → 字段见 `types.md`（`ComposerMode` · `ModelChannel` · `UserModelOption` · `PriceQuery`）

## app/composables/useSafeUrl.ts
- 导出函数/常量：`safeHref(url: string | undefined | null): string | undefined` L6

## app/composables/useTaskNotifier.ts
- 导出函数/常量：`useTaskNotifier()` L133 — 对外：toasts 供渲染层消费，dismissToast 供点掉

## app/composables/useToolCatalog.ts
- 导出函数/常量：`useToolCatalog()` L59 · `useToolCatalogSsr(): Promise<ReturnType<typeof useToolCatalog>>` L142 — 公开工具目录的 SSR 预取
- 导出类型 2 个 → 字段见 `types.md`（`ToolTemplate` · `ToolItem`）

### `useToolCatalog()` — L59 · 返回 11 个成员
- `tools` · L60 · ref `useState<ToolItem[]>`
- `loaded` · L61 · ref `useState<boolean>`
- `loading` · L62 · ref `useState<boolean>`
- `error` · L63 · ref `useState<string>`
- `refresh(): Promise<ToolItem[]>` · L73 — 拉取目录
- `ensure(): Promise<ToolItem[]>` · L90 — 首次进入各页面时调用：已加载过就不重复请求
- `get(code: string): ToolItem | undefined` · L95
- `byCategory(category: string): ToolItem[]` · L99
- `search(keyword: string): ToolItem[]` · L104
- `templatesOf(code: string): ToolTemplate[]` · L112
- `needsImage(code: string): boolean` · L117 — 该工具是否需要先选图（后端 input 形态决定输入面板与必填校验）

## app/composables/useTurnstile.ts
- 导出函数/常量：`useTurnstile()` L94
- 导出类型 1 个 → 字段见 `types.md`（`VerificationConfig`）

### `useTurnstile()` — L94 · 返回 10 个成员
- `required` · L98 · ref `ref` — required=true 表示本站在提交前必须拿到 token
- `ready` · L100 · ref `ref` — ready=true 表示 widget 已经渲染出来，用户可以点它
- `token` · L102 · ref `ref` — token 是 Cloudflare 回调给的凭据，提交时放进 cf-turnstile-response
- `error` · L104 · ref `ref` — error 是非阻塞提示（脚本加载失败等），不挡页面其它内容
- `siteKey` · L106 · ref `ref` — siteKey 供模板绑定 `data-sitekey`（与后台同样的声明式写法）
- `retrying` · L108 · ref `ref` — retrying 避免用户连续点击重复创建 widget
- `init()` · L184 · `/pub/verification/config`
- `reset()` · L205 — reset 提交失败后换一张新题（Cloudflare 的 token 一次性）
- `retry()` · L212 — retry 重新加载失败的脚本或重建挑战，不能让用户一直对着空白框重试提交

## app/composables/useVersionWatcher.ts
- 导出函数/常量：`useUpdateBlocker(fn: () => boolean)` L25 · `useVersionWatcher()` L46

### `useVersionWatcher()` — L46 · 返回 11 个成员
- `current` · L58 · ref `useState<string>` — 当前页面正在跑的版本（第一次探测时确立基线）
- `available` · L60 · ref `useState<string>` — 判定为"已上线的新版本"（空 = 没有）
- `lastCheckedAt` · L63 · ref `useState<number>`
- `checking` · L64 · ref `useState<boolean>`
- `dismissed` · L66 · ref `ref` — 提示条是否被用户"稍后"关掉（仅本次会话）
- `countdown` · L68 · ref `ref` — 自动刷新倒计时（秒）
- `paused` · L70 · ref `ref` — 因为正在操作而暂停自动刷新
- `check(force = false)` · L85 — 探测一次
- `reload()` · L133
- `dismiss()` · L139 — 用户点"稍后"：本次会话不再自动刷这个版本（下次进站仍会提示）
- `start()` · L177

<!-- END GENERATED:composables -->
