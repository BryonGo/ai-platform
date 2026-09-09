<script setup lang="ts">
import { characters } from '~/composables/useHougong'
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
}

const mode = ref<Mode>('image')
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
const ratio = ref('16:9')
const duration = ref('5 秒')
const notice = ref('')
const uploadPreview = ref('')
const uploadName = ref('')
const selected = ref('daji')

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
const cloudModelId = ref('')
const cloudQuality = ref('')

const activeCloudModel = computed(() => cloudModels.value.find(m => m.id === cloudModelId.value) || null)
// 只选云端（balance）或本地 comfy；云端模型仅图片（t2i），视频仍走 comfy i2v。
const useCloud = computed(() => mode.value === 'image' && !!activeCloudModel.value)

function cycleCloudModel() {
  if (!cloudModels.value.length) return
  const idx = Math.max(0, cloudModels.value.findIndex(m => m.id === cloudModelId.value))
  const next = cloudModels.value[(idx + 1) % cloudModels.value.length]
  if (!next) return
  cloudModelId.value = next.id
  cloudQuality.value = next.capabilities.default.quality
}

function clearCloudModel() {
  cloudModelId.value = ''
  cloudQuality.value = ''
}

function cycleCloudQuality() {
  const m = activeCloudModel.value
  if (!m) return
  const quals = m.capabilities.parameters.map(p => p.quality)
  if (!quals.length) return
  const idx = Math.max(0, quals.indexOf(cloudQuality.value))
  cloudQuality.value = quals[(idx + 1) % quals.length] || quals[0] || ''
}

// 当前计费提示：云端按 balance 分显示（pricing.balance），本地按 credit 积分。
const activeCloudCharge = computed(() => {
  const m = activeCloudModel.value
  if (!m) return 0
  const q = m.pricing.qualities.find(x => x.quality === cloudQuality.value)
  return q?.balance ?? 0
})

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
  if (useCloud.value) return activeCloudCharge.value
  return mode.value === 'video' ? 24 : 8
})
const selectedCharacter = computed(() => characters.find(c => c.id === selected.value))
const running = computed(() => messages.value.some(m => m.role === 'assistant' && m.status === 'running'))
const canSend = computed(() => !running.value && (promptText(promptModel.value).trim().length > 0 || !!uploadPreview.value))

// ---- 会话与产物 ----
const messages = ref<ChatMessage[]>([])
const artifacts = ref<Artifact[]>([])
const activeRunId = ref<number | null>(null)

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
    let firstFrameId = ''
    if (kind === 'video') {
      if (selectedAssetId.value) {
        firstFrameId = selectedAssetId.value
      } else if (rawFile.value) {
        const up = await hgApi.uploadMedia(rawFile.value)
        firstFrameId = up.mediaAssetId
      } else {
        throw new Error('视频生成请先上传首帧图片或从素材库选择')
      }
    }
    // 已选 LoRA：传 catalog id + 权重（后端按 id 校验 family 兼容并解析 comfy 文件名）。
    const selectedLoraItems = selectedLoras.value
      .map(s => ({ name: s.id, weight: s.weight }))

    const task = await hgApi.createTask({
      clientKey: `hg-web-${Date.now()}-${runSeq}`,
      type: kind === 'video' ? 'i2v' : 't2i',
      prompt: text,
      negativePrompt: negative.value.trim() || undefined,
      ratio: ratioNow,
      // i2v 走 MiniMax H3 专用工作流，不传文生图模型/采样参数（否则用错模型卡死）
      modelId: kind === 'video' ? undefined : (useCloud.value ? cloudModelId.value : (modelId.value || undefined)),
      quality: kind === 'video' ? undefined : (useCloud.value ? (cloudQuality.value || undefined) : undefined),
      engine: kind === 'video' ? undefined : (useCloud.value ? (activeCloudModel.value?.engine || undefined) : undefined),
      sampling: kind === 'video' || useCloud.value ? undefined : (sampling.value || undefined),
      loras: kind === 'video' || useCloud.value ? undefined : (selectedLoraItems.length ? selectedLoraItems : undefined),
      characterId: characterId === 'daji' ? '' : characterId,
      refAssetIds: firstFrameId ? [firstFrameId] : []
    })
    const msg = () => messages.value.find(m => m.runId === runId)
    const taskId = task.id
    let status = task.status
    // 轮询至终态
    while (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled' && status !== 'reconciling') {
      await sleep(2500)
      const t = await hgApi.getTask(taskId)
      status = t.status
      const cur = msg()
      if (cur) {
        cur.progress = t.progress || cur.progress
        cur.event = `${t.status} · ${cur.progress}%`
      }
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
            characterId: 0
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
      notice.value = status === 'failed' ? '生成失败，积分已退回，可在任务中心重试' : '任务已取消'
    }
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

// ---- 播放器 mock：接入真实视频源前用海报演示播放器形态 ----
const playing = ref(false)
const playSeconds = ref(0)
let playTimer: ReturnType<typeof setInterval> | undefined
const MOCK_VIDEO_SECONDS = 8

