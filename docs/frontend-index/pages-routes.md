# 页面路由

<!-- BEGIN GENERATED:pages -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

页面/视图：路由、职责、用到的组合式函数；大文件另附本文件声明清单。

### `/assets` — app/pages/assets.vue · 1915 行
素材库（/assets）——「我的资产」里的素材分区
- 用: `useHougongApi`
- 本文件声明 79 个: `pane` L22 · `items` L47 · `total` L48 · `pageNo` L49 · `firstLoading` L50 · `loadingMore` L51 · `done` L52 · `error` L53 · `notice` L54 · `brokenIds` L56 · `kind` L58 · `origin` L59
  `sort` L60 · `keyword` L61 · `showHidden` L62 · `onlyDuplicates` L69 · `manageMode` L76 · `picked` L78 · `hasFilter` L81 · `pickedVisible` L86 · `pickedHidden` L89 · `fetchPage` L97 · `reload` L127
  `loadMore` L138 · `sentinel` L146 · `stopObserver` L149 · `isPicked` L177 · `togglePick` L182 · `pickAllLoaded` L201 · `clearPick` L209 · `onPressStart` L218 · `onPressEnd` L226
  `onMediaClick` L232 · `preview` L242 · `previewOpen` L243 · `openPreview` L245 · `closePreview` L251 · `busyId` L256 · `toggleHiddenOne` L258 · `downloadingId` L276 · `download` L278
  `batchBusy` L297 · `confirmOpen` L298 · `confirmTitle` L299 · `confirmMessage` L300 · `pendingSingle` L301 · `batchProgress` L303 · `chunkSizeFor` L314 · `batchPercent` L319 · `batchInChunks` L326
  `askDelete` L341 · `doDelete` L353 · `runBatch` L384 · `dedupeOpen` L430 · `dedupeBusy` L431 · `dedupePlan` L432 · `dedupeMessage` L433 · `askDedupe` L443 · `doDedupe` L458 · `publishOpen` L482
  `publishPending` L483 · `publishCover` L485 · `askPublish` L487 · `submitPublish` L500 · `exporting` L530 · `exportTask` L531 · `exportError` L532 · `extOf` L534 · `relPathOf` L547
  `runExport` L551 · `typeLabel` L585 · `isImage` L588 · `isVideo` L591 · `displayName` L596 · `dateText` L601 · `sizeText` L606 · `dimsOf` L613 · `onImgError` L617 · `onKeydown` L622

### `/auth/login` — app/pages/auth/login.vue · 134 行
登录原型：契约对齐 go-sdk /api/v1/account/auth/login（邮箱/用户名 + 密码 + Turnstile）
- 用: `useTurnstile` · `useHougongApi`

### `/auth/register` — app/pages/auth/register.vue · 163 行
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

### `/effects` — app/pages/effects.vue · 367 行
vAutoPlayVideo 必须显式 import：模板里用了 `v-auto-play-video`，而 `<script setup>` 只把**本文…
- 用: `useToolCatalog`
- 本文件声明 7 个: `tab` L24 · `tools` L26 · `isOption` L56 · `effects` L60 · `inTab` L98 · `counts` L101 · `shown` L112

### `/` — app/pages/index.vue · 1566 行
- 用: `useHougongApi` · `useAuthDialog` · `useComposerDraft` · `useToolCatalog`
- 本文件声明 40 个: `notice` L27 · `toolCards` L64 · `quickTools` L95 · `hoverTool` L98 · `quickGridEl` L106 · `quickPopEl` L107 · `quickPopStyle` L108 · `placeQuickPop` L123 · `openQuickPop` L146
  `closeQuickPop` L155 · `onQuickPopResize` L161 · `isQuickToolActive` L166 · `selectedToolCard` L178 · `pickQuickTool` L185 · `runningWorks` L191 · `loggedIn` L201 · `continueItems` L245
  `continueLoading` L246 · `relativeTime` L248 · `submitLanding` L287 · `loadContinue` L332 · `exploreCategory` L385 · `exploreItems` L386 · `explorePage` L387 · `exploreLoading` L388
  `exploreDone` L389 · `exploreError` L390 · `exploreReady` L391 · `sentinel` L392 · `loadExplore` L407 · `switchCategory` L457 · `exploreVisible` L462 · `remixWork` L481 · `previewOpen` L493
  `previewSrc` L494 · `previewTitle` L495 · `previewAuthor` L496 · `previewKind` L498 · `openPreview` L500 · `openContinuePreview` L509

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

