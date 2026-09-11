<script setup lang="ts">
import { useComposerDraft } from '~/composables/useComposerDraft'
import PromptEditor from '~/components/prompt/promptEditor.vue'
import { promptText, type Prompt, type SnippetSnapshot } from '~/components/prompt/enhancement-mark'
import SnippetPicker from '~/components/prompt/snippetPicker.vue'
import ModelPicker from '~/components/selection/modelPicker.vue'
import LoraPicker, { type LoraSelection } from '~/components/selection/loraPicker.vue'

type Mode = 'image' | 'video'
type RunStatus = 'queued' | 'running' | 'done' | 'cancelled'

interface Artifact {
  runId: number
  kind: Mode
  prompt: string
  character: string
  ratio: string
  credits: number
  poster: string
  createdAt: string
}

/** 一次生成的展示参数。重试时复用同一份——后端重试是新建任务、snapshot 沿用旧任务。 */
interface RunMeta {
  kind: Mode
  characterName: string
  ratioNow: string
  credits: number
  text: string
}

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  runId: number | null
  status: RunStatus | null
  progress: number
  event: string
  text: string
  attachment?: { name: string, url: string }
  time: string
  /** 关联任务 id（助手消息）。重试要用它调 POST /hougong/tasks/{id}/retry。 */
  taskId?: number | string | null
  /** 生成本次的展示参数，重试时复用。 */
  meta?: RunMeta
}

const mode = ref<Mode>('image')
const ratio = ref('16:9')
const notice = ref('')
const uploadPreview = ref('')
const uploadName = ref('')
// 选中角色：存真实角色的数字 id 字符串（由 /hougong/characters 加载后回落到第一个）。
const selected = ref('')
const myCharacters = ref<CharacterItem[]>([])
const prompt = ref('')
// 结构化提示词（TipTap：@ 超级标签节点 + 润色增强），与纯文本 prompt 双向同步。
const promptModel = ref<Prompt>({ parts: [] })
// 防止同步回环的标记。
let syncingPrompt = false
// 超级标签第二级弹层（点分类菜单后打开）。
const snippetPickerOpen = ref(false)
const snippetCategory = ref('character')
const promptEditorRef = ref<InstanceType<typeof PromptEditor> | null>(null)

function onOpenCategory(category: string) {
  snippetCategory.value = category
  snippetPickerOpen.value = true
}

function onApplySnippet(source: SnippetSnapshot) {
  promptEditorRef.value?.applySnippet(source)
  snippetPickerOpen.value = false
}

// ── 出图参数（对齐 PeachArt generationSizePresets + 采样设置）──
const SIZE_PRESETS = [
  { ratio: '1:1', label: '方形', width: 1024, height: 1024 },
  { ratio: '2:3', label: '竖图', width: 832, height: 1248 },
  { ratio: '3:2', label: '横图', width: 1248, height: 832 },
  { ratio: '9:16', label: '手机', width: 768, height: 1344 },
  { ratio: '16:9', label: '桌面', width: 1344, height: 768 }
] as const
const width = ref(1344)
const height = ref(768)
const count = ref(1)
const paramsOpen = ref(false)

const SIZE_POLICY = { min: 512, max: 1536 } as const

function clampSize(n: number) {
  const v = Math.round(Number(n) || 0)
  return Math.min(SIZE_POLICY.max, Math.max(SIZE_POLICY.min, v))
}

function setSize(nextW: number, nextH: number) {
  width.value = clampSize(nextW)
  height.value = clampSize(nextH)
  const match = SIZE_PRESETS.find(s => s.width === width.value && s.height === height.value)
  if (match) ratio.value = match.ratio
}

function setCount(n: number) {
  const max = countMax.value
  count.value = Math.min(max, Math.max(1, Math.round(n) || 1))
}

function ratioIconWidth(r: string) {
  const [rw, rh] = r.split(':').map(Number)
  const aspect = rw && rh ? rw / rh : 1
  return Math.round(Math.min(28, Math.max(11, 18 * aspect)))
}

function isPresetSelected(preset: { ratio: string, width: number, height: number }) {
  if (useCloud.value) return preset.ratio === ratio.value
  return preset.width === width.value && preset.height === height.value
}

function pickSizePreset(preset: { ratio: string, label: string, width: number, height: number }) {
  ratio.value = preset.ratio
  if (preset.width > 0 && preset.height > 0) {
    width.value = preset.width
    height.value = preset.height
  }
}

function onWidthInput(e: Event) {
  setSize(Number((e.target as HTMLInputElement).value), height.value)
}

function onHeightInput(e: Event) {
  setSize(width.value, Number((e.target as HTMLInputElement).value))
}

function onStepsInput(e: Event) {
  patchSampling({ steps: Number((e.target as HTMLInputElement).value) })
}

function onCfgInput(e: Event) {
  patchSampling({ cfg: Number((e.target as HTMLInputElement).value) })
}

function onSamplerInput(e: Event) {
  patchSampling({ sampler: (e.target as HTMLSelectElement).value })
}

function onSchedulerInput(e: Event) {
  patchSampling({ scheduler: (e.target as HTMLSelectElement).value })
}

function patchSampling(patch: Partial<{ steps: number, sampler: string, scheduler: string, cfg: number }>) {
  const base = sampling.value ?? activeModel.value?.sampling ?? { steps: 24, sampler: 'euler', scheduler: 'normal', cfg: 6 }
  sampling.value = {
    steps: patch.steps ?? base.steps,
    sampler: patch.sampler ?? base.sampler,
    scheduler: patch.scheduler ?? base.scheduler,
    cfg: patch.cfg ?? base.cfg
  }
}

function resetSampling() {
  const m = activeModel.value
  if (m?.sampling) {
    sampling.value = { steps: m.sampling.steps, sampler: m.sampling.sampler, scheduler: m.sampling.scheduler, cfg: m.sampling.cfg }
  } else {
    sampling.value = null
  }
}

watch(mode, (m) => {
  if (m === 'video') paramsOpen.value = false
})

// PromptEditor 结构化 → 纯文本（snippet 取英文 prompt），同步回 prompt。
function syncFromModel() {
  prompt.value = promptText(promptModel.value)
}

watch(promptModel, () => {
  if (syncingPrompt) return
  syncingPrompt = true
  syncFromModel()
  syncingPrompt = false
}, { deep: true })

watch(prompt, (v) => {
  if (syncingPrompt) return
  // 若结构化 model 展平后已等于 v，说明来自编辑器，跳过。
  if (promptText(promptModel.value) === v) return
  syncingPrompt = true
  promptModel.value = { parts: v ? [{ kind: 'text', text: v }] : [] }
  syncingPrompt = false
})

const negative = ref('')

// ── 真实能力目录（模型/采样）与素材库 ──
const catalog = ref<Catalog | null>(null)
const modelId = ref('')
const sampling = ref<{ steps: number, sampler: string, scheduler: string, cfg: number } | null>(null)
const showNegative = ref(false)
const assetOpen = ref(false)
const assets = ref<AssetItem[]>([])
const selectedAssetId = ref('')
const modelPickerOpen = ref(false)
const loraPickerOpen = ref(false)
// 已选 LoRA（带权重），挂到当前底模 family 下。
const selectedLoras = ref<LoraSelection[]>([])

const activeModel = computed(() => (catalog.value?.models || []).find(m => m.id === modelId.value) || null)

// ── 视频模型（图生视频）：来自 catalog.videoModels（后端 task/workflow 冻结常量投影）──
// i2v 后端固定走 MiniMax H3 fl2va + 官方 turbo 4 步，无 modelId 分支，
// 所以视频模式不再展示图片底模，而是显示真正在跑的模型。
const videoModels = computed(() => catalog.value?.videoModels || [])
const activeVideoModel = computed(
  () => videoModels.value.find(m => m.available) || videoModels.value[0] || null
)
// ── 视频时长：默认 5 秒，点击出拖动条，确认后生效 ──
// 档位表由后端给出（模型按 24fps + 17k+5 网格吸附，5s→124 帧≈5.2s），前端不重复算。
const videoSeconds = ref(5)
const videoSecondsDraft = ref(5)
const durationOpen = ref(false)
const durationOptions = computed(() => activeVideoModel.value?.durations || [])
const durationBounds = computed(() => ({
  min: activeVideoModel.value?.minSeconds ?? 1,
  max: activeVideoModel.value?.maxSeconds ?? 10
}))
const durationOption = computed(
  () => durationOptions.value.find(o => o.seconds === videoSecondsDraft.value) || null
)
const videoDurationLabel = computed(() => `${videoSeconds.value} 秒`)
const durationFill = computed(() => {
  const { min, max } = durationBounds.value
  const span = Math.max(1, max - min)
  return `${((videoSecondsDraft.value - min) / span) * 100}%`
})
// ── 视频画幅：视频尺寸与图片不同（ResolutionSelector 实测），1:1 等图片画幅在视频档不可用 ──
const ratioOpen = ref(false)
const videoResolutions = computed(() => activeVideoModel.value?.resolutions || [])
const activeVideoResolution = computed(
  () => videoResolutions.value.find(r => r.ratio === ratio.value) || null
)
const videoRatioLabel = computed(() =>
  activeVideoResolution.value
    ? `${activeVideoResolution.value.ratio} ${activeVideoResolution.value.label}`
    : ratio.value
)
function toggleRatio() {
  ratioOpen.value = !ratioOpen.value
}
function pickVideoRatio(r: string) {
  ratio.value = r
  ratioOpen.value = false
}
// 进入视频档时，当前画幅若视频不支持（图片档的 1:1/2:3 等），回落到第一个可用画幅
watch([mode, videoResolutions], () => {
  if (mode.value !== 'video') {
    ratioOpen.value = false
    return
  }
  const list = videoResolutions.value
  if (!list.length) return
  if (!list.some(r => r.ratio === ratio.value)) ratio.value = list[0]!.ratio
}, { immediate: true })

