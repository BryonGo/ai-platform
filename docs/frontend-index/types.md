# 类型与字段

<!-- BEGIN GENERATED:types -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

导出的 `interface` / `type` 及**字段名**（不抄字段类型，需要类型时按行号去源码看）。

## app/composables/useAdultGate.ts
- `AdultGateStatus` L14 {siteAdultContent, gateRequired, verified, minAge, adultMode, canUseAdult}

## app/composables/useApi.ts
- `ApiEnvelope` L8 {code, message, data, errorKey?, requestId?, details?, contractVersion?}
- `PlatformErrorDetails` L22 {fieldErrors?, extra?} — 错误细节：与后端 httpx.Details 对应

## app/composables/useAppVersions.ts
- `BackendVersionInfo` *type* L16 {service, version, commit, buildTime, startedAt, goVersion}

## app/composables/useAuthDialog.ts
- `AuthDialogIntent` L9 {reason, mode?, resume?}

## app/composables/useAutoPlayVideo.ts
- `AutoPlayVideoOptions` L103 {enabled?} — 指令入参：`{ enabled?: boolean, immediate?: boolean }`

## app/composables/useCanvasApi.ts
- `CanvasGraphSummary` L20 {id, title, product?, ownerType?, ownerId?, nodeCount, revision, updatedAt, createdAt} — 图列表项（不含图内容）
- `CanvasTemplateItem` L33 {id, name, summary, nodeCount, updatedAt, builtIn} — 运营模板列表项（服务端形状）
- `ServerRun` L43 {id, nodeId, nodeType?, paramsHash, baseArtifactId?, status, error?, costCredits?, taskIds?, startedAt, finishedAt?} — 一次执行（服务端形状）
- `ServerArtifactItem` L58 {url, label?, mediaAssetId?, picked?, review?} — 一组候选里的一张（服务端形状）
- `ServerArtifact` L68 {id, nodeId, slot, type, version, url?, note?, items?, pickedIndex?, rows?, text?, manifest?, review, mediaAssetId?, runId?, createdAt} — 产物版本（服务端形状）
- `CanvasGraphView` L88 {graph, runs, artifacts} — 一次拿全的响应
- `CanvasPlanNode` L95 {nodeId, kind, runner?, reason?, paramsHash?, blocked?, blockedReason?} — 「运行全部」计划里的一项

## app/composables/useCanvasHistory.ts
- `CanvasSnapshot` L18 {graph}

## app/composables/useChatStudio.ts
- `StudioStatus` *type* L26 {id, url, kind, width?, height?}
- `StudioAsset` L28 {id, url, kind, width?, height?}
- `RunMeta` L36 {mode, ratio, seconds, count, modelId, modelName, credits, unit, prompt, characterName, toolName?, templateName?, contentRating}
- `StudioAttachment` L61 {name, url, assetId?, role?}
- `StudioMessage` L74 {id, role, kind, text, time, attachments?, taskId?, clientKey?, status?, progress?, assets?, error?, meta?, action?}
- `ChatStudio` *type* L1437 {provide}

## app/composables/useComposerDraft.ts
- `ComposerDraft` L4 {prompt, mode, ratio, durationSeconds, uploadName, files, references?, file?, modelId?, modelChannel?, toolCode?, templateCode?}

