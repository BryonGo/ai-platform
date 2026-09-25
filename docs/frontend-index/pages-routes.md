# 页面路由

<!-- BEGIN GENERATED:pages -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

页面/视图：路由、职责、用到的组合式函数；大文件另附本文件声明清单。

### `/actors/:id` — app/pages/actors/[id].vue · 18 行
平台演员详情页（/actors/:id）

### `/actors` — app/pages/actors/index.vue · 22 行
平台演员库（/actors）—— 独立的演员页面，不再是「资产」页里的一个页签

### `/actors/mine/:id/edit` — app/pages/actors/mine/[id]/edit.vue · 135 行
- 用: `useHougongApi`

### `/actors/mine/:id/generation/:runId` — app/pages/actors/mine/[id]/generation/[runId].vue · 11 行
生成 run 详情（/actors/mine/:id/generation/:runId）—— 与我的演员详情同一个页面组件， 只是详情页会优先按地址里的 …

### `/actors/mine/:id` — app/pages/actors/mine/[id]/index.vue · 1061 行
- 用: `useHougongApi`
- 本文件声明 49 个: `character` L28 · `works` L29 · `loading` L30 · `error` L31 · `characterId` L33 · `runIdParam` L38 · `facetLabels` L41 · `loadFacetLabels` L43 · `taxonomyTags` L53 · `mediaSlots` L69
  `voices` L75 · `voiceWithoutUrl` L77 · `showGeneration` L81 · `generationLabel` L82 · `toCard` L83 · `load` L87 · `coverBusy` L120 · `coverNote` L121 · `resetCover` L123 · `generationGate` L158
  `isOwnCharacter` L168 · `sourceAssetId` L170 · `hasTaxonomy` L176 · `catalog` L179 · `catalogError` L180 · `imageModels` L183 · `selectedModelId` L186 · `selectedModel` L188 · `qualityOptions` L190
  `selectedQuality` L191 · `priceLabel` L193 · `loadCatalog` L201 · `syncQuality` L217 · `run` L230 · `runBusy` L231 · `runError` L232 · `runNotice` L233 · `retryBusy` L234 · `stopPolling` L244
  `schedulePoll` L252 · `poll` L263 · `shouldContinuePolling` L286 · `reloadCharacterData` L298 · `loadLatestRun` L308 · `startGeneration` L325 · `retryRole` L354 · `runRoles` L375
  `unsupportedRoles` L392 · `isRunActive` L401

### `/actors/mine` — app/pages/actors/mine/index.vue · 22 行
我的演员（/actors/mine）—— 自建与从平台复制的演员，独立地址，刷新/分享/后退都保持

### `/actors/new` — app/pages/actors/new.vue · 52 行
- 用: `useHougongApi`

### `/assets` — app/pages/assets/index.vue · 2010 行
素材库（/assets）——「我的资产」里的素材分区
- 用: `useHougongApi`
- 本文件声明 83 个: `pane` L32 · `isAssetPane` L40 · `paneScope` L42 · `items` L67 · `total` L68 · `pageNo` L69 · `firstLoading` L70 · `loadingMore` L71 · `done` L72 · `error` L73 · `notice` L74
  `brokenIds` L76 · `kind` L78 · `origin` L79 · `sort` L80 · `keyword` L81 · `showHidden` L82 · `onlyDuplicates` L89 · `manageMode` L96 · `picked` L98 · `hasFilter` L101 · `pickedVisible` L106
  `pickedHidden` L109 · `fetchPage` L117 · `reload` L150 · `loadMore` L161 · `sentinel` L169 · `stopObserver` L172 · `isPicked` L203 · `togglePick` L208 · `pickAllLoaded` L227 · `clearPick` L235
  `onPressStart` L244 · `onPressEnd` L252 · `onMediaClick` L258 · `preview` L268 · `previewOpen` L269 · `openPreview` L271 · `closePreview` L277 · `busyId` L282 · `toggleHiddenOne` L284
  `downloadingId` L302 · `savingIds` L305 · `saveToLibrary` L313 · `download` L330 · `batchBusy` L349 · `confirmOpen` L350 · `confirmTitle` L351 · `confirmMessage` L352 · `pendingSingle` L353
  `batchProgress` L355 · `chunkSizeFor` L366 · `batchPercent` L371 · `batchInChunks` L378 · `askDelete` L393 · `doDelete` L405 · `runBatch` L436 · `dedupeOpen` L482 · `dedupeBusy` L483
  `dedupePlan` L484 · `dedupeMessage` L485 · `askDedupe` L495 · `doDedupe` L510 · `publishOpen` L534 · `publishPending` L535 · `publishCover` L537 · `askPublish` L539 · `submitPublish` L552
  `exporting` L582 · `exportTask` L583 · `exportError` L584 · `extOf` L586 · `relPathOf` L599 · `runExport` L603 · `typeLabel` L637 · `isImage` L640 · `isVideo` L643 · `displayName` L648
  `dateText` L653 · `sizeText` L658 · `dimsOf` L665 · `onImgError` L669 · `onKeydown` L674