const durationTouched = ref(false)
watch(activeVideoModel, (m) => {
  if (m?.defaultSeconds && !durationTouched.value) {
    videoSeconds.value = m.defaultSeconds
    videoSecondsDraft.value = m.defaultSeconds
  }
}, { immediate: true })
function openDuration() {
  videoSecondsDraft.value = videoSeconds.value
  durationOpen.value = !durationOpen.value
}
function confirmDuration() {
  videoSeconds.value = videoSecondsDraft.value
  durationTouched.value = true
  durationOpen.value = false
}
function cancelDuration() {
  videoSecondsDraft.value = videoSeconds.value
  durationOpen.value = false
}
// 当前底模 family 下可选的 LoRA。
const familyLoras = computed(() => {
  const fam = activeModel.value?.family
  if (!fam) return []
  return (catalog.value?.loras || []).filter(l => l.family === fam && l.selectable)
})

function pickModel(id: string) {
  modelId.value = id
  selectedLoras.value = []
  modelPickerOpen.value = false
  const m = (catalog.value?.models || []).find(x => x.id === id)
  if (m?.sampling) {
    sampling.value = { steps: m.sampling.steps, sampler: m.sampling.sampler, scheduler: m.sampling.scheduler, cfg: m.sampling.cfg }
  } else {
    // 模型无显式采样配置：清空，后端按工作流默认采样（如 Illustrious 24 步/CFG 6）。
    sampling.value = null
  }
}

// ── 云端模型（seedream/xiaoyi，balance 计费）选择 ──
const cloudModels = computed(() => catalog.value?.cloudModels || [])
const cloudPickerOpen = ref(false)
const cloudModelId = ref('')
const cloudQuality = ref('')

// 云端可生成模型 = API 目录（/platform/catalog.cloudModels）标记 available 的条目；
// 供弹窗枚举，任务侧仍需走后端 cloud.Resolve 再次校验可用性。
const availableCloudModels = computed(() =>
  cloudModels.value.filter(m => m.state === 'available')
)

const activeCloudModel = computed(() => cloudModels.value.find(m => m.id === cloudModelId.value) || null)
// 只选云端（balance）或本地 comfy；云端模型仅图片（t2i），视频仍走 comfy i2v。
const useCloud = computed(() => mode.value === 'image' && !!activeCloudModel.value)

function openCloudPicker() {
  // 云端缺省但目录里只有已占用 server? 尽力拉取。
  cloudPickerOpen.value = true
}

function pickCloudModel(id: string) {
  const m = cloudModels.value.find(x => x.id === id && x.state === 'available')
  if (!m) return
  modelId.value = ''
  selectedLoras.value = []
  sampling.value = null
  cloudModelId.value = m.id
  cloudQuality.value = m.capabilities?.default?.quality || m.capabilities?.parameters?.[0]?.quality || ''
  cloudPickerOpen.value = false
}

function clearCloudModel() {
  cloudModelId.value = ''
  cloudQuality.value = ''
}

// 参考图仅两种合法场景：云端图生图（t2i；comfy base = 纯文生图）或 i2v 视频首帧。
// 切到纯文生图（本机底模、无云端模型）时不残留曾在云端/视频模式下选过的参考图。
watch([mode, cloudModelId], () => {
  const refExpected = mode.value === 'video' || (mode.value === 'image' && !!activeCloudModel.value)
  if (!refExpected && (uploadPreview.value || rawFile.value || selectedAssetId.value)) {
    clearReferenceUpload()
  }
})

// 当前计费提示：云端按 balance 分显示（pricing.balance），本地按 credit 积分。
const activeCloudCharge = computed(() => {
  const m = activeCloudModel.value
  if (!m) return 0
  const q = m.pricing.qualities.find(x => x.quality === cloudQuality.value)
  return q?.balance ?? 0
})

const countMax = computed(() => {
  if (mode.value === 'video') return 1
  if (useCloud.value) {
    const maxOut = activeCloudModel.value?.capabilities.maxOutputs || 4
    return Math.min(4, Math.max(1, maxOut))
  }
  return 4
})

watch(countMax, (max) => {
  if (count.value > max) count.value = max
})

const paramsLabel = computed(() => {
  if (useCloud.value) {
    const q = cloudQuality.value ? ' · ' + cloudQuality.value : ''
    return ratio.value + q + ' · ' + count.value + '张'
  }
  const p = SIZE_PRESETS.find(s => s.width === width.value && s.height === height.value)
  const tag = p ? (p.label + ' ' + width.value + '×' + height.value) : (width.value + '×' + height.value)
  return tag + ' · ' + count.value + '张'
})

const sizeChoices = computed(() => {
  if (!useCloud.value) return [...SIZE_PRESETS]
  const m = activeCloudModel.value
  const param = m?.capabilities.parameters.find(p => p.quality === cloudQuality.value) || m?.capabilities.parameters[0]
  const ratios = param?.ratios || []
  if (!ratios.length) return [...SIZE_PRESETS]
  return ratios.map((r) => {
    const preset = SIZE_PRESETS.find(s => s.ratio === r.ratio)
    return preset || { ratio: r.ratio, label: r.ratio, width: 0, height: 0 }
  })
})

const cloudQualityChoices = computed(() => {
  const m = activeCloudModel.value
  if (!m) return []
  return m.capabilities.parameters.map(p => p.quality)
})

const samplingLimits = computed(() => {
  const s = catalog.value?.sampling
  return {
    stepsMin: s?.stepsMin || 1,
    stepsMax: s?.stepsMax || 50,
    cfgMin: s?.cfgMin ?? 0,
    cfgMax: s?.cfgMax ?? 10,
    cfgStep: s?.cfgStep || 0.1,
    samplers: s?.samplers?.length ? s.samplers : ['euler', 'dpmpp_2m', 'euler_ancestral', 'dpmpp_sde'],
    schedulers: s?.schedulers?.length ? s.schedulers : ['normal', 'karras', 'simple', 'sgm_uniform']
  }
})

const currentSampling = computed(() =>
  sampling.value
  ?? activeModel.value?.sampling
  ?? { steps: 24, sampler: 'euler', scheduler: 'normal', cfg: 6 }
)

const paramsWrapRef = ref<HTMLElement | null>(null)

function onParamsPointerDown(e: PointerEvent) {
  const el = paramsWrapRef.value
  if (el && !el.contains(e.target as Node)) paramsOpen.value = false
}

watch(paramsOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onParamsPointerDown)
  else document.removeEventListener('pointerdown', onParamsPointerDown)
})

onUnmounted(() => document.removeEventListener('pointerdown', onParamsPointerDown))

async function loadCatalog() {
  try {
    const cat = await hgApi.getCatalog()
    catalog.value = cat
    const model = cat.models.find(m => m.selectable)
    if (model) {
      modelId.value = model.id
      if (model.sampling) {
        sampling.value = { steps: model.sampling.steps, sampler: model.sampling.sampler, scheduler: model.sampling.scheduler, cfg: model.sampling.cfg }
      } else {
        sampling.value = null
      }
    }
  } catch {
    /* 目录不可用不影响生成（后端有默认） */
  }
}

async function openAssets() {
  assetOpen.value = !assetOpen.value
  if (assetOpen.value && !assets.value.length) {
    try {
      assets.value = await hgApi.listAssets(false, 1, 60)
    } catch {
      assets.value = []
    }
  }
}

function pickAsset(a: AssetItem) {
  selectedAssetId.value = a.id
  if (uploadPreview.value) {
    URL.revokeObjectURL(uploadPreview.value)
  }
  uploadPreview.value = a.url
  uploadName.value = `素材 ${a.id.slice(-6)}`
  assetOpen.value = false
  if (mode.value !== 'video') mode.value = 'video'
}

const cost = computed(() => {
  if (useCloud.value) return activeCloudCharge.value * Math.max(1, count.value)
  // 价格来自后端报价表（billing_rate_version），必须与创建任务时的实际预占一致；
  // 取不到时回退默认值，仅作展示兜底。
  const rates = catalog.value?.rates
  if (mode.value === 'video') {
    // 按时长计价是可选维度：后台配了 i2v:<画幅>:<秒> 就用它，否则回落 i2v:<画幅>。
    // 与后端 task/controller 的 QuoteFirst 顺序保持一致。
    const byDuration = rates?.videoByDuration?.[ratio.value]?.[String(videoSeconds.value)]
    if (typeof byDuration === 'number' && byDuration > 0) return byDuration
    const base = rates?.video?.[ratio.value]
    if (typeof base === 'number' && base > 0) return base
    return 24
  }
  const quoted = rates?.image?.[ratio.value]
  if (typeof quoted === 'number' && quoted > 0) return quoted
  return 8
})
const selectedCharacter = computed(() => myCharacters.value.find(c => String(c.id) === selected.value))
const running = computed(() => messages.value.some(m => m.role === 'assistant' && m.status === 'running'))
const canSend = computed(() => !running.value && (promptText(promptModel.value).trim().length > 0 || !!uploadPreview.value))

// ---- 会话与产物 ----
const messages = ref<ChatMessage[]>([])
const artifacts = ref<Artifact[]>([])
const activeRunId = ref<number | null>(null)

// 历史会话抽拉侧栏：会话列表来自 /platform/session；选择会话拉取其 task 行程。
const railOpen = ref(false)
const sessions = ref<SessionItem[]>([])
const activeSessionId = ref<string | null>(null)
const sessionLoading = ref(false)

async function loadSessions() {
  sessionLoading.value = true
  try {
    const items = await hgApi.listSessions(1, 100)
    sessions.value = items.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))
    const cur = sessions.value.find(s => s.current)
    if (cur) activeSessionId.value = cur.id
  } catch {
    sessions.value = []
  } finally {
    sessionLoading.value = false
  }
}

function openRail() {
  railOpen.value = !railOpen.value
  if (railOpen.value && !sessions.value.length && session.token.value) {
    void loadSessions()
  }
}