## app/composables/useHougongApi.ts
- `AuthResult` L4 {user_id, token}
- `AppearanceItem` L9 {label, value}
- `OutfitItem` L14 {id, name, note, swatch, current}
- `CharacterItem` L22 {id, name, alias, age, ageVerified, tagline, traits, appearance, outfits, workCount, coverUrl?, coverAssetId?}
- `CharacterInput` L40 {name, alias?, age?, ageVerified, tagline?, traits?, appearance?, outfits?} — CharacterInput 角色创建/更新输入（对齐后端 data.CharacterInput）
- `WorkItem` L51 {id, title, characterId, sessionId?, taskId?, assetId, imageUrl?, videoUrl?, kind, status?, favorite, contentRating?, visibility?, createdAt}
- `EpisodeItem` L90 {id, idx, title, status, budgetCredits, updatedAt, graphCount} — 一集（画布·集）
- `StoryItem` L101 {id, title, synopsis, characterIds, relation, settings, clips, updatedAt}
- `CatalogSampling` L112 {steps, stepsMin, stepsMax, cfgMin, cfgMax, cfgStep, samplers, schedulers}
- `ToolTemplateItem` L129 {code, name, summary} — 创作工具（后台「创作工具」维护）
- `ToolCatalogItem` L135 {code, name, category, summary, icon, cover?, badge?, engine, input, supportsTemplates, templates?}
- `CatalogItem` L154 {id, type, name, family, summary?, safety, fileName?, cover?, available, selectable, unavailableReason?, weight?, sampling?, steps, sampler, scheduler, cfg, samplers?, schedulers?, stepsMin?, stepsMax?, cfgMin?, cfgMax?, cfgStep?, ratios?, qualities?, sizes?}
- `CloudModel` L196 {id, name, author, excerpt?, cover?, state, engine, endpoint, unavailableReason?, capabilities, parameters, default, maxInputs, maxOutputs, pricing, includedInputs, extraInputBalance, qualities, output}
- `VideoDurationOption` L223 {seconds, frames, actualSeconds}
- `VideoResolution` L230 {ratio, label, width, height} — 视频画幅 → 输出尺寸（来自 comfy85 ResolutionSelector 实测：0.4MP、32 对齐）
- `CatalogVideoModel` L237 {id, name, engine, workflow, provider?, resolution?, steps, frameRate, length, width, height, minSeconds, maxSeconds, defaultSeconds, durations, resolutions, note?, summary?, available, selectable, unavailableReason?}
- `CatalogRates` L267 {product, image, video, extend, videoByDuration?} — 站点报价表：键为画幅（如 "1:1"），值为积分单价
- `Catalog` L280 {version, sampling, models, loras, videoModels, cloudModels, textModels?, audioModels?, rates?}
- `CatalogAudioModel` L305 {id, name, author?, excerpt?, summary?, available, selectable, unavailableReason?, family?, versionLabel?, isDefault?} — 一个音频模型（语音合成）
- `CatalogTextModel` L325 {id, name, author?, excerpt?, cover?, summary?, description?, contextWindow?, maxOutput?, reasoning?, available, selectable, unavailableReason?, family?, versionLabel?, isDefault?} — 一个文本模型
- `HougongTask` L347 {id, type, status, progress?, errorCode?, errorMessage?, billedCredits?, snapshot?, outputAssets?, createdAt?, finishedAt?}
- `WorkCreateInput` L362 {characterId?, sessionId?, taskId?, assetId?, kind?, title?, contentRating?, visibility?}
- `SessionItem` L375 {id, title, state, current, latestTask, createdAt, lastActivityAt}
- `SnippetCategory` L385 {key, labels, position, subcategories}
- `SnippetItem` L392 {id, category, subcategory, labels, prompt, preview}
- `AssetItem` L401 {id, name?, kind?, origin, status, mimeType, bytes, width, height, url, createdAt, hidden, scope?, duplicateCount?}
- `AssetChoice` L422 {asset, generation}
- `ExportTask` L428 {id, kind, status, sourceKind, sourceId, total, done, failed, resultAssetId, downloadUrl, errorCode, errorMessage, startedAt, finishedAt, createdAt, failures?} — 导出任务（对齐 api/v1/platform/export.go 的 ExportTaskItem）
- `PublicationWork` L451 {id, title, state, author?, contentRating, coverUrl, kind?, videoUrl?, tags, stats, publishedAt}
- `WorkEditor` L479 {id, state, title, content, contentRating, tags, updatedAt} — 作品编辑器（后端 WorkEditor）：草稿/已发布作品的可编辑字段
- `WorkSaveInput` L490 {id?, title?, content?, tagIds?, coverAssetId?, contentRating?} — 保存作品草稿入参（对应后端 WorkSaveReq）
- `PublicationPost` L501 {id, title, state, content, assets, tags, stats, publishedAt}
- `PublicationComment` L512 {id, targetKind, targetId, content, likes, createdAt}
- `PlatformTag` L521 {id, key, name, aliases, active, priority}
- `Invite` L530 {code, invited, completed, pending, earnedCredits, friendCredits, rewardCredits}
- `EconomyWallet` L540 {credits, balanceCents, nextExpiry}
- `WalletLedgerItem` L546 {id, asset, amount, kind, expiresAt, createdAt}
- `Membership` L555 {purchaseId, tier, choice, startedAt, expiresAt}
- `Purchase` L563 {id, kind, state, priceCents, credits, balanceCents, months, tier, choice, paymentUrl, paidAt, createdAt}
- `Transaction` L578 {id, type, category, state?, priceCents?, credits?, balanceCents?, tier?, amount?, kind?, expiresAt?, createdAt}
- `CreatorWork` L593 {id, title, imageUrl}
- `Creator` L599 {state, eligible, inviteCredits, requiredImages, publishedImages, reward, direction, statement, agreedAt, submittedAt, reviewedAt, reason, works, selectableWorks}
- `ModelCreator` L616 {state, platform, profileUrl, resourceUrls, agreedAt, submittedAt, reviewedAt, reason}
- `NotificationItem` L627 {id, kind, message, readAt, createdAt, target}
- `ModelWeight` L637 {default}
- `ModelStats` L638 {works}
- `ModelTag` L639 {key}
- `ModelSampling` L640 {steps?}
- `ModelFile` L641 {name}
- `ModelRuntime` L642 {engine}
- `ModelListItem` L643 {id, type, name, author, owner?, source?, family, category, tags, excerpt, cover, stats, available, selectable, unavailableReason, safety, triggers, weight, state?, updatedAt, engine}
- `ModelDetail` L667 {description, compatible, sampling}
- `ModelFacets` L673 {families, loraCategories}
- `MineListItem` L678 {id, title, type, family, category, excerpt, safety, state, updatedAt, cover, viewer}
- `MineModel` L692 {owner, source, sourceUrl, description, triggers, weight, sampling, images, runtime, file, reason}
- `ModelDraftInput` L706 {source, sourceUrl?, title, type, family, category, description?, triggers?, weight?, sampling?, imageIds?, safety}
- `ProfileInfo` L722 {id, username, email, nickname, avatar, user_type, status} — 当前登录账号的概要信息（对齐 /account/profile 返回）