### `/assets/temp` — app/pages/assets/temp.vue · 9 行
临时资产（/assets/temp）—— 与 /assets 同一个资产库组件，页签由地址决定

### `/assets/trash` — app/pages/assets/trash.vue · 9 行
回收站（/assets/trash）—— 与 /assets 同一个资产库组件，页签由地址决定

### `/auth/login` — app/pages/auth/login.vue · 167 行
登录原型：契约对齐 go-sdk /api/v1/account/auth/login（邮箱/用户名 + 密码 + Turnstile）
- 用: `useTurnstile` · `useHougongApi`

### `/auth/register` — app/pages/auth/register.vue · 216 行
注册：契约对齐 /api/v1/account/auth/register
- 用: `useTurnstile` · `useHougongApi`

### `/canvas/:graphId` — app/pages/canvas/[graphId].vue · 10 行
画布图（/canvas/:graphId）—— 与 /canvas 同一个画布组件，图 id 由地址决定

### `/canvas` — app/pages/canvas/index.vue · 2796 行
画布（织幕）—— 节点工作台，前端先行版
- 用: `useCanvasApi` · `useCanvasHistory` · `useHougongApi` · `useCanvasSlots` · `useCanvasRows`
- 本文件声明 178 个: `ownerType` L87 · `ownerId` L88 · `ownerQuery` L89 · `graphIdFromRoute` L96 · `graph` L98 · `savedGraph` L99 · `syncConflict` L100 · `operationError` L101 · `dirtyBaseline` L103
  `mutationBusy` L104 · `textDrafts` L105 · `setTextDraft` L106 · `graphDirty` L116 · `dirtyOf` L117 · `refreshPlan` L121 · `artifacts` L132 · `runs` L133 · `graphId` L136 · `graphRevision` L138
  `pendingNodeDeletes` L147 · `pendingEdgeDeletes` L148 · `graphTitle` L150 · `busy` L152 · `loading` L153 · `loadError` L154 · `batchBusy` L155 · `textSaving` L156 · `templateLoading` L157
  `templateError` L158 · `selectedId` L159 · `toast` L160 · `detailOpen` L161 · `railCollapsed` L168 · `previewOpen` L170 · `previewMedia` L171 · `runningIds` L172 · `streaming` L174
  `followUpDrafts` L176 · `followUp` L177 · `menu` L179 · `startPanel` L183 · `templates` L184 · `siteTemplates` L192 · `myGraphs` L199 · `refreshSiteTemplates` L201 · `refreshMyGraphs` L214
  `switchGraph` L224 · `openGraphList` L232 · `openStart` L236 · `replaceCanvas` L248 · `newBlank` L273 · `useTemplate` L285 · `saveAsTemplate` L322 · `dropTemplate` L328 · `connectFromSnapshot` L360
  `clipboard` L363 · `modelOptions` L365 · `videoModels` L368 · `videoModelResolutions` L371 · `baselineOptions` L381 · `upstreamSlotOf` L418 · `charactersOf` L443 · `characterPrompt` L455
  `scenesOf` L466 · `scenePrompt` L478 · `shotsOf` L491 · `dynamicOptionsOf` L502 · `videoModelResolutionsOf` L534 · `convergeVideoFormat` L546 · `selectedCount` L578 · `selectAll` L580
  `clearSelection` L584 · `selectedNodeIds` L590 · `selected` L594 · `selectedSpec` L595 · `openSlot` L605 · `focusCanvas` L613 · `onPaneClick` L618 · `onNodeOpen` L624 · `pending` L629
  `totalCost` L630 · `runningCount` L631 · `readyCount` L632 · `dirtyCount` L641 · `showToast` L651 · `linkHighlighted` L659 · `stateOf` L674 · `modelLabelOf` L682 · `arranging` L692
  `canArrange` L696 · `flowNodes` L698 · `flowEdges` L722 · `isValidConnection` L752 · `onConnectStart` L772 · `onConnectEnd` L784 · `onConnect` L793 · `onNodeDragStop` L811 · `hoveredEdge` L820
  `edgeBtnHover` L822 · `onEdgeHover` L825 · `onEdgeLeave` L830 · `edgeButtonPos` L844 · `removeEdge` L859 · `onEdgesChange` L865 · `pointOf` L874 · `openNodeMenu` L880 · `openSelectionMenu` L886
  `openPaneMenu` L890 · `openEdgeMenu` L894 · `closeMenu` L899 · `addNodeItems` L904 · `nodeMenuItems` L918 · `paneMenuItems` L939 · `connectMenuItems` L961 · `selectionMenuItems` L988
  `edgeMenuItems` L996 · `copyNode` L1001 · `pasteNode` L1008 · `connectNewNode` L1025 · `detachNode` L1055 · `onMenuPick` L1062 · `deleteSelected` L1129 · `runSelected` L1146 · `renameInline` L1164
  `onKeydown` L1175 · `freeSpot` L1228 · `add` L1235 · `onDrop` L1243 · `duplicate` L1250 · `rename` L1259 · `drop` L1264 · `hydrateInputs` L1279 · `autoWireShotInputs` L1310 · `expand` L1364
  `loadFromServer` L1423 · `saveToServer` L1474 · `persistGraph` L1480 · `mergeArtifacts` L1525 · `watchEvents` L1539 · `scheduleReload` L1565 · `errText` L1574 · `runNode` L1586
  `continueFrom` L1710 · `upsertRun` L1729 · `rerunNode` L1743 · `runAll` L1754 · `reloadGraph` L1800 · `resolveConflict` L1832 · `pick` L1858 · `pickItem` L1881 · `review` L1905 · `saveRows` L1926
  `saveText` L1935 · `commitArtifact` L1948 · `removeArtifact` L1974 · `openArtifact` L1989 · `openPreview` L1996 · `sourcePortLabel` L2024 · `selectedUpstreamAdvice` L2037
  `followNewerUpstream` L2073 · `selectedReferences` L2098 · `selectedSourcePreview` L2125 · `approveUpstream` L2163 · `fragments` L2170 · `moveFragment` L2180 · `estimateOf` L2193
  `estimatedBatch` L2198 · `selectedTableRows` L2209 · `setParam` L2232 · `shotRowsOf` L2260 · `wideScreen` L2276 · `syncWide` L2278 · `hasUnsavedWork` L2282 · `beforeUnload` L2284
  `arrangeCanvas` L2358 · `fit` L2413 · `reloadFromServer` L2418 · `zoomPercent` L2424

