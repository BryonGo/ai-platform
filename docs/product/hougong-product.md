# 后宫产品文档（反向推导版 v1）

> 生成方式：从 `ai-platform`（前台 Nuxt）现有源码与已实测的后端契约**反向推导**，不是理想的
> 产品规划。每条现状都标注了依据；「缺口」小节是文档化时确认的**体验断点**，按主题归组。
> 范围说明：只收前台产品行为；后台运营（工具目录维护、模型配置）只在影响前台行为时提及。

## 0. 产品一句话

面向个人创作者的 AI 图片/视频生产平台：**用对话与工具完成生产，角色（演员）是可复用的生产资产**。
成人内容站点（默认可用，入口带年龄确认）。

## 1. 主干旅程（现状实际走向）

```
浏览（未登录可看首页/探索/TV/技能）
  └─ 写操作触发登录弹窗（reason=generate|publish|account）
登录/注册（弹窗页签 或 /auth/login|register，redirect 回跳）
  ↓
创作：首页输入 → 草稿交接 → /create 对话生成
      或 /tool/[code] 工具直出（不进对话）
  ↓
任务（temp 资产落库）→ 作品入库 → 继续/再生成/发布/收藏
  ↓
资产库（我的资产 / 临时资产，上传素材 + 已保存产物）· 钱包（报价→扣费→流水）
```

### 1.1 身份（现状）

| 能力 | 现状 | 依据 |
| --- | --- | --- |
| 登录方式 | 邮箱+密码；弹窗与独立页双入口，redirect 防开放重定向 | `HgAuthDialog.vue` / `auth/login.vue` |
| 注册 | 前端校验密码强度 + 条款勾选；用户名由服务端生成 | `auth/register.vue` |
| 密码规则 | ≥8 位且含字母与数字（前后端同口径） | `app/utils/password.ts` |
| 会话恢复 | token 只在内存；刷新后 `auto-login` 用 HttpOnly Cookie 无感恢复 | `useApi.ts` L107 |
| 自动化 | 401/60001（及账号侧 50005/50006/50007、`UNAUTHENTICATED`）清登录态并提示重新登录，错误按 errorKey 转中文 | `useApi.ts` L199 |
| 退出 | 前端 clear + 跳登录页；**未调用后端登出** | `app.vue` L237 |
| 年龄门 | 站点开关控制全屏确认，拒绝即跳外站，不做绕过 | `AppAgeGate.vue` |
| 账号菜单 | 个人中心→`/settings`；我的发布→`/works`；充值→`/wallet?tab=recharge`；订单→`/wallet?tab=orders`（原「偏好设置」入口已被替换） | `app.vue` L549-585 |

**身份缺口（登录之后就该有而没有的）**
- 无「忘记密码」/重置密码链路（密码规则里写了重置口径，但无任何入口）。
- 无修改密码、修改邮箱（设置页文案提及「修改邮箱」入口**并不存在**）、无换绑。
- 无真正的游客登录入口（`/account/auth/guest` 前端从未调用；测试流程在用，产品未暴露）。
- 人机验证：独立登录/注册页已真接 Turnstile（`useTurnstile.ts`，先问 `/pub/verification/config`，站点配 `turnstile/both` 时渲染 widget 并带 `cf-turnstile-response`）；但**登录弹窗 `HgAuthDialog.vue` 未接**（纯表单、无 token），站点配了 turnstile 时弹窗登录/注册会被后端拒。
- 顶栏未读数只在进站和登录弹窗关闭时拉一次，无轮询/SSE，通知不及时。

### 1.2 钱（现状）

