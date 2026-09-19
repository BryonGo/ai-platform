/**
 * 画布（织幕二期）真接口客户端：`/api/v1/canvas/*`。
 *
 * 与 useHougongApi 同一套底座（`apiRequest`：站点头、HttpOnly Cookie、雪花 ID 保精度），
 * 只有一处不一样 —— **运行节点走 SSE**，`apiRequest` 会把整段响应缓冲完再返回，
 * 流式就没了，所以这里单独用 fetch + ReadableStream 读。
 *
 * 两处"服务端形状 → 前端模型"的转换集中在本文件（不在页面里各转一份）：
 *   1. 时间戳：服务端是 unix 秒（数字），前端模型是字符串 → 一律转 ISO；
 *   2. 服务端多带的字段（mediaAssetId / runId / taskIds）原样带上，前端要就用。
 */
import type { CanvasArtifact, CanvasExportManifest, CanvasGraph, CanvasReview, CanvasRun } from '~/data/canvas-graph'
import type { CanvasTemplateInfo } from '~/data/canvas-templates'
import { apiBase, apiRequest, siteCode, useAuthSession } from './useApi'

// ---------------------------------------------------------------- 服务端形状

/** 图列表项（不含图内容）。 */
export interface CanvasGraphSummary {
  id: string
  title: string
  product?: string
  ownerType?: string
  ownerId?: string
  nodeCount: number
  revision: number
  updatedAt: number
  createdAt: number
}

/** 运营模板列表项（服务端形状）。 */
export interface CanvasTemplateItem {
  id: string
  name: string
  summary: string
  nodeCount: number
  updatedAt: number
  builtIn: boolean
}

/** 一次执行（服务端形状）。 */
export interface ServerRun {
  id: string
  nodeId: string
  nodeType?: string
  paramsHash: string
  baseArtifactId?: string
  status: 'running' | 'done' | 'failed'
  error?: string
  costCredits?: number
  taskIds?: string[]
  startedAt: number
  finishedAt?: number
}

/** 一组候选里的一张（服务端形状）。 */
export interface ServerArtifactItem {
  url: string
  label?: string
  /** 素材 id：执行器靠它取参考图；前端想复用这张时也要用 */
  mediaAssetId?: string
  picked?: boolean
  review?: CanvasReview
}

/** 产物版本（服务端形状）。 */
export interface ServerArtifact {
  id: string
  nodeId: string
  slot: string
  type: CanvasArtifact['type']
  version: number
  url?: string
  note?: string
  items?: ServerArtifactItem[]
  pickedIndex?: number
  rows?: CanvasArtifact['rows']
  text?: string
  manifest?: CanvasExportManifest
  review: CanvasReview
  mediaAssetId?: string
  runId?: string
  createdAt: number
}

/** 一次拿全的响应。 */
export interface CanvasGraphView extends CanvasGraphSummary {
  graph: CanvasGraph
  runs: ServerRun[]
  artifacts: ServerArtifact[]
}

/** 「运行全部」计划里的一项。 */
export interface CanvasPlanNode {
  nodeId: string
  kind: string
  runner?: string
  reason?: string
  paramsHash?: string
  blocked?: boolean
  blockedReason?: string
}

// ---------------------------------------------------------------- 形状转换

/** unix 秒 → ISO 字符串（前端模型用字符串；`0`/缺省 → 空串）。 */
function iso(seconds?: number): string {
  if (!seconds) return ''
  return new Date(seconds * 1000).toISOString()
}

/** 服务端 run → 前端模型。 */
export function toCanvasRun(run: ServerRun): CanvasRun {
  return {
    id: run.id,
    nodeId: run.nodeId,
    paramsHash: run.paramsHash,
    baseArtifactId: run.baseArtifactId,
    status: run.status,
    error: run.error,
    costCredits: run.costCredits,
    startedAt: iso(run.startedAt),
    finishedAt: run.finishedAt ? iso(run.finishedAt) : undefined
  }
}

/** 服务端产物 → 前端模型（多带的 mediaAssetId / runId 一并带上）。 */
export function toCanvasArtifact(a: ServerArtifact): CanvasArtifact {
  return {
    id: a.id,
    nodeId: a.nodeId,
    slot: a.slot,
    type: a.type,
    version: a.version,
    url: a.url,
    note: a.note,
    items: a.items,
    pickedIndex: a.pickedIndex,
    rows: a.rows,
    text: a.text,
    manifest: a.manifest,
    review: a.review,
    mediaAssetId: a.mediaAssetId,
    runId: a.runId,
    createdAt: iso(a.createdAt)
  }
}

