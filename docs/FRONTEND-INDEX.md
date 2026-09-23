# 后宫前台（Nuxt）AI 索引

> 给 AI 读的入口文档。**目的：不要为了找一个函数，把 `useChatStudio.ts` / `useHougongApi.ts`
> 这两个上千行的文件整份读一遍。**
>
> 结构：本文（语义层，手写）负责「东西在哪、链路怎么走、有哪些坑」；`docs/frontend-index/`
> 下的分册（生成层）负责「具体有哪些符号、签名是什么、在第几行」，由源码自动生成，不会过期。

## 0. 三种查法（token 从省到贵，优先用第 1 种）

```bash
# 1) 命令行查单个符号 / 某个源文件（只打印命中的那几行，最省）
node scripts/gen-frontend-index.mjs --grep 参考图                          # 按关键词搜全部索引
node scripts/gen-frontend-index.mjs --file app/composables/useChatStudio.ts # 看一个文件的完整段落
node scripts/gen-frontend-index.mjs --file HgImageRefPicker.vue

# 2) 打开对应的索引分册（见下一节，每册都很小：几十到几百行）

# 3) 读源码。只有**要改它**的时候才需要，且应该带着索引里的行号直接跳过去读。
```

## 1. 索引分册

<!-- BEGIN GENERATED:hub -->
<!-- 本区由 npm run index:frontend 生成，勿手改 -->

| 想看什么 | 文件 | 行数 |
| --- | --- | --- |
| 组合式函数方法索引（最重要） | `docs/frontend-index/composables.md` | 374 |
| 组件契约 props/emits | `docs/frontend-index/components.md` | 248 |
| 页面与路由 | `docs/frontend-index/pages-routes.md` | 149 |
| 类型与字段 | `docs/frontend-index/types.md` | 173 |
| 工具函数与静态数据 | `docs/frontend-index/utils-data.md` | 121 |

最大的源文件（整份读最贵，优先查上面的索引再定点读）：

| 文件 | 行数 |
| --- | --- |
| `app/pages/canvas.vue` | 2792 |
| `app/pages/assets.vue` | 1915 |
| `app/pages/index.vue` | 1589 |
| `app/composables/useHougongApi.ts` | 1500 |
| `app/composables/useChatStudio.ts` | 1475 |
| `app/components/HgChatComposer.vue` | 1118 |
| `app/pages/tool/[code].vue` | 1049 |
| `app/app.vue` | 895 |
| `app/components/canvas/DetailPanel.vue` | 891 |
| `app/pages/stories/[id].vue` | 807 |
| `app/data/canvas-graph.ts` | 741 |
| `app/pages/wallet.vue` | 672 |

<!-- END GENERATED:hub -->

## 2. 目录职责：新代码该放哪

| 位置 | 职责 | 说明 |
| --- | --- | --- |
| `app/composables/useApi.ts` | 请求底层 | `apiBase()`/`siteCode()`/`apiRequest()`/`useAuthSession()`。鉴权头、站点头、超时、雪花 ID、错误码都在这里收口 |
| `app/composables/useHougongApi.ts` | **后端接口的唯一出口** | 一个 `useHougongApi()` 返回上百个方法，方法名 ≈ 接口语义。页面里不要自己 `fetch` |
| `app/composables/useChatStudio.ts` | 创作态的全部状态与动作 | `createChatStudio()` 产出实例，`provideChatStudio()` 在页面注入，子组件 `useChatStudio()` 取用 |
| `app/composables/useModelCatalog.ts` | 模型/画幅/时长候选与报价 | 基本是纯函数，报价口径集中在这里 |
| `app/composables/useMediaRefresh.ts` + `app/plugins/media-heal.client.ts` | 签名地址过期自愈 | 只有「签名地址 + 真的过期」才重取数据 |
| `app/composables/useCanvas*.ts` | 画布 | `useCanvasApi` 对接后端，`useCanvasSlots/Rows/History` 是界面状态 |
| `app/utils/` | 纯函数 | `image-ref.ts`（`@` 图引用的措辞与解析）、`password.ts`（密码规则） |
| `app/data/` | 静态数据表 | `canvas-*.ts`（节点/模板/布局/SSE/结构化输出）、`image-options.ts`、`hougong-home.ts`、`tool-notice.ts` |
| `app/config/features.ts` | 运行时开关 | 目前是画布开关 `canvasFeatureEnabled()` |
| `app/components/` | 组件 | `Hg*` 是后宫业务组件，`canvas/`、`prompt/`、`selection/` 是子系统组件 |
| `app/pages/` | 路由页面 | 文件路径即路由 |
| `tests/` | 纯逻辑测试 | `node --test tests/*.test.mjs`，目前覆盖画布的数据变换 |
| `scripts/gen-frontend-index.mjs` | 本索引的生成器 | 改索引格式才需要动它 |

## 3. 四条主链路

### 3.1 创作：输入 → 建任务 → 等结果 → 出产物