| 能力 | 现状 | 依据 |
| --- | --- | --- |
| 口径 | 后端全环境已统一 `coin_wallet`（金币），换算 `coinsPerCent=10`：1 元 = 100 分 = 1000 金币，边界换算一次。**前端代码里完全没有「金币」字样**（`grep coin/金币` 只命中图标 class），全站仍按「积分 / 余额(元)」两代口径显示 | 仓库 AGENTS.md 踩坑 §2 |
| 界面口径 | 顶栏「N 积分」+ 钱包页「可用积分 / 余额（元）」双卡片 + 报价 `costText` 的「N 积分 / N 余额」两级单位 —— 三处都落后于合并结论，需收敛 | `app.vue` L510 / `wallet.vue` L238-258 |
| 报价 | /create：云端模型按 `pricing.qualities[].balance`（单位「余额」）、本地/视频按 `rates` 画幅/时长单价（单位「积分」）；取不到价显示「费用待确认」 | `useModelCatalog.ts` `quoteModel` L83 |
| /tool 报价 | `cost` 恒 0（`const cost = ref(0)`，从不赋值），页面写「以实际结算为准」—— 未接报价引擎 | `tool/[code].vue` L224 |
| 扣费 | 后端 `createTask` 时扣（前端只预展示）；失败带上游原因；`INSUFFICIENT_CREDITS` → 撤假卡片，推「去充值」按钮直达 /wallet | `useChatStudio.ts` `send` L1003 |
| 充值 | checkout 档位 50/100/300/500/1000 元下单桩 + 「10 元 = 10,000 金币」文案（1 元 = 1000 金币）—— **支付网关仍未接** | `wallet.vue` L43/L288 |
| 会员 | 下单固定 `standard` + `moreCredits`（`doCheckout('member')`，单一面值口径）。后端仅按面值兑换金币：1 元 = 1000 金币，¥29/69/128/328/648 → 29,000/69,000/128,000/328,000/648,000 金币，会员 1 个月；**无额外赠送、无余额奖励**。历史 choice（moreCredits/moreBalance）新下单同额、旧订单原样可读；UI 不再做「更多积分/更多余额」二选一 | 后端 `economy.Offers`；`wallet.vue` `doCheckout` L130 |
| 文本押金 | 站点**未配置**（键缺失）→ 0 分（不押金）；建单侧 `chat.RunBilled` 兜到**最小 1 分**保护，结算按真实用量多退少补。**显式配 0 同样 0**；只有配置**读取故障**才用兜底值。后台「AI 供应商与模型」页展示同样收敛为 0（`Default: "0"` + `AllowZero`，保存 0 合法），不再出现"页面显示 100"的误导 | 后端 `billing/service/usage.go` `TextDepositPoints`；`chat/service/chat.go` L209；后台 `cms/controller/admin/ai_setting.go` `KeyTextDepositPoints` 项 |
| 流水 | 「订单（transaction）」与钱包 ledger 双 Tab；kind（daily/invite/generation/refund/publish/member/topup/adjust）映射中文 | `wallet.vue` L22 |
| 钱包深链 | `?tab=recharge` / `?tab=orders` 已实现：账号菜单「充值/订单」进来直接滚到对应区；非法值静默回退 | `wallet.vue` `applyTabFromQuery` L65 |
| 重复提交 | 前端意图指纹（mode/prompt/画幅/时长/模型/参考图）确认层，不扣款；重试=新任务重新计费 | `useChatStudio.ts` `send`/`confirmDuplicate` |

**钱缺口**
- 金币单一口径未落到 UI（顶栏「积分」、钱包卡片「可用积分/余额(元)」、充值换算说明三处仍是两代残留）。
- ~~后台文本押金展示默认值 100~~ **已解决（2026-09-24）**：后台「AI 供应商与模型」页的文本押金项已收敛为 0 —— `Default: "0"` + 新增 `allowZero: true`（该页数字项默认仍要求 > 0，只有文本押金放开 0）。实测闭环：未配置时 GET `value=0`；保存 0 → GET 0；保存 100 → GET 100；保存负数被拒；其它计数项保存 0 仍被拒。后台 UI 的 help text 由服务端 `hint` 下发，为「0 或未配置：不额外预占（建单最低押 1 分…）；填正数则按该值预占」。
- 会员权益目前**只有「面值兑换金币 + N 个月会员身份」两件事**，无其它已实现的独立权益；若后续要加，需同时改后端 `economy.Offers` 与前台会员卡文案。
- `useHougongApi.wallet()`（`/account/credits`，返回 `{balance,holds}`）前端**无任何调用点**，是死代码；实际钱包页走 `walletBalance()`（`/platform/economy/wallet`，返回 `{credits,balanceCents,nextExpiry}`）。
- 无消费前「余额不够»的前置校验：只有提交后才知道，体验被动。
- 任务失败自动退款是否有/多久，界面无任何说明（ledger 有 refund 项，透明度不足）。

