# 工具函数与静态数据

<!-- BEGIN GENERATED:utils -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

纯函数、常量表与静态数据（没有响应式状态，可直接在任意上下文调用）。

## app/utils/actor.ts
- `const ACTOR_TAXONOMY_FIELDS = [` L54 — 演员结构化标签的**字段顺序与中文名**（筛选面板、创建表单、索引共用一份）
- `const ACTOR_TEMPERAMENT_KEY = 'temperament' as const` L72 — 气质：唯一的多选字段，序列化时按重复键下发
- `const ACTOR_MEDIA_SLOTS = [` L75 — 演员媒体槽位的**展示顺序与中文名**
- `const ACTOR_SORT_VALUES = ['recommended', 'newest', 'name'] as const` L84 — 合法的排序值（后端 sort 枚举）
- `serializeActorQuery(q: ActorListQuery = {}): string` L99 — 演员列表筛选 → 查询串
- `normalizeActorTaxonomy(raw: unknown): ActorTaxonomy` L123 — 结构化标签归一化：未知/空值直接丢弃（界面按「未设置」处理）
- `normalizeActorMedia(raw: unknown): ActorMedia` L172 — 媒体归一化，两种形态都认： · 数组（后端 actor/character 媒体）：`[{ kind:'portrait', assetId?, url }…
- `normalizeActorFacets(raw: unknown): ActorFacets` L273 — 分面归一化，兼容三种后端形态： · 值→数量的映射（**当前后端**）：`{ era: { ancient: 2, modern: 1 }, … }` · …
- `buildFacetLabelMap(facets: ActorFacets | null | undefined): Map<string, ActorFacetLabelMap>` L306 — 由 facets 建「维度 → (value → label)」映射，供卡片/详情把 taxonomy 的原始 code 换成中文展示名（如 `modern…
- `facetLabel(labels: Map<string, ActorFacetLabelMap> | null | undefined, dimension: string, value: string): string` L323 — 单个维度取值 → 展示名
- `const ACTOR_CHIP_LIMIT = 4` L334 — `actorTaxonomyChips` 的选项：最多显示几个维度
- `actorTaxonomyChips(taxonomy: ActorTaxonomy | null | undefined, labels: Map<string, ActorFacetLabelMap> | null | undefined, limit = ACTOR_CHIP_LIMIT): string[]` L343 — 卡片/详情标签：按 `ACTOR_TAXONOMY_FIELDS` 顺序取**前 limit 个有值**的维度， 值是 facets 的 label（取不到…
- `actorCardMedia(media: ActorMedia | null | undefined, coverUrl?: string): ActorCardMedia` L398 — 挑选卡片媒体
- `const ACTOR_CARD_ASPECT_RATIO = '4 / 3'` L420 — 卡片固定宽高比 4:3（= 参考站 420×315）
- `const ACTOR_GEN_ROLES = [` L430 — 生成 role 的**展示顺序与中文名**（与后端 ActorGenRoles 同序）
- `actorGenRoleLabel(role: string): string` L438 — role 的中文名
- `actorGenUnsupportedReason(role: string): string` L445 — 不支持的 role → 面向用户的说明（`voice` 是当前唯一的已知项）
- `actorGenStatusLabel(status: string): string` L451 — run / role 的状态中文名
- `actorGenIsTerminal(status: string): boolean` L469 — run 是否已到终态（succeeded / partial / failed）
- `actorGenRoleNeedsRetry(status: string): boolean` L475 — role 是否需要显示「重试」（仅 failed）
- `shouldContinueActorGenPolling(input: { status: string, stopped?: boolean, attempts: number, maxAttempts: number }): boolean` L485 — 轮询是否还应继续
- `actorGenSummary(run: { status: string, roles?: { status: string }[], successAssetCount?: number }): string` L497 — run 级进度文案：已完成 role 数 + 成功资产数，全部来自后端真实字段
- `normalizeActorGenRole(raw: unknown): ActorGenRole` L509 — role 条目归一化（id 一律字符串、assetIds 数组必为数组）
- `normalizeActorGenRun(raw: unknown): ActorGenRun | null` L525 — run 归一化：ID 全字符串、roles/unsupportedRoles 必为数组、状态有兜底
- `normalizeActorItem(raw: unknown): ActorItem` L552 — 演员列表条目归一化（id 一律字符串，封面从 media/cover 兜底）
- `normalizeActorOutfits(raw: unknown): ActorOutfit[]` L578 — 造型归一化（后端字段：id/outfitKey/label/sortOrder
- `normalizeActorVoice(raw: unknown): ActorVoice | null` L598 — 音色归一化：后端可能给单个对象，也可能给数组（取第一条）
- `normalizeActorDetail(raw: unknown): ActorDetail` L617 — 演员详情归一化：actor + media + outfits + voice + favorited
- `actorGenerationLabel(status?: string): string` L656 — 生成状态 → 中文
- `actorShowsGeneration(actor: { generationStatus?: string }): boolean` L677 — 列表卡片是否要显示生成状态角标
- `normalizeCharacterItem(raw: unknown): CharacterItem` L688 — 用户角色行归一化
- `normalizeCharacterVoices(raw: unknown): ActorVoice[]` L710 — 角色音色归一化：后端下发的 `voice` 可能是数组（当前实现）也可能是单个对象， 统一成 `ActorVoice[]`，展示层只管第一条有没有可播 URL
- `const ACTOR_GALLERY_BLOCKS = [` L735 — 详情画廊三块（对齐参考站：肖像 / 表情 / 转身）
- `const ACTOR_GALLERY_ASPECT = '356 / 302'` L742 — 画廊整体宽高比（参考站 356×302）
- `actorGalleryBlocks(media?: ActorMedia | null): ActorGalleryBlock[]` L759 — 一份媒体集合 → 画廊三块（各自回退，互不顶替）
- `actorMediaForOutfit(detail: { media?: ActorMedia | null, outfits?: ActorOutfit[] | null } | null | undefined, outfitId: string): ActorMedia` L782 — 当前生效的媒体集合
- `actorVoiceState(voice?: ActorVoice | ActorVoice[] | null): ActorVoiceState` L802 — 音色归一：接受单个对象或数组
- `actorStripCandidates(items: ActorItem[] | null | undefined, currentId: string, limit = 12): ActorItem[]` L818 — 「切换演员」条的候选：**排除当前演员**，最多 limit 个

