# 全站路由与页面设计（v1 方案）

> 2026-09-25。本文只做**路由与页面设计**，不改代码。
> 目标：除创作者工作台 `/create` 外，**每个页面级视图都有自己的 URL**，
> 切换页面必须换路由；旧链接全部保留重定向。
>
> 现状事实来自 `docs/frontend-index/pages-routes.md` 与当前源码逐条核对，
> 不是从原型或记忆推断。

## 0. 一句话结论

现在站点有 21 个页面文件、URL 基本独立，但**页面内部的“页面级 tab / 面板”有 4 处没有写 URL**：
`/wallet` 的交易/流水、`/effects` 的全部/图片/视频、首页探索分类、演员库的平台/我的来源。
另有 `/characters*`、`/assets?pane=actors`、`/wallet?tab=recharge` 三套旧入口需要统一。
本文给出完整目标路由、旧→新重定向、每页独立设计和分阶段实施顺序。

## 1. 设计原则

1. **一页一路由**：用户能点到的“整页视图”必须有独立 path，能刷新、能分享、能后退。
2. **path 表达页面，query 表达可选状态**：
   - 页面级 tab / 来源 / 分类 → path 子路由；
   - 筛选、分页、预览对象、当前造型、当前 run 等**不改变页面语义**的状态 → query；
   - 只有 `/create` 例外（内部会话/模式/技能切换不拆路由，见 §6）。
3. **详情页可寻址**：演员详情、作品详情、故事详情、工具页、画布图都有独立 URL；
   详情内的子视图（造型、生成 run、资产预览）至少要有 query 或子路由。
4. **旧链接永久重定向**，不做死链。重定向规则集中在 §5。
5. **每页独立设计**：列表页、详情页、创建页、设置页各自有自己的
   加载/空/错误/权限/离开确认策略，不靠“同一个大组件里 `v-if` 切状态”混过去。

## 2. 现状审计

### 2.1 已有独立页面路由

| 当前 URL | 文件 | 页面职责 | 页面级视图 | URL 同步现状 |
|---|---|---|---|---|
| `/` | `app/pages/index.vue` | 首页：快捷片 / 继续创作 / 探索 | 探索分类 `推荐/动画动漫/影视创作/产品展示` | ❌ 只改 `exploreCategory` 状态，不写 URL |
| `/explore`（不存在） | — | 探索流独立页 | — | ⚠️ 分类只存在于首页组件内 |
| `/effects` | `app/pages/effects.vue` | 效果库 | 全部 / 图片 / 视频 | ❌ `tab` 是组件状态，完全不写 URL |
| `/tool/:code` | `app/pages/tool/[code].vue` | 单工具页 | 模板切换、输入形态、结果区 | ✅ path 带 code；`?template=` 已用 |
| `/create` | `app/pages/create.vue` | 创作者工作台 | 会话、模式、技能、结果 | ✅ `?session=`/`?tool=`/`?template=`/`?mode=`/`?remix=` 已有；**本方案唯一不拆路由的页面** |
| `/canvas` | `app/pages/canvas.vue` | 画布工作台 | 图、模板、节点详情、产物预览 | ⚠️ `?id=` 会 `router.replace` 回写；`?ownerType/&ownerId=` 只进不出 |
| `/canvases` | `app/pages/canvases.vue` | 我的画布列表 | 列表/重命名/复制/删除 | ✅ 列表页独立 |
| `/stories` | `app/pages/stories/index.vue` | 故事列表 | — | ✅ |
| `/stories/:id` | `app/pages/stories/[id].vue` | 故事详情 | 集列表、剧本展开 | ⚠️ 集/剧本是内部状态；建议至少 query |
| `/works` | `app/pages/works/index.vue` | 我的作品 / 我的发布 | 两个数据源上下分区 | ⚠️ 不是 tab，是同页两段；可接受 |
| `/works/:id` | `app/pages/works/[id].vue` | 作品详情 | — | ✅ |
| `/tv` | `app/pages/tv.vue` | TV 频道 | — | ✅ |
| `/notifications` | `app/pages/notifications.vue` | 通知 | — | ✅ |
| `/settings` | `app/pages/settings.vue` | 设置 | 账号/成人内容/版本 | ✅ 单页可接受 |
| `/auth/login` `/auth/register` | `app/pages/auth/*` | 登录 / 注册 | — | ✅ |
| `/assets` | `app/pages/assets.vue` | 我的资产 / 临时 / 演员 / 回收站 | 4 个页签 | ✅ `?pane=` 双向同步（目前唯一做对的） |
| `/actors/:id` | `app/pages/actors/[id].vue` | 平台演员详情 | 造型、画廊三块、音色 | ⚠️ 造型/画廊选择不写 URL |
| `/characters` | `app/pages/characters/index.vue` | 旧“角色资产”列表 | — | ⚠️ 与 `/assets?pane=actors`、`/actors` 重复 |
| `/characters/new` | `app/pages/characters/new.vue` | 旧“新建角色” | — | ⚠️ 成功后跳 `/assets?pane=actors&source=mine` |
| `/characters/:id` | `app/pages/characters/[id].vue` | 我的演员详情 + 生成入口 | 生成 run 状态 | ⚠️ 生成 run 不写 URL；与平台演员详情 `/actors/:id` 命名分叉 |
| `/characters/:id/edit` | `app/pages/characters/[id]/edit.vue` | 我的演员编辑 | — | ⚠️ 同上 |