```
页面(index.vue / create.vue)  provideChatStudio()  →  createChatStudio()
  send()                          # useChatStudio：校验能不能发、算幂等键
  └─ submitGeneration()           # 上传参考图、拼 createTask 入参
     └─ hgApi.createTask()        # POST /hougong/tasks（工具/模板/LoRA/参考图都在这里定稿）
        └─ settle()               # src: useChatStudio.ts，终态收敛
           ├─ hgApi.subscribeTaskEvents()   # SSE，仅「加速唤醒」，断线不影响正确性
           ├─ 2.5s 轮询 hgApi.getTask()     # **权威**：终止条件只看轮询结果
           └─ succeeded 时：getTask 取 outputAssets → resolveAssets() → createWork() 自动入库 → openPreview()
```

要点：

- `reconciling` 是**中间态**，不是失败，不要当终态收尾。
- 失败要把上游原因（`errorMessage`）带给用户：只说「生成失败」会让内容审核拦截和后端 bug 长得一样。
- SSE 的用途是缩短等待，不是事件源真相；改这里必须保证「没有 SSE 时行为不变」。

### 3.2 请求与身份

`apiRequest()`（`useApi.ts`）是唯一出口，它统一处理：

- `X-Site-Code` 头（`siteCode()` ← `NUXT_PUBLIC_SITE_CODE`，默认 `default`）；
- 凭据：**token 只在内存**（`useState`）+ 后端下发的 HttpOnly Cookie；
- 雪花 ID：`JSON.parse` 之前用正则把 ≥16 位整数加引号，避免 `>2^53` 精度丢失；
- 错误：`code !== 0` 抛错；`401 / 60001` 清登录态并抛「登录已过期」。

SSR 与浏览器分开：服务端走 `apiBaseInternal`（容器内网直连），浏览器走 `public.apiBase`（留空 = 同源 `/api/v1`，由 `routeRules` 代理到 `API_PROXY`）。

### 3.3 站点归属（本地联调最容易踩）

后端按**请求 Host** 解析站点，`X-Site-Code` 只对后台管理接口生效。因此：

- `localhost` / `127.0.0.1` / 未绑定域名一律**静默回落到默认站（site 1）**，不是后宫；
- 本地联调要么让 dev server 代理到带站点 Host 的 API 实例，要么接受落到默认站的事实（别拿它验证后宫数据）；
- 容器内直接连 API 时必须用带站点域名的网络别名，否则 `/` 预渲染与 SSR 取到的是默认站数据。

### 3.4 画布（/canvas）

- 开关 `canvasEnabled` 走**运行时配置**：`app.vue` 隐藏入口 + `middleware/canvas-gate.global.ts` 挡直连，两处都要生效（只藏入口挡不住手敲 URL）。
- 节点/端口/右键菜单的图标名写在 `app/data/canvas-nodes.ts` 等数据表里，`@nuxt/icon` 默认不扫 `.ts`，所以 `nuxt.config.ts` 里显式列了图标并放开了 scan —— 往数据表加图标时容易漏。

## 4. 必须遵守的约定（都是踩过坑的）

1. **雪花 ID 一律按字符串收发。** 资产/任务/作品 id 都可能是 16 位以上整数。
2. **不要往 localStorage 写 token。** 凭据只在内存 + HttpOnly Cookie；旧键名的清理代码保留着，别删。
3. **`@` 图引用的措辞只在一处定义**（`app/utils/image-ref.ts` 的 `imageRefWording`）。改措辞必须同步 `IMAGE_REF_PATTERN` / `IMAGE_REF_RE`，否则提示词里的引用会解析不出来。
4. **视频模式下第 1 张图是首帧**，其余才是参考图；`imageRefFirstFrame` / `referenceRoles` 读的是同一个判断，界面措辞与模型实际收到的图位必须一致。
5. **上传上限 15MB**（`15 << 20`），与后端 `maxMediaUploadBytes` 对齐，改一边就要改另一边。
6. **报价/画幅/时长候选不要散落到组件里**，统一走 `useModelCatalog.ts`，否则会出现「界面显示的价格」与「下单价格」不一致。
7. 新增后端接口 → 加到 `useHougongApi.ts`；页面里出现裸 `$fetch`/`fetch` 调 `/api/v1` 就是走错了。

## 5. 改代码时的同步义务

本索引的符号、签名、行号全部从源码生成，**唯一需要人（或 AI）做的事**：

- 改了 `app/` 下的导出函数、组合式函数成员、组件 props/emits、页面 → 跑一次

  ```bash
  npm run index:frontend     # 重新生成
  npm run index:check        # 只校验是否过期（CI 用它）
  ```

  并**和代码放在同一个提交里**。忘了也不要紧：`--check` 会指出哪个分册过期了。
- 新增函数时在它上方写一行 `// 说明`：索引的「说明」列直接取这行注释。不写不会丢符号，但索引上只剩签名。
- **不要手改 `<!-- BEGIN GENERATED -->` 与 `<!-- END GENERATED -->` 之间的内容**，下次生成会被覆盖；要改说明就改源码注释，要改结构就改生成器。

## 6. 验证

```bash
npm run lint         # eslint
npm run typecheck    # nuxt typecheck
npm run test         # node --test tests/*.test.mjs（纯逻辑）
npm run index:check  # 本索引是否与源码一致
```

静态检查替代不了真机验证：涉及生成、计费、上传的改动必须走真实后端跑一遍。
