# 组件契约 props/emits

<!-- BEGIN GENERATED:components -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

组件的对外契约（props / v-model / emits / slots / expose）。改组件前先看这里，不用读整个 `.vue`。

### AppAgeGate — app/components/AppAgeGate.vue · 182 行
18+ 确认弹窗
- props: —
- 用: `useAdultGate`

### AppCharacterCard — app/components/AppCharacterCard.vue · 78 行
角色卡片：封面取后端返回的 coverUrl（该角色最近一部作品的产物），无作品时用首字占位
- props: `character` · `index`

### AppCharacterForm — app/components/AppCharacterForm.vue · 841 行
角色表单（新建 / 编辑共用），**视觉优先**： 第一屏 = 角色源图（必选）+ 角色名 + 成年确认
- props: `initial?` · `submitting?` · `serverError?` · `submitLabel?` · `editMode?` · `cancelTo?`='/actors'(取消后回到哪里（默认回平台演员库，不再跳旧的 /characters / ?pane=actors）)
- emits: `submit` · 用: `useHougongApi`
- 本文件声明 28 个: `sourceAssetId` L76 · `sourceUrl` L77 · `sourceBusy` L78 · `sourceError` L79 · `pickerOpen` L80 · `fileInput` L81 · `facets` L84 · `facetsError` L85 · `newTrait` L87 · `localError` L88
  `singleOptions` L90 · `temperamentOptions` L95 · `optionsFor` L110 · `toggleTemperament` L117 · `loadFacets` L123 · `fill` L133 · `resolveSourceUrl` L161 · `uploadSource` L170 · `onFile` L196
  `onPickAsset` L204 · `clearSource` L211 · `addTrait` L218 · `removeTrait` L228 · `addAppearance` L232 · `removeAppearance` L236 · `addOutfit` L240 · `removeOutfit` L244 · `onSubmit` L248

### AppStoryCard — app/components/AppStoryCard.vue · 65 行
故事卡片：数据全部来自真实接口，角色名与封面由调用方传入
- props: `story` · `index` · `cover?` · `characterNames?`

### AppWorkCard — app/components/AppWorkCard.vue · 138 行
展示型卡片：角色信息由调用方传入（真实接口的角色名/头像）
- props: `work` · `index` · `characterName?` · `characterImage?`

### AssetSectionNav — app/components/AssetSectionNav.vue · 54 行
- props: —

### BrandNavIcon — app/components/BrandNavIcon.vue · 146 行
- props: `name`

### ContextMenu — app/components/canvas/ContextMenu.vue · 174 行
- props: `x` · `y` · `title?` · `subtitle?` · `items`
- emits: `pick` · `close`

### DetailPanel — app/components/canvas/DetailPanel.vue · 891 行
画布右侧详情面板：选中节点的状态、输入、参数、产物版本、运行记录
- props: `streaming?` · `error?` · `drafts` · `graph` · `node`(选中的节点（null = 没选）) · `spec` · `state`(选中节点的运行态（由页面按同一套规则算好，避免两处判断不一致）) · `artifacts` · `runs` · `frameGrid` · `modelOptions?`
  `optionsByKey?`(按参数 key 覆盖候选（能力值，见 ParamFields 的说明）) · `activeSlot`(当前在看哪一口输出槽（多口节点才有意义，由页面统一算，见 useCanvasSlots）) · `upstreamAdvice?` · `kind` · `label` · `upstreamTitle` · `version` · `artifactId`
  `wired?` · `approve` · `follow` · `sourcePreview?`(选中的角色/场景那一条的设定（出图按它来，得让人看见）) · `references?`(这次会带哪几张参考图（首帧/视频），顺序就是上游收到的顺序) · `tableRows`(分镜表草稿（页面按节点 id 存，卡片与这里共用一份）) · `tableDirty` · `followUp`
  `busy`(有任务在跑时禁用"带补充再生成")
