import type { Catalog, CharacterItem, HougongTask, SessionItem } from './useHougongApi'
import { buildModelOptions, durationOptions, quoteModel, videoSizeFor, videoRatios, type ComposerMode } from './useModelCatalog'
import { sizeFor } from '../data/image-options'
import { promptText, type Prompt } from '../components/prompt/enhancement-mark'

// 对话创作页的业务层。
//
// 这里**不重写**任何后端能力：全部复用 useHougongApi 已验证的接口与调用方式
// （目录 / 上传 / 建任务 / getTask 轮询 + SSE 加速 / 取消 / 重试 / 会话 / 历史 /
// 角色 / 素材 / 按资产 id 解析展示地址）。
//
// 相对旧创作页修掉的三个缺陷（交接文档第 5 节点名的）：
// 1. 历史重建只取 outputAssets[0]、非成功状态一律映射 cancelled
//    → 现在保留**全部产物**与**后端真实状态**；
// 2. 产物展示地址靠扫素材库（listAssets 200+200）猜
//    → 现在用 assetSelectByIds 按资产 id 直取；
// 3. 发送被 !running 锁死、普通「进度怎么样」消息会被当成提示词建任务
//    → 现在生成中仍可继续对话，状态类提问用真实任务状态回答、不建任务。
//
// 尚未落地、需要后端契约的部分（G3 第二层防重、G4 对话编排）在代码里以
// `待后端契约` 标注，前端只做显式、可关闭的兜底，不冒充服务端语义。

export type StudioStatus = 'creating' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'reconciling'

export interface StudioAsset {
  id: string
  url: string
  kind: 'image' | 'video'
  width?: number
  height?: number
}

export interface RunMeta {
  mode: ComposerMode
  ratio: string
  seconds: number
  count: number
  modelId: string
  modelName: string
  credits: number | null
  unit: '积分' | '余额'
  prompt: string
  characterName: string
}

export interface StudioMessage {
  id: string
  role: 'user' | 'assistant'
  kind: 'text' | 'task'
  text: string
  time: number
  attachment?: { name: string, url: string, assetId?: string }
  /** 任务卡字段（kind === 'task'） */
  taskId?: string
  clientKey?: string
  status?: StudioStatus
  progress?: number
  assets?: StudioAsset[]
  error?: string
  meta?: RunMeta
}

const TERMINAL: StudioStatus[] = ['succeeded', 'failed', 'cancelled']
const RUNNING: StudioStatus[] = ['creating', 'queued', 'running', 'reconciling']

/** 状态类提问：这类消息不能创建计费任务（交接文档第 4 节）。 */
const STATUS_QUESTION = /好了吗|好了没|好没好|完成了吗|完成了没|进度|怎么样|到哪了|还要多久|多久能|生成完了|跑完了|出图了吗|可以了吗/