// 在侧栏列出该会话的最近任务（历史只读性列出；当前服务器 active 只由后端 EnsureActive 决定）
// 注意：库里 task.snapshot 是包在 input 下的（对齐后端 workflow.snapshotParams），
// 直接读 snap.prompt 会拿到空值——这正是「点了历史会话没反应」的原因。
const sessionLoadingId = ref<string | null>(null)

// 会话管理：重命名 / 归档（后端接口早已存在，此前前端没有入口）
async function renameHistorySession(s: SessionItem) {
  const currentTitle = s.title || `会话 ${String(s.id).slice(-6)}`
  const next = window.prompt('重命名会话', currentTitle)
  if (next === null) return
  const title = next.trim()
  if (!title || title === currentTitle) return
  try {
    const updated = await hgApi.renameSession(s.id, title)
    s.title = updated?.title || title
  } catch (e: unknown) {
    messages.value.push(assistText(`重命名失败：${e instanceof Error ? e.message : '未知错误'}`))
  }
}

async function archiveHistorySession(s: SessionItem) {
  const label = s.title || `会话 ${String(s.id).slice(-6)}`
  if (!window.confirm(`归档会话「${label}」？归档后不再出现在历史列表。`)) return
  try {
    await hgApi.archiveSession(s.id)
    if (activeSessionId.value === s.id) activeSessionId.value = null
    // 归档当前会话时后端 EnsureActive 会新建一个 active 会话，重新拉列表才能看到
    await loadSessions()
  } catch (e: unknown) {
    messages.value.push(assistText(`归档失败：${e instanceof Error ? e.message : '未知错误'}`))
  }
}