- emits: `close` · `run` · `rerun` · `draft` · `expand` · `param` · `row-update` · `rows-save` · `rows-discard` · `pick` · `pick-item` · `review` · `approve-upstream` · `follow-upstream` · `preview` · `slot` · `text-save` · `open-artifact` · `delete-artifact` · `update:followUp` · `continue` · `move-fragment`
- 本文件声明 18 个: `slot` L114 · `versions` L117 · `shown` L123 · `slotNote` L131 · `slotLabel` L137 · `draftKey` L145 · `textDraft` L146 · `editingText` L150 · `textDirty` L151 · `startEditText` L153
  `discardText` L154 · `nodeRuns` L156 · `fragments` L162 · `inputSummary` L172 · `estimate` L190 · `reviewTone` L192 · `reviewLabel` L195 · `updateFollowUp` L198

### NodeCard — app/components/canvas/NodeCard.vue · 180 行
画布节点卡：把标题栏、端口、内容、参数区、底栏装配起来
- props: `id` · `data` · `node` · `spec` · `state` · `dirty?`(参数或输入变了、还没重跑（界面给个"待重跑"的提示）) · `linked?`(鼠标悬停某条连线时，这条线两端的节点) · `frameGrid?`(H3 帧数网格与模型候选：卡片上也能改参数，取值必须与右栏同一份) · `modelOptions?`
  `optionsByKey?`(按参数 key 覆盖候选（能力值，见 ParamFields 的说明）) · `tableRows?`(分镜表当前的行（草稿优先）与"改过没存"标记) · `tableDirty?` · `activeSlot?`(当前在看哪一口输出槽（多口节点由页面记着，见 useCanvasSlots）) · `artifacts`
  `modelLabel?`(这一步用的模型名（每一步不一样，显示出来才知道在烧哪个模型的钱）) · `streaming?`(正在流式输出的文本（SSE 未接前由本地模拟逐字推）) · `selected?`
- emits: `run` · `rerun` · `expand` · `remove` · `duplicate` · `rename` · `pick` · `pick-item` · `review` · `open` · `slot` · `preview` · `param` · `collapse` · `row-update` · `rows-save` · `rows-discard`

### NodeFoot — app/components/canvas/NodeFoot.vue · 152 行
节点卡的底栏：运行 / 生成节点 / 本版未开放、版本切换、参数开关、这一步用的模型、产物备注
- props: `node` · `spec` · `state` · `versions`(该节点输出槽的产物版本（新的在前）) · `shownId?`(当前选用的产物 id) · `shownNote?`(当前选用产物的备注（分辨率 / 时长 …）) · `failed?` · `dirty?` · `modelLabel?`
  `hasParams`(有可改的参数（决定要不要显示「参数」开关）) · `paramsOpen` · `canExpand`(分镜表里有内容（决定要不要显示「生成节点」）)
- emits: `run` · `rerun` · `expand` · `pick` · `toggle-params`

### NodeHead — app/components/canvas/NodeHead.vue · 131 行
节点卡的标题栏：图标 + 名字 + 状态 + 待确认/待重跑小点 + 折叠 + ⋯ 菜单
- props: `node` · `spec` · `state` · `pendingCount`(有几份产物等人确认（>0 时标题栏亮小点）) · `dirty?`(参数或输入变了、还没重跑)
- emits: `rename` · `duplicate` · `remove` · `collapse`

### NodeLibrary — app/components/canvas/NodeLibrary.vue · 81 行
左栏节点库：按分组列出九类节点，点击或拖拽到画布上创建实例
- props: —
- emits: `add`

### NodePorts — app/components/canvas/NodePorts.vue · 67 行
节点卡的端口：左入右出，标签与圆点对齐，颜色按数据类型
- props: `spec`

### NodePreview — app/components/canvas/NodePreview.vue · 321 行
节点卡的内容区：按节点类型显示不同的东西 —— 多输出槽 → 逐口列产出
- props: `node` · `spec` · `state` · `artifacts` · `streaming?` · `tableRows?`(分镜表当前的行（草稿优先）与"改过没存"标记) · `tableDirty?` · `frameGrid?` · `activeSlot?`(当前在看哪一口输出槽（多口节点由页面记着，见 useCanvasSlots）)
- emits: `param` · `pick-item` · `slot` · `preview` · `row-update` · `rows-save` · `rows-discard`
- 本文件声明 9 个: `onSlot` L42 · `shown` L45 · `promptSpec` L58 · `promptKey` L59 · `promptValue` L60 · `textPreview` L62 · `tableRows` L67 · `editableTable` L68 · `slotSummaries` L79