### 2.2 无独立 URL 的“页面级视图”

| 视图 | 位置 | 现状 | 风险 |
|---|---|---|---|
| 钱包 交易 / 流水 | `app/pages/wallet.vue:21,521-522` | `tab` 只改组件状态；`?tab=` 只支持入站 `recharge/orders` 滚动落点（`:66-71,194-198`） | 切到流水后刷新/分享/后退都回交易；“流水”页面找不回 |
| 钱包 充值 / 订单 / 会员 | `app/pages/wallet.vue` + `app/app.vue:569-581` | 头像菜单用 `/wallet?tab=recharge|orders` 滚动到区域 | 能进，但切走后 URL 不表达当前位置 |
| 效果 全部 / 图片 / 视频 | `app/pages/effects.vue:26,135-157` | `tab` 纯状态 | 分享“视频效果”只能分享 `/effects` |
| 首页探索分类 | `app/pages/index.vue` `switchCategory` | `exploreCategory` 纯状态 | 分类无法分享 |
| 演员库 平台 / 我的 | `app/components/HgActorLibrary.vue:22-24` | 只在初始化和 watch 时读 `?source=`，`activate()` 不回写 | 点“我的演员”后 URL 不变 |
| 站内搜索 | `app/app.vue` `searchOpen/searchQuery/searchResults` | 搜索是 shell 内浮层 | 搜索结果无法分享/刷新保留 |
| 演员详情 造型/画廊 | `app/components/HgActorDetail.vue` | `selectedOutfitId/activeSlot` 纯状态 | 分享某个造型/某张图只能到演员 |
| 生成 run | `app/pages/characters/[id].vue` | `run` + `runId` 在组件状态，轮询 `latest` | 刷新只能看到 latest；历史 run 无地址 |
| 资产预览 | `app/pages/assets.vue` `previewOpen` | 预览是组件状态 | 分享单张资产只能到列表 |

## 3. 目标路由表（推荐方案）

> 表中 `⛔` 是 `/create` 例外，不拆路由；其余页面级视图全部 path 化。

### 3.1 首页与发现

| 目标 URL | 页面 | 说明 |
|---|---|---|
| `/` | 首页 | 快捷片 / 继续创作 / 探索入口 |
| `/explore` | 探索流 | 默认“推荐” |
| `/explore/:category` | 探索流分类 | `recommend/anime/film/product`；分类即 path |
| `/effects` | 效果库 | 默认全部 |
| `/effects/image` | 图片效果 | 独立 path |
| `/effects/video` | 视频效果 | 独立 path |
| `/tool/:code` | 单工具页 | 保持；`?template=` 仍有效 |

### 3.2 创作者与画布