## app/composables/useModelCatalog.ts
- `ComposerMode` *type* L14 {id, name, mode, channel, cover?, tags, fromPrice, priceUnit, summary?, supportsReference?, available, unavailableReason?}
- `ModelChannel` *type* L20 {id, name, mode, channel, cover?, tags, fromPrice, priceUnit, summary?, supportsReference?, available, unavailableReason?} — 账务通道
- `UserModelOption` L22 {id, name, mode, channel, cover?, tags, fromPrice, priceUnit, summary?, supportsReference?, available, unavailableReason?}
- `PriceQuery` L47 {ratio, seconds, count}

## app/composables/useToolCatalog.ts
- `ToolTemplate` L9 {code, name, summary, cover?, coverBefore?, badge?, tags?, isCard?}
- `ToolItem` L34 {code, name, category, summary, icon, cover?, coverBefore?, coverVideo?, badge?, tags?, engine, input, supportsTemplates, templates}

## app/composables/useTurnstile.ts
- `VerificationConfig` L21 {mode, turnstile_site_key?} — VerificationConfig 是后端 /pub/verification/config 的响应

## app/data/canvas-graph.ts
- `CanvasArtifactRef` L19 {artifactId, version, item?}
- `CanvasInputRef` L26 {from, slot}
- `CanvasNode` L33 {id, kind, title, at, params, inputs, outputs, ref?, collapsed?}
- `CanvasEdge` L55 {id, from, to}
- `CanvasGraph` L61 {version, frameGrid, nodes, edges}
- `CanvasNodeState` *type* L72 {id, nodeId, paramsHash, baseArtifactId?, status, error?, costCredits?, startedAt, finishedAt?} — 运行态：由 canvas_run 派生，不存在节点行上
- `CanvasReview` *type* L75 {id, nodeId, paramsHash, baseArtifactId?, status, error?, costCredits?, startedAt, finishedAt?} — 审核态：挂在**产物**上，不在节点上
- `CanvasRun` L77 {id, nodeId, paramsHash, baseArtifactId?, status, error?, costCredits?, startedAt, finishedAt?}
- `CanvasArtifact` L94 {id, nodeId, slot, type, version, url?, note?, items?, pickedIndex?, rows?, text?, manifest?, review, createdAt, mediaAssetId?, runId?, conversationId?}
- `CanvasArtifactItem` L143 {url, label?, mediaAssetId?, picked?, review?} — 一组候选里的一张（图像类）
- `CanvasExportManifest` L159 {exported, skipped, mismatch, exportId?, status?, total?} — 成片导出 / 素材导出 的结果清单
- `CanvasShotRow` L170 {idx, shotSize, camera, frames, scene, keyframePrompt, line?} — 分镜表的一行（一镜）
- `CanvasSample` L180 {graph, artifacts, runs}
- `CanvasFragment` L618 {upstreamId, upstream?, artifactId?, shotIdx, label} — 剪辑合成要拼的片段顺序