### NodeTableEditor — app/components/canvas/NodeTableEditor.vue · 111 行
分镜表节点的就地编辑：镜号 / 景别 / 帧数 / 秒
- props: `rows` · `frameGrid` · `editable`(可编辑（分镜表节点且已有内容）) · `dirty`(有未保存的改动) · `limit?`(卡片里最多显示几行（详情面板里显示全部）)
- emits: `update` · `save` · `discard`

### ParamFields — app/components/canvas/ParamFields.vue · 292 行
节点参数表单：卡片里、右侧详情里**同一份**渲染逻辑
- props: `node` · `spec` · `frameGrid`(H3 帧数网格（真源在服务端，随图带下来）) · `modelOptions?`(modelId 的下拉候选，按 modelKind 分桶) · `optionsByKey?` · `dense?`(紧凑模式：卡片里用，字号与间距更小) · `skipKey?`(不渲染这个参数（卡片上已把"指令"渲染成输入框，别重复）)
  `sourcePreview?` · `references?`
- emits: `update` · `preview`

### StartDialog — app/components/canvas/StartDialog.vue · 153 行
画布起始面板：新建时选「空白」还是「套模板」，也能把当前这张图另存为模板
- props: `mode`(new = 新建（选空白或模板）) · `templates` · `loading?` · `error?`
- emits: `retry` · `blank` · `use` · `remove` · `save` · `close`

### StructuredOutput — app/components/canvas/StructuredOutput.vue · 151 行
- props: `text`
- emits: `save` · `draft`

### Topbar — app/components/canvas/Topbar.vue · 225 行
画布顶栏：标题、就绪/待确认/待重跑/已选/花费/本次预计、撤销重做、 缩放、新建、适应画布、保存、运行全部
- props: `busy?` · `arranging?` · `canArrange?` · `nodeCount` · `readyCount` · `pending`(有几份产物等人确认) · `dirtyCount`(现在真能跑、且需要跑的节点数) · `selectedCount` · `totalCost`(已花费（分）)
  `estimatedBatch`(「运行全部」这一遍的预估花费（分）) · `runningCount`(正在跑的节点数（>0 时按钮变"运行中"）) · `zoomPercent` · `canUndo` · `canRedo` · `graphTitle?`(当前图名（以前页面里存了 `graphTitle` 却没渲染，界面上根本看不到自己在哪张图）)
  `graphs?`(我的图（最近更新在前）)
- emits: `undo` · `redo` · `zoom-in` · `zoom-out` · `new` · `fit` · `arrange` · `save` · `run-all` · `switch-graph` · `open-graphs`

### HgActorDetail — app/components/HgActorDetail.vue · 712 行
平台演员详情（只读）
- props: `id`
- 用: `useHougongApi`
- 本文件声明 30 个: `detail` L29 · `loading` L30 · `error` L31 · `notice` L32 · `favoriteBusy` L34 · `cloning` L35 · `facetLabels` L38 · `selectedOutfitId` L41 · `activeMedia` L44 · `gallery` L47
  `voice` L50 · `voiceEl` L51 · `voicePlaying` L52 · `tags` L55 · `generationLabel` L57 · `stripItems` L60 · `stripRef` L61 · `strip` L63 · `loadStrip` L65 · `nextStrip` L74 · `loadFacetLabels` L81
  `pauseVoice` L91 · `load` L96 · `pickOutfit` L120 · `outfitThumb` L127 · `downloadName` L135 · `toggleVoice` L139 · `onVoiceError` L151 · `toggleFavorite` L156 · `cloneToMine` L172

### HgActorLibrary — app/components/HgActorLibrary.vue · 1055 行
演员库 —— 平台演员（/actors）与我的演员（/actors/mine）共用的组件，来源由路由决定
- props: `source?`='platform'
- 用: `useHougongApi`
- 本文件声明 20 个: `source` L28 · `loggedIn` L30 · `moreOpen` L62 · `favoriteBusy` L63 · `pageCount` L65 · `hasMoreFilters` L67 · `facetOptions` L74 · `showAll` L84 · `showRecent` L89 · `isAllActive` L95
  `isRecentActive` L106 · `buildQuery` L112 · `loadPlatform` L137 · `toggleTemperament` L179 · `resetFilters` L185 · `toggleFavorite` L195 · `loadMine` L221 · `activate` L240 · `removeMine` L245
  `cardMedia` L256