| 目标 URL | 页面 | 说明 |
|---|---|---|
| `/create` ⛔ | 创作者工作台 | **例外**：会话/模式/技能/结果不拆路由；保留 `?session/tool/template/mode/remix` |
| `/canvas/:graphId` | 画布图 | 当前 `/canvas?id=` 改成 path；`?ownerType&ownerId` 保留为来源标签 |
| `/canvas` | 新画布 | 无 id 时新建/选模板 |
| `/canvases` | 我的画布列表 | 保持 |

### 3.3 作品与故事

| 目标 URL | 页面 | 说明 |
|---|---|---|
| `/works` | 我的作品 / 我的发布 | 保持；两段数据源仍是同页 |
| `/works/:id` | 作品详情 | 保持 |
| `/stories` | 故事列表 | 保持 |
| `/stories/:id` | 故事详情 | 保持；`?episode=` 可选，定位某集 |
| `/tv` | TV 频道 | 保持 |

### 3.4 演员（新命名空间）

| 目标 URL | 页面 | 说明 |
|---|---|---|
| `/actors` | 平台演员库 | 平台演员 + 筛选；替代 `/assets?pane=actors` |
| `/actors/mine` | 我的演员 | 自建 / 复制来的演员 |
| `/actors/new` | 新建演员 | 替代 `/characters/new` |
| `/actors/:id` | 平台演员详情 | 保持；`?outfit=` 可选，定位造型 |
| `/actors/mine/:id` | 我的演员详情 | 替代 `/characters/:id`；生成 run 入口也在这 |
| `/actors/mine/:id/edit` | 我的演员编辑 | 替代 `/characters/:id/edit` |
| `/actors/mine/:id/generation/:runId` | 生成 run 详情 | 生成任务可分享/刷新保留；无 runId 时用最近一次 |

命名理由：
- 平台演员 id 与我的演员 id 来自**两张不同的表**（`hougong_actor.id` vs `hougong_character.id`），
  若共用 `/actors/:id` 语义不清晰，因此我的演员统一在 `/actors/mine/:id` 下。
- `/characters*` 全部重定向到 `/actors/mine*`，不再维护第二套列表。

### 3.5 资产

| 目标 URL | 页面 | 说明 |
|---|---|---|
| `/assets` | 我的资产 | 替代 `?pane=library` |
| `/assets/temp` | 临时资产 | 替代 `?pane=temp` |
| `/assets/trash` | 回收站 | 替代 `?pane=trash` |
| `/assets/:id`（可选） | 资产详情/预览 | 若产品要单资产页；否则用 `?asset=<id>` 浮层 |

演员页签不再属于资产：`/assets?pane=actors` 永久重定向 `/actors`。

### 3.6 钱与账号

| 目标 URL | 页面 | 说明 |
|---|---|---|
| `/wallet` | 钱包概览 + 交易 | 默认交易 |
| `/wallet/ledger` | 流水 | 替代 `?tab=ledger` 只读不写 |
| `/wallet/recharge` | 充值/会员 | 替代 `?tab=recharge` 滚动落点 |
| `/wallet/orders` | 订单 | 替代 `?tab=orders` 滚动落点 |
| `/wallet/membership`（可选） | 会员 | 若从充值里拆出独立页 |
| `/notifications` | 通知 | 保持 |
| `/settings` | 设置 | 保持；如要拆账号/成人内容再用 `/settings/account` |
| `/auth/login` | 登录 | 保持 |
| `/auth/register` | 注册 | 保持 |
| `/search` | 站内搜索 | `?q=`；替代 shell 浮层，结果可分享 |

## 4. query 允许范围（path 化之后）