// ---------------------------------------------------------------- 图

export function useCanvasApi() {
  /**
   * 本站**运营下发的模板**（只读）。
   *
   * 与浏览器本地模板分开：这一份是站点资产（后台配、全站可见），本地那份是用户私人草稿。
   * 拿不到就返回空数组 —— 页面据此回退到"内置产线 + 本地模板"，不会因为接口挂了打不开画布。
   */
  async function listTemplates(): Promise<CanvasTemplateItem[]> {
    // 服务端回的是 `{list: [...]}`（与后台模板接口同一形状），不是裸数组 ——
    // 按数组取会得到 undefined，`.map` 抛错后被调用方的 try/catch 吞掉，
    // 表现是"接口 200 但面板里没有运营模板"（这个坑真踩过，别改成想当然的形状）。
    const data = await apiRequest<{ list: CanvasTemplateItem[] }>('/canvas/template/list')
    return data?.list ?? []
  }

  /**
   * 站点模板 → 起始面板要的模型。
   *
   * `site: true` 让面板知道"这不是用户自己的模板"（不给删除按钮）；
   * summary 里带上步数 —— 用户选模板时第一句想知道的就是"几步、要不要我填东西"。
   */
  function toTemplateInfos(items: CanvasTemplateItem[]): CanvasTemplateInfo[] {
    return (items ?? []).map(t => ({
      id: `site:${t.id}`,
      name: t.name,
      summary: t.nodeCount ? `${t.summary || '运营模板'}（${t.nodeCount} 步）` : (t.summary || '运营模板'),
      site: true
    }))
  }

  /** 取一条运营模板的结构（套用）。id 回空串 = 这条模板已经下架了。 */
  async function getTemplate(id: string): Promise<{ id: string, graph: CanvasGraph | null }> {
    const data = await apiRequest<{ id: string, graph: CanvasGraph | null }>(
      `/canvas/template/detail?id=${encodeURIComponent(id)}`
    )
    return { id: data?.id ?? '', graph: (data?.graph as CanvasGraph) ?? null }
  }

  /** 我的图列表（列表页不拉整图）。 */
  /**
   * 列图。`owner` 是**可选的归属过滤**（从某一集/某个项目进画布时只列这一份的图）。
   *
   * 归属对前端是个**不透明标签**（`{ type: 'episode' | 'project', id: string }`）：
   * 画布不认识"集"与"项目"，只是原样带给服务端 —— 加归属过滤不需要画布认识业务模型。
   */
  function listGraphs(
    product = '',
    owner: { type?: string, id?: string } = {}
  ): Promise<CanvasGraphSummary[]> {
    const params = new URLSearchParams()
    if (product) params.set('product', product)
    if (owner.type) params.set('owner_type', owner.type)
    if (owner.id) params.set('owner_id', owner.id)
    const query = params.toString()
    return apiRequest<CanvasGraphSummary[]>(`/canvas/graph/list${query ? `?${query}` : ''}`)
  }

  /** 一次拿全：图 + runs + artifacts（全部转成前端模型）。 */
  async function getGraph(id: string): Promise<{
    summary: CanvasGraphSummary
    graph: CanvasGraph
    runs: CanvasRun[]
    artifacts: CanvasArtifact[]
  }> {
    const data = await apiRequest<CanvasGraphView>(`/canvas/graph/get?id=${encodeURIComponent(id)}`)
    return {
      summary: data,
      // 图内容里可能有服务端注入的 frameGrid：以服务端那份为准（真源在服务端）。
      graph: { ...(data.graph ?? {}) } as CanvasGraph,
      runs: (data.runs ?? []).map(toCanvasRun),
      artifacts: (data.artifacts ?? []).map(toCanvasArtifact)
    }
  }

  /**
   * 新建（id 为空）或保存整张图。
   *
   * 更新时必须带 `revision`（打开这张图时看到的版本号）：服务端用乐观并发挡住
   * "两个标签页同编一张图，后保存的把前一个盖掉"。冲突时抛错，页面提示用户重新载入。
   */
  function saveGraph(in_: {
    id?: string
    title: string
    product?: string
    ownerType?: string
    ownerId?: string
    graph: CanvasGraph
    revision?: number
  }): Promise<CanvasGraphSummary> {
    return apiRequest<CanvasGraphSummary>('/canvas/graph/save', {
      method: 'POST',
      body: {
        id: in_.id || 0,
        title: in_.title,
        product: in_.product ?? 'hougong',
        owner_type: in_.ownerType ?? '',
        // `ownerId` 是**字符串**（项目/集的 id 可能超过 2^53），这里原样传字符串：
        // 服务端按 uint64 解析，转成 number 反而会在前端先把雪花 id 改掉值。
        owner_id: in_.ownerId || 0,
        graph: in_.graph,
        revision: in_.id ? in_.revision : undefined
      }
    })
  }

  /** 软删自己的图。 */
  function deleteGraph(id: string): Promise<unknown> {
    return apiRequest('/canvas/graph/del', { method: 'POST', body: { id } })
  }

  // ---------------------------------------------------------------- 运行

  /** 「运行全部」的执行计划：服务端按拓扑序算出**脏**节点，前端只负责循环。 */
  function runPlan(id: string): Promise<CanvasPlanNode[]> {
    return apiRequest<{ nodes: CanvasPlanNode[] }>(`/canvas/run/plan?id=${encodeURIComponent(id)}`)
      .then(data => data.nodes ?? [])
  }

  /**
   * 跑一个节点：响应是 SSE 流。
   *
   * 事件：`delta`（文本逐字）/ `artifact`（当场出产物）/ `queued`（图/视频已建任务）/
   * `error` / `done`。**流里报错时 HTTP 仍是 200**，所以别按状态码判成败。
   */
  async function runNodeStream(
    in_: {
      id: string
      nodeId: string
      force?: boolean
      baseArtifactId?: string
      instruction?: string
      /**
       * 任务领取优先级：单点「运行」给 10，「运行全部」逐节点给 0（默认）。
       *
       * 为什么要区分：一次运行全部会连着建十几个平台任务，用户紧接着单点某个节点时，
       * 那颗任务应该插到批量任务前面 —— 否则交互式操作要等整批跑完。
       */
      priority?: number
    },
    handlers: {
      onDelta?: (text: string) => void
      onArtifact?: (payload: { run?: ServerRun, artifact?: ServerArtifact, artifacts?: ServerArtifact[], cached?: boolean }) => void
      onQueued?: (payload: { run?: ServerRun }) => void
      onError?: (message: string) => void
    },
    signal?: AbortSignal
  ): Promise<void> {
    const session = useAuthSession()
    const headers: Record<string, string> = {
      'X-Site-Code': siteCode(),
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    }
    if (session.token.value) headers.Authorization = `Bearer ${session.token.value}`

    const resp = await fetch(`${apiBase()}/canvas/node/run`, {
      method: 'POST',
      headers,
      credentials: 'include',
      signal,
      body: JSON.stringify({
        id: in_.id,
        node_id: in_.nodeId,
        force: !!in_.force,
        base_artifact_id: in_.baseArtifactId || 0,
        instruction: in_.instruction || '',
        priority: in_.priority || 0
      })
    })
    if (!resp.ok || !resp.body) {
      handlers.onError?.(`运行失败：HTTP ${resp.status}`)
      return
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE 以空行分帧；最后一段可能不完整，留在 buffer 里等下一块。
      let sep = buffer.indexOf('\n\n')
      while (sep >= 0) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        dispatchFrame(frame, handlers)
        sep = buffer.indexOf('\n\n')
      }
    }
    if (buffer.trim()) dispatchFrame(buffer, handlers)
  }

  /** 解析一帧 SSE（`event:` + `data:` 两行）。 */
  function dispatchFrame(
    frame: string,
    handlers: Parameters<typeof runNodeStream>[1]
  ): void {
    let event = ''
    let payload = ''
    for (const line of frame.split('\n')) {
      const text = line.replace(/\r$/, '')
      if (text.startsWith('event: ')) event = text.slice(7).trim()
      else if (text.startsWith('data: ')) payload = text.slice(6)
    }
    if (!event) return
    let data: Record<string, unknown>
    try {
      data = payload ? JSON.parse(payload) : {}
    } catch {
      return
    }
    switch (event) {
      case 'delta':
        handlers.onDelta?.(String(data.text ?? ''))
        break
      case 'artifact':
        handlers.onArtifact?.(data as Parameters<NonNullable<typeof handlers.onArtifact>>[0])
        break
      case 'queued':
        handlers.onQueued?.(data as { run?: ServerRun })
        break
      case 'error':
        handlers.onError?.(String(data.message ?? '运行失败'))
        break
      default:
        break
    }
  }

  // ---------------------------------------------------------------- 产物

  /** 选定产物版本（写进图 JSON 并推进 revision，返回新 revision）。 */
  function pickArtifact(in_: {
    id: string
    nodeId: string
    slot: string
    artifactId: string
    item?: number
  }): Promise<number> {
    return apiRequest<{ revision: number }>('/canvas/artifact/pick', {
      method: 'POST',
      body: {
        id: in_.id,
        node_id: in_.nodeId,
        slot: in_.slot,
        artifact_id: in_.artifactId,
        item: in_.item
      }
    }).then(data => data.revision ?? 0)
  }

  /** 审核产物（approved / rejected / pending）。 */
  function reviewArtifact(in_: {
    id: string
    artifactId: string
    review: CanvasReview
  }): Promise<unknown> {
    return apiRequest('/canvas/artifact/review', {
      method: 'POST',
      body: { id: in_.id, artifact_id: in_.artifactId, review: in_.review }
    })
  }

  /** 删产物（被选定的不允许删 —— 要删先改选）。 */
  function delArtifact(in_: { id: string, artifactId: string }): Promise<unknown> {
    return apiRequest('/canvas/artifact/del', {
      method: 'POST',
      body: { id: in_.id, artifact_id: in_.artifactId }
    })
  }

  /** 手工改完存新版本（分镜表逐行编辑）。 */
  function saveArtifact(in_: {
    id: string
    nodeId: string
    slot: string
    type?: string
    rows?: unknown
    text?: string
    note?: string
  }): Promise<ServerArtifact> {
    return apiRequest<{ artifact: ServerArtifact }>('/canvas/artifact/save', {
      method: 'POST',
      body: {
        id: in_.id,
        node_id: in_.nodeId,
        slot: in_.slot,
        type: in_.type ?? '',
        rows: in_.rows,
        text: in_.text ?? '',
        note: in_.note ?? ''
      }
    }).then(data => data.artifact)
  }

  /**
   * 订阅平台事件流（`/platform/events`）：任务完成/失败时刷新整图。
   *
   * 为什么需要它：图像/视频是**异步任务**，产物由服务端的收敛钩子落库 —— 没有推送的话，
   * 用户跑完一镜只能靠手动"重新载入"才看得到图。事件里带 `graphId`，按当前图过滤。
   *
   * 不用 `EventSource`：它带不上 Authorization 头（本仓库的凭据在内存 + HttpOnly Cookie），
   * 所以这里同样用 fetch + ReadableStream；断线由调用方退避重连。
   */
  async function subscribeEvents(
    onEvent: (event: string, data: Record<string, unknown>) => void,
    signal: AbortSignal
  ): Promise<void> {
    const session = useAuthSession()
    const headers: Record<string, string> = {
      'X-Site-Code': siteCode(),
      'Accept': 'text/event-stream'
    }
    if (session.token.value) headers.Authorization = `Bearer ${session.token.value}`
    const resp = await fetch(`${apiBase()}/platform/events`, { headers, credentials: 'include', signal })
    if (!resp.ok || !resp.body) return
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep = buffer.indexOf('\n\n')
      while (sep >= 0) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        let event = ''
        let payload = ''
        for (const line of frame.split('\n')) {
          const text = line.replace(/\r$/, '')
          if (text.startsWith('event: ')) event = text.slice(7).trim()
          else if (text.startsWith('data: ')) payload = text.slice(6)
          // id: 行是给 Last-Event-ID 续传用的；这里不续传，断线后直接重拉整图。
        }
        if (!event || !payload) continue
        try {
          onEvent(event, JSON.parse(payload) as Record<string, unknown>)
        } catch {
          /* 解析失败的事件跳过，不影响其它事件 */
        }
        sep = buffer.indexOf('\n\n')
      }
    }
  }

  /** 导出节点运行（打包成 ZIP，异步）。 */
  function exportNode(in_: { id: string, nodeId: string }): Promise<{
    exportId: string
    status: string
    total: number
    failures?: string[]
  }> {
    return apiRequest('/canvas/export', {
      method: 'POST',
      body: { id: in_.id, node_id: in_.nodeId }
    })
  }

  return {
    listTemplates,
    toTemplateInfos,
    getTemplate,
    listGraphs,
    getGraph,
    saveGraph,
    deleteGraph,
    runPlan,
    runNodeStream,
    pickArtifact,
    reviewArtifact,
    delArtifact,
    saveArtifact,
    exportNode,
    subscribeEvents
  }
}
