# 页面路由

<!-- BEGIN GENERATED:pages -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

页面/视图：路由、职责、用到的组合式函数；大文件另附本文件声明清单。

### `/assets` — app/pages/assets.vue · 2003 行
素材库（/assets）——「我的资产」里的素材分区
- 用: `useHougongApi`
- 本文件声明 83 个: `pane` L23 · `isAssetPane` L31 · `paneScope` L33 · `items` L58 · `total` L59 · `pageNo` L60 · `firstLoading` L61 · `loadingMore` L62 · `done` L63 · `error` L64 · `notice` L65
  `brokenIds` L67 · `kind` L69 · `origin` L70 · `sort` L71 · `keyword` L72 · `showHidden` L73 · `onlyDuplicates` L80 · `manageMode` L87 · `picked` L89 · `hasFilter` L92 · `pickedVisible` L97
  `pickedHidden` L100 · `fetchPage` L108 · `reload` L141 · `loadMore` L152 · `sentinel` L160 · `stopObserver` L163 · `isPicked` L198 · `togglePick` L203 · `pickAllLoaded` L222 · `clearPick` L230
  `onPressStart` L239 · `onPressEnd` L247 · `onMediaClick` L253 · `preview` L263 · `previewOpen` L264 · `openPreview` L266 · `closePreview` L272 · `busyId` L277 · `toggleHiddenOne` L279
  `downloadingId` L297 · `savingIds` L300 · `saveToLibrary` L308 · `download` L325 · `batchBusy` L344 · `confirmOpen` L345 · `confirmTitle` L346 · `confirmMessage` L347 · `pendingSingle` L348
  `batchProgress` L350 · `chunkSizeFor` L361 · `batchPercent` L366 · `batchInChunks` L373 · `askDelete` L388 · `doDelete` L400 · `runBatch` L431 · `dedupeOpen` L477 · `dedupeBusy` L478
  `dedupePlan` L479 · `dedupeMessage` L480 · `askDedupe` L490 · `doDedupe` L505 · `publishOpen` L529 · `publishPending` L530 · `publishCover` L532 · `askPublish` L534 · `submitPublish` L547
  `exporting` L577 · `exportTask` L578 · `exportError` L579 · `extOf` L581 · `relPathOf` L594 · `runExport` L598 · `typeLabel` L632 · `isImage` L635 · `isVideo` L638 · `displayName` L643
  `dateText` L648 · `sizeText` L653 · `dimsOf` L660 · `onImgError` L664 · `onKeydown` L669

### `/auth/login` — app/pages/auth/login.vue · 167 行
登录原型：契约对齐 go-sdk /api/v1/account/auth/login（邮箱/用户名 + 密码 + Turnstile）
- 用: `useTurnstile` · `useHougongApi`

### `/auth/register` — app/pages/auth/register.vue · 216 行
注册：契约对齐 /api/v1/account/auth/register
- 用: `useTurnstile` · `useHougongApi`