### 1.3 生成（现状）

两条路径：
- **对话路径**：首页输入（不建任务）→ 草稿 `setDraft`（仅内存，刷新即失）→ `/create?tool=…&template=…` → 校验、上传参考图、`createTask` → 2.5s 轮询为权威 + SSE 加速 → 成功取 outputAssets → `createWork` 自动入库。
- **工具路径**：`/tool/[code]` 左表单右结果，`ratio` 写死 `1:1`，直接 createTask，不走对话。

关键口径：
- clientKey 一次逻辑提交一个；确认重复后仍生成用新 key。
- 参数上限全部跟模型能力走：count（cloud capabilities.maxOutputs / 本地 4）、参考图数（视频本地 1 首帧 + 9 参、视频云端 1、cloud 图 maxInputs、本地底模 1）、时长档（模型 durations）、2K 视频恒不可选。
- LoRA 仅本地图片底模按 family 过滤；成人 LoRA ⇒ r18。
- 状态机：creating/queued/running/reconciling/succeeded/failed/cancelled；reconciling 是中间态不算失败。
- `/create` 的 init 只消费 `?tool=`、`?template=`、`?session=`、`?mode=video` 四个 query（`useChatStudio.ts` L1352-1380）；`?remix=`、`?character=` 不在其中。

**生成缺口**
- `?remix=` 参数发出端有（首页作品卡「创作同款」，`index.vue` L487），消费端不存在 → 提示词回填未实现。
- `?character=` 同样无消费端（角色详情页「用她创作」发 `characters/[id].vue` L121）→ 带不上角色。
- tool 页估值恒 0，与 create 页报价口径不一致（界面显示价格与下单价格不一致的风险点，违反第 6 条约定）。
- createTask 无 sessionId 入参（`useChatStudio.ts` L1176 有显式注释），任务归属靠后端 EnsureActive，契约悬置。
- 首页提交若刷新，内存草稿全失（用户输入不落，任何恢复手段都没有）。

### 1.4 画幅 / 比例（现状）

- 8 档：横 21:9、16:9、3:2、4:3，方 1:1，竖 3:4、2:3、9:16；1K/2K（1K 尺寸 ×factor2）。数据表里 `shape` 取值是 `wide|portrait|square`（不是 `tall`）。 | `image-options.ts` L17
- 默认 9:16（竖屏优先，原 16:9 已改）；收敛顺序：模型声明 default → 竖屏兜底 → 支持列表第一位。 | `useChatStudio.ts` L194 / `useModelCatalog.ts` `pickRatio` L296
- 各模型支持的 ratios 差异大（文档举例 Nano Banana 10 档 vs Seedream 5 档，档数来自后端目录、仓库内不可核）；不支持的档**直接不渲染**而非置灰。 | `HgChatComposer.vue` L148
- 视频：只认模型自带的 resolutions 表，模型没声明的比例不下发。
- **没有任何「根据内容推荐画幅」能力**，横屏只是 4 个普通按钮之一。

**画幅缺口** → 见审计篇的「画幅推荐」专项：用户无从知道该选横还是竖；不渲染不置灰让用户误以为产品「缺档」。

### 1.5 资产（现状）