### HgAssetPanel — app/components/HgAssetPanel.vue · 466 行
- props: —
- 用: `useChatStudio` · `useHougongApi`
- 本文件声明 15 个: `message` L14 · `assets` L15 · `current` L16 · `infoOpen` L17 · `savedIds` L27 · `savingIds` L28 · `allSaved` L41 · `saving` L43 · `saveLabel` L44 · `saveAssets` L54 · `close` L79
  `onKeydown` L83 · `download` L90 · `continueEdit` L112 · `toVideo` L128

### HgAssetPicker — app/components/HgAssetPicker.vue · 548 行
- props: `open` · `selectedIds?`=() => [](已引用的资产 id（顺序即引用顺序，与 studio.references 一致）) · `canAddMore?`=true(还能不能再加（受 referenceMax 约束）) · `videoMode?`=false(视频模式：提示第 1 张是首帧，避免界面措辞与图位不一致)
- emits: `select` · `close` · 用: `useHougongApi`
- 本文件声明 19 个: `items` L38 · `total` L39 · `pageNo` L40 · `firstLoading` L41 · `loadingMore` L42 · `error` L43 · `done` L44 · `hint` L46 · `isAllowedImage` L51 · `fetchPage` L55 · `reload` L88
  `retry` L98 · `loadMore` L103 · `isSelected` L108 · `displayName` L112 · `roleLabel` L117 · `pick` L124 · `close` L141 · `onKeydown` L145

### HgAuthDialog — app/components/HgAuthDialog.vue · 587 行
未登录时的登录弹窗（效果图 homepage-interactions 面板 04）
- props: —
- v-model: `open` · 用: `useHougongApi` · `useAuthDialog` · `useTurnstile`
- 本文件声明 16 个: `tab` L11 · `email` L12 · `password` L13 · `confirmPassword` L15 · `agreed` L16 · `showPassword` L18 · `pending` L19 · `error` L20 · `turnstileBlocked` L41 · `heading` L43 · `close` L46
  `reset` L50 · `onKeydown` L68 · `afterAuth` L75 · `submitLogin` L81 · `submitRegister` L104

### HgBottomSheet — app/components/HgBottomSheet.vue · 113 行
移动端底部面板容器：同一个面板内容在窄屏以 sheet 呈现，可滚动、可关闭、保留选择
- props: `title?`=''
- v-model: `open`

### HgChatComposer — app/components/HgChatComposer.vue · 1144 行
- props: `variant?`='chat'
- emits: `submit` · 用: `useChatStudio` · `useIsNarrow` · `useGlowPointer` · `useHougongApi`
- 本文件声明 28 个: `paramsOpen` L10 · `ratioUnsupported` L23 · `onSend` L39 · `sendLabel` L48 · `blockHint` L53 · `loraOpen` L60 · `openLora` L63 · `imageRefOpen` L71 · `promptEditorRef` L72
  `assetPickerOpen` L78 · `selectedReferenceIds` L80 · `onPickAsset` L84 · `onOpenCategory` L88 · `onPickImageRef` L98 · `onCloseImageRef` L104 · `modelSheet` L109 · `paramsSheet` L110
  `mentionOpen` L116 · `mediaAssets` L119 · `loadMediaAssets` L121 · `ensureMentionData` L136 · `characterName` L140 · `tplOpen` L142 · `focusEditorFromContainer` L152 · `ratioOptions` L171
  `resolutionOptions` L185 · `samplingLimits` L198 · `patchSampling` L217

### HgChatHistory — app/components/HgChatHistory.vue · 355 行
历史会话侧栏：搜索、时间分组、新建、重命名、归档
- props: —
- 用: `useChatStudio`
- 本文件声明 11 个: `menuId` L6 · `renamingId` L7 · `renameDraft` L8 · `toggleMenu` L10 · `openMenu` L15 · `closeMenu` L19 · `onDocumentPointerDown` L23 · `onDocumentKeydown` L32 · `startRename` L46
  `commitRename` L52 · `archive` L60

### HgCompareSlider — app/components/HgCompareSlider.vue · 176 行
原图 / 效果对比滑块
- props: `before` · `after` · `alt?`='', label: '原图与效果对比', initial: 50, fit: 'cover' · `label?` · `initial?`(初始揭示比例（%），默认从中间开始) · `fit?`