### `/canvas` — app/pages/canvas.vue · 2792 行
画布（织幕）—— 节点工作台，前端先行版
- 用: `useCanvasApi` · `useCanvasHistory` · `useHougongApi` · `useCanvasSlots` · `useCanvasRows`
- 本文件声明 177 个: `ownerType` L86 · `ownerId` L87 · `ownerQuery` L88 · `graph` L90 · `savedGraph` L91 · `syncConflict` L92 · `operationError` L93 · `dirtyBaseline` L95 · `mutationBusy` L96
  `textDrafts` L97 · `setTextDraft` L98 · `graphDirty` L108 · `dirtyOf` L109 · `refreshPlan` L113 · `artifacts` L124 · `runs` L125 · `graphId` L128 · `graphRevision` L130 · `pendingNodeDeletes` L139
  `pendingEdgeDeletes` L140 · `graphTitle` L142 · `busy` L144 · `loading` L145 · `loadError` L146 · `batchBusy` L147 · `textSaving` L148 · `templateLoading` L149 · `templateError` L150
  `selectedId` L151 · `toast` L152 · `detailOpen` L153 · `railCollapsed` L160 · `previewOpen` L162 · `previewMedia` L163 · `runningIds` L164 · `streaming` L166 · `followUpDrafts` L168
  `followUp` L169 · `menu` L171 · `startPanel` L175 · `templates` L176 · `siteTemplates` L184 · `myGraphs` L191 · `refreshSiteTemplates` L193 · `refreshMyGraphs` L206 · `switchGraph` L216
  `openGraphList` L223 · `openStart` L227 · `replaceCanvas` L239 · `newBlank` L264 · `useTemplate` L276 · `saveAsTemplate` L313 · `dropTemplate` L319 · `connectFromSnapshot` L351 · `clipboard` L354
  `modelOptions` L356 · `videoModels` L359 · `videoModelResolutions` L362 · `baselineOptions` L372 · `upstreamSlotOf` L409 · `charactersOf` L434 · `characterPrompt` L446 · `scenesOf` L457
  `scenePrompt` L469 · `shotsOf` L482 · `dynamicOptionsOf` L493 · `videoModelResolutionsOf` L525 · `convergeVideoFormat` L537 · `selectedCount` L569 · `selectAll` L571 · `clearSelection` L575
  `selectedNodeIds` L581 · `selected` L585 · `selectedSpec` L586 · `openSlot` L596 · `focusCanvas` L604 · `onPaneClick` L609 · `onNodeOpen` L615 · `pending` L620 · `totalCost` L621
  `runningCount` L622 · `readyCount` L623 · `dirtyCount` L632 · `showToast` L642 · `linkHighlighted` L650 · `stateOf` L665 · `modelLabelOf` L673 · `arranging` L683 · `canArrange` L687
  `flowNodes` L689 · `flowEdges` L713 · `isValidConnection` L743 · `onConnectStart` L763 · `onConnectEnd` L775 · `onConnect` L784 · `onNodeDragStop` L802 · `hoveredEdge` L811 · `edgeBtnHover` L813
  `onEdgeHover` L816 · `onEdgeLeave` L821 · `edgeButtonPos` L835 · `removeEdge` L850 · `onEdgesChange` L856 · `pointOf` L865 · `openNodeMenu` L871 · `openSelectionMenu` L877 · `openPaneMenu` L881
  `openEdgeMenu` L885 · `closeMenu` L890 · `addNodeItems` L895 · `nodeMenuItems` L909 · `paneMenuItems` L930 · `connectMenuItems` L952 · `selectionMenuItems` L979 · `edgeMenuItems` L987
  `copyNode` L992 · `pasteNode` L999 · `connectNewNode` L1016 · `detachNode` L1046 · `onMenuPick` L1053 · `deleteSelected` L1120 · `runSelected` L1137 · `renameInline` L1155 · `onKeydown` L1166
  `freeSpot` L1219 · `add` L1226 · `onDrop` L1234 · `duplicate` L1241 · `rename` L1250 · `drop` L1255 · `hydrateInputs` L1270 · `autoWireShotInputs` L1301 · `expand` L1355 · `loadFromServer` L1414
  `saveToServer` L1470 · `persistGraph` L1476 · `mergeArtifacts` L1521 · `watchEvents` L1535 · `scheduleReload` L1561 · `errText` L1570 · `runNode` L1582 · `continueFrom` L1706 · `upsertRun` L1725
  `rerunNode` L1739 · `runAll` L1750 · `reloadGraph` L1796 · `resolveConflict` L1828 · `pick` L1854 · `pickItem` L1877 · `review` L1901 · `saveRows` L1922 · `saveText` L1931 · `commitArtifact` L1944
  `removeArtifact` L1970 · `openArtifact` L1985 · `openPreview` L1992 · `sourcePortLabel` L2020 · `selectedUpstreamAdvice` L2033 · `followNewerUpstream` L2069 · `selectedReferences` L2094
  `selectedSourcePreview` L2121 · `approveUpstream` L2159 · `fragments` L2166 · `moveFragment` L2176 · `estimateOf` L2189 · `estimatedBatch` L2194 · `selectedTableRows` L2205 · `setParam` L2228
  `shotRowsOf` L2256 · `wideScreen` L2272 · `syncWide` L2274 · `hasUnsavedWork` L2278 · `beforeUnload` L2280 · `arrangeCanvas` L2354 · `fit` L2409 · `reloadFromServer` L2414 · `zoomPercent` L2420

### `/canvases` — app/pages/canvases.vue · 458 行
我的画布 —— 创作者找回自己建过的画布
- 用: `useCanvasApi`
- 本文件声明 22 个: `rows` L17 · `total` L18 · `page` L19 · `keyword` L21 · `keywordApplied` L22 · `sort` L24 · `ownerFilter` L25 · `loading` L32 · `error` L33 · `editingId` L35 · `draft` L36 · `busy` L37
  `pageCount` L39 · `load` L41 · `search` L64 · `goPage` L70 · `open` L77 · `startRename` L81 · `commitRename` L86 · `duplicate` L102 · `remove` L115 · `ago` L130

### `/characters/:id/edit` — app/pages/characters/[id]/edit.vue · 133 行
- 用: `useHougongApi`

### `/characters/:id` — app/pages/characters/[id].vue · 285 行
- 用: `useHougongApi`

### `/characters` — app/pages/characters/index.vue · 72 行
- 用: `useHougongApi`

### `/characters/new` — app/pages/characters/new.vue · 51 行
- 用: `useHougongApi`

### `/create` — app/pages/create.vue · 465 行
对话创作页（/create）
- 本文件声明 8 个: `streamRef` L8 · `historyOpen` L9 · `pinned` L10 · `sessionTitle` L12 · `resultTotal` L14 · `scrollToBottom` L16 · `onJumpLatest` L25 · `onScroll` L30