- `/assets` **四**页签：我的资产 / **临时资产** / 演员库 / 回收站（**空壳**）。前两个共用一套列表，靠 `scope` 区分：我的资产=`permanent`，临时资产=`temp`；演员库/回收站是独立组件。 | `assets.vue` L17-33
- 列的是账号下 `media_asset`：`origin=generated|uploaded`；`hidden` 一个状态 + `scope=temp|permanent`（缺省按 permanent）；排序 最新/最早/体积；关键词、kind、origin、重复图（sha256 dryRun 合并）筛选。 | `useHougongApi.ts` `listAssets` L1015
- **保存流程已落地**：临时生成产物 → 「保存到我的资产」= `POST /platform/asset/{id}/save`（幂等，只改 scope，不重传不重算）。落点：/assets 临时页签 `saveToLibrary`（L308）、/tool 结果区 `saveOutputs`（L138，按钮三态「保存到我的资产 / 保存中… / 已保存到我的资产」）。 | `useHougongApi.ts` `saveAsset` L1087
- **未落点的保存入口**：/create 对话产物面板 `HgAssetPanel` 与画布产物预览仍**没有**保存按钮（只有 继续修改/生成视频/下载）。
- 生成产物落库是**后端行为**（origin=generated），前端只按 id 解析；作品入库是前端 `createWork`。
- 删除=硬删（页面自己写「不可撤销」但页签挂着「回收站」，语义冲突）；隐藏/显示可批量（分片≤200）。 | `assets.vue` L392 / `chunkSizeFor` L361
- 引用与被引用：创作页 `@` 引用选择器（`HgImageRefPicker`）列当前已上传的参考图，`addReferenceFromAsset` 沿用 assetId 不重复上传；产物面板可「继续修改 / 生成视频」（产物即首帧）。注意 `HgChatComposer` 里 `@` 工具条入口**已按用户要求暂时取下**（逻辑保留、按钮注释掉，`HgChatComposer.vue` L97），`addReferenceFromAsset` 当前无调用点。 | `HgAssetPanel.vue` L44-55
- 媒体地址全是限时签名（作品/资产 3600s，工具封面 86400s），`useMediaRefresh` + `media-heal` 插件做过期自愈——**一切资产展示的通用前提**。 | `useMediaRefresh.ts` L1-6
- 演员库：`mine=listCharacters` 软删；封面默认自动=最近作品产物，`setCharacterCover(assetId=0)` 恢复自动；`public` 公共库后端无字段，前端如实留空。 | `HgActorLibrary.vue` L113-119
- 角色资产**入口已撤下**：`FEATURES.characterAssets=false`，侧栏/资产分区/搜索入口都不渲染，但 `/characters` 页面与接口、创作页角色选择全部保留（改回 true 即恢复）。账号菜单「个人中心」已改指向 `/settings`（不再受该开关影响）。 | `config/features.ts` / `app.vue` L548

**资产缺口（现状断点汇总，详细方案见审计篇 §A）**
- `scope` 只能区分 temp/permanent，**没有 `expires_at`/`saved_at`**：临时产物不会自动过期清理，「保存」也只是一个永久标记。
- 临时页签与「我的资产」是两个列表，但**对话路径产物没有保存入口**（见上），用户从 /create 出图后只能去 /assets 临时页签补保存。
- 无资产详情（尺寸/来源任务/被谁引用），`AssetDetail`/`Uses` 后端结构已存在未接。
- 删除语义与回收站冲突；无恢复/彻底删除链路；无引用保护提示（确认弹层只有一句泛化文案）。
- 一次慢/挂的 tools 目录请求会让首页快捷片整排消失且会话内不重试（实测坑，详见 AGENTS.md）。

### 1.6 历史 / 复用（现状）

- 作品库 `/works`：上半区 `hougong_work`（含收藏、可见性 private/unlisted/public、分级、删除、设为角色封面、发布到社区）；下半区社区发布 `platform_work` 四态（draft/published/unpublished/hidden）管理。**两个模型各管一段，是有意设计**。 | `works/index.vue` L14-16
- 继续编辑链路：产物面板 continueEdit/toVideo = 拿产物当引用替换整组；首页「继续创作」= 最近 3 作品 + 在飞任务角标（角标来自 `listTasks` 非终态数）。 | `useChatStudio.ts` L823 / `index.vue` L332
- 故事线 `/stories`：片段全量重排 + 集管理（episodes），**画布从集进**——`/canvas?ownerType=episode&ownerId=<id>`，画布把 owner 当不透明标签原样存取；剧本按需读画布产物，不镜像进 `hougong_episode.script`。 | `stories/[id].vue` L111-190 / `canvas.vue` L86
- 我的画布 `/canvases`：标题+时间列表，就地改名（只改标题、不动 revision）、软删（`graph/del`，产物与会话不动）、按归属过滤（episode/project/自由图）。 | `canvases.vue` L1-30
- 会话历史：侧栏今天/昨天/更早分组 + 顶栏搜索；打开会话分页读任务、倒序重建消息。

