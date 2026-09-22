# 工具函数与静态数据

<!-- BEGIN GENERATED:utils -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

纯函数、常量表与静态数据（没有响应式状态，可直接在任意上下文调用）。

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
- `createHistory<T>(limit = 50, isSame: (a: T, b: T) = > boolean = (a, b) = > a =  =  = b): CanvasHistory<T>` L29

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
- `readCanvasEvents(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: Record<string, unknown>) = > void): Promise<void>` L2 — Streaming SSE decoder supporting LF/CRLF, arbitrary chunks and multiline data.

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
- `const EXPLORE_CATEGORIES = ['推荐', '动画动漫', '影视创作', '产品展示'] as const` L62

## app/data/image-options.ts
- `const RATIO_OPTIONS: RatioOption[] = [` L14
- `const RESOLUTIONS = [` L25
- `ratioIcon(shape: RatioOption['shape'])` L30
- `sizeFor(ratio: string, resolution: string): [number, number]` L35 — 画幅 + 分辨率 → 输出尺寸（本地模型用）

## app/data/tool-notice.ts
- `toolNotice(code: string): ToolNotice | undefined` L36 — toolNotice 取某个工具的边界提示

## app/config/features.ts
- `const FEATURES = {` L10 — 前台功能开关
- `featureEnabled(key: FeatureKey): boolean` L24 — 读开关：写成函数是为了以后能接远程配置/灰度而不动调用点
- `canvasFeatureEnabled(): boolean` L41 — 画布（/canvas）开关

<!-- END GENERATED:utils -->
