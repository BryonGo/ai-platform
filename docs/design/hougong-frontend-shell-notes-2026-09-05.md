# 后宫前端 · 应用壳与首页现状记录（2026-09-05）

> 记录当前可运行的 ai-platform 前端（由另一 Agent 完成首页 + 本会话完成的顶栏修正）。
> 本文用于后续 Agent 接手页面开发时保持一致，避免重复返工。图片交付仍统一 WebP。

## 1. 当前页面与结构

- **`/` 首页保持原版结构**（用户确认，勿再改动）：cinema-hero 影院首屏 + creator-deck 内嵌 composer（图片/视频、上传、提示词、参数、生成按钮）+ 注释保留的 cast 模块 + story-grid 作品流；锚点 id 仍在但不再承担导航职责。
- 侧栏/移动端导航走**多页路由**：总览 `/`、创作 `/create`、角色 `/characters`、故事 `/stories`、作品 `/works`（首页=总览）。
- 新增页面（本会话，作为独立入口保留）：
  - `/create` 创作工作台：composer + cast 出演阵容（可选角）
  - `/characters` 列表、`/characters/[id]` 详情（性格/外观锚点/服装预设/她的作品）
  - `/stories` 列表、`/stories/[id]` 详情（关系/场景/片段时间线）
  - `/works` 库（全部/视频/图集筛选）、`/works/[id]` 详情（生成信息/继续创作/同角色作品）
  - `/auth/login`、`/auth/register`（字段对齐 go-sdk account 契约）
- 共享：`app/composables/useHougong.ts`（角色×3/作品×10/故事×3 mock，结构对齐 openapi 契约）、
  `app/components/AppCharacterCard.vue`、`AppWorkCard.vue`、`AppStoryCard.vue`、`BrandNavIcon.vue`
- `app/app.vue`：应用壳（通栏顶栏 + 可收起侧栏 + 主内容 + 移动底部导航），导航高亮按路由路径计算

## 2. 设计 tokens（main.css 实际值，与早期手记略有差异，以本表为准）

| 语义 | 变量 | 值 |
|---|---|---|
| 画布/深底 | `--canvas` / `--deep` | `#0d0e10` / `#08090a` |
| 面板 | `--panel` | `#17181b` |
| 抬升面板 | `--raised` | `#202125` |
| 正文 | `--ink` | `#f3f1eb` |
| 弱化文字 | `--muted` / `--faint` | `#aaa7a0` / `#716f6a` |
| 主色 Amber | `--amber` / `--amber-soft` | `#fbbf24` / `#fbd36a` |
| 细分隔线 | `--line` | `rgb(255 255 255 / 0.1)` |
| 侧栏宽 | `--rail` | `240px`（收起 `92px`） |
| 顶栏高 | `--topbar-h` | `68px`（移动 `58px`） |

- 字体：`--font-sans`（MiSans/HarmonyOS/苹方/雅黑）、`--font-display`（思源宋体/Noto Serif SC 等衬线）用于标题与品牌。
- 风格特征：暗底、细线边框、Amber 点缀、`border-radius: 8px 3px 8px 3px`（故宫式倒角）与 `conic-gradient` 描边动画（composer / recommended 卡片）。
- 注意：amber 目前用 hex `#fbbf24`；手记早期建议 oklch amber-400，以页面实际实现为准，如需统一再全局替换。

## 3. 应用壳细节（本会话已按用户确认修正）

### 顶栏（通栏）

- 通栏顶栏横跨整屏，sticky 顶部，`z-index: 70`，半透明 + blur，下边框 `--line`。
- 左侧组 `.topbar-left`：**收起按钮 → 首页 → 竖向分隔线 → 创作中心 / Image Studio**。
  - `padding-left: calc(var(--rail) + clamp(22px, 3.2vw, 52px))`：**不顶格，与主内容区起点对齐**（收起后随 `--rail` 联动左移）。
- 右侧 `.account-area`：积分胶囊（黄点 + 数字 + “积分”）+ 头像（妲己图），`margin-right` 同款 clamp，**不贴最右**。
- 收起按钮 `.rail-toggle`：图标 `i-lucide-panel-left-close`（展开态）/ `i-lucide-panel-left-open`（收起态），带 `aria-expanded` 与中文 aria-label。

### 侧栏（side-rail）

- 位于顶栏下方（sticky `top: var(--topbar-h)`，`height: calc(100dvh - var(--topbar-h))`），右侧竖线 `border-right: 1px solid var(--line)` **必须保留**。
- 内部自上而下：品牌（amber “后”字标 + 后宫字标）→ 导航（总览/创作/角色/故事/作品，锚点）→ 底部工具（语言/通知/设置）。
- **收起行为（用户确认）**：固定宽度，由顶栏按钮控制 `240px ↔ 92px` 图标窄栏（`--rail` 变量 + `.app-shell.rail-collapsed` 选择器控制文字隐藏）；**已删除 761–1280px 自动收窄媒体查询**，不再随视口自适应。
- 移动端（≤760px）：侧栏隐藏（`--rail: 0`），顶栏只显示「后宫」（`.top-bar::before`）+ 积分/头像，`.topbar-left` 隐藏；底部固定 tab 导航（5 项）显示。

## 4. 首页主要资产（public/images）

| 文件 | 用途 |
|---|---|
| `hougong-hero-cinematic-v2.webp` | 首屏背景（cinema-hero） |
| `daji-three-tail-cutout-v2.webp` | 首屏主人物剪影（可透明切图，妲己） |
| `daji-three-tail-front-v1.webp` | 人物卡/头像/旧整图（不透明背景） |
| `daji-approved-direction-v1.webp` | 备用人物图 |
| `office-lady-gold-glasses-v1.webp` / `nurse-sweet-adult25-v1.webp` | 首屏支持角色（成年角色示例） |

角色文案口径：妲己 24 岁成年、三尾狐灵；“21/25 岁成年”等支持角色示例图仅首页氛围用，角色档案以实际创建为准。

## 5. 本会话已改动文件（顶栏修正）

- `app/app.vue`：结构重排——通栏顶栏移出主栏，新增收起按钮/首页；`.topbar-left` 与 `.account-area` 分组。
- `app/assets/css/main.css`：`.top-bar/.shell-body/.side-rail/.main-column` 布局改造；新增 `.topbar-left/.rail-toggle/.home-link/.topbar-divider`；`.app-shell.rail-collapsed` 收起态样式；移除 761–1280 自适应块；`--topbar-h` 变量化。

## 6. 待办/后续页面

- [x] 多页路由拆分（首页/创作/角色/故事/作品/登录注册）
- [x] 顶栏通栏 + 首页入口 + 收起侧栏按钮（取消自适应）
- [ ] 与后端契约 `docs/contracts/openapi-hougong.yaml` 对齐（当前数据为 composable mock，替换为契约请求层）
- [ ] 角色/故事的增删改（新建角色、新建故事表单）、作品上传真实预览
- [ ] 空状态/错误态统一、移动端视觉回归