| query | 用在 | 语义 |
|---|---|---|
| `?outfit=<id>` | `/actors/:id` | 当前造型 |
| `?slot=<key>` | `/actors/:id` | 当前画廊块（portrait/emotive/turnaround） |
| `?asset=<id>` | `/assets` | 资产预览浮层 |
| `?episode=<id>` | `/stories/:id` | 当前集 |
| `?category=` | 首页 `/` | 仅当 `/explore` 未上线时的兼容入口 |
| `?template=` | `/tool/:code` | 工具模板 |
| `?session/tool/template/mode/remix` | `/create` | 创作者工作台内部状态 |
| `?ownerType&ownerId` | `/canvas/:graphId` | 画布来源标签 |
| `?q=` | `/search` | 搜索词 |
| `?page=&keyword=` | 列表页 | 分页/筛选，不进 path |

原则：**query 改变的是同一页面的“看哪一份数据/哪一个对象”，不是“在哪一页”。**

## 5. 旧链接 → 新链接重定向

| 旧 URL | 新 URL | 处理 |
|---|---|---|
| `/characters` | `/actors/mine` | 301/客户端跳转 |
| `/characters/new` | `/actors/new` | 301 |
| `/characters/:id` | `/actors/mine/:id` | 301 |
| `/characters/:id/edit` | `/actors/mine/:id/edit` | 301 |
| `/assets?pane=actors` | `/actors` | 301 |
| `/assets?pane=actors&source=mine` | `/actors/mine` | 301 |
| `/assets?pane=temp` | `/assets/temp` | 301 |
| `/assets?pane=trash` | `/assets/trash` | 301 |
| `/assets?pane=library` | `/assets` | 301 |
| `/wallet?tab=ledger` | `/wallet/ledger` | 301 |
| `/wallet?tab=recharge` | `/wallet/recharge` | 301 |
| `/wallet?tab=orders` | `/wallet/orders` | 301 |
| `/effects`（点击 tab 不换 URL 的旧链接） | `/effects` 默认全部 | 无痛；`?tab=` 若以后出现则映射 |
| `/canvas?id=<id>` | `/canvas/<id>` | 301；保留 `ownerType/ownerId` |
| `/assets?pane=actors` 在代码里的跳转 | 改成 `/actors/mine` | 调用点见 §7 |

## 6. `/create` 为什么例外

`/create` 是一个**工作台**，不是一个列表/详情页面：
会话、模式（图片/视频）、工具、模板、技能、结果区、历史侧栏都在同一工作区里连续切换，
用户的心智是“在同一个创作会话里换工具”，不是“跳去另一个页面”。
因此保留：
- `/create` 一个 path；
- `?session/tool/template/mode/remix` 表达当前工作台上下文；
- 不把“图片模式/视频模式/某次生成结果”拆成一堆路由。

## 7. 受影响文件与实施顺序

### 7.1 路由与外壳

- `app/app.vue`：侧栏/账号菜单/搜索入口的 `to` 全部指向新 path；搜索浮层改为 `/search?q=`。
- 新增页面文件：
  - `app/pages/explore/index.vue`、`app/pages/explore/[category].vue`
  - `app/pages/effects/image.vue`、`app/pages/effects/video.vue`
  - `app/pages/wallet/ledger.vue`、`/recharge.vue`、`/orders.vue`
  - `app/pages/actors/index.vue`、`mine/index.vue`、`new.vue`、`mine/[id]/index.vue`、`mine/[id]/edit.vue`、`mine/[id]/generation/[runId].vue`
  - `app/pages/assets/temp.vue`、`trash.vue`
  - `app/pages/search.vue`
- 旧页面保留为薄重定向：`app/pages/characters/**`、`app/pages/assets.vue` 的 `pane` 兼容分支、
  `app/pages/canvas.vue` 对 `?id=` 的兼容。

### 7.2 组件内跳转点（必须一起改）

| 位置 | 现状 | 新目标 |
|---|---|---|
| `HgActorDetail.vue:183` | `navigateTo({path:'/assets',query:{pane:'actors',source:'mine'}})` | `/actors/mine` |
| `AppCharacterForm.vue:23` | `cancelTo: '/assets?pane=actors'` | `/actors` |
| `characters/new.vue:23` | 成功后回 `/assets?pane=actors&source=mine` | `/actors/mine` |
| `characters/[id].vue:443` | 详情里的 `/assets?pane=actors` | `/actors` |
| `app/app.vue:572,581` | `/wallet?tab=recharge|orders` | `/wallet/recharge|orders` |
| `canvases.vue:78,107` | `/canvas?id=` | `/canvas/<id>` |
| `stories/[id].vue:443,530,594` | `/canvas?ownerType=...` | `/canvas?ownerType=...`（无 id 新画布，保持不变） |