### `/effects` — app/pages/effects.vue · 369 行
vAutoPlayVideo 必须显式 import：模板里用了 `v-auto-play-video`，而 `<script setup>` 只把**本文…
- 本文件声明 7 个: `tab` L26 · `tools` L28 · `isOption` L58 · `effects` L62 · `inTab` L100 · `counts` L103 · `shown` L114

### `/` — app/pages/index.vue · 1591 行
- 用: `useHougongApi` · `useAuthDialog` · `useComposerDraft`
- 本文件声明 41 个: `notice` L27 · `toolCards` L66 · `quickTools` L97 · `quickRows` L110 · `hoverTool` L113 · `quickGridEl` L121 · `quickPopEl` L122 · `quickPopStyle` L123 · `placeQuickPop` L138
  `openQuickPop` L161 · `closeQuickPop` L170 · `onQuickPopResize` L176 · `isQuickToolActive` L181 · `selectedToolCard` L193 · `pickQuickTool` L200 · `runningWorks` L206 · `loggedIn` L216
  `continueItems` L260 · `continueLoading` L261 · `relativeTime` L263 · `submitLanding` L302 · `loadContinue` L347 · `exploreCategory` L400 · `exploreItems` L401 · `explorePage` L402
  `exploreLoading` L403 · `exploreDone` L404 · `exploreError` L405 · `exploreReady` L406 · `sentinel` L407 · `loadExplore` L422 · `switchCategory` L472 · `exploreVisible` L477 · `remixWork` L496
  `previewOpen` L504 · `previewSrc` L505 · `previewTitle` L506 · `previewAuthor` L507 · `previewKind` L509 · `openPreview` L511 · `openContinuePreview` L520

### `/notifications` — app/pages/notifications.vue · 203 行
- 用: `useHougongApi`

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

### `/wallet` — app/pages/wallet.vue · 999 行
- 用: `useHougongApi`
- 本文件声明 36 个: `loading` L6 · `error` L7 · `wallet` L11 · `claiming` L12 · `claimNotice` L13 · `invite` L15 · `copied` L16 · `membership` L18 · `tab` L21 · `transactions` L22 · `ledger` L23
  `rechargeAmt` L25 · `checkoutBusy` L26 · `checkoutRes` L27 · `checkoutErr` L28 · `rechargeRef` L31 · `ordersRef` L32 · `creatorInfo` L34 · `applyCreatorOpen` L35 · `mcInfo` L36 · `applyMcOpen` L37
  `applyErr` L38 · `applyBusy` L39 · `creatorForm` L40 · `mcForm` L41 · `fmtCredits` L53 · `applyTabFromQuery` L66 · `scrollToSection` L77 · `load` L83 · `claim` L106 · `copyInvite` L119
  `doCheckout` L130 · `loadCreator` L146 · `submitCreator` L154 · `submitModelCreator` L167 · `addResourceUrl` L180

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
- `app/app.vue` · 916 行
  - 本文件声明: `recentSessions` L71 · `searchOpen` L74 · `searchQuery` L75 · `searchResults` L91 · `searchEmpty` L113 · `openSearch` L118 · `goSearch` L126 · `onSearchKeydown` L131 · `accountOpen` L134
    `accountWrapRef` L135 · `railOpen` L136 · `dotTrailRef` L138 · `fadeDotTrails` L143 · `onDotPointerMove` L156 · `railCollapsed` L185 · `isFullBleed` L188 · `credits` L189 · `unread` L190
    `pageName` L210 · `isActive` L219 · `onAccountToggle` L227 · `onDocClick` L231 · `logout` L237 · `loadShellData` L243
- `app/app.config.ts` · 9 行
- `app/App.vue` · 916 行
  - 本文件声明: `recentSessions` L71 · `searchOpen` L74 · `searchQuery` L75 · `searchResults` L91 · `searchEmpty` L113 · `openSearch` L118 · `goSearch` L126 · `onSearchKeydown` L131 · `accountOpen` L134
    `accountWrapRef` L135 · `railOpen` L136 · `dotTrailRef` L138 · `fadeDotTrails` L143 · `onDotPointerMove` L156 · `railCollapsed` L185 · `isFullBleed` L188 · `credits` L189 · `unread` L190
    `pageName` L210 · `isActive` L219 · `onAccountToggle` L227 · `onDocClick` L231 · `logout` L237 · `loadShellData` L243
- `server/api/backend-version.get.ts` — 后端（Go API）当前**正在跑**的版本，供设置页展示
- `server/api/version.get.ts` — 当前**正在运行**的前端版本（用户浏览器里缓存的那份可能是旧的）
- `server/api/version.head.ts` — HEAD /api/version —— 只为探活/监控存在，回答"这个端点在不在这里"
- `server/utils/version.ts` — 版本端点（/api/version）GET 与 HEAD 共用的部分

## 中间件与插件
- `app/middleware/canvas-gate.global.ts` — 画布路由保留给直达链接和内部业务跳转使用
- `app/plugins/media-heal.client.ts` — 媒体自愈的全局接线（仅浏览器）

<!-- END GENERATED:pages -->