**复用缺口**
- 「继续创作」点击直达的创作会话上下文缺失（作品→会话无 anchor，只能重开）。
- 真实作品「创作同款」走不通（同 remix 缺口）。
- 社区作品与本站作品两套模型对用户的心智解释不足（发布流与探索流数据源不同）。

### 1.7 首页排序 / 推荐（现状）

- 顺序：hero → 快捷片（后台工具目录**前 8 个** `QUICK_COUNT=8`，色板 `QUICK_TINTS` 是前端按序号循环假数据，等 `hougong_tool.tint`）→ 继续创作（最近 3 作品+任务角标）→ 探索灵感（未登录整块隐藏）。 | `index.vue` L62/L94-95
- 探索流：`listWorksFeed(page, 4, 'explore')` → `/platform/work?scope=explore`，**纯时间序**；「热门/最新」角标是前端推（likes≥5 / 7 天内，`work-feed.ts`）；分类页签 `['推荐','动画动漫','影视创作','产品展示']` 只筛已加载内容（后端 feed 无 tag 参数），最多加载 8 页（`PAGE_SIZE*8=32` 条）。 | `index.vue` `loadExplore` L407/L397 / `work-feed.ts` L16
- /TV 读同一流（`listWorksFeed(page, 12, 'explore')`，封面墙 + 加载更多按钮，不做无限滚动）。 | `tv.vue` L19-36

**排序缺口** → 见审计篇 §C：缺推荐位/权重；分类伪装成分页过滤；快捷片顺序=后台表序，无效果数据。

### 1.8 设置 / 合规（现状）

- 设置页：改用户名（4-32 位规则 `USERNAME_RE`）、站点成人说明、入口确认重置、双端版本号（前台 `/api/version` + 接口 `/api/backend-version`）。 | `settings.vue` L24
- 成人内容默认可用（后端 AllowAdult 恒 true）；遮罩逻辑保留在作品页（canUseAdult 现恒 true）。 | `useAdultGate.ts`
- 画布开关是**运行时配置**（`NUXT_PUBLIC_CANVAS_ENABLED`，默认开、生产 false），用户不可见：`app.vue` 藏入口 + `middleware/canvas-gate.global.ts` 挡直连，两处同时生效；`AGE_GATE_REQUIRED` 错误有文案但**没有自动弹确认框**的分支。 | `config/features.ts`
- 另有代码内开关 `FEATURES.characterAssets=false`：角色资产入口撤下（功能保留）。 | `config/features.ts`

## 2. 现状边界清单（一句话级，写补全方案前先认账）

1. 草稿只内存：刷新/跨设备即失。
2. `?remix=`、`?character=` 深链发出端有、消费端无。
3. 回收站、公共演员库、探索推荐、内容推荐画幅：后端契约缺失，前端如实为空或写死。
4. 报价三处口径不齐（create `quoteModel` / tool 恒 0 / 换算文案旧）。
5. 任务归属会话的绑定靠后端隐式行为（createTask 无 sessionId）。
6. 媒体签名过期自愈是全站资产展示前提，任何新资产功能都要复合用它。
7. 通知无实时通道；登出不摔后端会话。
8. 金币口径合并已全环境落地，UI 有三处滞后点（顶栏、钱包卡片、充值换算）。
9. 资产 `scope`（temp/permanent）+ 保存接口已落地；缺的是 `expires_at`、对话面板/画布保存入口、回收站三动作。
10. 角色资产入口（`characterAssets=false`）与画布入口（运行时开关）都靠开关隐藏，功能保留。

---

> 审计与补全方案见同目录 `hougong-product-audit.md`（二次深审：资产生命周期 / 钱 / 登录 /
> 会话 / 画幅推荐 / 首页排序，逐项给目标态 + 分阶段落地路径）。

## 修订记录

> 二次深审（对照工作区源码逐条核验）。注意：核验时 `app/pages/assets.vue`、`app/pages/tool/[code].vue`、
> `app/pages/wallet.vue`、`app/composables/useHougongApi.ts`、`app/app.vue` 均处于**未提交**状态
> （`git status` 为 M），且核验过程中仍在被并行会话改动（如 Turnstile 接入是核验中途出现的），
> 本文按核验当时代码为准；索引 `npm run index:check` 已通过。

