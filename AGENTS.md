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