## app/utils/image-ref.ts
- `const IMAGEREF_ID_PREFIX = 'imageref:'` L22 — chip 快照 id 前缀：`imageref:<index>`（index 从 1 开始，与图条顺序一致）
- `imageRefWording(index: number, firstFrameRole = false): string` L29 — 给上游看的措辞（集中在这里，改动时同步下面的引用正则）
- `imageRefLabel(index: number, firstFrameRole = false): string` L35 — chip 与图条上的短标签（首帧 / 参考1 / 图1）
- `const IMAGE_REF_PATTERN = '参考图(\\d+)|首帧'` L41 — 提示词里识别引用措辞用的正则源（与 imageRefWording 必须同步）
- `const IMAGE_REF_RE = /参考图(\d+)/g` L43 — 提示词里识别「参考图N」用的正则（图片模式
- `imageRefIndexOf(sourceId: string | undefined | null): number` L46 — 从 chip 快照 id 解析出图片序号（不是本模块的 chip 返回 0）
- `imageRefSnapshot(index: number, firstFrameRole = false): SnippetSnapshot` L58 — 构造一个代表「第 index 张图」的快照（index 从 1 开始）
- `applyImageRefRoles(prompt: Prompt, firstFrameRole: boolean): Prompt` L76 — 按当前模式重写提示词里所有 `@` 图 chip 的措辞
- `missingImageRefs(text: string, available: number, firstFrameRole = false): number[]` L96 — 提示词里引用了、但当前已不存在的图片序号（按用户要求：不重编号、保留文字， 提交前提示「@图N 已不存在」）

## app/utils/password.ts
- `const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/` L6 — 密码强度基线：与后端同一口径（≥8 位且同时含字母与数字）
- `const PASSWORD_HINT = '至少 8 位，且需同时包含字母与数字'` L7

