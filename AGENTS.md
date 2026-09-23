# 本仓库的 AI 协作约定（ai-platform / 后宫前台）

## 先读索引，不要遍历源码

本仓库的入口文档是 **[docs/FRONTEND-INDEX.md](./docs/FRONTEND-INDEX.md)**：目录职责、四条主链路、
必须遵守的约定（雪花 ID、凭据存放、站点归属、图位语义等）都在那里。

找一个函数/一个 props/一个接口时，按这个顺序，不要一上来就整份读源码：

```bash
node scripts/gen-frontend-index.mjs --grep <关键词>          # 搜全部索引，只回命中行
node scripts/gen-frontend-index.mjs --file <源文件路径>       # 看某个文件的完整符号段落
```

索引分册在 `docs/frontend-index/`：`composables.md`（组合式函数方法，最重要）、`components.md`、
`pages-routes.md`、`types.md`、`utils-data.md`。`useChatStudio.ts`（约 1460 行）与
`useHougongApi.ts`（约 1460 行）是最大的两个文件，**除非要改它们，否则不要整份读**。

## 改完代码必须同步索引

索引的符号、签名、行号都从源码生成。改了 `app/` 下的导出函数、组合式函数成员、组件 props/emits、
页面之后：

```bash
npm run index:frontend   # 重新生成（和代码放同一个提交）
npm run index:check      # 只校验是否过期
```

- 新增函数时在它上方写一行 `// 说明`，索引的「说明」列直接取它。
- 不要手改 `<!-- BEGIN GENERATED -->` 与 `<!-- END GENERATED -->` 之间的内容（会被覆盖）；
  改说明就改源码注释，改结构就改 `scripts/gen-frontend-index.mjs`。

## 提交与验证

- **按主题拆提交**：一个提交只讲一件事，信息写清「现象 / 根因 / 改法 / 实测」。
- 不要 `git add -A`：本仓库可能同时有别的会话在改，只显式 `git add <路径>`。
- 提交前：`npm run lint`、`npm run typecheck`，涉及纯逻辑再跑 `npm run test`。
- 涉及生成、计费、上传的改动，静态检查不算验证，必须接真实后端跑一遍。

---

# 后宫产品（跨仓库）的 dev / 测试 / 部署 / 踩坑

> 本节是**产品级**约定，不只管本仓库：后宫由四个仓库组成，前台（本仓库）与后端、后台、编排
> 是分开的。下面每条都是本机实测过的，不是抄文档。

## 相关仓库与端口（dev 实测）

| 面 | 仓库 | dev 地址 | 怎么起 |
|---|---|---|---|
| 前台（后宫站） | `ai-platform`（本仓库） | `http://localhost:3333` | `npm run dev` |
| 后台控制台 | `../aicodcms-vue` | `http://localhost:8888` | `vp dev` |
| 后端 API | `../aicodcms` | `http://127.0.0.1:8201` | 见下 |
| 部署编排 | `../infra` | — | 脚本在 `scripts/server/` |

## dev 规则

### 前端：站点与代理全在 `.env.local`

`.env.local` **被 `.gitignore` 忽略、不入库**（换机器要自己建）。实测内容与作用：

```bash
NUXT_PUBLIC_SITE_CODE=hougong     # 不带就回落 default 站：账号找不到、工具目录 0 个
API_PROXY=http://127.0.0.1:8201   # nuxt routeRules 把 /api/v1/** 反代到本地 API
NUXT_API_BASE_INTERNAL=http://127.0.0.1:8201   # SSR 走内网直连，不绕公网域名
```

- 浏览器端 `apiBase()` 留空 ⇒ 同源 `/api/v1`，由 nuxt 的 `routeRules['/api/v1/**'].proxy` 转发。
  **这是唯一无跨域的组合**。
- **不要**设 `NUXT_PUBLIC_API_BASE` 指向外部域名：那会把浏览器请求变成跨站，撞上后端
  `internal/router/router.go` 的 `MiddlewareCSRF`（`Sec-Fetch-Site: cross-site` 一律拒），
  表现是登录/写接口 403，而 curl 直连后端却是好的 —— 很容易误判成"密码错了"。
- 画布开关是 `NUXT_PUBLIC_CANVAS_ENABLED !== 'false'`：**dev 默认开**，只有显式 `=false` 才关。

### 后端：启动参数必须带站点

```bash
APP_ENV=dev GF_GCFG_FILE=config.dev DEV_SITE_CODE=hougong APP_ROLE=all <二进制>
```

- **`DEV_SITE_CODE=hougong` 不能省**：它决定"请求没带 `X-Site-Code` 时回落到哪个站"。
  省掉的表现是前台工具目录变 0 个。
- `config.dev.yaml` 是本地忽略文件；**不要**用 `manifest/config/config.yaml`（指向生产库）。
- `APP_ROLE=all`：worker 与 API 同进程，画布/生成类任务才有人执行。
- 站点隔离实测（用来判断站点参数是否生效）：
  `X-Site-Code: hougong` → 72 个工具；`: default` → 0 个；不带 header → 回落 hougong。

### 后台登录

`POST /api/v1/pms/login`，字段名是 **`username`**（不是 `account`），本站 `admin` / `aa666888`。
后台请求要带 `Authorization: Bearer <token>` + `X-Site-Code: <site>`。