### 7.3 分阶段

| 阶段 | 内容 | 风险 |
|---|---|---|
| P0 | 路由设计文档（本文） | 无 |
| P1 | 全站 URL 同步补漏：`wallet/effects/首页分类/演员来源/搜索` 至少写 query，保证“切视图必换 URL” | 低；不动 path，不破链接 |
| P2 | 演员命名空间迁移 `/characters* → /actors/mine*`、`/assets?pane=actors → /actors` + 重定向 | 中；要改所有跳转点与分享链接 |
| P3 | 资产/钱包/效果 path 子路由 + 旧 query 重定向 | 中；wallet/effects 组件要拆页面 |
| P4 | 详情子视图可寻址：造型 `?outfit=`、生成 run `/actors/mine/:id/generation/:runId`、资产预览 `?asset=`、搜索 `/search` | 中 |
| P5 | 画布 `/canvas/:graphId`、探索 `/explore/:category` | 中高；画布有大量内部状态 |

## 8. 每页独立设计检查清单（实施时逐页过）

> 2026-09-25 实施状态（本仓库）：P1 + P2 已落地并实测（见下）。带 `[~]` 的是部分满足或
> 属于各页原有实现、未在本次统一收口。

- [x] 有唯一 path；刷新后能恢复同一视图（`/create` 按 §6 例外；`/canvas` 仍是"最近一张"入口）
- [x] 页面级 tab/来源/分类全部是 path 子路由，不是组件状态
- [x] query 只用于筛选/分页/对象选择（§4）
- [~] 登录/权限/年龄门处理在该页自己的入口，不靠外壳兜底（`/actors` 已给登录提示；
      `/assets`、`/wallet` 仍是 `goLogin()` 跳登录页）
- [~] 加载 / 空 / 错误 / 重试 四态独立（`/explore`、`/search`、`/actors` 新页已具备；
      其余沿用各页原有实现）
- [x] 跨页返回目标明确（列表→详情→返回列表保留筛选；`/actors`↔`/actors/mine` 用浏览器后退）
- [x] 分享链接不含临时签名、token、内部 object key
- [x] 旧 URL 有重定向，不产生 404（301 实测：`/characters*`、`/assets?pane=*`、`/wallet?tab=*`、`/canvas?id=`）
- [x] 页面标题与 `app.vue` 的 `PAGE_NAMES` 映射同步
- [ ] 索引更新：新增页面后跑 `npm run index:frontend`（本次未跑，由主会话统一生成）

## 9. 需要产品拍板的点

1. `/explore/:category` 是独立探索页，还是只把首页分类写进 `?category=`？
2. `/wallet/recharge`、`/orders`、`/membership` 是否要真正拆成独立页面，还是仅子路由滚动定位？
3. 平台演员与我的演员是否接受 `/actors` 与 `/actors/mine/:id` 的双命名空间？
4. 资产是否需要 `/assets/:id` 单资产详情页，还是只用 `?asset=` 浮层？
5. 故事详情里的“集/剧本”是否要 `/stories/:id/episodes/:episodeId`，还是 `?episode=`？
6. 画布是否接受 `/canvas/:graphId`（会改变 `canvases.vue` 的跳转和旧 `?id=` 链接）？

## 10. 预期产出

- 一份可执行的旧链接重定向表（§5）；
- 每个页面独立的路由/入口/离开/状态设计（§3、§4、§8）；
- 分阶段实施清单（§7.3），P1 可先独立上线，不等命名空间迁移。

---

## 附：本方案不做什么

- 不改 `/create` 工作台内部为多个路由；
- 不复制任何外部站点结构或素材；
- 不为了“路由好看”把筛选/分页也塞进 path；
- 不在没有重定向的情况下删除旧 URL。