### HgComposerMedia — app/components/HgComposerMedia.vue · 226 行
输入框左侧的「+ 添加图片」方框（首页与创作页共用）
- props: `max?`=1(该模型能收几张（1 = 只有首帧) · `accept?`='image/png,image/jpeg,image/webp' · `ariaLabel?`='添加参考图' · `title?`='添加图片' · `disabled?`=false
- emits: `files` · `pickAsset`

### HgConfirmDialog — app/components/HgConfirmDialog.vue · 274 行
通用确认弹窗
- props: `title?`='确认操作' · `message?`='' · `confirmText?`='确认'(确认按钮文案) · `cancelText?`='取消' · `danger?`=false(危险操作：确认按钮用警示色) · `pending?`=false(确认中：禁用按钮并显示进行态) · `progress?`=null
- v-model: `open` · emits: `confirm`

### HgDuplicateDialog — app/components/HgDuplicateDialog.vue · 202 行
重复提交确认（参考图面板 03 / 交接文档 G3 第二层）
- props: —
- 用: `useChatStudio`

### HgExploreFeed — app/components/HgExploreFeed.vue · 469 行
探索灵感流 —— 首页区块（/）与独立探索页（/explore、/explore/:category）共用
- props: `category?`='推荐', guestHint: false(当前分类（中文标签）) · `guestHint?`(未登录时是否显示登录提示（探索页 true)
- 用: `useHougongApi`
- 本文件声明 17 个: `loggedIn` L22 · `items` L24 · `page` L25 · `loading` L26 · `done` L27 · `error` L28 · `ready` L29 · `sentinel` L30 · `load` L37 · `visible` L81 · `remixWork` L89 · `previewOpen` L94
  `previewSrc` L95 · `previewTitle` L96 · `previewAuthor` L97 · `previewKind` L98 · `openPreview` L100

### HgGenParams — app/components/HgGenParams.vue · 171 行
生成参数面板（不含容器）：比例 / 清晰度 / 分辨率 / **模型支持的参数**
- props: `mode` · `ratio`(当前比例（用于高亮）) · `ratios`(可选比例：value + 该档的像素尺寸（用于 title 提示）) · `resolution` · `resolutions` · `sizeLabel`(当前比例 + 清晰度对应的**分辨率**文案（如 1024 × 1024），空则显示占位) · `count`
  `countMax?`(数量上限（云端取 capabilities.maxOutputs）) · `seconds` · `durationList` · `sampling` · `limits` · `loraVisible?`(效果包入口：visible=false 时整行不渲染（云端模型）) · `loraSelected?`
- emits: `update:ratio` · `update:resolution` · `update:count` · `update:seconds` · `patch:sampling` · `open:lora` · `close`

### HgImageRefPicker — app/components/HgImageRefPicker.vue · 169 行
`@` 唤出的图片选择器：列出当前已上传的图，选中即在提示词里插入一个原子 chip
- props: `open` · `items`(当前已上传的图（与参考图条一一对应，顺序即编号）) · `roles?`=() => []
- emits: `close` · `pick`

### HgMediaPreview — app/components/HgMediaPreview.vue · 188 行
- props: `src?`='', title: '', author: '', kind: 'image' · `title?` · `author?` · `kind?`(视频预览用：未完成时不允许播放假 URL（指南第 6 条）)
- v-model: `open`

### HgModelPanel — app/components/HgModelPanel.vue · 255 行
- props: `options` · `modelValue` · `mode`
- emits: `select`

### HgModelPicker — app/components/HgModelPicker.vue · 88 行
- props: `options` · `modelValue` · `mode`
- emits: `update:modelValue`

### HgOptionRow — app/components/HgOptionRow.vue · 136 行
就地展开的选项行：铺在输入框**内部**，不用浮层遮挡输入区
- props: `title` · `options` · `value` · `closeOnSelect?`=true
- emits: `select`

### HgParamsPanel — app/components/HgParamsPanel.vue · 173 行
- props: `mode` · `count` · `countMax?`(数量上限：云端模型用 capabilities.maxOutputs（后台可配），本地底模没有该声明，用 4) · `seconds` · `durationList` · `sampling` · `limits`
- emits: `update:count` · `update:seconds` · `patch:sampling`