## app/utils/routes.ts
- `normalizePath(path: string): string` L8 — 去掉结尾斜杠（保留根路径），同时剥掉 query / hash
- `queryValue(value: unknown): string` L16 — query 值统一取字符串（数组取第一个
- `cleanQuery(query: Record<string, unknown> | undefined): Record<string, string>` L22 — 只保留非空的字符串 query（重定向时把无关/空参数丢掉，链接保持干净）
- `effectTabFromPath(path: string): EffectTab` L42 — 效果页 path → 页签
- `effectPath(tab: EffectTab): string` L50 — 页签 → 效果页 path（页签即地址，切页签必须换 URL）
- `walletSectionFromPath(path: string): WalletSection` L59 — 钱包 path → 区块
- `walletPath(section: WalletSection): string` L68
- `assetPaneFromPath(path: string): AssetPane` L79 — 资产 path → 页签（演员不再属于资产，没有 actors 页签）
- `assetPath(pane: AssetPane): string` L86
- `actorSourceFromPath(path: string): ActorSource` L95 — 演员库 path → 来源（/actors = 平台，/actors/mine = 我的）
- `actorSourcePath(source: ActorSource): string` L99
- `myActorPath(id: string | number): string` L104 — 我的演员详情 / 编辑 / 生成 run 的地址（id 全按字符串，避免雪花 id 精度坑）
- `myActorEditPath(id: string | number): string` L108
- `myActorGenerationPath(id: string | number, runId: string | number): string` L112
- `const EXPLORE_CATEGORY_SLUGS = [` L118
- `const DEFAULT_EXPLORE_SLUG: ExploreSlug = 'recommend'` L127
- `exploreSlugOf(label: string): ExploreSlug | ''` L130 — 中文分类标签 → slug
- `exploreLabelOf(slug: string): string` L136 — slug → 中文标签
- `isExploreSlug(slug: string): slug is ExploreSlug` L142 — 是否为合法探索 slug
- `searchPath(keyword: string): string` L149 — 搜索地址：词为空时就是 `/search`（不写空 q=）
- `legacyRedirect(pathname: string, query?: Record<string, unknown>): RouteTarget | null` L166 — 旧 URL 的新地址

## app/utils/work-feed.ts
- `toExploreWork(work: PublicationWork): ExploreWork` L16 — 后端作品 → 前台展示结构