### `/canvases` — app/pages/canvases.vue · 458 行
我的画布 —— 创作者找回自己建过的画布
- 用: `useCanvasApi`
- 本文件声明 22 个: `rows` L17 · `total` L18 · `page` L19 · `keyword` L21 · `keywordApplied` L22 · `sort` L24 · `ownerFilter` L25 · `loading` L32 · `error` L33 · `editingId` L35 · `draft` L36 · `busy` L37
  `pageCount` L39 · `load` L41 · `search` L64 · `goPage` L70 · `open` L77 · `startRename` L81 · `commitRename` L86 · `duplicate` L102 · `remove` L115 · `ago` L130

### `/characters/:id/edit` — app/pages/characters/[id]/edit.vue · 10 行
旧「我的角色编辑」已迁移到 /actors/mine/:id/edit

### `/characters/:id` — app/pages/characters/[id]/index.vue · 10 行
旧「我的角色详情」已迁移到 /actors/mine/:id

### `/characters` — app/pages/characters/index.vue · 9 行
旧「角色资产」列表已迁移到 /actors/mine（演员新命名空间）

### `/characters/new` — app/pages/characters/new.vue · 9 行
旧「新建角色」已迁移到 /actors/new

### `/create` — app/pages/create.vue · 465 行
对话创作页（/create）
- 本文件声明 8 个: `streamRef` L8 · `historyOpen` L9 · `pinned` L10 · `sessionTitle` L12 · `resultTotal` L14 · `scrollToBottom` L16 · `onJumpLatest` L25 · `onScroll` L30