async function openHistorySession(id: string) {
  activeSessionId.value = id
  sessionLoadingId.value = id
  const sessionTitle = sessions.value.find(s => s.id === id)?.title || `会话 ${String(id).slice(-6)}`
  try {
    const rows = await hgApi.listSessionTasks(id, 1, 30)
    // 产物 URL：任务产物 asset 在素材库里（隐藏态也一并取），供历史回看播放。
    const assetMap = new Map<string, AssetItem>()
    try {
      const [visible, hidden] = await Promise.all([
        hgApi.listAssets(false, 1, 200),
        hgApi.listAssets(true, 1, 200)
      ])
      for (const a of [...visible, ...hidden]) assetMap.set(a.id, a)
    } catch {
      /* 素材库不可读时仍展示历史文本 */
    }

    // 用任务快照重建读回聊天视图：越旧的排到前面
    const rebuilt: ChatMessage[] = []
    const rebuiltArtifacts: Artifact[] = []
    const newest = [...rows].reverse()
    for (const t of newest) {
      const raw = (t.snapshot || {}) as Record<string, unknown>
      const inner = raw.input && typeof raw.input === 'object' ? raw.input as Record<string, unknown> : raw
      const prompt = typeof inner.prompt === 'string' ? inner.prompt : ''
      const ratio = typeof inner.ratio === 'string' ? inner.ratio : ''
      const runId = Number(t.id) || null
      const time = t.createdAt
        ? new Date(t.createdAt * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : ''

      // 产物：outputAssets[0] → 素材库 presign URL（图片/视频都能直接渲染）
      const outId = String((t.outputAssets || [])[0] ?? '')
      const asset = outId ? assetMap.get(outId) : undefined
      if (asset?.url) {
        rebuiltArtifacts.push({
          runId: runId ?? 0,
          kind: (asset.mimeType || '').startsWith('video/') ? 'video' : 'image',
          prompt,
          character: '历史',
          ratio,
          credits: t.billedCredits || 0,
          poster: asset.url,
          createdAt: time || now()
        })
      }

      if (prompt) {
        rebuilt.push({
          id: ++msgSeq,
          role: 'user',
          runId,
          status: null,
          progress: 0,
          event: '',
          text: prompt,
          time
        })
      }
      const done = t.status === 'succeeded'
      rebuilt.push({
        id: ++msgSeq,
        role: 'assistant',
        runId,
        status: done ? 'done' : 'cancelled',
        progress: t.progress || 0,
        event: `${t.status}${done ? ' · 完成' : ' · 未完成'}`,
        text: `${prompt ? prompt.slice(0, 24) : typeLabel(t.type)}${ratio ? ' · ' + ratio : ''}`,
        time
      })
    }

    if (rebuilt.length) {
      messages.value = [welcomeMessage(), ...rebuilt]
      const last = rebuilt[rebuilt.length - 1]
      if (last) msgSeq = last.id
      // 历史产物挂到产物卡（runId 对齐任务 id，点「查看产物」可回看）
      for (const a of rebuiltArtifacts) {
        if (!artifacts.value.some(x => x.runId === a.runId)) artifacts.value.push(a)
      }
    } else {
      // 空会话也要有明确反馈，否则用户会以为「点了没反应」
      messages.value = [welcomeMessage(), assistText(`「${sessionTitle}」还没有创作记录。`)]
    }
    railOpen.value = false
  } catch (e) {
    const reason = e instanceof Error ? e.message : '会话读取失败'
    notice.value = `历史会话读取失败：${reason}`
  } finally {
    sessionLoadingId.value = null
  }
}

function typeLabel(t?: string) {
  return t === 'i2v' ? '图生视频' : t === 't2i' ? '文生图' : ''
}

let msgSeq = 0
let runSeq = 0

function now() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function welcomeMessage(): ChatMessage {
  return {
    id: ++msgSeq,
    role: 'assistant',
    runId: null,
    status: null,
    progress: 0,
    event: '',
    text: '我是你的创作台。告诉我下一幕，或点下面的示例；图片任务 8 积分、视频任务 24 积分，失败或取消自动退回。',
    time: now()
  }
}

function assistText(text: string): ChatMessage {
  return { id: ++msgSeq, role: 'assistant', runId: null, status: null, progress: 0, event: '', text, time: now() }
}

function activeArtifact() {
  return artifacts.value.find(a => a.runId === activeRunId.value) ?? artifacts.value.at(-1) ?? null
}

// 该任务是否已有可展示的产物（历史会话回看时用于决定是否显示「查看产物」）。
function hasArtifact(runId: number | null) {
  return runId !== null && artifacts.value.some(a => a.runId === runId)
}

const hgApi = useHougongApi()
const session = useAuthSession()
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function clearRunTimers() {
  // 真实轮询由 async send 管理，无定时器残留。
}

function msgText(kind: Mode, characterName: string, ratioNow: string, credits: number) {
  const unit = useCloud.value ? '余额' : '积分'
  return `${characterName} · ${kind === 'video' ? '视频' : '图片'} · ${ratioNow} · 预占 ${credits} ${unit}`
}

// 加载当前账号的真实角色（未登录或失败时为空列表，生成时不带角色）。
async function loadMyCharacters() {
  session.load()
  if (!session.token.value) return
  try {
    myCharacters.value = await hgApi.listCharacters()
    const first = myCharacters.value[0]
    if (!selected.value && first) {
      selected.value = String(first.id)
    }
  } catch {
    myCharacters.value = []
  }
}

// settleRun 轮询任务至终态并落账：成功则入库作品 + 生成产物卡片，失败/取消则标记并提示。
//
// 从 send() 抽出，供「重试」复用 —— 后端重试语义是**新建任务**（新 clientKey、重新计费、
// snapshot 沿用旧任务），收敛流程与首次完全一致，差别只是任务 id 来自 retryTask。
async function settleRun(runId: number, taskId: number | string, meta: RunMeta, initialStatus = 'queued') {
  const { kind, characterName, ratioNow, credits, text } = meta
  const msg = () => messages.value.find(m => m.runId === runId)
  let status = initialStatus
  // 事件驱动 + 轮询兜底：终态事件到达时立即唤醒，把收敛延迟从最多 2.5s 压到近实时。
  // EventSource 不可用 / 未登录 / 断线时 subscribeTaskEvents 返回空关闭函数，
  // 行为与纯轮询**完全一致** —— 它是加速，不是替代。
  let wake: (() => void) | null = null
  const closeEvents = hgApi.subscribeTaskEvents((event, data) => {
    // 进度类事件不打断轮询（进度本来就靠轮询回写）；只认本任务的终态事件。
    if (event === 'task.queued' || event === 'task.started' || event === 'task.progress') return
    if (String(data.taskId ?? '') !== String(taskId)) return
    const w = wake
    wake = null
    w?.()
  })
  try {
    while (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled' && status !== 'reconciling') {
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
      const t = await hgApi.getTask(taskId)
      status = t.status
      const cur = msg()
      if (cur) {
        cur.progress = t.progress || cur.progress
        cur.event = `${t.status} · ${cur.progress}%`
      }
    }
  } finally {
    closeEvents()
  }
  const finalMsg = msg()
  if (status === 'succeeded') {
    // 取产物 asset → 自动入库作品 → 取封面
    const detail = await hgApi.getTask(taskId)
    const outAssets: string[] = detail.outputAssets || []
    let imageUrl = ''
    if (outAssets.length) {
      try {
        await hgApi.createWork({
          taskId: String(taskId),
          assetId: outAssets[0],
          kind: kind === 'video' ? 'video' : 'image',
          title: text.slice(0, 40),
          characterId: Number(selected.value) || 0
        })
        const latestWorks = await hgApi.listWorks()
        const latest = latestWorks[0]
        if (latest) {
          imageUrl = latest.imageUrl || ''
        }
      } catch {
        /* 入库失败仍显示任务完成 */
      }
    }
    if (finalMsg) {
      finalMsg.progress = 100
      finalMsg.status = 'done'
      finalMsg.event = 'task.completed · 已结算 ' + credits + ' 积分，作品已入库'
      finalMsg.text = msgText(kind, characterName, ratioNow, credits)
    }
    artifacts.value.push({
      runId,
      kind,
      prompt: text,
      character: characterName,
      ratio: ratioNow,
      credits,
      poster: imageUrl,
      createdAt: now()
    })
  } else {
    if (finalMsg) {
      finalMsg.status = 'cancelled'
      finalMsg.event = `task.${status} · 未产生结算`
      finalMsg.text = `${msgText(kind, characterName, ratioNow, credits)} → ${status}（积分已退回）`
    }
    notice.value = status === 'failed'
      ? '生成失败，积分已退回；可在该条消息下点「重试」'
      : '任务已取消'
  }
}

// retryRun 重试失败/取消的任务。
//
// 后端语义（internal/addon/hougong/controller/task.go Retry）：**新建任务并重新计费** ——
// clientKey 必填（幂等键），snapshot 沿用旧任务，只允许终态任务重试（否则 409）。
// 因此要用**返回的新 id** 去轮询，而不是继续轮询旧 id。
async function retryRun(from: ChatMessage) {
  if (running.value || !from.taskId || !from.meta) {
    return
  }
  const meta = from.meta
  const runId = ++runSeq
  messages.value.push({
    id: ++msgSeq,
    role: 'assistant',
    runId,
    status: 'queued',
    progress: 0,
    taskId: null,
    meta,
    event: 'task.created · 正在重试（新建任务并重新计费）',
    text: msgText(meta.kind, meta.characterName, meta.ratioNow, meta.credits),
    time: now()
  })
  notice.value = ''
  try {
    const created = await hgApi.retryTask(from.taskId, `hg-web-retry-${Date.now()}-${runId}`)
    const cur = messages.value.find(m => m.runId === runId)
    if (cur) {
      cur.taskId = created.id
    }
    await settleRun(runId, created.id, meta, created.status)
  } catch (e: unknown) {
    const cur = messages.value.find(m => m.runId === runId)
    const reason = e instanceof Error ? e.message : '重试失败'
    if (cur) {
      cur.status = 'cancelled'
      cur.progress = 0
      cur.event = 'task.failed · ' + reason
      cur.text = `${msgText(meta.kind, meta.characterName, meta.ratioNow, meta.credits)} → 重试失败`
    }
    notice.value = reason
  }
}

async function send() {
  if (!canSend.value) {
    if (!promptText(promptModel.value).trim() && !uploadPreview.value) {
      notice.value = '请先描述这一幕。'
    }
    return
  }
  const text = promptText(promptModel.value).trim() || '（仅参考图）根据附件生成'
  const attachment = uploadPreview.value ? { name: uploadName.value || '参考图', url: uploadPreview.value } : undefined

  messages.value.push({
    id: ++msgSeq,
    role: 'user',
    runId: null,
    status: null,
    progress: 0,
    event: '',
    text,
    attachment,
    time: now()
  })

  const runId = ++runSeq
  const characterName = selectedCharacter.value?.name ?? ''
  const credits = cost.value
  const kind = mode.value
  const ratioNow = ratio.value
  const characterId = selected.value

  messages.value.push({
    id: ++msgSeq,
    role: 'assistant',
    runId,
    status: 'queued',
    progress: 0,
    event: 'task.created · 正在创建任务并预占积分',
    text: msgText(kind, characterName, ratioNow, credits),
    time: now()
  })
  try {
    if (!session.token.value) {
      throw new Error('请先登录')
    }
    let referenceAssetId = ''
    if (selectedAssetId.value) {
      referenceAssetId = selectedAssetId.value
    } else if (rawFile.value) {
      const up = await hgApi.uploadAsset(rawFile.value)
      referenceAssetId = up.assetId
    }
    if (kind === 'video' && !referenceAssetId) {
      throw new Error('视频生成请先上传首帧图片或从素材库选择')
    }
    // 已选 LoRA：传 catalog id + 权重（后端按 id 校验 family 兼容并解析 comfy 文件名）。
    const selectedLoraItems = selectedLoras.value
      .map(s => ({ name: s.id, weight: s.weight }))

    const task = await hgApi.createTask({
      clientKey: `hg-web-${Date.now()}-${runSeq}`,
      ...(mode.value === 'video' ? { durationSeconds: videoSeconds.value } : {}),
      type: kind === 'video' ? 'i2v' : 't2i',
      prompt: text,
      negativePrompt: negative.value.trim() || undefined,
      ratio: ratioNow,
      width: kind === 'video' || useCloud.value ? undefined : width.value,
      height: kind === 'video' || useCloud.value ? undefined : height.value,
      count: kind === 'image' ? count.value : undefined,
      // i2v 走 MiniMax H3 专用工作流，不传文生图模型/采样参数（否则用错模型卡死）
      modelId: kind === 'video' ? undefined : (useCloud.value ? cloudModelId.value : (modelId.value || undefined)),
      quality: kind === 'video' ? undefined : (useCloud.value ? (cloudQuality.value || undefined) : undefined),
      engine: kind === 'video' ? undefined : (useCloud.value ? (activeCloudModel.value?.engine || undefined) : undefined),
      sampling: kind === 'video' || useCloud.value ? undefined : (sampling.value || undefined),
      loras: kind === 'video' || useCloud.value ? undefined : (selectedLoraItems.length ? selectedLoraItems : undefined),
      characterId: characterId || undefined,
      refAssetIds: referenceAssetId ? [referenceAssetId] : []
    })
    // 任务已创建 = 消息已送出，清空输入框，与聊天一致。
    // 正文在上方已捕获为 text，后续轮询/入库不读输入框；promptModel 是编辑器唯一数据源，
    // 清它会经 watch → syncFromModel 把 prompt 一并置空。
    // 参考图/素材刻意保留：i2v 常用同一首帧换提示词连续出片，清掉会逼用户重复上传。
    promptModel.value = { parts: [] }
    // 把任务 id 与展示参数记到助手消息上：失败后重试要用（见 retryRun）。
    const meta: RunMeta = { kind, characterName, ratioNow, credits, text }
    const assistantMsg = messages.value.find(m => m.runId === runId)
    if (assistantMsg) {
      assistantMsg.taskId = task.id
      assistantMsg.meta = meta
    }
    await settleRun(runId, task.id, meta, task.status)
  } catch (e: unknown) {
    const cur = messages.value.find(m => m.runId === runId)
    const reason = e instanceof Error ? e.message : '生成失败'
    if (cur) {
      cur.status = 'cancelled'
      cur.progress = 0
      cur.event = 'task.failed · ' + reason
      cur.text = `${msgText(kind, characterName, ratioNow, credits)} → 失败（积分未扣）`
    }
    notice.value = reason
    // 登录过期：稍候跳转登录页（游客一键登录恢复）。
    if (reason.includes('登录已过期')) {
      await sleep(1200)
      await navigateTo('/auth/login')
    }
  }
}

async function cancelRun() {
  const msg = messages.value.find(m => m.role === 'assistant' && m.status === 'running')
  if (!msg || msg.runId === null) {
    return
  }
  try {
    await hgApi.cancelTask(msg.runId)
    msg.status = 'cancelled'
    msg.progress = 0
    msg.event = 'task.cancelled · 预占积分已退回'
    msg.text = `${msg.text} → 已取消，未产生扣费`
  } catch (e: unknown) {
    notice.value = e instanceof Error ? e.message : '取消失败'
  }
}

function sample(kind: Mode, text: string) {
  mode.value = kind
  prompt.value = text
}

// （产物单卡 video 现在直接用原生 <video> 播放，移除了此前 mock 播放器占位逻辑。）

function pickArtifact(runId: number) {
  activeRunId.value = runId
}

function hint(text: string) {
  messages.value.push(assistText(text))
}

// ---- 带入 ----
const { takeDraft } = useComposerDraft()

// 从视频产物抽取首帧（浏览器端 canvas，不需要服务端 ffmpeg）。
// 依据：MinIO/CDN 已配置 CORS —— 预检返回 204 + Access-Control-Allow-Origin，
// 因此 crossOrigin="anonymous" 下 canvas 不会被污染，可以直接 toBlob 上传。
function grabFirstFrame(url: string, timeoutMs = 20000): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    let done = false
    const cleanup = () => {
      clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
    }
    const fail = (msg: string) => {
      if (done) return
      done = true
      cleanup()
      reject(new Error(msg))
    }
    const timer = setTimeout(() => fail('抽帧超时'), timeoutMs)

    const draw = () => {
      if (done) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        if (!canvas.width || !canvas.height) return fail('视频尺寸未知')
        const ctx = canvas.getContext('2d')
        if (!ctx) return fail('无法创建画布')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (done) return
          done = true
          cleanup()
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('首帧编码失败'))
          }
        }, 'image/png')
      } catch (e: unknown) {
        fail(e instanceof Error ? e.message : '抽帧失败')
      }
    }

    video.addEventListener('loadeddata', () => {
      // 部分编码首帧时间戳不为 0，先回到 0 秒再画
      if (video.currentTime > 0.01) {
        video.addEventListener('seeked', draw, { once: true })
        video.currentTime = 0
      } else {
        draw()
      }
    }, { once: true })
    video.addEventListener('error', () => fail('视频加载失败'), { once: true })
    video.src = url
  })
}