## app/data/canvas-graph.ts
- `newId(prefix: string): string` L191 — 节点 id：`n_<kind>_<序号>`
- `defaultParams(kind: CanvasNodeKind): Record<string, unknown>` L197 — 节点默认参数：按类型声明取默认值（select 取第一项，frames 取中间档）
- `createNode(kind: CanvasNodeKind, at: { x: number, y: number }, title?: string, shotIdx?: number): CanvasNode` L208
- `addNode(graph: CanvasGraph, node: CanvasNode): void` L223
- `removeNode(graph: CanvasGraph, nodeId: string): void` L228 — 删节点：连同它的入边、出边一起删，下游的 inputs 也清掉（不留悬空引用）
- `connectNodes(graph: CanvasGraph, from: { node: string, slot: string }, to: { node: string, slot: string })` L244 — 连线
- `disconnect(graph: CanvasGraph, edgeId: string): void` L276
- `topoOrder(graph: CanvasGraph): string[]` L298 — 拓扑序（输入先于输出）
- `parentsOf(graph: CanvasGraph, nodeId: string): string[]` L318
- `downstreamOf(graph: CanvasGraph, nodeId: string): string[]` L323 — 下游（不含自己）
- `paramsHash(node: CanvasNode): string` L341 — 参数指纹：类型 + 参数 + 每个输入槽的产物版本
- `nodeState(graph: CanvasGraph, node: CanvasNode, runs: CanvasRun[], artifacts: CanvasArtifact[] = []): CanvasNodeState` L365 — 节点运行态：running > failed > 有产物 = ready > 必填输入没接 = blocked > 上游产物还没人确认 = awaiting…
- `const NODE_STATE_META: Record<CanvasNodeState, { label: string, tone: 'muted' | ` L390
- `expandShotlist(graph: CanvasGraph, shotlistId: string, rowCount: number, opts: { keyframeKind?: CanvasNodeKind, videoKind?: CanvasNodeKind } = {})` L404 — 方案 A（已拍板）：分镜表的 N 行批量展开成 N 组「关键帧生成 + 图生视频」节点并自动连线
- `makeEdge(fromNode: string, fromSlot: string, toNode: string, toSlot: string): CanvasEdge` L474 — 造一条边：from（上游）→ to（下游）
- `selectArtifact(graph: CanvasGraph, artifact: CanvasArtifact): void` L484 — 产出/切换某个产物版本时，把下游节点的输入槽一起改掉
- `selectFreshArtifacts(graph: CanvasGraph, list: CanvasArtifact[]): void` L508 — 一次运行落了**多口**产物时，逐口都成为"当前选用"
- `withItemPicked(graph: CanvasGraph, artifacts: CanvasArtifact[], artifactId: string, index: number): CanvasArtifact[]` L523 — 组内选用第 index 张：更新 picked 标记与产物镜像的 url，并把下游输入引用一起改掉
- `withItemReview(artifacts: CanvasArtifact[], artifactId: string, index: number, review: CanvasReview): CanvasArtifact[]` L537 — 逐张驳回/恢复：三视图里"侧面那张不行"要能单独标出来
- `connectionAllowed(graph: CanvasGraph, from: { node: string, slot: string }, to: { node: string, slot: string }, inPort: { multiple?: boolean }): boolean` L554 — 这条连线能不能接 —— 拖线时的即时校验，也是 Vue Flow 校验**已存在边**时用的函数
- `incomingEdges(graph: CanvasGraph, nodeId: string, slots?: string[]): CanvasEdge[]` L586 — 指向这个节点的入边（可限定槽位）
- `upstreamArtifact(graph: CanvasGraph, edge: CanvasEdge): CanvasArtifact | undefined` L591 — 上游节点当前选定的产物（没跑过就是 undefined）
- `inputRefs(node: CanvasNode, slot: string): CanvasInputRef[]` L598 — 某个输入槽接进来的引用（永远返回数组，别处不用再判空）
- `artifactOfRef(artifacts: CanvasArtifact[], ref: { artifactId: string }): CanvasArtifact | undefined` L608 — 一条引用对应的产物（找不到就是上游还没产出）
- `fragmentOrder(graph: CanvasGraph, node: CanvasNode, slot = 'video'): CanvasFragment[]` L628
- `buildExportManifest(graph: CanvasGraph, artifacts: CanvasArtifact[], node: CanvasNode)` L657 — 挑片并算出导出清单
- `nextVersion(artifacts: CanvasArtifact[], nodeId: string, slot: string): number` L692 — 某个输出槽的下一个版本号（同 node + slot 内自增）
- `artifactsOf(artifacts: CanvasArtifact[], nodeId: string, slot?: string): CanvasArtifact[]` L697
- `pendingReviewCount(artifacts: CanvasArtifact[]): number` L704 — 卡点：有多少产物还在等人看（画布顶部"待处理"用这个数）
- `exportFileName(episodeIdx: number, shotIdx: number, maxShotIdx: number): string` L709 — 导出文件名：E{集号}-S{镜号}.mp4，镜号补零位数按本集最大镜号，不少于两位
- `dependencyLevels(graph: CanvasGraph, ids: string[]): string[][]` L720 — 把一批节点按**依赖分层**：同一层里的节点互不依赖，可以一起跑

## app/data/canvas-history.ts
- `createHistory<T>(limit = 50, isSame: (a: T, b: T) => boolean = (a, b) => a =  =  = b): CanvasHistory<T>` L29

## app/data/canvas-layout.ts
- `layoutCanvas(nodes: LayoutNode[], edges: LayoutEdge[]): Record<string, LayoutPoint>` L19

## app/data/canvas-nodes.ts
- `const PORT_META: Record<CanvasPortType, CanvasPortMeta> = {` L45
- `portMeta(type: CanvasPortType): CanvasPortMeta` L56
- `const CANVAS_GROUPS: CanvasGroupMeta[] = [` L71 — 左栏节点库的分组，顺序即显示顺序
- `groupMeta(key: CanvasGroupKey): CanvasGroupMeta` L81
- `const CONTEXT_PARAM: CanvasParamSpec = {` L116 — 文本节点的「上文」参数（服务端 `context`，LLM-CAPABILITY-R1 §11-4）
- `const FRAME_GRID = [124, 141, 158, 175, 192, 209, 226, 243, 260, 277, 294, 311, ` L173 — H3 帧数网格：只接受 frames % 17 == 5、124–362
- `const RENDER_TIERS = {` L176 — 渲染档位：预览便宜、定稿才是交付
- `const CANVAS_NODE_TYPES: CanvasNodeTypeSpec[] = [` L183
- `nodeTypeSpec(kind: CanvasNodeKind): CanvasNodeTypeSpec` L487
- `canConnect(from: CanvasPortType, to: CanvasPortType): boolean` L494 — 连线合法性：同类型才允许连
- `framesToSeconds(frames: number): number` L499 — 帧数 → 时长（24fps）
- `creditsToYuan(credits: number): string` L504 — 分 → ¥（平台 100 分 = 1 元）

