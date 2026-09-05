# PeachArt 到后宫的功能参照

检查日期：2026-09-05。通过 Git fetch 获取 `TaohuadaoAI/PeachArt` 最新远端引用，读取 `origin/main` 提交 `57fc812`。本地 main 落后远端一个提交，未切换分支或合并。检查远端 frontend-dev-nn 与主线差异，主要为生成参数和前端交互相关变更。

证据是代码静态检查，不是线上调用验证，不保证配置中的供应商模型在目标环境可用。

## 已有可复用基础

| 能力 | tRPC 路径/源文件 | 备注 |
|---|---|---|
| 创建图片任务 | generation.create | quick 或 recipe；本地/云模型配方、输入素材、会话、幂等 clientKey |
| 任务反馈 | generation.get/list | 状态、进度、队列位置、错误、输入、结果 |
| 再编辑参数 | generation.edit.get | 返回可编辑配方及输入，不等于独立局部涂抹编辑器 |
| 重试/取消/删除 | generation.retry/cancel/remove | 有权限与状态限制，非任意任务皆可删除 |
| 连续会话 | generation.session.create/get/list/tasks/rename/archive | 是创作会话，不是完整故事/分镜工程 |
| 模型选择 | model.catalog.get、model.list/get/facets | 本地模型、LoRA 与云模型能力/参数 |
| 提示词 | prompt.optimize/translate；snippet router | 优化、翻译与超级标签；quickStart 使用默认可运行本地模型，不是已验证的智能语义选模 |
| 图片工具 | generation/tools.ts | 双倍高清、智能修脸、智能修手，通过工具配方生成 |
| 素材 | media-router.ts | 素材访问及输入选择基础，具体上传链路需接入时继续对照 |
| 费用闭环 | creation/task/command.ts | 排队与扣款编排，任务失败/取消时退款；retry 为重新计费任务 |
| 商业和发布 | economy/publication routers | 钱包、流水、会员查询、结账、作品发布等已有接口入口 |

模型执行适配已有 ComfyUI、Seedream、小易相关实现。云模型能力矩阵定义画幅、质量、参考输入和输出上限；这些是代码配置，不能直接等同供应商能力验证。最新主线还包含分辨率参数与高分辨率计费变更。

## 本次未发现完整对应能力

- 视频生成：当前生成配方以图片尺寸/画幅/质量为主，云目录为图像模型；本次未找到视频时长、首尾帧、视频生成供应商等完整链路。
- 独立角色档案：未找到 character CRUD 及角色身份、服装版本、关系等结构化接口。角色提示词/LoRA/超级标签不等于角色档案。
- 故事项目：未找到独立故事、分镜、片段排序和关系持久化接口。session 可复用为连续创作基础，但不应改名后宣称已有完整故事能力。

## 对后宫的建议

先以 PeachArt 现有契约及行为为基础组织界面，不重新臆造同类生成接口。Nuxt 前端需要重建交互组件，可评估共享 contracts 与 tRPC 协议；React 组件不能直接移入 Nuxt 使用。

视频、结构化角色、故事工程作为需要进一步确认接口来源和范围的增量。品牌妲己不是必须新增业务模块的理由。是否共用 PeachArt 后端部署、账号和钱包尚未确定，不能默认共享生产数据。

后宫图片资产采用 WebP。PeachArt 既有模型输出包含 png/jpeg/webp，模型封面还有 avif；目标站需明确统一交付/展示转换策略，不能仅修改扩展名。

主要 Git 源文件：

- apps/api/src/transport/trpc/creation-router.ts
- packages/contracts/src/generation.ts
- packages/contracts/src/generation/tools.ts
- packages/contracts/src/cloud/catalog.ts
- apps/api/src/application/creation/task/command.ts
- apps/api/src/infrastructure/generation/engines.ts
- apps/api/src/transport/trpc/model-router.ts
- apps/api/src/transport/trpc/prompt-router.ts
