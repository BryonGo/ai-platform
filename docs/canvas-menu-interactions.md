# Canvas 菜单交互与接口说明

## 交互流程

1. 进入 `/canvas`：显示“正在加载画布”，请求图列表，再读取最近一张图。请求失败显示错误与重试按钮；只有成功返回空数据时才显示空画布引导。加载或失败期间禁用保存，避免误覆盖。
2. 右键节点：显示节点当前状态和操作。运行中、等待上游、等待确认、未开放的节点禁用运行与重跑。打开菜单时聚焦第一个可用按钮；Tab 导航、Enter 执行、Escape/点击外部关闭。
3. 运行：先保存图（带 revision）；保存失败终止后续执行。成功后提交节点；文本 delta 实时更新，artifact 显示产物已生成，queued 仅提示任务已提交，error 显示失败。异步提交不等于生成完成。
4. 状态更新：`/platform/events` 中当前 graphId 的 task.* 事件触发 800ms 合并刷新；断线以 1–5 秒退避重连并补拉。节点菜单、卡片、详情共享同一份状态。
5. 模板：仅展示接口返回的站点模板和用户真实保存的本机模板。清除示例图入口和示例文件。模板套用清空 outputs、产物、运行记录及旧 graphId，随后保存为新图。本机模板明确标明本机存储，写入失败不报成功。

## 现有接口格式

以下为客户端当前使用的业务数据格式（不是虚构的线上响应）。基础路径 `/api/v1`；通用接口外层封装由 `apiRequest` 处理；ID 使用字符串，时间戳为 Unix 秒。

| 接口 | 方法与输入 | 业务响应 |
| --- | --- | --- |
| `/canvas/graph/list` | GET：product、owner_type、owner_id 可选 | `{ list: CanvasGraphSummary[] }` |
| `/canvas/graph/get` | GET：id | `{ id, title, revision, graph, artifacts, runs, ... }` |
| `/canvas/graph/save` | POST：`{ id, title, product, owner_type, owner_id, graph, revision }` | `CanvasGraphSummary`，含新 revision |
| `/canvas/template/list` | GET | `{ list: [{ id, name, summary, nodeCount, updatedAt, builtIn }] }` |
| `/canvas/template/detail` | GET：id | `{ id, graph }` |
| `/canvas/run/plan` | GET：id | `{ nodes: [{ nodeId, kind, blocked, blockedReason, reason, paramsHash }] }` |
| `/canvas/node/run` | POST：`{ id, node_id, force, base_artifact_id, instruction, priority }` | SSE |
| `/platform/events` | GET，持续订阅 | SSE：task.*，数据含 graphId |

节点运行 SSE 事件：

```ts
type RunEvent =
  | { event: 'delta'; data: { text: string } }
  | { event: 'artifact'; data: { run?: ServerRun; artifacts?: ServerArtifact[]; artifact?: ServerArtifact; cached?: boolean } }
  | { event: 'queued'; data: { run?: ServerRun } }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: Record<string, unknown> }

interface ServerRun {
  id: string
  nodeId: string
  paramsHash: string
  status: 'running' | 'done' | 'failed'
  error?: string
  costCredits?: number
  taskIds?: string[]
  startedAt: number
  finishedAt?: number
}
```

完整类型以 `app/composables/useCanvasApi.ts` 为准。HTTP 200 的 SSE 也可能携带 error，不能只按 HTTP 状态判断成功。

## UI 参考

- 右侧详情：宽度 `clamp(280px, 27vw, 420px)`，桌面最多占视口 45%，窄屏最多 100%；正文区域滚动。
- 右键菜单：按内容定宽，常规最小 220px、最大 360px，并限制在视口边缘 8px 内；高度随内容增长，超过视口后内部滚动。子菜单点击展开为内嵌列表，避免屏幕边缘截断与横向遮挡。
- 按钮：悬停提高背景亮度；按下位移 1px；键盘聚焦显示轮廓；禁用降透明度并显示禁用光标。加载使用旋转图标，遵守减少动画偏好。
- 状态：现有详情与卡片使用灰色待运行、蓝色运行中、绿色已就绪、红色失败、黄色等待上游/等待确认；右键菜单同步展示文字及运行图标，不依赖颜色辨识。
- 加载/空状态在内容区域展示；操作结果通过 `aria-live` 提示读屏软件。

## 后端扩展与待联调项

当前契约没有 queued/stopped 运行状态或停止接口，不能把“等待上游”冒充队列等待，也不能把失败显示成已停止。如需完整支持，后端需扩展 `ServerRun.status` 为 queued/running/done/failed/stopped，并提供幂等停止接口和 task.queued/task.started/task.stopped 事件；前后端同时更新状态映射。

当前自动刷新仍使用整图替换，后续需用 revision/编辑基线合并来保护并行编辑中的草稿。需在真实环境验证断线重连、并发编辑冲突、队列转运行、任务完成/失败及小视口布局；静态检查不能替代这些联调。

## 整理画布

顶部“适应画布”旁新增“整理画布”。点击后以当前节点实测宽高计算位置：前半段按阶段分列，角色/场景分组；带镜号的节点按镜号分行，同镜首帧与视频保持同行；未连接节点移至下方。自定义依赖优先于默认阶段，循环依赖报错并保留原位置。同组角色参考下游镜号排序以减少交叉，但不保证任意复杂图零交叉。

位置变更作为一个独立撤销步骤；动画仅更新视图，不逐帧写入历史。整理后按实际画布区域适应视角（右侧详情是独立栏，不计入可用画布宽度）。尊重减少动画偏好。用户点击保存后布局持久化。运行中、加载中和窄屏节点列表模式不可整理；不会自动在生成或编辑过程中重排。