## app/data/canvas-sse.ts
- `readCanvasEvents(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: Record<string, unknown>) => void): Promise<void>` L2 — Streaming SSE decoder supporting LF/CRLF, arbitrary chunks and multiline data.

## app/data/canvas-structured.ts
- `parseStructured(text: string): JsonValue | undefined` L5
- `textCells(value: JsonValue, path: (string | number)[] = []): TextCell[]` L9
- `replaceText(value: JsonValue, path: (string | number)[], text: string): JsonValue` L15
- `streamCells(text: string): TextCell[]` L26 — 增量流仅展示已闭合的字符串字段
- `characterEntries(text: string)` L92
- `sceneEntries(text: string)` L100 — 场景条目
- `const STRUCT_FIELD_LABELS: Record<string, string> = {` L117 — 列表类产物的**行视图**：一行一项、一列一个字段
- `structuredTable(value: JsonValue, slot: string): StructuredTable | undefined` L134
- `protectedPath(path: (string | number)[]): boolean` L208
- `structuredCells(value: JsonValue, path: (string | number)[] = []): (TextCell &` L213
- `validateStructuredEdit(original: string, text: string, slot: string): string | undefined` L218

## app/data/canvas-sync.ts
- `editableGraph(graph: CanvasGraph): CanvasGraph` L4 — Server-owned output selections and derived inputs never belong to edit history.
- `editFingerprint(graph: CanvasGraph): string` L7
- `nodeFingerprint(node: CanvasNode): string` L10
- `withServerOutputs(local: CanvasGraph, remote: CanvasGraph): CanvasGraph` L13
- `mergeCanvas(local: CanvasGraph, baseline: CanvasGraph, remote: CanvasGraph)` L24

## app/data/canvas-templates.ts
- `listTemplates(): CanvasTemplateInfo[]` L67 — 本机用户实际保存的模板
- `emptyCanvas(): CanvasTemplatePayload` L73 — 空白画布：一张什么都没连的图
- `loadTemplate(id: string): CanvasTemplatePayload | null` L87 — 载入模板：**只给结构**（节点 + 连线 + 参数），产物与运行记录一律为空
- `saveTemplate(name: string, graph: CanvasGraph): CanvasTemplateInfo | null` L94 — 把当前这张图存成模板（只存图，不存产物与账）
- `removeTemplate(id: string): boolean` L103

## app/data/hougong-home.ts
- `const TOOL_TABS: { id: 'all' | ToolKind, label: string }[] = [` L16
- `const EXPLORE_CATEGORIES = ['推荐', '动画动漫', '影视创作', '产品展示'] as const` L61

## app/data/image-options.ts
- `const RATIO_OPTIONS: RatioOption[] = [` L14
- `const RESOLUTIONS = [` L25
- `ratioIcon(shape: RatioOption['shape'])` L30
- `sizeFor(ratio: string, resolution: string): [number, number]` L35 — 画幅 + 分辨率 → 输出尺寸（本地模型用）

## app/data/reference-limit.ts
- `referenceLimitReason(input: { max: number, modelName?: string, cloud?: boolean }): string` L9 — 参考图被拒 / 超限时的一句话原因

## app/data/tool-notice.ts
- `toolNotice(code: string): ToolNotice | undefined` L36 — toolNotice 取某个工具的边界提示

## app/config/features.ts
- `const FEATURES = {` L10 — 前台功能开关
- `featureEnabled(key: FeatureKey): boolean` L24 — 读开关：写成函数是为了以后能接远程配置/灰度而不动调用点
- `canvasFeatureEnabled(): boolean` L41 — 画布入口开关

<!-- END GENERATED:utils -->