**改错（陈旧/与代码不符）**
1. §1.1 会话恢复行号：`useApi.ts` L103 → L107（L103 是注释行）。依据 `useApi.ts` L107 `restoreSession`。
2. §1.1 401 清登录态：补上账号侧 50005/50006/50007 与 `UNAUTHENTICATED`（L199 起）。依据 `useApi.ts` L193-207。
3. §1.5 **页签数错了**：原文「三页签（我的资产/演员库/回收站）」→ 实际**四页签**（新增「临时资产」，`assets.vue` L17-33）。
4. §1.5 **「无法区分生成未保存/已保存」已不成立**：已落 `scope=temp|permanent` 与 `POST /platform/asset/{id}/save`
   （`useHougongApi.ts` L1025/L1087），/assets 临时页签有 `saveToLibrary`（L308），/tool 结果区有 `saveOutputs`（L138，按钮三态）。
5. §1.5 `@` 引用：`HgChatComposer` 的 `@` 工具条入口**已暂时取下**（逻辑保留、按钮注释），`addReferenceFromAsset` 当前无调用点；
   原文「创作页 mention 面板引素材库图」应改为「`@` 选择器列当前已上传参考图（`HgImageRefPicker`）」。
6. §1.4 `shape` 取值更正：`wide|portrait|square`（原文审计篇写作 `tall`）。
7. §1.2 充值文案实测为「10 元 = 100,000 积分」（`wallet.vue` L298，与「10 万积分」等价）；流水 kind 补 `publish`/`member`。

**补漏（重要现状原文档未写）**
8. §1.5/§1.8 角色资产入口 `FEATURES.characterAssets=false` 已撤下（侧栏/资产分区/搜索），功能保留；账号菜单「个人中心」改指向 `/settings`（`app.vue` L548）。
9. §1.2/§1.6 钱包 `?tab=recharge|orders` 深链已实现（`wallet.vue` L65），账号菜单「充值/订单」直达；原文未提。
10. §1.3 `/create` init 消费的 query 明确为 `tool/template/session/mode`（`useChatStudio.ts` L1352-1380），`?session=` 有消费端。
11. §1.6 画布链路：`/canvas?ownerType=episode&ownerId=` 从集进、owner 为不透明标签；`/canvases` 我的画布（改名只动标题、软删）。
12. §1.7 探索分类值 `['推荐','动画动漫','影视创作','产品展示']`、`PAGE_SIZE=4`、上限 8 页；TV `PAGE_SIZE=12`、按钮加载。
13. §1.8 画布开关是运行时配置（默认开/生产 false），入口+直连两处生效（`config/features.ts` + `middleware/canvas-gate.global.ts`）。
14. §1.2 `useHougongApi.wallet()`（`/account/credits`）前端无调用点，是死代码；钱包页实走 `walletBalance()`。
15. §1.1 人机验证：核验过程中工作区**新增**了 `app/composables/useTurnstile.ts` 且登录/注册页已接入（`login.vue`/`register.vue` 传 `cf-turnstile-response`，`useHougongApi.login/register` 新增可选 `turnstileToken`）；但登录弹窗 `HgAuthDialog.vue` 未接。此条随并行会话的改动更新，若后续弹窗也接入请再核。

**存疑（需人工/后端确认）**
- §1.4「Nano Banana 10 档 vs Seedream 5 档」：档数来自后端目录，仓库内不可核。
- §1.2 后端 `EconomyWallet` 的 `credits`/`balanceCents` 是否已随 `coin_wallet` 合并改口径（前端只透传展示）。
- 核验期间工作区在持续被并行会话改动（Turnstile 就是核验中途出现的），本文以核验当时代码为准。

**会员 / 文本押金口径补充（2026-09-24）**
- §1.2 新增「会员」「文本押金」两行现状：会员仅按面值兑换金币（前端单按钮 + 「¥69 → 69,000 金币 · 会员 1 个月」）；
  文本押金未配置 = 0 分（建单兜最小 1 分）。
- 后台文本押金展示默认值已在 2026-09-24 收口为 0（`Default: "0"` + `allowZero: true`），见 §1.2「文本押金」行与「钱缺口」中的已解决条目。