onMounted(async () => {
  messages.value.push(welcomeMessage())
  loadCatalog()
  await loadMyCharacters()

  const draft = takeDraft()
  if (draft) {
    mode.value = draft.mode
    ratio.value = draft.ratio
    if (typeof draft.durationSeconds === 'number' && draft.durationSeconds > 0) {
      videoSeconds.value = draft.durationSeconds
      videoSecondsDraft.value = draft.durationSeconds
      durationTouched.value = true
    }
    prompt.value = draft.prompt
    if (draft.file) {
      if (uploadPreview.value) {
        URL.revokeObjectURL(uploadPreview.value)
      }
      uploadPreview.value = URL.createObjectURL(draft.file)
      uploadName.value = draft.uploadName
    }
    messages.value.push(assistText('已从首页带入草稿：描述、模式与参考图已填好，点击生成开始。'))
    return
  }

  const route = useRoute()
  const characterId = typeof route.query.character === 'string' ? route.query.character : ''
  if (characterId && myCharacters.value.some(c => String(c.id) === characterId)) {
    selected.value = characterId
  }
  // 作品页「继续创作」：把该作品的产物当作参考图/首帧带入（产物本身就是 MediaAsset）。
  // 注意视频产物是 mp4，不能当首帧，只带入角色与说明。
  const workId = typeof route.query.work === 'string' ? route.query.work : ''
  if (workId) {
    try {
      const w = await hgApi.getHougongWork(workId)
      if (w.characterId && myCharacters.value.some(c => String(c.id) === String(w.characterId))) {
        selected.value = String(w.characterId)
      }
      if (w.kind === 'image' && w.assetId) {
        selectedAssetId.value = String(w.assetId)
        if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)
        uploadPreview.value = w.imageUrl || ''
        uploadName.value = w.title || `作品 ${String(w.id).slice(-6)}`
        if (mode.value !== 'video') mode.value = 'video'
        messages.value.push(assistText(`已带入作品《${w.title}》作为首帧，写下一幕即可生成视频。`))
      } else if (w.kind === 'video' && w.imageUrl) {
        // 视频产物是 mp4，不能直接当首帧：先在浏览器抽首帧再上传成新的图片素材。
        messages.value.push(assistText(`正在从视频作品《${w.title}》抽取首帧…`))
        try {
          const blob = await grabFirstFrame(w.imageUrl)
          const up = await hgApi.uploadAsset(new File([blob], `firstframe-${w.id}.png`, { type: 'image/png' }))
          selectedAssetId.value = up.assetId
          if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)
          uploadPreview.value = URL.createObjectURL(blob)
          uploadName.value = `${w.title} · 首帧`
          if (mode.value !== 'video') mode.value = 'video'
          messages.value.push(assistText(`已用视频《${w.title}》的首帧作为续作首帧，写下一幕即可继续生成。`))
        } catch (e: unknown) {
          messages.value.push(assistText(`抽取首帧失败（${e instanceof Error ? e.message : '未知错误'}），请手动上传一张图片作为首帧。`))
        }
      } else {
        messages.value.push(assistText(`已带入作品《${w.title}》，但它没有可用的产物文件，请手动上传一张图片作为首帧。`))
      }
    } catch {
      /* 作品不可读时忽略，不阻断创作页 */
    }
  }
  // 故事页「继续创作」：带入故事的首个角色。
  const storyId = typeof route.query.story === 'string' ? route.query.story : ''
  if (storyId) {
    try {
      const st = await hgApi.getHougongStory(storyId)
      const first = (st.characterIds || [])[0]
      if (first && myCharacters.value.some(c => String(c.id) === String(first))) {
        selected.value = String(first)
      }
      messages.value.push(assistText(`已在故事《${st.title}》下继续创作${selectedCharacter.value ? `，当前角色：${selectedCharacter.value.name}` : ''}。`))
    } catch {
      /* 故事不可读时忽略 */
    }
  }
})

function onKeydown(event: KeyboardEvent) {
  // Escape：关闭右侧产物单卡（含暂停原生 <video>）。
  if (event.key === 'Escape') {
    activeRunId.value = null
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  clearRunTimers()
  document.removeEventListener('keydown', onKeydown)
  if (uploadPreview.value) {
    URL.revokeObjectURL(uploadPreview.value)
  }
})

function inspire() {
  syncingPrompt = true
  prompt.value = '雨夜的落地窗前，妲己缓缓回眸，三条白色狐尾随风舒展，镜头从侧后方轻轻靠近。'
  promptModel.value = { parts: [{ kind: 'text', text: prompt.value }] }
  syncingPrompt = false
}

// ── 润色 / 翻译（对齐 PeachArt composer toolbar） ──
const optimizing = ref(false)
const translating = ref(false)

async function runOptimize() {
  const text = promptText(promptModel.value).trim()
  if (!text || optimizing.value || translating.value) return
  optimizing.value = true
  try {
    const out = await hgApi.optimizePrompt(text, useCloud.value ? cloudModelId.value : (modelId.value || ''))
    if (out) {
      // 回填润色结果（作为新的结构化文本，暂不做增强 mark 高亮）。
      syncingPrompt = true
      promptModel.value = { parts: [{ kind: 'text', text: out }] }
      prompt.value = out
      syncingPrompt = false
    }
  } catch (e: unknown) {
    notice.value = e instanceof Error ? e.message : '润色失败'
  } finally {
    optimizing.value = false
  }
}

async function runTranslate() {
  const text = promptText(promptModel.value).trim()
  if (!text || optimizing.value || translating.value) return
  translating.value = true
  try {
    const out = await hgApi.translatePrompt(text)
    if (out) {
      syncingPrompt = true
      promptModel.value = { parts: [{ kind: 'text', text: out }] }
      prompt.value = out
      syncingPrompt = false
    }
  } catch (e: unknown) {
    notice.value = e instanceof Error ? e.message : '翻译失败'
  } finally {
    translating.value = false
  }
}

const rawFile = ref<File | null>(null)

function clearReferenceUpload() {
  if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)
  uploadPreview.value = ''
  uploadName.value = ''
  rawFile.value = null
  selectedAssetId.value = ''
}

// switchMode 切换创作模式（图片 / 视频）。两者能力集不同（视频不走 LoRA、模型、采样参数），
// 而输入区里的结构化提示词会把上一模式留下的 @ 超级标签节点原样带过去，切完看着像「凭空多了一堆 @」。
// 因此切换时清空输入区。刻意保留的：参考图与素材库选中项——图片转视频时它就是首帧，
// 清掉会逼用户重复上传；模式各自的参数（比例/时长/清晰度）也各自独立保存，不受影响。
function switchMode(next: Mode) {
  if (mode.value === next) {
    return
  }
  mode.value = next
  promptModel.value = { parts: [] }
  negative.value = ''
}

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }
  if (uploadPreview.value) {
    URL.revokeObjectURL(uploadPreview.value)
  }

  uploadPreview.value = URL.createObjectURL(file)
  uploadName.value = file.name
  rawFile.value = file
  selectedAssetId.value = ''
}
</script>