/** 提示词归一：比较重复提交时忽略空白差异 */
function normalizePrompt(text: string) {
  return text.trim().replace(/\s+/g, ' ')
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function createChatStudio() {
  const hgApi = useHougongApi()
  const session = useAuthSession()
  const route = useRoute()
  const { openDialog } = useAuthDialog()
  const { takeDraft } = useComposerDraft()

  /* ---------------- 输入器状态 ---------------- */

  const mode = ref<ComposerMode>(route.query.mode === 'video' ? 'video' : 'image')
  /** 提示词：结构化 parts（@角色/@服装/@背景/@姿势/@画风 插入 snippet 节点），
     提交任务时用 promptText() 取纯文本（与旧创作页一致）。 */
  const promptModel = ref<Prompt>({ parts: [] })
  const prompt = computed(() => promptText(promptModel.value))
  const ratio = ref('16:9')
  const count = ref(1)
  /** 输出分辨率：1K / 2K（即梦口径）。云端按 quality 提交，本地按 width/height 提交。 */
  const resolution = ref('1K')
  const seconds = ref(5)
  const modelId = ref('')
  const characterId = ref('')
  const reference = ref<{ file: File | null, name: string, preview: string, assetId: string }>({
    file: null,
    name: '',
    preview: '',
    assetId: ''
  })
  const catalog = ref<Catalog | null>(null)
  const characters = ref<CharacterItem[]>([])
  const notice = ref('')
  /**
   * 重复提交确认（参考图面板 03 / 交接文档 G3 第二层）。
   *
   * 后端目前**没有**「同内容不同 clientKey」的确认协议，所以这里是前端的显式兜底：
   * 命中同会话内相同生成意图时**先不建任务、不预占、不扣款**，由用户确认。
   * 服务端协议落地后，判定要移到后端（前端只负责展示与确认）。
   */
  const duplicate = ref<{ existing: StudioMessage, dims: string[], meta: RunMeta, text: string } | null>(null)
  /**
   * 已选 LoRA（提交时进 createTask.loras）。
   * 口径与旧创作页一致：只对**本地图片底模**生效，按底模 family 过滤可选范围。
   * 待办（用户已知悉）：公共 LoRA 应由后台维护「本站可用清单」，不应把全量灌给前台。
   */
  const selectedLoras = ref<{ id: string, weight: number }[]>([])
  const loraOptions = computed(() => {
    const list = catalog.value?.loras ?? []
    const family = catalog.value?.models?.find(item => item.id === modelId.value)?.family
    return family ? list.filter(item => item.family === family) : []
  })

  /** 采样参数：只在所选模型真的支持时（catalog.models[].sampling）才有值 */
  const sampling = ref<{ steps: number, sampler: string, scheduler: string, cfg: number } | null>(null)

  const modelOptions = computed(() => buildModelOptions(catalog.value, mode.value))
  const selectedModel = computed(() => modelOptions.value.find(item => item.id === modelId.value))
  const durationList = computed(() => durationOptions(selectedModel.value, catalog.value))
  const selectedCharacter = computed(() => characters.value.find(item => String(item.id) === characterId.value))

  // 采样参数跟随所选模型：换模型就按该模型的默认值重算，避免把上一个模型的
  // Steps/CFG 带到另一个模型上（旧创作页 syncFromModel 的同样口径）。
  watch(selectedModel, (model) => {
    const raw = catalog.value?.models?.find(item => item.id === model?.id)
    sampling.value = raw?.sampling
      ? {
          steps: raw.sampling.steps,
          sampler: raw.sampling.sampler,
          scheduler: raw.sampling.scheduler,
          cfg: raw.sampling.cfg
        }
      : null
  }, { immediate: true })

  // 切到视频模式且当前模型不可用时，默认选中 MiniMax H3（用户手动换过就不再改）
  /** 图片默认 Krea 2 Turbo（运营主推），视频默认 MiniMax H3；用户手动换过就不动 */
  function ensureDefaultModel() {
    const list = modelOptions.value
    if (!list.length) return
    if (list.some(item => item.id === modelId.value)) return
    const pattern = mode.value === 'video' ? /mini\s*max/i : /krea\s*2\s*turbo/i
    const preferred = list.find(model => model.available && pattern.test(model.name))
    const fallback = list.find(model => model.available)
    modelId.value = preferred?.id ?? fallback?.id ?? ''
  }

  watch([mode, modelOptions], ensureDefaultModel, { immediate: true })

  // 换模型后如果当前时长档不存在，收敛到该模型的第一档
  watch(loraOptions, (list) => {
    if (!selectedLoras.value.length) return
    const allowed = new Set(list.map(item => item.id))
    selectedLoras.value = selectedLoras.value.filter(item => allowed.has(item.id))
  })

  watch(durationList, (list) => {
    if (list.length && !list.includes(seconds.value)) seconds.value = list[0] ?? 5
  })

  /**
   * 参考图能力（用户明确口径）：
   * - 本地 ComfyUI 图片模型是**文生图**，不给参考图入口（避免用户传了图却无效）
   * - 云端模型支持参考图（catalog.cloudModels.capabilities.maxInputs > 0）
   * - 视频必须给首帧，所以视频模式保留
   */
  const referenceAllowed = computed(() => mode.value === 'video' || selectedModel.value?.channel === 'cloud')

  const quote = computed(() => quoteModel(catalog.value, selectedModel.value, {
    ratio: ratio.value,
    seconds: seconds.value,
    count: count.value
  }))
  const costText = computed(() => quote.value === null ? '费用待确认' : `${quote.value.amount} ${quote.value.unit}`)

  const canSend = computed(() => !!prompt.value.trim() || !!reference.value.assetId || !!reference.value.file)

  /* ---------------- 会话与消息 ---------------- */

  const sessions = ref<SessionItem[]>([])
  const sessionsLoading = ref(false)
  const sessionQuery = ref('')
  const activeSessionId = ref<string>('')
  const historyLoading = ref(false)
  const messages = ref<StudioMessage[]>([])
  const ready = ref(false)

  const filteredSessions = computed(() => {
    const keyword = sessionQuery.value.trim().toLowerCase()
    if (!keyword) return sessions.value
    return sessions.value.filter(item => (item.title || '').toLowerCase().includes(keyword))
  })

  /** 按「今天 / 昨天 / 更早」分组，供历史侧栏使用 */
  const groupedSessions = computed(() => {
    const day = 24 * 60 * 60 * 1000
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    const groups: { label: string, items: SessionItem[] }[] = [
      { label: '今天', items: [] },
      { label: '昨天', items: [] },
      { label: '更早', items: [] }
    ]
    for (const item of filteredSessions.value) {
      const at = (item.lastActivityAt || item.createdAt || 0) * 1000
      if (at >= startOfToday) groups[0]!.items.push(item)
      else if (at >= startOfToday - day) groups[1]!.items.push(item)
      else groups[2]!.items.push(item)
    }
    return groups.filter(group => group.items.length)
  })

  const activeSession = computed(() => sessions.value.find(item => item.id === activeSessionId.value) || null)

  /** 当前会话中仍在跑的任务（顶部概况与状态问答都读它） */
  const runningMessages = computed(() => messages.value.filter(item => item.kind === 'task' && item.status && RUNNING.includes(item.status)))
  const runningTask = computed(() => runningMessages.value.at(-1) || null)

  /** 产物面板：默认跟随最后一条有产物的任务 */
  const previewOpen = ref(false)
  const previewMessageId = ref('')
  const previewIndex = ref(0)

  const previewMessage = computed(() => {
    const byId = messages.value.find(item => item.id === previewMessageId.value)
    if (byId?.assets?.length) return byId
    return [...messages.value].reverse().find(item => item.assets?.length) || null
  })
  const previewAssets = computed(() => previewMessage.value?.assets ?? [])
  const previewAsset = computed(() => previewAssets.value[previewIndex.value] ?? previewAssets.value[0] ?? null)

  function openPreview(messageId: string, index = 0) {
    previewMessageId.value = messageId
    previewIndex.value = index
    previewOpen.value = true
  }

  /* ---------------- 数据加载 ---------------- */

  async function loadCatalog() {
    try {
      catalog.value = await hgApi.getCatalog()
    } catch {
      catalog.value = null
    }
  }

  async function loadCharacters() {
    session.load()
    if (!session.token.value) {
      characters.value = []
      return
    }
    // 角色是**可选生产资产**，不是必选也不是默认值：这里刻意不自动选中第一个。
    // 用户没显式引用角色时，任务不带 characterId，避免「传了自己的图却被默认角色污染」。
    characters.value = await hgApi.listCharacters().catch(() => [] as CharacterItem[])
    if (characterId.value && !characters.value.some(item => String(item.id) === characterId.value)) {
      characterId.value = ''
    }
  }

  async function loadSessions() {
    if (!session.token.value) {
      sessions.value = []
      return
    }
    sessionsLoading.value = true
    try {
      sessions.value = await hgApi.listSessions(1, 40)
    } catch {
      sessions.value = []
    } finally {
      sessionsLoading.value = false
    }
  }

  /**
   * 任务 → 展示资产。
   * 用 assetSelectByIds **按资产 id** 解析展示地址（交接文档：不靠扫有限列表找历史产物），
   * 并保留**全部**产物而不是第一张。
   */
  async function resolveAssets(assetIds: string[]): Promise<StudioAsset[]> {
    const ids = assetIds.filter(Boolean)
    if (!ids.length) return []
    try {
      const choices = await hgApi.assetSelectByIds(ids)
      return choices
        .map(({ asset }) => ({
          id: asset.id,
          url: asset.url,
          kind: (asset.mimeType || '').startsWith('video/') ? 'video' as const : 'image' as const,
          width: asset.width,
          height: asset.height
        }))
        .filter(item => !!item.url)
    } catch {
      return []
    }
  }

  /** 历史快照 → 提示词 / 画幅（快照结构兼容两种形态） */
  function readSnapshot(task: HougongTask) {
    const raw = (task.snapshot || {}) as Record<string, unknown>
    const inner = raw.input && typeof raw.input === 'object' ? raw.input as Record<string, unknown> : raw
    return {
      prompt: typeof inner.prompt === 'string' ? inner.prompt : '',
      ratio: typeof inner.ratio === 'string' ? inner.ratio : '',
      seconds: typeof inner.durationSeconds === 'number' ? inner.durationSeconds : undefined
    }
  }

  /**
   * 打开历史会话：分页读完整任务并重建消息。
   * 状态用**后端真实状态**呈现（排队中 / 运行中 / 已完成 / 失败 / 已取消），
   * 不再把非成功一律画成 cancelled。
   */
  async function openSession(id: string) {
    if (activeSessionId.value === id && messages.value.length) return
    activeSessionId.value = id
    historyLoading.value = true
    try {
      const rows = await hgApi.listSessionTasks(id, 1, 100)
      const ordered = [...rows].reverse()
      // 一次性解析所有任务的产物，避免逐个请求
      const allIds = ordered.flatMap(task => (task.outputAssets || []).map(String))
      const assets = await resolveAssets(allIds)
      const assetMap = new Map(assets.map(asset => [asset.id, asset]))

      const rebuilt: StudioMessage[] = []
      for (const task of ordered) {
        const snap = readSnapshot(task)
        const at = (task.createdAt || 0) * 1000
        if (snap.prompt) {
          rebuilt.push({
            id: makeId('u'),
            role: 'user',
            kind: 'text',
            text: snap.prompt,
            time: at || Date.now()
          })
        }
        const outIds = (task.outputAssets || []).map(String)
        rebuilt.push({
          id: makeId('t'),
          role: 'assistant',
          kind: 'task',
          text: '',
          time: at || Date.now(),
          taskId: String(task.id),
          status: (task.status as StudioStatus) || 'queued',
          progress: task.progress || 0,
          assets: outIds.map(assetId => assetMap.get(assetId)).filter((item): item is StudioAsset => !!item),
          meta: {
            mode: task.type === 'i2v' ? 'video' : 'image',
            ratio: snap.ratio || '',
            seconds: snap.seconds ?? 0,
            count: outIds.length || 1,
            modelId: '',
            modelName: '',
            credits: task.billedCredits ?? null,
            unit: '积分',
            prompt: snap.prompt,
            characterName: ''
          }
        })
      }
      messages.value = rebuilt.length
        ? rebuilt
        : [{ id: makeId('a'), role: 'assistant', kind: 'text', text: '这个会话还没有创作记录。', time: Date.now() }]
    } catch (e: unknown) {
      notice.value = `历史会话读取失败：${e instanceof Error ? e.message : '未知错误'}`
    } finally {
      historyLoading.value = false
    }
  }

  async function newSession() {
    activeSessionId.value = ''
    messages.value = [welcome()]
    previewOpen.value = false
    return ''
  }

  function welcome(): StudioMessage {
    return {
      id: makeId('a'),
      role: 'assistant',
      kind: 'text',
      text: '想创作什么？描述一幕，或带上参考图；生成中也可以随时问我进度。',
      time: Date.now()
    }
  }

  /** 会话不存在时按需创建：任务必须显式归属用户正在用的会话（不再靠后端猜 active）。 */
  async function ensureSession(firstText: string) {
    if (activeSessionId.value) return activeSessionId.value
    const created = await hgApi.createSession(firstText.slice(0, 20) || '新的创作')
    activeSessionId.value = String(created.id)
    sessions.value = [created, ...sessions.value]
    return activeSessionId.value
  }

  async function renameSession(id: string, title: string) {
    await hgApi.renameSession(id, title)
    const hit = sessions.value.find(item => item.id === id)
    if (hit) hit.title = title
  }

  /** 归档语义：后端是归档，不是物理删除（交接文档：不要伪装成删除、不级联删资产） */
  async function archiveSession(id: string) {
    await hgApi.archiveSession(id)
    sessions.value = sessions.value.filter(item => item.id !== id)
    if (activeSessionId.value === id) await newSession()
  }

  /* ---------------- 生成 ---------------- */

  function pushAssistant(text: string): StudioMessage {
    const message: StudioMessage = { id: makeId('a'), role: 'assistant', kind: 'text', text, time: Date.now() }
    messages.value.push(message)
    return message
  }

  function clearPrompt() {
    promptModel.value = { parts: [] }
  }

  async function uploadReference(file: File) {
    const up = await hgApi.uploadAsset(file)
    reference.value = {
      file: null,
      name: file.name || '参考图',
      preview: URL.createObjectURL(file),
      assetId: up.assetId
    }
  }

  function setReferenceFile(file: File) {
    if (reference.value.preview) URL.revokeObjectURL(reference.value.preview)
    reference.value = { file, name: file.name, preview: URL.createObjectURL(file), assetId: '' }
  }

  /** 把已有产物设为下一步的引用对象（「继续修改」/「生成视频」用），沿用它的 assetId，不重复上传。 */
  function setReferenceFromAsset(asset: StudioAsset) {
    if (reference.value.preview && reference.value.preview.startsWith('blob:')) URL.revokeObjectURL(reference.value.preview)
    reference.value = { file: null, name: '上一张产物', preview: asset.url, assetId: asset.id }
  }

  function clearReference() {
    if (reference.value.preview) URL.revokeObjectURL(reference.value.preview)
    reference.value = { file: null, name: '', preview: '', assetId: '' }
  }

  /** 状态类提问：用真实任务状态回答，不创建任务。 */
  function replyStatus() {
    const task = runningTask.value
    if (!task) {
      const last = [...messages.value].reverse().find(item => item.kind === 'task')
      pushAssistant(last
        ? `当前没有进行中的任务。最近一次是「${last.status}」，共 ${last.assets?.length ?? 0} 个产物。`
        : '当前没有进行中的任务，可以直接描述你想创作的一幕。')
      return
    }
    const waited = Math.max(0, Date.now() - task.time)
    const waitedText = waited > 60_000 ? `${Math.floor(waited / 60_000)} 分 ${Math.floor((waited % 60_000) / 1000)} 秒` : `${Math.floor(waited / 1000)} 秒`
    // 没有真实进度就不编造队列位置或预计完成时间（交接文档 G5）
    pushAssistant(`任务 ${task.taskId} 当前状态：${statusLabel(task.status)}，已等待 ${waitedText}。完成后会在这里更新。`)
  }

  function statusLabel(status?: StudioStatus) {
    switch (status) {
      case 'creating': return '创建中'
      case 'queued': return '排队中'
      case 'running': return '生成中'
      case 'reconciling': return '结算核对中'
      case 'succeeded': return '已完成'
      case 'failed': return '失败'
      case 'cancelled': return '已取消'
      default: return '未知'
    }
  }

  /** 终态收敛：SSE 只做「加速唤醒」，2.5s 轮询才是权威（断线/未登录行为与纯轮询一致）。 */
  async function settle(message: StudioMessage, taskId: string, initialStatus: string) {
    let status = (initialStatus as StudioStatus) || 'queued'
    message.status = status
    let wake: (() => void) | null = null
    const closeEvents = hgApi.subscribeTaskEvents((event, data) => {
      if (event === 'task.queued' || event === 'task.started' || event === 'task.progress') return
      if (String(data.taskId ?? '') !== String(taskId)) return
      const w = wake
      wake = null
      w?.()
    })
    let guard = 0
    try {
      while (!TERMINAL.includes(status) && guard < 600) {
        guard += 1
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wake = null
            resolve()
          }, 2500)
          wake = () => {
            clearTimeout(timer)
            resolve()
          }
        })
        const task = await hgApi.getTask(taskId)
        // reconciling 是**中间态**，不能当成失败直接收尾（旧实现会把它显示成 cancelled）
        status = (task.status as StudioStatus) || status
        message.status = status
        message.progress = task.progress ?? message.progress
      }
    } catch (e: unknown) {
      message.error = e instanceof Error ? e.message : '任务状态读取失败'
    } finally {
      closeEvents()
    }

    if (status === 'succeeded') {
      const detail = await hgApi.getTask(taskId).catch(() => null)
      const outIds = (detail?.outputAssets || message.assets?.map(a => a.id) || []).map(String)
      // 保留全部产物
      message.assets = await resolveAssets(outIds)
      message.progress = 100
      // 自动入库作品（沿用既有行为），失败不影响产物展示
      const first = message.assets[0]
      if (first) {
        await hgApi.createWork({
          taskId: String(taskId),
          assetId: first.id,
          kind: message.meta?.mode === 'video' ? 'video' : 'image',
          title: (message.meta?.prompt || '未命名').slice(0, 40),
          characterId: Number(characterId.value) || 0
        }).catch(() => undefined)
      }
      if (message.assets.length) openPreview(message.id, 0)
    } else if (status === 'failed') {
      message.error = message.error || '生成失败，积分已退回'
    } else if (status === 'cancelled') {
      message.error = '任务已取消'
    }
    // 让正在跑的输入区状态回落
    return status
  }

  /** 生成意图指纹：只比较**用户可感知**的输入（交接文档建议的比较维度子集） */
  function intentFingerprint(meta: RunMeta) {
    return [
      meta.mode,
      normalizePrompt(meta.prompt || ''),
      meta.ratio,
      meta.mode === 'video' ? meta.seconds : '',
      meta.mode === 'image' ? meta.count : '',
      meta.modelId,
      characterId.value,
      reference.value.assetId
    ].join('|')
  }

  /** 在当前会话里找同一生成意图的历史任务（初期边界＝当前会话，与文档建议一致） */
  function findDuplicate(meta: RunMeta) {
    const target = intentFingerprint(meta)
    const hit = [...messages.value].reverse().find((item) => {
      if (item.kind !== 'task' || !item.meta || !item.taskId) return false
      return intentFingerprint(item.meta) === target
    })
    if (!hit) return null
    // 说明哪些维度相同，弹窗里逐条展示
    const dims = Object.entries(hit.meta
      ? {
          创作类型: hit.meta.mode === meta.mode,
          提示词: normalizePrompt(hit.meta.prompt || '') === normalizePrompt(meta.prompt || ''),
          画幅: hit.meta.ratio === meta.ratio,
          模型: hit.meta.modelId === meta.modelId,
          角色: true,
          参考图: true
        }
      : {}).filter(([, same]) => same).map(([label]) => label)
    return { existing: hit, dims }
  }

  /** 用户确认「仍要再次生成」：用**新的 clientKey** 建任务（确认后再次生成是合法新任务） */
  async function confirmDuplicate() {
    const pending = duplicate.value
    duplicate.value = null
    if (!pending) return
    await submitGeneration(pending.meta, pending.text)
  }

  /** 取消确认：不建任务、不扣款，描述仍在输入框里 */
  function dismissDuplicate() {
    duplicate.value = null
  }

  /** 「查看已有任务」：直接打开该任务的产物，不做任何新提交 */
  function viewDuplicate() {
    const existing = duplicate.value?.existing
    duplicate.value = null
    if (!existing) return
    if (existing.assets?.length) openPreview(existing.id, 0)
    else notice.value = `任务 ${existing.taskId} 当前状态：${statusLabel(existing.status)}`
  }

  async function send() {
    notice.value = ''
    const text = prompt.value.trim()
    if (!session.token.value) {
      openDialog({ reason: 'generate', resume: 'chat-composer' })
      notice.value = '草稿已保留，登录后即可继续。'
      return
    }
    if (!canSend.value) {
      notice.value = '请先描述这一幕，或上传参考图。'
      return
    }
    // 状态类提问绝不创建计费任务（交接文档第 4 节）
    if (STATUS_QUESTION.test(text)) {
      messages.value.push({ id: makeId('u'), role: 'user', kind: 'text', text, time: Date.now() })
      clearPrompt()
      replyStatus()
      return
    }

    const meta: RunMeta = {
      mode: mode.value,
      ratio: ratio.value,
      seconds: seconds.value,
      count: count.value,
      modelId: modelId.value,
      modelName: selectedModel.value?.name || '',
      credits: quote.value?.amount ?? null,
      unit: quote.value?.unit ?? '积分',
      prompt: text,
      characterName: selectedCharacter.value?.name || ''
    }
    // 第二层防重：同会话内相同生成意图先确认，未确认前不建任务、不预占、不扣款
    const dup = findDuplicate(meta)
    if (dup) {
      duplicate.value = { ...dup, meta, text }
      return
    }
    await submitGeneration(meta, text)
  }

  /**
   * 真正建任务。meta 与文本在调用前已确定，因此确认路径与首次路径行为一致。
   * 传输层幂等：一次逻辑提交只生成一个 clientKey，网络重试复用同一个。
   */
  async function submitGeneration(meta: RunMeta, text: string) {
    const clientKey = makeId('hg')
    const userMessage: StudioMessage = {
      id: makeId('u'),
      role: 'user',
      kind: 'text',
      text: text || '（仅参考图）根据附件生成',
      time: Date.now(),
      attachment: reference.value.preview
        ? { name: reference.value.name || '参考图', url: reference.value.preview, assetId: reference.value.assetId }
        : undefined
    }
    const taskMessage: StudioMessage = {
      id: makeId('t'),
      role: 'assistant',
      kind: 'task',
      text: '',
      time: Date.now(),
      clientKey,
      status: 'creating',
      progress: 0,
      meta
    }
    messages.value.push(userMessage, taskMessage)
    clearPrompt()

    let created: string | null = null
    try {
      const sessionId = await ensureSession(text)
      let refAssetId = reference.value.assetId
      if (!refAssetId && reference.value.file) {
        const up = await hgApi.uploadAsset(reference.value.file)
        refAssetId = up.assetId
      }
      if (mode.value === 'video' && !refAssetId) {
        throw new Error('视频生成请先上传首帧图片，或从素材库选择')
      }
      // 本地文生图模型不支持参考图：即使界面上残留了引用也不下发
      if (!referenceAllowed.value) refAssetId = ''
      const created2 = await hgApi.createTask({
        clientKey,
        type: mode.value === 'video' ? 'i2v' : 't2i',
        prompt: text || '根据附件生成',
        ratio: ratio.value,
        durationSeconds: mode.value === 'video' ? seconds.value : undefined,
        count: mode.value === 'image' ? count.value : undefined,
        // 图片：本地按下发尺寸、云端用 quality 表达分辨率
        // 视频：尺寸只取模型自带分辨率表，模型没声明的比例不下发（UI 已置灰）
        width: mode.value === 'video'
          ? (videoSizeFor(catalog.value, modelId.value, ratio.value)?.[0])
          : (selectedModel.value?.channel !== 'cloud' ? sizeFor(ratio.value, resolution.value)[0] : undefined),
        height: mode.value === 'video'
          ? (videoSizeFor(catalog.value, modelId.value, ratio.value)?.[1])
          : (selectedModel.value?.channel !== 'cloud' ? sizeFor(ratio.value, resolution.value)[1] : undefined),
        quality: mode.value === 'image' && selectedModel.value?.channel === 'cloud' ? resolution.value : undefined,
        sampling: mode.value === 'image' && selectedModel.value?.channel === 'local' && sampling.value
          ? { ...sampling.value }
          : undefined,
        loras: mode.value === 'image' && selectedModel.value?.channel === 'local' && selectedLoras.value.length
          ? selectedLoras.value.map(item => ({ name: item.id, weight: item.weight }))
          : undefined,
        modelId: modelId.value || undefined,
        characterId: characterId.value || undefined,
        refAssetIds: refAssetId ? [refAssetId] : []
      })
      created = String(created2.id)
      taskMessage.taskId = created
      taskMessage.status = (created2.status as StudioStatus) || 'queued'
      // 待后端契约：createTask 目前**没有** sessionId 入参，任务归属仍由后端
      // EnsureActive 自动挂到「当前会话」。前端能做的只有先确保会话存在
      // （下面这步），真正的显式归属要等 G4 给 createTask 加 sessionId。
      void sessionId
      await settle(taskMessage, created, created2.status)
    } catch (e: unknown) {
      const reason = e instanceof Error ? e.message : '生成失败'
      if (created === null) {
        // 任务从未创建（余额不足 / 参数不支持 / 未登录）：不留「预占 → 失败」的假卡片
        messages.value = messages.value.filter(item => item.id !== taskMessage.id)
        pushAssistant(`创建任务失败：${reason}`)
      } else {
        taskMessage.status = 'failed'
        taskMessage.error = reason
      }
      notice.value = reason
    }
  }

  async function cancel(message: StudioMessage) {
    if (!message.taskId) return
    try {
      await hgApi.cancelTask(message.taskId)
      // 后端返回后重新读一次真实状态，不靠 UI 点击即判定已取消
      const task = await hgApi.getTask(message.taskId).catch(() => null)
      if (task) message.status = (task.status as StudioStatus) || message.status
      if (message.status !== 'cancelled') message.status = 'cancelled'
    } catch (e: unknown) {
      notice.value = e instanceof Error ? e.message : '取消失败'
    }
  }

  async function retry(message: StudioMessage) {
    if (!message.taskId || !message.meta) return
    // 后端重试语义是**新建任务并重新计费**：clientKey 必填，用返回的新 id 收敛
    const clientKey = makeId('hg')
    try {
      const created = await hgApi.retryTask(message.taskId, clientKey)
      const next: StudioMessage = {
        id: makeId('t'),
        role: 'assistant',
        kind: 'task',
        text: '',
        time: Date.now(),
        taskId: String(created.id),
        clientKey,
        status: (created.status as StudioStatus) || 'queued',
        progress: 0,
        meta: message.meta
      }
      messages.value.push(next)
      await settle(next, String(created.id), created.status)
    } catch (e: unknown) {
      notice.value = e instanceof Error ? e.message : '重试失败'
    }
  }

  /* ---------------- 初始化 ---------------- */

  function applyDraft() {
    const draft = takeDraft()
    if (!draft) return false
    mode.value = draft.mode
    ratio.value = draft.ratio
    if (typeof draft.durationSeconds === 'number' && draft.durationSeconds > 0) seconds.value = draft.durationSeconds
    promptModel.value = draft.prompt ? { parts: [{ kind: 'text', text: draft.prompt }] } : { parts: [] }
    if (draft.file) setReferenceFile(draft.file)
    // 首页已选模型：按通道恢复（不可用时保持未选，不静默换成别的模型）
    if (draft.modelId) {
      const hit = modelOptions.value.find(item => item.id === draft.modelId)
      if (hit?.available) modelId.value = hit.id
    }
    return true
  }

  async function init() {
    session.load()
    await Promise.all([loadCatalog(), loadCharacters()])
    // 目录到位后显式落一次默认底模：图片 Krea 2 Turbo / 视频 MiniMax H3。
    // 不依赖 watch 的触发时序，避免出现「模型：待选择」。
    ensureDefaultModel()
    await loadSessions()
    const hadDraft = applyDraft()
    const querySession = typeof route.query.session === 'string' ? route.query.session : ''
    if (querySession) {
      await openSession(querySession)
    } else if (hadDraft) {
      messages.value = [welcome(), {
        id: makeId('a'),
        role: 'assistant',
        kind: 'text',
        text: '已从首页带入草稿：描述、模式、模型与参考图已填好，确认费用后即可生成。',
        time: Date.now()
      }]
    } else {
      messages.value = [welcome()]
      const first = sessions.value[0]
      if (first) await openSession(String(first.id))
    }
    ready.value = true
  }

  return {
    // 输入器
    mode, prompt, promptModel, ratio, count, seconds, resolution, modelId, characterId, reference, notice,
    catalog, characters, selectedCharacter, modelOptions, selectedModel, durationList, sampling,
    selectedLoras, loraOptions,
    costText, quote, canSend, referenceAllowed,
    /** 当前视频模型支持的比例（用于 UI 置灰） */
    supportedVideoRatios: computed(() => videoRatios(catalog.value, modelId.value)),
    /** 视频 1K/2K 是否可选：后端每个比例只给一档，因此视频下 2K 不可选 */
    videoSecondTierAvailable: computed(() => false),
    // 会话
    sessions, sessionsLoading, sessionQuery, filteredSessions, groupedSessions,
    activeSessionId, activeSession, historyLoading, messages, ready,
    // 产物面板
    previewOpen, previewIndex, previewMessage, previewAssets, previewAsset, openPreview,
    runningMessages, runningTask, duplicate, confirmDuplicate, dismissDuplicate, viewDuplicate,
    // 动作
    init, send, cancel, retry, openSession, newSession, renameSession, archiveSession,
    setReferenceFile, clearReference, uploadReference, setReferenceFromAsset,
    statusLabel
  }
}

export type ChatStudio = ReturnType<typeof createChatStudio>

const STUDIO_KEY: InjectionKey<ChatStudio> = Symbol('hg:chat-studio')

export function provideChatStudio() {
  const studio = createChatStudio()
  provide(STUDIO_KEY, studio)
  return studio
}

export function useChatStudio() {
  const studio = inject(STUDIO_KEY, null)
  if (!studio) throw new Error('useChatStudio 必须在提供 ChatStudio 的页面内使用')
  return studio
}