### `/tool/:code` — app/pages/tool/[code].vue · 1049 行
单个创作工具页（/tool/:code）
- 用: `useHougongApi` · `useToolCatalog`
- 本文件声明 54 个: `code` L21 · `tool` L24 · `templates` L25 · `template` L26 · `toolMissing` L27 · `emptySlot` L36 · `uploading` L40 · `prompt` L41 · `inputKind` L42 · `needsImage` L43 · `isPair` L44
  `isVideoPair` L46 · `isMask` L48 · `isCharacter` L50 · `characters` L51 · `characterId` L52 · `slotCount` L54 · `filledSlots` L55 · `maskCanvas` L64 · `setMaskCanvas` L66 · `brushSize` L71
  `hasStroke` L72 · `canSubmit` L76 · `runs` L101 · `busy` L102 · `notice` L103 · `sourceUrl` L105 · `latest` L107 · `templateCover` L110 · `templateCoverBefore` L112 · `demoVideo` L123 · `demo` L138
  `demoAlt` L147 · `restriction` L153 · `slotLabel` L161 · `cost` L171 · `onPick` L173 · `setFile` L181 · `clearFile` L190 · `syncMaskCanvas` L203 · `resetMask` L226 · `pointOf` L235 · `strokeTo` L245
  `onMaskDown` L264 · `onMaskMove` L274 · `onMaskUp` L281 · `exportMask` L287 · `swapSlots` L305 · `submit` L311 · `poll` L376 · `resolveOutputs` L399 · `isVideoUrl` L415 · `outputLabel` L421
  `download` L430

### `/tv` — app/pages/tv.vue · 255 行
- 用: `useHougongApi`

### `/wallet` — app/pages/wallet.vue · 672 行
- 用: `useHougongApi`
- 本文件声明 32 个: `loading` L5 · `error` L6 · `wallet` L9 · `claiming` L10 · `claimNotice` L11 · `invite` L13 · `copied` L14 · `membership` L16 · `tab` L18 · `transactions` L19 · `ledger` L20
  `rechargeAmt` L22 · `checkoutBusy` L23 · `checkoutRes` L24 · `checkoutErr` L25 · `creatorInfo` L27 · `applyCreatorOpen` L28 · `mcInfo` L29 · `applyMcOpen` L30 · `applyErr` L31 · `applyBusy` L32
  `creatorForm` L33 · `mcForm` L34 · `fmtCredits` L46 · `load` L50 · `claim` L73 · `copyInvite` L86 · `doCheckout` L97 · `loadCreator` L113 · `submitCreator` L121 · `submitModelCreator` L134
  `addResourceUrl` L147

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
- `app/app.vue` · 895 行
  - 本文件声明: `recentSessions` L72 · `searchOpen` L75 · `searchQuery` L76 · `searchResults` L92 · `searchEmpty` L114 · `openSearch` L119 · `goSearch` L127 · `onSearchKeydown` L132 · `accountOpen` L135
    `accountWrapRef` L136 · `railOpen` L137 · `dotTrailRef` L139 · `fadeDotTrails` L144 · `onDotPointerMove` L157 · `railCollapsed` L186 · `isFullBleed` L189 · `credits` L190 · `unread` L191
    `pageName` L211 · `isActive` L220 · `onAccountToggle` L228 · `onDocClick` L232 · `logout` L238 · `loadShellData` L244
- `app/app.config.ts` · 9 行
- `app/App.vue` · 895 行
  - 本文件声明: `recentSessions` L72 · `searchOpen` L75 · `searchQuery` L76 · `searchResults` L92 · `searchEmpty` L114 · `openSearch` L119 · `goSearch` L127 · `onSearchKeydown` L132 · `accountOpen` L135
    `accountWrapRef` L136 · `railOpen` L137 · `dotTrailRef` L139 · `fadeDotTrails` L144 · `onDotPointerMove` L157 · `railCollapsed` L186 · `isFullBleed` L189 · `credits` L190 · `unread` L191
    `pageName` L211 · `isActive` L220 · `onAccountToggle` L228 · `onDocClick` L232 · `logout` L238 · `loadShellData` L244
- `server/api/backend-version.get.ts` — 后端（Go API）当前**正在跑**的版本，供设置页展示
- `server/api/version.get.ts` — 当前**正在运行**的前端版本（用户浏览器里缓存的那份可能是旧的）
- `server/api/version.head.ts` — HEAD /api/version —— 只为探活/监控存在，回答"这个端点在不在这里"
- `server/utils/version.ts` — 版本端点（/api/version）GET 与 HEAD 共用的部分

## 中间件与插件
- `app/middleware/canvas-gate.global.ts` — 画布（/canvas）屏蔽闸门
- `app/plugins/media-heal.client.ts` — 媒体自愈的全局接线（仅浏览器）

<!-- END GENERATED:pages -->