## 测试规则

- 提交门禁：`npm run lint`、`npm run typecheck`；纯逻辑加 `npm run test`（当前 22 个用例）。
- 改了 `app/` 下导出函数/组合式成员/组件 props/页面 ⇒ `npm run index:frontend` 并把生成物
  放进同一个提交；`npm run index:check` 只校验。**新增导出符号一定会让 check 失败**。
- **浏览器端到端**：Playwright 已装在 `../aicodcms-vue/node_modules/playwright`（chromium 已下载），
  可直接 `require` 它跑"真实页面 + 真实后端"。省事的套路：
  1. `context.request.post('http://localhost:3333/api/v1/account/auth/guest', …)` 先拿会话
     （`Set-Cookie` 会落进浏览器上下文，前端靠 HttpOnly Cookie 自动恢复登录）；
  2. 再 `page.goto(...)` 走真实 UI，断言界面**文案**而不只是接口返回。
- 涉及**生成、计费、上传、错误提示**的改动，静态检查不算验证 —— 必须接真实后端跑一遍。

## 部署规则

- 生产构建**必须**带 `--build-arg NUXT_PUBLIC_CANVAS_ENABLED=false`。首页 `/` 在
  `nuxt.config.ts` 里是 `prerender: true`，它的 HTML 与内嵌 `__NUXT__` 配置**在构建期就定稿**，
  运行时注入无效 —— 构建期漏传，画布入口就会跟着上生产。
- 脚本在 `../infra/scripts/server/`，都在**部署机上跑**（源码/二进制先 scp 过去）：
  - `build-hougong.sh <TAG>`：解 `/root/hougong-src.tgz` → `docker build -t bryongo/hougongweb:<TAG>`
    （带上面的 build-arg）。
  - `apply-hougong.sh <TAG>`：改 `/data/infra/.env` 的 `HOUGONGWEB_IMAGE_TAG`（先备份 `.env.bak-<TS>`）
    → `docker compose up -d hougongweb`。
  - 配套：`build-console.sh` / `apply-console.sh`（改 `AICODCMS_CONSOLE_TAG`）、
    `deploy-api.sh`（换二进制 + 重启 + healthz 轮询 + 失败给回滚命令）。
- 上线前先看当前生产版本：`docker ps --format '{{.Names}} | {{.Image}}'`。
- **dev 先行，生产要明确点头**；生产库的迁移（配置中心、钱包合并）尚未做，见下面踩坑 §2。

## 踩坑（都踩过，按现象查）

### 1. 后端错误文案直接漏给用户

后端同时下发 `message`（内部英文）与 `errorKey`（稳定键），前端只取 `message` 就会把
`insufficient credits` 这种英文怼到用户脸上。

> **规矩：按 `errorKey` 分支，不要匹配 `message` 文案。** 收口在
> `app/composables/useApi.ts` 的 `apiRequest`（`PlatformApiError` + `errorKey` 文案表）；
> 新增错误码往那张表里加一条，全站调用点自动生效。

### 2. 「余额不足」不一定真的没钱

后宫钱包有**两代口径**：

| | 表 | 现状 |
|---|---|---|
| 旧 | `credit_wallet`（积分）+ `platform_balance_wallet`（余额/分） | **生产库仍是这一代** |
| 新 | `coin_wallet`（两者合并） | dev / test 已是这一代 |

所以会出现"账号明明有 99999 积分，却报余额不足"—— 因为那条链路扣的是**余额(分)**，账号只有积分。
**排查先确认是哪个钱包、哪一代口径，再怀疑模型/供应商。**

### 3. 画布报「输入槽「material」还没接线」

源节点（如"剧本输入" `script_in`）本身不建任务，但**必须能产出产物**：

- 手工建图时，`inputs` 要写成 `{artifactId, version, from, slot}` 且 `artifactId` 指向**已存在**的产物，
  光连 `edges` 不算接线；
- 所以要先**单独跑源节点**拿到产物，再接给下游，否则下游永远"输入没就绪"。

### 4. 定位某次画布运行失败

界面上显示的 `#<paramsHash>` 可直接在 `canvas_run` 表按 `params_hash` 查
`status` / `error` / `cost_credits` / `task_ids`：

- `cost_credits=0` **且** `task_ids IS NULL` **且** `started_at = finished_at`
  ⇒ 在建单/调上游**之前**就被拒了（校验或计费），跟模型无关；
- 反之才需要往模型/上游查。

### 5. "测试连接/拉取成功"不等于模型名是对的

后台的探测只证明**连得上、列表拉得到**，不证明注册进库的 `upstream_id` 上游真的有。
用 `../aicodcms` 的核对工具逐条比：

```bash
cd ../aicodcms && APP_ENV=dev GF_GCFG_FILE=config.dev go run ./hack/modelcheck -site hougong -v
```

实测撞出过 `gemini-2.5-flash`、`grok-imagine-image` 这类**上游不存在**的名字：
它们在画布下拉里正常可选，一提交才 `Model not found`。

### 6. 兄弟仓库可能同时有别的会话在改

前台、后端、后台共用同一批 worktree，实测遇到过 `../aicodcms/hack/dbmig/main.go` 正被并行会话
写着。**永远显式 `git add <路径>`**，提交前 `git status` 扫一眼有没有不是自己的改动。