<template>
  <div
    class="chat-page"
    :class="{ 'has-artifact': !!activeArtifact() }"
  >
    <!-- 历史会话抽拉侧栏 -->
    <div
      v-if="railOpen"
      class="session-rail-backdrop"
      @click="railOpen = false"
    />
    <aside
      v-if="railOpen"
      class="session-rail"
      aria-label="历史会话"
    >
      <div class="session-rail__head">
        <div>
          <strong>历史会话</strong>
          <small v-if="!sessionLoading">共 {{ sessions.length }} 个</small>
        </div>
        <button
          type="button"
          aria-label="关闭"
          @click="railOpen = false"
        >
          <span
            class="i-lucide-x"
            aria-hidden="true"
          />
        </button>
      </div>
      <div class="session-rail__body">
        <p
          v-if="sessionLoading"
          class="session-rail__empty"
        >
          加载中…
        </p>
        <p
          v-else-if="!sessions.length"
          class="session-rail__empty"
        >
          还没有历史会话<br>发送一条创作后即可在这里看到
        </p>
        <ul
          v-else
          class="session-rail__list"
        >
          <li
            v-for="s in sessions"
            :key="s.id"
          >
            <button
              type="button"
              class="session-row"
              :class="{ active: activeSessionId === s.id, current: s.current }"
              :disabled="sessionLoadingId === s.id"
              @click="openHistorySession(s.id)"
            >
              <span class="session-row__name">{{ s.title || `会话 ${String(s.id).slice(-6)}` }}</span>
              <span class="session-row__meta">
                <b v-if="s.current">当前</b>
                <span v-if="sessionLoadingId === s.id">加载中…</span>
                <span v-else>{{ s.latestTask?.status || '无任务' }}</span>
              </span>
            </button>
            <div class="session-row__actions">
              <button
                type="button"
                title="重命名"
                @click.stop="renameHistorySession(s)"
              >
                <span
                  class="i-lucide-pencil"
                  aria-hidden="true"
                />重命名
              </button>
              <button
                type="button"
                title="归档（归档当前会话会开启一个新会话）"
                @click.stop="archiveHistorySession(s)"
              >
                <span
                  class="i-lucide-archive"
                  aria-hidden="true"
                />归档
              </button>
            </div>
          </li>
        </ul>
      </div>
    </aside>

    <!-- 对话主列 -->
    <section
      class="chat-panel"
      aria-label="创作对话"
    >
      <div class="chat-head">
        <span
          class="chat-dot"
          aria-hidden="true"
        />
        <strong>创作台 · SSE 会话</strong>
        <button
          type="button"
          class="history-toggle"
          @click="openRail"
        >
          <span
            class="i-lucide-history"
            aria-hidden="true"
          />历史{{ sessions.length ? ` ${sessions.length}` : '' }}
        </button>
        <small>{{ running ? '有任务进行中' : '空闲' }}</small>
      </div>

      <div class="chat-scroll">
        <div
          v-for="m in messages"
          :key="m.id"
          class="chat-msg"
          :class="m.role"
        >
          <!-- 用户消息 -->
          <template v-if="m.role === 'user'">
            <div class="user-bubble">
              <p>{{ m.text }}</p>
              <div
                v-if="m.attachment"
                class="bubble-attachments"
              >
                <img
                  :src="m.attachment.url"
                  :alt="m.attachment.name"
                  :title="m.attachment.name"
                >
              </div>
              <small>{{ m.time }}</small>
            </div>
          </template>

          <!-- 助手：欢迎/提示 -->
          <template v-else-if="!m.runId">
            <div class="assistant-bubble static">
              <p>{{ m.text }}</p>
              <div class="assistant-samples">
                <button
                  type="button"
                  class="btn-ghost small"
                  @click="sample('image', '月下回廊，她转身回眸，朱红裙摆在夜风中扬起')"
                >
                  文生图示例
                </button>
                <button
                  type="button"
                  class="btn-ghost small"
                  @click="sample('video', '三尾在烛光中缓慢舒展，她缓缓走向镜头')"
                >
                  图生视频示例
                </button>
              </div>
            </div>
          </template>

          <!-- 助手：任务事件 -->
          <template v-else>
            <div
              class="assistant-bubble"
              :class="m.status"
            >
              <div class="run-line">
                <span
                  class="run-dot"
                  :class="m.status"
                  aria-hidden="true"
                />
                <code>{{ m.event }}</code>
                <small>{{ m.time }}</small>
              </div>
              <p>{{ m.text }}</p>

              <div
                v-if="m.status === 'running'"
                class="modal-progress"
              >
                <div
                  class="modal-progress-bar"
                  :style="{ width: `${m.progress}%` }"
                />
              </div>

              <div
                v-if="m.status === 'running'"
                class="run-actions"
              >
                <button
                  type="button"
                  class="btn-ghost small"
                  @click="cancelRun"
                >
                  取消任务
                </button>
                <span class="refund-hint inline">取消后预占积分自动退回</span>
              </div>

              <!-- 失败/取消后可重试。后端重试是**新建任务并重新计费**，故文案要写明。 -->
              <div
                v-if="m.status === 'cancelled' && m.taskId"
                class="run-actions"
              >
                <button
                  type="button"
                  class="btn-ghost small"
                  :disabled="running"
                  @click="retryRun(m)"
                >
                  重试
                </button>
                <span class="refund-hint inline">重试会新建任务并重新预占积分</span>
              </div>

              <button
                v-if="m.status === 'done' && m.runId && hasArtifact(m.runId)"
                type="button"
                class="view-artifact"
                @click="pickArtifact(m.runId!)"
              >
                查看产物 →
              </button>
            </div>
          </template>
        </div>
      </div>

      <!-- 输入区：严格对照首页输入框（composer） -->
      <div class="chat-composer">
        <div class="composer">
          <div
            class="mode-tabs"
            role="tablist"
            aria-label="选择创作类型"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'image'"
              :class="{ active: mode === 'image' }"
              @click="switchMode('image')"
            >
              <span
                class="i-lucide-image"
                aria-hidden="true"
              />图片创作
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="mode === 'video'"
              :class="{ active: mode === 'video' }"
              @click="switchMode('video')"
            >
              <span
                class="i-lucide-video"
                aria-hidden="true"
              />视频创作
            </button>
          </div>

          <div class="prompt-area">
            <label
              v-if="useCloud || mode === 'video'"
              class="upload-box"
            >
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="上传参考图片"
                @change="handleUpload"
              >
              <img
                v-if="uploadPreview"
                :src="uploadPreview"
                :alt="uploadName"
              >
              <span
                v-else
                class="upload-placeholder"
              >
                <i
                  class="i-lucide-plus"
                  aria-hidden="true"
                />
                <strong>上传图片</strong>
                <small>用于画面对比</small>
              </span>
              <span
                v-if="uploadPreview"
                class="upload-replace"
              >更换图片</span>
            </label>

            <div class="prompt-copy">
              <PromptEditor
                ref="promptEditorRef"
                v-model="promptModel"
                placeholder="描述你想创作的下一幕，输入 @ 唤出角色、服装、画风…"
                @open-category="onOpenCategory"
              />
            </div>
          </div>

          <div class="composer-footer">
            <div class="parameters">
              <button
                type="button"
                :class="{ active: showNegative }"
                @click="showNegative = !showNegative"
              >
                <span
                  class="i-lucide-minus-circle"
                  aria-hidden="true"
                />负面词
              </button>
              <button
                type="button"
                :class="{ active: assetOpen }"
                @click="openAssets"
              >
                <span
                  class="i-lucide-library"
                  aria-hidden="true"
                />素材库
              </button>
              <div
                v-if="mode === 'image' && (catalog?.models || []).length"
                class="model-selector"
              >
                <button
                  type="button"
                  class="model-btn"
                  :class="{ active: !useCloud }"
                  @click="clearCloudModel(); modelPickerOpen = true"
                >
                  <img
                    v-if="activeModel?.cover"
                    :src="activeModel.cover"
                    :alt="activeModel.name"
                    class="model-thumb"
                  >
                  <span
                    v-else
                    class="model-thumb model-thumb-fallback"
                  >{{ (activeModel?.name || '模')[0] }}</span>
                  <span class="model-name">{{ activeModel?.name || '底模' }}</span>
                  <small class="fam">{{ activeModel?.family || '' }}</small>
                </button>
              </div>
              <!-- 视频模式：显示后端实际使用的视频模型（当前仅 MiniMax H3，无选择分支） -->
              <div
                v-else-if="mode === 'video' && activeVideoModel"
                class="model-selector"
              >
                <span
                  class="model-btn video-model active"
                  :title="`${activeVideoModel.workflow} · ${activeVideoModel.steps} 步 · ${activeVideoModel.frameRate}fps`"
                >
                  <span class="model-thumb model-thumb-fallback">{{ activeVideoModel.name[0] }}</span>
                  <span class="model-name">{{ activeVideoModel.name }}</span>
                  <small class="fam">{{ activeVideoModel.note || '图生视频' }}</small>
                </span>
              </div>
              <!-- 视频画幅：尺寸来自后端（ResolutionSelector 实测），与图片档画幅不同 -->
              <div
                v-if="mode === 'video' && videoResolutions.length"
                class="params-wrap"
              >
                <button
                  type="button"
                  class="params-trigger"
                  :class="{ active: ratioOpen }"
                  title="视频画幅"
                  @click="toggleRatio"
                >
                  <span
                    class="i-lucide-monitor"
                    aria-hidden="true"
                  />
                  <span class="params-trigger-label">{{ videoRatioLabel }}</span>
                </button>
                <div
                  v-if="ratioOpen"
                  class="params-popover resolution-popover"
                  role="dialog"
                  aria-label="视频画幅"
                >
                  <section class="params-section">
                    <h2>视频画幅</h2>
                    <div class="resolution-list">
                      <button
                        v-for="r in videoResolutions"
                        :key="r.ratio"
                        type="button"
                        class="resolution-item"
                        :class="{ selected: r.ratio === ratio }"
                        :aria-pressed="r.ratio === ratio"
                        @click="pickVideoRatio(r.ratio)"
                      >
                        <span class="resolution-ratio">{{ r.ratio }}</span>
                        <span class="resolution-label">{{ r.label }}</span>
                        <span class="resolution-size">{{ r.width }}×{{ r.height }}</span>
                      </button>
                    </div>
                  </section>
                </div>
              </div>
              <!-- 视频时长：默认 5 秒；点击出拖动条，确认后生效 -->
              <div
                v-if="mode === 'video'"
                class="params-wrap"
              >
                <button
                  type="button"
                  class="params-trigger"
                  :class="{ active: durationOpen }"
                  title="视频时长"
                  @click="openDuration"
                >
                  <span
                    class="i-lucide-timer"
                    aria-hidden="true"
                  />
                  <span class="params-trigger-label">{{ videoDurationLabel }}</span>
                </button>
                <div
                  v-if="durationOpen"
                  class="params-popover duration-popover"
                  role="dialog"
                  aria-label="视频时长"
                >
                  <section class="params-section">
                    <h2>视频时长</h2>
                    <div class="duration-row">
                      <input
                        v-model.number="videoSecondsDraft"
                        type="range"
                        class="duration-slider"
                        :style="{ '--duration-fill': durationFill }"
                        :min="durationBounds.min"
                        :max="durationBounds.max"
                        step="1"
                        :aria-valuetext="`${videoSecondsDraft} 秒`"
                      >
                      <span class="duration-value">{{ videoSecondsDraft }} 秒</span>
                    </div>
                    <p class="duration-hint">
                      模型按 {{ activeVideoModel?.frameRate || 24 }}fps 生成<template v-if="durationOption">
                        ，实际约 {{ durationOption.actualSeconds.toFixed(1) }} 秒（{{ durationOption.frames }} 帧）
                      </template>
                    </p>
                  </section>
                  <div class="duration-actions">
                    <button
                      type="button"
                      class="duration-cancel"
                      @click="cancelDuration"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      class="duration-confirm"
                      @click="confirmDuration"
                    >
                      确认
                    </button>
                  </div>
                </div>
              </div>
              <button
                v-if="familyLoras.length && !useCloud && mode === 'image'"
                type="button"
                :class="{ active: selectedLoras.length > 0 }"
                @click="loraPickerOpen = true"
              >
                <span
                  class="i-lucide-layers"
                  aria-hidden="true"
                />效果包 <b>{{ selectedLoras.length }}</b>/8
              </button>
              <button
                v-if="availableCloudModels.length && mode === 'image'"
                type="button"
                :class="{ active: useCloud }"
                @click="openCloudPicker"
              >
                <span
                  class="i-lucide-cloud"
                  aria-hidden="true"
                />{{ useCloud ? activeCloudModel?.name : '云端' }}
              </button>
              <div
                v-if="mode === 'image'"
                ref="paramsWrapRef"
                class="params-wrap"
              >
                <button
                  type="button"
                  class="params-trigger"
                  :class="{ active: paramsOpen }"
                  :title="paramsLabel"
                  @click="paramsOpen = !paramsOpen"
                >
                  <span
                    class="i-lucide-sliders-horizontal"
                    aria-hidden="true"
                  />
                  <span class="params-trigger-label">{{ paramsLabel }}</span>
                </button>
                <div
                  v-if="paramsOpen"
                  class="params-popover"
                  role="dialog"
                  aria-label="出图设置"
                >
                  <section class="params-section">
                    <h2>{{ useCloud ? '画幅' : '尺寸' }}</h2>
                    <div class="params-ratio-grid">
                      <button
                        v-for="preset in sizeChoices"
                        :key="preset.ratio"
                        type="button"
                        class="ratio-btn"
                        :class="{ selected: isPresetSelected(preset) }"
                        :aria-pressed="isPresetSelected(preset)"
                        @click="pickSizePreset(preset)"
                      >
                        <span
                          class="ratio-icon-wrap"
                          aria-hidden="true"
                        >
                          <span
                            class="ratio-icon"
                            :style="{ width: ratioIconWidth(preset.ratio) + 'px' }"
                          />
                        </span>
                        <span class="ratio-value">{{ preset.ratio }}</span>
                        <span
                          v-if="preset.label && preset.label !== preset.ratio"
                          class="ratio-label"
                        >{{ preset.label }}</span>
                      </button>
                    </div>
                    <div
                      v-if="!useCloud"
                      class="params-size-fields"
                    >
                      <label>
                        宽度
                        <input
                          :value="width"
                          type="number"
                          min="512"
                          max="1536"
                          step="1"
                          @change="onWidthInput"
                        >
                      </label>
                      <label>
                        高度
                        <input
                          :value="height"
                          type="number"
                          min="512"
                          max="1536"
                          step="1"
                          @change="onHeightInput"
                        >
                      </label>
                    </div>
                  </section>
                  <section
                    v-if="useCloud && cloudQualityChoices.length"
                    class="params-section"
                  >
                    <h2>清晰度</h2>
                    <div class="params-count-row">
                      <button
                        v-for="q in cloudQualityChoices"
                        :key="q"
                        type="button"
                        :class="{ selected: cloudQuality === q }"
                        @click="cloudQuality = q"
                      >
                        {{ q }}
                      </button>
                    </div>
                  </section>
                  <section class="params-section">
                    <h2>生成张数</h2>
                    <div class="params-count-row">
                      <button
                        v-for="n in [1, 2, 3, 4]"
                        :key="n"
                        type="button"
                        :disabled="n > countMax"
                        :class="{ selected: count === n }"
                        @click="setCount(n)"
                      >
                        {{ n }}
                      </button>
                    </div>
                  </section>
                  <section
                    v-if="!useCloud"
                    class="params-section"
                  >
                    <div class="params-sampling-head">
                      <h2>采样设置</h2>
                      <button
                        type="button"
                        class="params-reset"
                        @click="resetSampling"
                      >
                        恢复默认
                      </button>
                    </div>
                    <div class="params-size-fields">
                      <label>
                        步数
                        <input
                          :value="currentSampling.steps"
                          type="number"
                          :min="samplingLimits.stepsMin"
                          :max="samplingLimits.stepsMax"
                          step="1"
                          @change="onStepsInput"
                        >
                      </label>
                      <label>
                        CFG
                        <input
                          :value="currentSampling.cfg"
                          type="number"
                          :min="samplingLimits.cfgMin"
                          :max="samplingLimits.cfgMax"
                          :step="samplingLimits.cfgStep"
                          @change="onCfgInput"
                        >
                      </label>
                      <label>
                        采样器
                        <select
                          :value="currentSampling.sampler"
                          @change="onSamplerInput"
                        >
                          <option
                            v-for="s in samplingLimits.samplers"
                            :key="s"
                            :value="s"
                          >{{ s }}</option>
                        </select>
                      </label>
                      <label>
                        调度器
                        <select
                          :value="currentSampling.scheduler"
                          @change="onSchedulerInput"
                        >
                          <option
                            v-for="s in samplingLimits.schedulers"
                            :key="s"
                            :value="s"
                          >{{ s }}</option>
                        </select>
                      </label>
                    </div>
                  </section>
                </div>
              </div>
            </div>
            <div class="footer-actions">
              <button
                type="button"
                class="icon-btn"
                title="给我灵感"
                @click="inspire"
              >
                <span
                  class="i-lucide-dices"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="icon-btn"
                :disabled="optimizing || translating"
                :aria-busy="translating"
                :title="translating ? '翻译中…' : '翻译提示词'"
                @click="runTranslate"
              >
                <span
                  class="i-lucide-languages"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="icon-btn"
                :disabled="optimizing || translating"
                :aria-busy="optimizing"
                :title="optimizing ? '润色中…' : '一键润色'"
                @click="runOptimize"
              >
                <span
                  class="i-lucide-wand-sparkles"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="generate"
                :disabled="!canSend"
                @click="send"
              >
                <span
                  class="i-lucide-sparkles"
                  aria-hidden="true"
                />
                生成{{ mode === 'video' ? '视频' : '图片' }}
                <small>{{ cost }} {{ useCloud ? '余额' : '积分' }}</small>
              </button>
            </div>
          </div>
          <div
            v-if="selectedLoras.length && !useCloud && mode === 'image'"
            class="lora-strip"
          >
            <span class="lora-strip-label">已选效果包：</span>
            <button
              v-for="s in selectedLoras"
              :key="s.id"
              type="button"
              class="lora-chip"
              @click="loraPickerOpen = true"
            >
              {{ (catalog?.loras || []).find(l => l.id === s.id)?.name || s.id }} · {{ s.weight }}
            </button>
          </div>
          <textarea
            v-if="showNegative"
            v-model="negative"
            rows="2"
            class="negative-input"
            aria-label="负面提示词"
            placeholder="不希望出现的内容：模糊、畸形手指、文字水印……"
          />
          <div
            v-if="assetOpen"
            class="asset-strip"
          >
            <span class="asset-strip-label">素材库：</span>
            <button
              v-for="a in assets"
              :key="a.id"
              type="button"
              class="asset-strip-item"
              :class="{ active: selectedAssetId === a.id }"
              @click="pickAsset(a)"
            >
              <img
                :src="a.url"
                :alt="a.id"
              >
            </button>
            <span
              v-if="!assets.length"
              class="asset-strip-empty"
            >暂无素材，先上传或生成一张</span>
          </div>
          <p
            v-if="notice"
            class="composer-notice"
            role="status"
          >
            {{ notice }}
          </p>
        </div>
      </div>
    </section>

    <!-- 右侧产物单卡：点击消息里的「查看产物」后才出现 -->
    <aside
      v-if="activeArtifact()"
      class="artifact-panel"
      aria-label="产物"
    >
      <div class="artifact-card">
        <div class="artifact-toolbar">
          <strong>{{ activeArtifact()!.kind === 'video' ? '视频产物' : '图片产物' }}</strong>
          <button
            type="button"
            aria-label="关闭产物"
            @click="activeRunId = null"
          >
            <span
              class="i-lucide-x"
              aria-hidden="true"
            />
          </button>
        </div>

        <div
          v-if="activeArtifact()!.kind === 'video'"
          class="artifact-video"
        >
          <video
            v-if="activeArtifact()!.poster"
            :src="activeArtifact()!.poster"
            controls
            autoplay
            loop
            playsinline
            preload="auto"
            :poster="activeArtifact()!.poster"
          />
          <div
            v-else
            class="artifact-empty"
          >
            视频地址暂不可用
          </div>
        </div>

        <div
          v-else
          class="artifact-image"
        >
          <img
            :src="activeArtifact()!.poster"
            :alt="activeArtifact()!.prompt"
          >
        </div>

        <div class="artifact-meta">
          <p>{{ activeArtifact()!.prompt }}</p>
          <dl>
            <div>
              <dt>角色</dt>
              <dd>{{ activeArtifact()!.character }}</dd>
            </div>
            <div>
              <dt>画幅</dt>
              <dd>{{ activeArtifact()!.ratio }}</dd>
            </div>
            <div>
              <dt>计费</dt>
              <dd>已结算 {{ activeArtifact()!.credits }} 积分</dd>
            </div>
            <div>
              <dt>时间</dt>
              <dd>{{ activeArtifact()!.createdAt }}</dd>
            </div>
          </dl>
          <div class="artifact-actions">
            <button
              type="button"
              class="btn-ghost small"
              @click="hint('收藏与下载在素材库接入后可用。')"
            >
              收藏
            </button>
            <button
              type="button"
              class="btn-ghost small"
              @click="hint('下载走素材导出接口，原型暂未接入。')"
            >
              下载
            </button>
            <NuxtLink
              to="/works"
              class="btn-primary small"
            >加入作品库</NuxtLink>
          </div>
        </div>
      </div>
    </aside>

    <div
      v-if="cloudPickerOpen"
      class="cloud-picker"
    >
      <div
        class="cloud-picker__mask"
        @click="cloudPickerOpen = false"
      />
      <div
        class="cloud-picker__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="选择云端模型"
      >
        <div class="cloud-picker__head">
          <div>
            <strong>选择云端模型</strong>
            <small>按张扣减余额，失败自动退回</small>
          </div>
          <button
            type="button"
            aria-label="关闭"
            class="cloud-picker__close"
            @click="cloudPickerOpen = false"
          >
            <span
              class="i-lucide-x"
              aria-hidden="true"
            />
          </button>
        </div>
        <p
          v-if="!availableCloudModels.length"
          class="cloud-picker__empty"
        >
          暂无可用云端模型
        </p>
        <ul
          v-else
          class="cloud-picker__list"
        >
          <li
            v-for="m in availableCloudModels"
            :key="m.id"
          >
            <button
              type="button"
              class="cloud-picker__row"
              :class="{ current: activeCloudModel?.id === m.id }"
              @click="pickCloudModel(m.id)"
            >
              <span class="cloud-picker__thumb">{{ (m.name || '云')[0] }}</span>
              <span class="cloud-picker__meta">
                <b>{{ m.name }}</b>
                <small>{{ m.engine }} · {{ m.capabilities?.parameters?.[0]?.quality || '默认' }} · {{ m.pricing?.qualities?.[0]?.balance || '—' }} 余额/张</small>
              </span>
              <span
                v-if="activeCloudModel?.id === m.id"
                class="cloud-picker__check"
              >
                <span
                  class="i-lucide-check"
                  aria-hidden="true"
                />
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <ModelPicker
      :open="modelPickerOpen"
      :models="catalog?.models || []"
      :model-id="modelId"
      @close="modelPickerOpen = false"
      @select="pickModel"
    />
    <LoraPicker
      :open="loraPickerOpen"
      :loras="familyLoras"
      :selected="selectedLoras"
      @close="loraPickerOpen = false"
      @update="selectedLoras = $event"
    />
    <SnippetPicker
      :open="snippetPickerOpen"
      :category="snippetCategory"
      @close="snippetPickerOpen = false; promptEditorRef?.cancelSnippet()"
      @apply="onApplySnippet"
    />
  </div>