function togglePlay() {
  if (!playing.value) {
    playing.value = true
    playSeconds.value = 0
    playTimer = setInterval(() => {
      playSeconds.value += 0.1
      if (playSeconds.value >= MOCK_VIDEO_SECONDS) {
        stopPlay()
      }
    }, 100)
  } else {
    stopPlay()
  }
}

function stopPlay() {
  playing.value = false
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = undefined
  }
}

function formatSeconds(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function pickArtifact(runId: number) {
  activeRunId.value = runId
}

function hint(text: string) {
  messages.value.push(assistText(text))
}

// ---- 带入 ----
const { takeDraft } = useComposerDraft()

onMounted(() => {
  messages.value.push(welcomeMessage())
  loadCatalog()

  const draft = takeDraft()
  if (draft) {
    mode.value = draft.mode
    ratio.value = draft.ratio
    duration.value = draft.duration || '5 秒'
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
  if (characterId && characters.some(c => c.id === characterId)) {
    selected.value = characterId
  }
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    stopPlay()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  clearRunTimers()
  stopPlay()
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

              <button
                v-if="m.status === 'done' && m.runId"
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
              @click="mode = 'image'"
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
              @click="mode = 'video'"
            >
              <span
                class="i-lucide-video"
                aria-hidden="true"
              />视频创作
            </button>
          </div>

          <div class="prompt-area">
            <label class="upload-box">
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
              <button
                type="button"
                class="inspire"
                @click="inspire"
              >
                <span
                  class="i-lucide-dices"
                  aria-hidden="true"
                />给我灵感
              </button>
              <button
                type="button"
                class="inspire"
                :disabled="optimizing || translating"
                :aria-busy="translating"
                @click="runTranslate"
              >
                <span
                  class="i-lucide-languages"
                  aria-hidden="true"
                />{{ translating ? '翻译中…' : '翻译' }}
              </button>
              <button
                type="button"
                class="inspire"
                :disabled="optimizing || translating"
                :aria-busy="optimizing"
                @click="runOptimize"
              >
                <span
                  class="i-lucide-wand-sparkles"
                  aria-hidden="true"
                />{{ optimizing ? '润色中…' : '润色' }}
              </button>
            </div>
          </div>

          <div class="composer-footer">
            <div class="parameters">
              <button
                type="button"
                @click="showNegative = !showNegative"
              >
                <span
                  class="i-lucide-image-plus"
                  aria-hidden="true"
                />{{ showNegative ? '负面词 ✓' : '负面词' }}
              </button>
              <button
                type="button"
                @click="openAssets"
              >
                <span
                  class="i-lucide-image-plus"
                  aria-hidden="true"
                />素材库
              </button>
              <div
                v-if="(catalog?.models || []).length"
                class="model-selector"
              >
                <button
                  type="button"
                  :class="{ active: !useCloud }"
                  @click="clearCloudModel(); modelPickerOpen = true"
                >
                  <span
                    class="i-lucide-box"
                    aria-hidden="true"
                  />{{ activeModel?.name || '底模' }} <small class="fam">{{ activeModel?.family || '' }}</small>
                </button>
              </div>
              <button
                v-if="familyLoras.length && !useCloud && mode === 'image'"
                type="button"
                @click="loraPickerOpen = true"
              >
                <span
                  class="i-lucide-layers-3"
                  aria-hidden="true"
                />效果包 {{ selectedLoras.length }}/8
              </button>
              <button
                v-if="cloudModels.length && mode === 'image'"
                type="button"
                :class="{ active: useCloud }"
                @click="cycleCloudModel"
              >
                <span
                  class="i-lucide-cloud"
                  aria-hidden="true"
                />{{ activeCloudModel?.name || '云端' }}
              </button>
              <button
                v-if="useCloud"
                type="button"
                @click="cycleCloudQuality"
              >
                <span
                  class="i-lucide-sliders-horizontal"
                  aria-hidden="true"
                />{{ cloudQuality }}
              </button>
              <button
                type="button"
                @click="ratio = ratio === '16:9' ? '9:16' : '16:9'"
              >
                <span
                  class="i-lucide-monitor"
                  aria-hidden="true"
                />{{ ratio }}
              </button>
              <button
                v-if="mode === 'video'"
                type="button"
                @click="duration = duration === '5 秒' ? '10 秒' : '5 秒'"
              >
                <span
                  class="i-lucide-clock-3"
                  aria-hidden="true"
                />{{ duration }}
              </button>
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
          class="mock-player"
        >
          <img
            :src="activeArtifact()!.poster"
            :alt="activeArtifact()!.prompt"
          >
          <span
            class="story-wash"
            aria-hidden="true"
          />
          <div class="player-chrome">
            <button
              type="button"
              class="play-btn"
              :aria-label="playing ? '暂停' : '播放'"
              @click="togglePlay"
            >
              <span
                :class="playing ? 'i-lucide-pause' : 'i-lucide-play'"
                aria-hidden="true"
              />
            </button>
            <div class="player-track">
              <div
                class="player-track-fill"
                :style="{ width: `${(playSeconds / MOCK_VIDEO_SECONDS) * 100}%` }"
              />
            </div>
            <span class="player-time">
              {{ formatSeconds(playSeconds) }} / 00:0{{ MOCK_VIDEO_SECONDS }}
            </span>
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
</style>