### `/effects/image` — app/pages/effects/image.vue · 10 行
图片效果（/effects/image）—— 与 /effects 同一个页面组件，只是分类由地址决定

### `/effects` — app/pages/effects/index.vue · 370 行
vAutoPlayVideo 必须显式 import：模板里用了 `v-auto-play-video`，而 `<script setup>` 只把**本文…
- 本文件声明 7 个: `tab` L34 · `tools` L36 · `isOption` L66 · `effects` L70 · `inTab` L108 · `counts` L111 · `shown` L118

### `/effects/video` — app/pages/effects/video.vue · 9 行
视频效果（/effects/video）—— 与 /effects 同一个页面组件，只是分类由地址决定

### `/explore/:category` — app/pages/explore/[category].vue · 35 行
探索流分类（/explore/:category）—— 分类即地址，刷新 / 分享 / 后退都保持

### `/explore` — app/pages/explore/index.vue · 23 行
探索流（/explore）—— 默认「推荐」

### `/` — app/pages/index.vue · 1142 行
- 用: `useHougongApi` · `useAuthDialog` · `useComposerDraft`
- 本文件声明 27 个: `notice` L20 · `toolCards` L59 · `quickTools` L90 · `quickRows` L103 · `hoverTool` L106 · `quickGridEl` L114 · `quickPopEl` L115 · `quickPopStyle` L116 · `placeQuickPop` L131
  `openQuickPop` L154 · `closeQuickPop` L163 · `onQuickPopResize` L169 · `isQuickToolActive` L174 · `selectedToolCard` L186 · `runningWorks` L193 · `loggedIn` L203 · `continueItems` L241
  `continueLoading` L242 · `relativeTime` L244 · `submitLanding` L283 · `loadContinue` L328 · `previewOpen` L380 · `previewSrc` L381 · `previewTitle` L382 · `previewAuthor` L383 · `previewKind` L385
  `openContinuePreview` L387

### `/notifications` — app/pages/notifications.vue · 203 行
- 用: `useHougongApi`

### `/search` — app/pages/search.vue · 331 行
站内搜索（/search?q=）—— 从应用外壳的搜索浮层变成**独立页面**：结果可刷新、可分享、可后退
- 用: `useHougongApi` · `useToolCatalog`
- 本文件声明 8 个: `keyword` L42 · `sessions` L44 · `query` L46 · `searchResults` L48 · `hasQuery` L67 · `searchEmpty` L68 · `clearKeyword` L90 · `loadSessions` L95

### `/settings` — app/pages/settings.vue · 458 行
设置页：账号（用户名）与成人内容偏好
- 用: `useAdultGate` · `useHougongApi`
- 本文件声明 14 个: `message` L14 · `errorText` L15 · `profile` L18 · `usernameDraft` L19 · `usernamePending` L20 · `usernameMsg` L21 · `usernameErr` L22 · `loadProfile` L27 · `saveUsername` L39
  `frontVersion` L70 · `apiVersion` L74 · `versionLoaded` L75 · `loadVersions` L77 · `resetGate` L105

