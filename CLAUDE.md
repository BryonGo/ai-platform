# ai-platform（后宫前台）AI 协作约定

完整约定见 [AGENTS.md](./AGENTS.md)，本仓库的前端索引入口是
[docs/FRONTEND-INDEX.md](./docs/FRONTEND-INDEX.md)。

三条要点：

1. 找符号先用 `node scripts/gen-frontend-index.mjs --grep <关键词>` 或 `--file <源文件>`，
   不要整份读 `useChatStudio.ts` / `useHougongApi.ts`（各约 1460 行）。
2. 改了 `app/` 下的导出函数/组合式成员/组件 props/页面后，跑 `npm run index:frontend`
   并把生成结果和代码放在同一个提交里。
3. 不要手改 `<!-- BEGIN GENERATED -->` 与 `<!-- END GENERATED -->` 之间的内容。