</template>

<style scoped>
.negative-input {
  width: 100%;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.12));
  border-radius: 8px;
  background: var(--hg-input, rgb(255 255 255 / 0.05));
  color: var(--ink);
  font-size: 13px;
  resize: vertical;
  outline: none;
}
.negative-input:focus {
  border-color: var(--amber);
}
.asset-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  overflow-x: auto;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.1));
  border-radius: 10px;
  background: rgb(255 255 255 / 0.025);
}
.asset-strip-label {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
.asset-strip-item {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  overflow: hidden;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  background: var(--panel);
}
.asset-strip-item.active {
  border-color: var(--amber);
  box-shadow: 0 0 0 2px rgb(251 191 36 / 0.25);
}
.asset-strip-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.asset-strip-empty {
  color: var(--faint);
  font-size: 12px;
}

/* ── 模型选择按钮 ── */
.model-selector {
  position: relative;
}
.model-selector .fam {
  color: var(--muted);
  font-weight: 400;
  margin-left: 4px;
}

/* ── 已选 LoRA 徽标条 ── */
.lora-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.1));
  border-radius: 10px;
  background: rgb(255 255 255 / 0.025);
}
.lora-strip-label {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}
.lora-chip {
  padding: 4px 10px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.12));
  border-radius: 999px;
  cursor: pointer;
  color: var(--ink);
  background: var(--panel);
  font-size: 12px;
}
.lora-chip.active {
  border-color: var(--amber);
  background: rgb(251 191 36 / 0.16);
}