### `/stories/:id` — app/pages/stories/[id].vue · 807 行
- 用: `useHougongApi` · `useCanvasApi`
- 本文件声明 35 个: `story` L6 · `charNames` L7 · `workTitles` L8 · `myWorks` L9 · `workCovers` L10 · `loading` L11 · `error` L12 · `storyId` L14 · `clips` L15 · `cover` L16 · `updatedText` L20
  `charName` L24 · `editing` L28 · `saving` L29 · `editClips` L30 · `pickerOpen` L31 · `addable` L34 · `startEdit` L40 · `moveClip` L46 · `removeClip` L57 · `addClip` L61 · `saveClips` L66
  `load` L84 · `episodes` L116 · `episodesBusy` L117 · `episodeError` L118 · `loadEpisodes` L120 · `addEpisode` L130 · `renameEpisode` L143 · `setEpisodeStatus` L154 · `removeEpisode` L163
  `replaceEpisode` L175 · `episodeScripts` L191 · `scriptState` L199 · `toggleEpisodeScript` L203

### `/stories` — app/pages/stories/index.vue · 88 行
- 用: `useHougongApi`

### `/tool/:code` — app/pages/tool/[code].vue · 1139 行
单个创作工具页（/tool/:code）
- 用: `useHougongApi` · `useAuthDialog`
- 本文件声明 60 个: `code` L25 · `tool` L28 · `templates` L29 · `pickTemplate` L36 · `template` L42 · `toolMissing` L43 · `emptySlot` L52 · `uploading` L56 · `prompt` L57 · `inputKind` L58
  `needsImage` L59 · `isPair` L60 · `isVideoPair` L62 · `isMask` L64 · `isCharacter` L66 · `characters` L67 · `characterId` L68 · `slotCount` L70 · `filledSlots` L71 · `maskCanvas` L80
  `setMaskCanvas` L82 · `brushSize` L87 · `hasStroke` L88 · `canSubmit` L92 · `runs` L119 · `busy` L120 · `notice` L121 · `sourceUrl` L123 · `latest` L125 · `savedIds` L136 · `savingIds` L137
  `allOutputsSaved` L140 · `anyOutputSaving` L144 · `saveOutputs` L154 · `templateCover` L179 · `templateCoverBefore` L181 · `demoVideo` L192 · `demo` L207 · `demoAlt` L216 · `restriction` L222
  `slotLabel` L230 · `cost` L240 · `onPick` L242 · `setFile` L250 · `clearFile` L259 · `syncMaskCanvas` L272 · `resetMask` L295 · `pointOf` L304 · `strokeTo` L314 · `onMaskDown` L333
  `onMaskMove` L343 · `onMaskUp` L350 · `exportMask` L356 · `swapSlots` L374 · `submit` L380 · `poll` L453 · `resolveOutputs` L476 · `isVideoUrl` L497 · `outputLabel` L503 · `download` L512

### `/tv` — app/pages/tv.vue · 255 行
- 用: `useHougongApi`

### `/wallet` — app/pages/wallet/index.vue · 1021 行
- 用: `useHougongApi`
- 本文件声明 37 个: `loading` L13 · `error` L14 · `wallet` L18 · `claiming` L19 · `claimNotice` L20 · `invite` L22 · `copied` L23 · `membership` L25 · `tab` L29 · `transactions` L32 · `ledger` L33
  `rechargeAmt` L35 · `checkoutBusy` L36 · `checkoutRes` L37 · `checkoutErr` L38 · `rechargeRef` L42 · `ordersRef` L43 · `membershipRef` L44 · `creatorInfo` L46 · `applyCreatorOpen` L47 · `mcInfo` L48
  `applyMcOpen` L49 · `applyErr` L50 · `applyBusy` L51 · `creatorForm` L52 · `mcForm` L53 · `fmtCredits` L65 · `applySection` L77 · `scrollToSection` L84 · `load` L90 · `claim` L113
  `copyInvite` L126 · `doCheckout` L137 · `loadCreator` L153 · `submitCreator` L161 · `submitModelCreator` L174 · `addResourceUrl` L187

