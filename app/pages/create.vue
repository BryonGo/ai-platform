<script setup lang="ts">
import { characters, works } from '~/composables/useHougong'
import { useComposerDraft } from '~/composables/useComposerDraft'

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
const ratio = ref('16:9')
const duration = ref('5 秒')
const notice = ref('')
const uploadPreview = ref('')
const uploadName = ref('')
const selected = ref('daji')

const cost = computed(() => (mode.value === 'video' ? 24 : 8))
const selectedCharacter = computed(() => characters.find(c => c.id === selected.value))
const running = computed(() => messages.value.some(m => m.role === 'assistant' && m.status === 'running'))
const canSend = computed(() => !running.value && (prompt.value.trim().length > 0 || !!uploadPreview.value))

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

function posterFor(characterId: string, idx: number) {
  const pool = works.filter(w => w.characterId === characterId).map(w => w.image)
  const base = pool.length ? pool : works.map(w => w.image)
  return base[idx % base.length] ?? base[0] ?? ''
}

let runTimers: ReturnType<typeof setInterval>[] = []

function clearRunTimers() {
  runTimers.forEach(t => clearInterval(t))
  runTimers = []
}

function send() {
  if (!canSend.value) {
    if (!prompt.value.trim() && !uploadPreview.value) {
      notice.value = '请先描述这一幕。'
    }
    return
  }
  const text = prompt.value.trim() || '（仅参考图）根据附件生成'
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
  const characterId = selected.value
  const characterName = selectedCharacter.value?.name ?? ''
  const credits = cost.value
  const kind = mode.value
  const ratioNow = ratio.value
  const poster = posterFor(characterId, runId - 1)

  messages.value.push({
    id: ++msgSeq,
    role: 'assistant',
    runId,
    status: 'queued',
    progress: 0,
    event: 'task.created · 任务已创建，预占积分中',
    text: `${characterName} · ${kind === 'video' ? '视频' : '图片'} · ${ratioNow} · 预占 ${credits} 积分`,
    time: now()
  })

  setTimeout(() => {
    const q = messages.value.find(m => m.runId === runId)
    if (q) {
      q.status = 'running'
      q.event = 'task.started · 正在生成'
    }
    const started = Date.now()
    const targetMs = kind === 'video' ? 2600 : 1400
    const timer = setInterval(() => {
      const msg = messages.value.find(m => m.runId === runId)
      if (!msg || msg.status !== 'running') {
        clearInterval(timer)
        return
      }
      const elapsed = Date.now() - started
      msg.progress = Math.min(96, Math.round((elapsed / targetMs) * 96))
      msg.event = `task.progress · ${msg.progress}%`
      if (elapsed >= targetMs) {
        clearInterval(timer)
        msg.progress = 100
        msg.status = 'done'
        msg.event = 'task.completed · 生成完成'
        msg.text = `${characterName} · ${kind === 'video' ? '视频' : '图集'} · ${ratioNow} · 已结算 ${credits} 积分`
        artifacts.value.push({
          runId,
          kind,
          prompt: text,
          character: characterName,
          ratio: ratioNow,
          credits,
          poster,
          createdAt: now()
        })
      }
    }, 120)
    runTimers.push(timer)
  }, 320)
}

function cancelRun() {
  const msg = messages.value.find(m => m.role === 'assistant' && m.status === 'running')
  if (!msg) {
    return
  }
  msg.status = 'cancelled'
  msg.progress = 0
  msg.event = 'task.cancelled · 预占积分已退回'
  msg.text = `${msg.text} → 已取消，未产生扣费`
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
  prompt.value = '雨夜的落地窗前，妲己缓缓回眸，三条白色狐尾随风舒展，镜头从侧后方轻轻靠近。'
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
              <textarea
                v-model="prompt"
                rows="3"
                aria-label="创作描述"
                placeholder="描述你想创作的下一幕……"
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
            </div>
          </div>

          <div class="composer-footer">
            <div class="parameters">
              <button type="button">
                <span
                  class="i-lucide-user-round"
                  aria-hidden="true"
                />{{ selectedCharacter?.name }}
              </button>
              <button type="button">
                <span
                  class="i-lucide-image-plus"
                  aria-hidden="true"
                />参考素材
              </button>
              <button type="button">
                <span
                  class="i-lucide-box"
                  aria-hidden="true"
                />智能匹配
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
              <small>{{ cost }} 积分</small>
            </button>
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
  </div>
</template>