.params-wrap {
  position: relative;
}
.params-trigger {
  max-width: 14rem;
}
.params-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.params-popover {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
  width: min(20rem, calc(100vw - 2rem));
  padding: 12px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.12));
  border-radius: 12px;
  background: var(--panel, #16161a);
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.35);
}
.params-section + .params-section {
  margin-top: 16px;
}
/* ── 视频画幅：列表 + 尺寸 ── */
.resolution-popover {
  width: min(16rem, calc(100vw - 2rem));
}
.resolution-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
}
.resolution-item {
  display: grid;
  grid-template-columns: 3.2rem 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.resolution-item:hover {
  background: rgb(255 255 255 / 0.06);
}
.resolution-item.selected {
  background: rgb(255 255 255 / 0.1);
}
.resolution-ratio {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.resolution-label {
  color: var(--hg-muted, rgb(255 255 255 / 0.55));
}
.resolution-size {
  color: var(--hg-muted, rgb(255 255 255 / 0.4));
  font-variant-numeric: tabular-nums;
}

/* ── 视频时长：拖动条 + 确认 ── */
.duration-popover {
  width: min(18rem, calc(100vw - 2rem));
}
.duration-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.duration-slider {
  flex: 1;
  height: 4px;
  appearance: none;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--hg-accent, #b08a4f) 0%,
    var(--hg-accent, #b08a4f) var(--duration-fill, 44%),
    rgb(255 255 255 / 0.14) var(--duration-fill, 44%),
    rgb(255 255 255 / 0.14) 100%
  );
  cursor: pointer;
}
.duration-slider::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--panel, #16161a);
  background: var(--hg-accent, #b08a4f);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12);
  cursor: pointer;
}
.duration-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--panel, #16161a);
  background: var(--hg-accent, #b08a4f);
  cursor: pointer;
}
.duration-value {
  min-width: 3.4rem;
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.duration-hint {
  margin: 8px 0 0;
  color: var(--hg-muted, rgb(255 255 255 / 0.55));
  font-size: 11px;
  line-height: 1.5;
}
.duration-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.duration-actions button {
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.12));
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.duration-actions .duration-confirm {
  border-color: transparent;
  background: var(--hg-accent, #b08a4f);
  color: #1a1207;
}
.duration-actions button:hover {
  filter: brightness(1.08);
}
.params-section h2 {
  margin: 0;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}
.params-ratio-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 2px;
  margin-top: 8px;
  padding: 4px;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.05);
}
.params-popover .ratio-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  height: auto;
  padding: 6px 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #8f8f95;
  gap: 0;
}
.params-popover .ratio-btn.selected {
  background: var(--card, #1f1f24);
  color: var(--ink);
  border-color: transparent;
}
.ratio-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
}
.ratio-icon {
  height: 18px;
  border: 1.5px solid currentColor;
  border-radius: 3px;
}
.ratio-value,
.ratio-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
}
.ratio-label {
  font-weight: 400;
}
.params-size-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}
.params-size-fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
}
.params-size-fields input,
.params-size-fields select {
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.12));
  border-radius: 8px;
  background: rgb(255 255 255 / 0.04);
  color: var(--ink);
  font-size: 12px;
  outline: none;
}
.params-size-fields input:focus,
.params-size-fields select:focus {
  border-color: var(--amber);
}
.params-count-row {
  display: flex;
  gap: 2px;
  margin-top: 8px;
  padding: 4px;
  border-radius: 8px;
  background: rgb(255 255 255 / 0.05);
}
.params-popover .params-count-row button {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #8f8f95;
  font-size: 12px;
  font-weight: 600;
}
.params-popover .params-count-row button.selected {
  background: var(--card, #1f1f24);
  color: var(--ink);
}
.params-popover .params-count-row button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.params-sampling-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.params-reset {
  height: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.params-reset:hover {
  color: var(--ink);
}

/* 云端模型选择弹窗 */
.cloud-picker {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
}
.cloud-picker__mask {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.55);
}
.cloud-picker__dialog {
  position: relative;
  width: min(360px, calc(100vw - 32px));
  max-height: min(520px, calc(100dvh - 64px));
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid var(--line, rgb(255 255 255 / 0.12));
  border-radius: 14px;
  background: var(--panel, #16161a);
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.45);
}
.cloud-picker__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.cloud-picker__head > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cloud-picker__head strong {
  font-size: 15px;
}
.cloud-picker__head small {
  color: var(--muted, #8f8f95);
  font-size: 12px;
}
.cloud-picker__close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #999a9f;
}
.cloud-picker__close:hover {
  background: rgb(255 255 255 / 0.08);
  color: var(--ink);
}
.cloud-picker__empty {
  color: var(--muted, #8f8f95);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
  margin: 0;
}
.cloud-picker__list {
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cloud-picker__row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.03);
  color: var(--ink);
  text-align: left;
}
.cloud-picker__row:hover {
  background: rgb(255 255 255 / 0.07);
}
.cloud-picker__row.current {
  border-color: rgb(251 191 36 / 0.5);
  background: rgb(251 191 36 / 0.1);
}
.cloud-picker__thumb {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: rgb(251 191 36 / 0.18);
  color: var(--amber-soft, #fbd36a);
  font-weight: 700;
}
.cloud-picker__meta {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cloud-picker__meta b {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.cloud-picker__meta small {
  color: var(--muted, #8f8f95);
  font-size: 11px;
}
.cloud-picker__check {
  flex: 0 0 auto;
  color: var(--amber);
}

/* 历史会话抽拉侧栏 */
.history-toggle {
  margin-left: 8px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  border: 1px solid var(--line, rgb(255 255 255 / 0.12));
  border-radius: 7px;
  background: transparent;
  color: #999a9f;
  font-size: 12px;
}
.history-toggle:hover {
  background: rgb(255 255 255 / 0.06);
  color: var(--ink);
}
.session-rail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgb(0 0 0 / 0.4);
}
.session-rail {
  position: fixed;
  z-index: 61;
  top: calc(var(--topbar-h, 58px) + 16px);
  left: calc(var(--rail, 244px) + 16px);
  bottom: 16px;
  width: min(300px, calc(100vw - 350px));
  min-width: 220px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line, rgb(255 255 255 / 0.12));
  border-radius: 14px;
  background: var(--panel, #16161a);
  box-shadow: 0 20px 50px rgb(0 0 0 / 0.45);
  overflow: hidden;
}
.session-rail__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--hg-line, rgb(255 255 255 / 0.08));
}
.session-rail__head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.session-rail__head strong {
  font-size: 14px;
}
.session-rail__head small {
  color: var(--muted, #8f8f95);
  font-size: 11px;
}
.session-rail__head button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #999a9f;
}
.session-rail__head button:hover {
  background: rgb(255 255 255 / 0.08);
  color: var(--ink);
}
.session-rail__body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.session-rail__empty {
  margin: 32px auto;
  text-align: center;
  color: var(--muted, #8f8f95);
  font-size: 12px;
  line-height: 1.9;
}
.session-rail__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.session-row {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--ink);
  text-align: left;
}
.session-row:hover {
  background: rgb(255 255 255 / 0.06);
}
.session-row.active {
  border-color: rgb(251 191 36 / 0.4);
  background: rgb(251 191 36 / 0.08);
}
.session-row__actions {
  display: flex;
  gap: 6px;
  margin: 2px 0 6px 4px;
}
.session-row__actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid rgb(255 255 255 / 0.12);
  border-radius: 7px;
  background: transparent;
  color: var(--ink-dim, #9aa0a6);
  font-size: 11px;
  cursor: pointer;
}
.session-row__actions button:hover:not(:disabled) {
  color: var(--ink);
  border-color: rgb(251 191 36 / 0.45);
}
.session-row__actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.session-row__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.session-row__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted, #8f8f95);
  font-size: 11px;
}
.session-row__meta b {
  font-weight: 600;
  color: var(--amber-soft, #fbd36a);
}
</style>