### HgPublishDialog — app/components/HgPublishDialog.vue · 389 行
发布作品弹窗（把生成结果/选中素材发布到社区，出现在首页「探索」流）
- props: `coverUrl?`=''(封面预览地址（签发 URL）) · `coverName?`=''(封面来源名称，例如素材文件名) · `initialTitle?`=''(编辑既有作品时的初值) · `initialContent?`='' · `initialRating?`=''
  `editing?`=false(正在编辑既有作品（true 时不显示"保存草稿"，避免覆盖线上内容的语义歧义）) · `pending?`=false(提交中：禁用按钮)
- v-model: `open` · emits: `close` · `submit`
- 本文件声明 7 个: `title` L40 · `content` L41 · `rating` L42 · `canPublish` L51 · `submit` L61 · `close` L67 · `onKeydown` L73

### HgRatioIcon — app/components/HgRatioIcon.vue · 70 行
按宽高比画一个矩形，替代原来的"横/竖/方"三选一图标
- props: `ratio`(形如 "16:9") · `size?`=26(图标边长（px），矩形按这个尺寸等比缩放)

### HgReferenceStrip — app/components/HgReferenceStrip.vue · 124 行
参考图缩略图行：**排在输入框上方**，有图才出现
- props: `items?`=() => [] · `max?`=1(该模型能收几张（> 1 时显示 N/上限）) · `roles?`=() => []
- emits: `remove`

### HgTaskCard — app/components/HgTaskCard.vue · 511 行
- props: `message`
- 用: `useChatStudio` · `useHougongApi`
- 本文件声明 16 个: `now` L13 · `isRunning` L16 · `elapsed` L17 · `assets` L34 · `activeIndex` L40 · `openAsset` L47 · `kindLabel` L50 · `paramsLine` L56 · `download` L77 · `savedIds` L96 · `savingIds` L97
  `canSave` L108 · `allSaved` L110 · `saving` L112 · `saveLabel` L113 · `saveAssets` L125

### HgUpdateBar — app/components/HgUpdateBar.vue · 110 行
新版本提示条（全局挂在 app.vue）：线上发了新版本时出现
- props: —
- 用: `useVersionWatcher`

### promptEditor — app/components/prompt/promptEditor.vue · 360 行
TipTap 提示词编辑器：输入 @ 唤出「超级 Tag」分类菜单（@角色/@服装/@背景/@姿势/@画风）， 选中分类后由父组件打开该分类的标签卡片弹层，…
- props: `modelValue` · `placeholder?`='输入 @ 唤出角色、服装、画风…' · `disabled?`=false
- emits: `update:modelValue` · `open-category` · expose: `toPlainText`
- 本文件声明 9 个: `clipboardTextSlice` L42 · `snippetTarget` L52 · `tryTriggerSnippet` L122 · `applySnippet` L134 · `relabelImageRefs` L153 · `cancelSnippet` L173 · `onEditorClick` L192
  `toPlainText` L204 · `focus` L210

### composerModelPicker — app/components/selection/composerModelPicker.vue · 213 行
- props: `options` · `selectedKey` · `mode`
- emits: `select` · `browse` · `open`

### loraPicker — app/components/selection/loraPicker.vue · 203 行
LoRA 选择器（底部弹层 + 带封面卡片 + 权重数值输入，多选）
- props: `open` · `loras` · `selected`
- emits: `close` · `update`

### modelPicker — app/components/selection/modelPicker.vue · 98 行
模型选择器（底部弹层 + 带封面卡片，按 family 筛选）
- props: `open` · `models` · `modelId`
- emits: `close` · `select`

### selectionCard — app/components/selection/selectionCard.vue · 106 行
带封面图的选择卡片（对齐 PeachArt SelectionCard）：封面 + 底部渐变 + 标题 + 副标题，选中粉色高亮
- props: `image` · `title` · `description?` · `label?` · `selected?` · `disabled?`
- emits: `select`

### selectionDialog — app/components/selection/selectionDialog.vue · 110 行
底部全屏选择弹层（对齐 PeachArt SelectionDialog）：fixed 底部，搜索 + family 筛选 + 横排卡片 rail
- props: `open` · `title` · `filters` · `activeFilter`
- emits: `close` · `update:activeFilter`

<!-- END GENERATED:components -->