## app/data/canvas-history.ts
- `CanvasHistory` L14 {canUndo, canRedo, push, reset, undo, redo, current}

## app/data/canvas-layout.ts
- `LayoutNode` L2 {id, kind, width, height, shot?} — Deterministic left-to-right layout. Only returns positions; never mutates grap…
- `LayoutEdge` L9 {from}
- `LayoutPoint` L10 {x}

## app/data/canvas-nodes.ts
- `CanvasPortType` *type* L28 {label, color, icon} — 数据在节点之间流动的类型
- `CanvasPortMeta` L38 {label, color, icon}
- `CanvasGroupKey` *type* L62 {key, label, color}
- `CanvasGroupMeta` L64 {key, label, color}
- `CanvasNodeKind` *type* L87 {key, label, kind, options?, placeholder?, hint?}
- `CanvasParamSpec` L101 {key, label, kind, options?, placeholder?, hint?} — 参数控件的声明
- `CanvasPortSpec` L127 {slot, type, label, required?, multiple?}
- `CanvasNodeTypeSpec` L138 {kind, group, label, subtitle, icon, width, inputs, outputs, params, modelKind?, promptKey?, stage, estimateCredits?}
- `RenderTier` *type* L181 {kind, group, label, subtitle, icon, width, inputs, outputs, params, stage, estimateCredits}

## app/data/canvas-structured.ts
- `JsonValue` *type* L2 string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue } — JSON 保持原始结构
- `TextCell` L3 {path}
- `StructuredRow` L123 {label, cells}
- `StructuredTable` L129 {headers, rows}

## app/data/canvas-templates.ts
- `CanvasTemplateInfo` L14 {id, name, summary, builtIn?, site?}
- `CanvasTemplatePayload` L29 {graph, artifacts, runs}

## app/data/hougong-home.ts
- `ToolKind` *type* L14 {id}
- `ExploreWork` L23 {id, title, author, avatar?, cover, category, tags?, badge?, badgeBaked?, duration?, kind?, videoUrl?, mock}
- `ContinueItem` L46 {id, title, cover, status, statusText, compareBefore?, done?, kind?, videoUrl?}
- `ExploreCategory` *type* L63 typeof EXPLORE_CATEGORIES[number]

## app/data/image-options.ts
- `RatioOption` L5 {value, label, shape, size1k} — 画幅与分辨率选项（对齐即梦：8 档比例 + 1K/2K）

## app/data/tool-notice.ts
- `ToolNotice` L21 {text, detail?}

## app/config/features.ts
- `FeatureKey` *type* L21 keyof typeof FEATURES

<!-- END GENERATED:types -->