### `/wallet/ledger` — app/pages/wallet/ledger.vue · 9 行
金币流水（/wallet/ledger）—— 与 /wallet 同一个页面组件，当前区块由地址决定

### `/wallet/membership` — app/pages/wallet/membership.vue · 9 行
会员（/wallet/membership）—— 与 /wallet 同一个页面组件，进入后滚到会员区

### `/wallet/orders` — app/pages/wallet/orders.vue · 9 行
订单（/wallet/orders）—— 与 /wallet 同一个页面组件，进入后滚到订单列表区

### `/wallet/recharge` — app/pages/wallet/recharge.vue · 9 行
充值（/wallet/recharge）—— 与 /wallet 同一个页面组件，进入后滚到「充值金币」区

### `/works/:id` — app/pages/works/[id].vue · 541 行
- 用: `useHougongApi` · `useAdultGate`
- 本文件声明 26 个: `work` L9 · `owner` L10 · `related` L11 · `loading` L12 · `error` L13 · `favBusy` L14 · `revealed` L18 · `needMask` L19 · `coverBusy` L24 · `coverNote` L25 · `workId` L27 · `visBusy` L29
  `visNote` L30 · `saveVisibility` L40 · `kindLabel` L54 · `createdText` L55 · `toCard` L61 · `load` L65 · `publishOpen` L95 · `publishPending` L96 · `publishMsg` L97 · `submitPublish` L99
  `removeWork` L128 · `setAsCover` L140 · `toggleFavorite` L154 · `markOrientation` L171

### `/works` — app/pages/works/index.vue · 425 行
- 用: `useHougongApi` · `useAdultGate`
- 本文件声明 18 个: `works` L8 · `charNames` L9 · `loading` L10 · `error` L11 · `filter` L12 · `published` L17 · `publishedLoading` L18 · `publishOpen` L19 · `publishPending` L20 · `editingWork` L21
  `loadPublished` L23 · `openPublish` L39 · `submitPublish` L44 · `togglePublishState` L78 · `removePublished` L89 · `filtered` L101 · `maskedIds` L107 · `loadWorks` L114

## 应用外壳与服务端路由
- `app/app.vue` · 710 行
  - 本文件声明: `recentSessions` L73 · `accountOpen` L77 · `accountWrapRef` L78 · `railOpen` L79 · `dotTrailRef` L81 · `fadeDotTrails` L86 · `onDotPointerMove` L99 · `railCollapsed` L128
    `isFullBleed` L131 · `credits` L132 · `unread` L133 · `pageName` L165 · `isActive` L174 · `onAccountToggle` L182 · `onDocClick` L186 · `logout` L192 · `loadShellData` L198
- `app/app.config.ts` · 9 行
- `app/App.vue` · 710 行
  - 本文件声明: `recentSessions` L73 · `accountOpen` L77 · `accountWrapRef` L78 · `railOpen` L79 · `dotTrailRef` L81 · `fadeDotTrails` L86 · `onDotPointerMove` L99 · `railCollapsed` L128
    `isFullBleed` L131 · `credits` L132 · `unread` L133 · `pageName` L165 · `isActive` L174 · `onAccountToggle` L182 · `onDocClick` L186 · `logout` L192 · `loadShellData` L198
- `server/api/backend-version.get.ts` — 后端（Go API）当前**正在跑**的版本，供设置页展示
- `server/api/version.get.ts` — 当前**正在运行**的前端版本（用户浏览器里缓存的那份可能是旧的）
- `server/api/version.head.ts` — HEAD /api/version —— 只为探活/监控存在，回答"这个端点在不在这里"
- `server/utils/version.ts` — 版本端点（/api/version）GET 与 HEAD 共用的部分

## 中间件与插件
- `app/middleware/canvas-gate.global.ts` — 画布路由保留给直达链接和内部业务跳转使用
- `app/plugins/media-heal.client.ts` — 媒体自愈的全局接线（仅浏览器）

<!-- END GENERATED:pages -->
