<script setup lang="ts">
const hgApi = useHougongApi()
const session = useAuthSession()
const router = useRouter()
// 积分余额（顶部栏与本地展示共用，避免依赖未实现的 useAppStore）
const appCredits = useState<number>('hg:credits', () => 0)

type Mode = 'image' | 'video'

const mode = ref<Mode>('image')
const positive = ref('')
const negative = ref('')
const showNegative = ref(false)
const referencePreview = ref('')
const referenceName = ref('')
const rawFile = ref<File | null>(null)

const catalog = ref<Catalog | null>(null)
const modelId = ref('')
const loras = ref<{ name: string, weight: number }[]>([])
const selectedLoraIds = ref<string[]>([])

const ratio = ref('1:1')
const customWidth = ref(0)
const customHeight = ref(0)
const count = ref(1)
const seed = ref<number | null>(null)
const steps = ref(12)
const sampler = ref('dpmpp_2m')
const scheduler = ref('karras')
const cfg = ref(1)

const parametersOpen = ref(false)
const submitting = ref(false)
const notice = ref('')
const genError = ref('')
const resultUrl = ref('')
const resultStatus = ref<'idle' | 'working' | 'done' | 'failed'>('idle')
const resultProgress = ref(0)
const resultCredits = ref(0)
const balance = ref(0)
const charge = computed(() => (mode.value === 'video' ? 24 : 8))

// ── 快捷词（snippet）@ 提及 + 选择器 ──
const snippetCats = ref<SnippetCategory[]>([])
const snippetOpen = ref(false)
const snippetActiveCat = ref('character')
const snippetQuery = ref('')
const snippetItems = ref<SnippetItem[]>([])
const snippetEnabled = ref(false)
const mentionAnchor = ref(-1)
let snippetDebounce: ReturnType<typeof setTimeout> | undefined

async function loadSnippetCats() {
  if (snippetCats.value.length === 0) {
    try { snippetCats.value = await hgApi.snippetCategories() } catch { /* 忽略 */ }
  }
}
function openSnippet() {
  snippetOpen.value = true
  snippetActiveCat.value = 'character'
  snippetQuery.value = ''
  loadSnippetCats().then(fetchSnippets)
}
function closeSnippet() { snippetOpen.value = false }
async function fetchSnippets() {
  try {
    const r = await hgApi.snippetList({ category: snippetActiveCat.value, query: snippetQuery.value || undefined, limit: 12 })
    snippetItems.value = r.items
  } catch { snippetItems.value = [] }
}
function pickSnippet(it: SnippetItem) {
  // 插入英文 prompt（喂给生成器），中文展示在标题。
  appendToPrompt(it.prompt.english || it.labels.english)
  snippetOpen.value = false
}
function appendToPrompt(text: string) {
  const cur = positive.value
  positive.value = cur ? cur + ', ' + text : text
}
// @ 提及检测：输入 @ 后弹出 snippet 选择器。
function onPromptInput() {
  const m = positive.value.match(/@([^\s@]*)$/)
  if (m) {
    if (!snippetOpen.value) openSnippet()
    snippetQuery.value = m[1] || ''
    if (snippetDebounce) clearTimeout(snippetDebounce)
    snippetDebounce = setTimeout(fetchSnippets, 150)
  } else if (!snippetOpen.value) {
    /* 未触发，不自动关（用户可能手工打开） */
  }
}

// ── 生成会话（workspace）侧栏 ──
const sessions = ref<SessionItem[]>([])
const activeSessionId = ref('')
const sessionOpen = ref(false)

async function loadSessions() {
  try { sessions.value = await hgApi.listSessions() } catch { sessions.value = [] }
}
function toggleSessionPanel() { sessionOpen.value = !sessionOpen.value; if (sessionOpen.value) loadSessions() }
async function newSession() {
  try { await hgApi.createSession(); await loadSessions() } catch (e) { notice.value = e instanceof Error ? e.message : '创建会话失败' }
}
async function renameSession(id: string) {
  const cur = sessions.value.find(s => s.id === id)
  const title = window.prompt('会话标题', cur?.title || '')
  if (!title) return
  try { await hgApi.renameSession(id, title); await loadSessions() } catch (e) { notice.value = e instanceof Error ? e.message : '重命名失败' }
}
async function archiveSession(id: string) {
  try { await hgApi.archiveSession(id); await loadSessions() } catch (e) { notice.value = e instanceof Error ? e.message : '归档失败' }
}

// ── 资产库选择器（参考图）──
const assetOpen = ref(false)
const assetItems = ref<AssetItem[]>([])
const assetBusy = ref(false)

async function openAssetPicker() {
  assetOpen.value = true
  assetBusy.value = true
  try { assetItems.value = await hgApi.listAssets() } catch { assetItems.value = [] } finally { assetBusy.value = false }
}
function closeAssetPicker() { assetOpen.value = false }
function pickAsset(it: AssetItem) {
  referencePreview.value = it.url
  referenceName.value = it.id
  rawFile.value = null // 用已上传资产，无需再传文件
  if (mode.value !== 'video') mode.value = 'video'
  selectedAssetId.value = it.id
  assetOpen.value = false
}
const selectedAssetId = ref('')

const ratioPresets = [
  { ratio: '1:1', label: '方形' },
  { ratio: '3:4', label: '竖图' },
  { ratio: '4:3', label: '横图' },
  { ratio: '9:16', label: '手机' },
  { ratio: '16:9', label: '桌面' }
]

const currentLoraWeight = (name: string) => loras.value.find(l => l.name === name)?.weight ?? 0
const canSubmit = computed(() => positive.value.trim().length > 0 && !submitting.value)

onMounted(async () => {
  session.load()
  if (!session.token.value) {
    await navigateTo('/auth/login')
    return
  }
  try {
    const [cat, wallet] = await Promise.all([
      hgApi.getCatalog(),
      hgApi.wallet().catch(() => ({ balance: 0, holds: 0 }))
    ])
    catalog.value = cat
    balance.value = wallet.balance
    appCredits.value = wallet.balance
    const model = cat.models.find(m => m.selectable)
    if (model) {
      modelId.value = model.id
      if (model.sampling) {
        steps.value = model.sampling.steps
        sampler.value = model.sampling.sampler
        scheduler.value = model.sampling.scheduler
        cfg.value = model.sampling.cfg
      }
    }
  } catch (e: unknown) {
    notice.value = e instanceof Error ? e.message : '能力目录加载失败'
  }
})

function toggleLora(id: string) {
  const idx = selectedLoraIds.value.indexOf(id)
  if (idx >= 0) {
    selectedLoraIds.value.splice(idx, 1)
    loras.value = loras.value.filter(l => l.name !== id)
    return
  }
  const item = catalog.value?.loras.find(l => l.id === id)
  if (!item) return
  selectedLoraIds.value.push(id)
  loras.value.push({ name: item.fileName || id, weight: item.weight?.default ?? 1 })
}

function onLoraWeight(id: string, event: Event) {
  const item = catalog.value?.loras.find(l => l.id === id)
  const name = item?.fileName || id
  const target = event.target as HTMLInputElement
  setLoraWeight(name, Number(target.value))
}

function setLoraWeight(name: string, weight: number) {
  const idx = loras.value.findIndex(l => l.name === name)
  if (idx >= 0) loras.value[idx] = { name, weight }
}

function selectRatio(r: { ratio: string }) {
  ratio.value = r.ratio
  customWidth.value = 0
  customHeight.value = 0
}

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (referencePreview.value) URL.revokeObjectURL(referencePreview.value)
  referencePreview.value = URL.createObjectURL(file)
  referenceName.value = file.name
  rawFile.value = file
  if (mode.value !== 'video') mode.value = 'video'
}

function clearReference() {
  if (referencePreview.value) URL.revokeObjectURL(referencePreview.value)
  referencePreview.value = ''
  referenceName.value = ''
  rawFile.value = null
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  notice.value = ''
  genError.value = ''
  resultUrl.value = ''
  resultStatus.value = 'working'
  resultProgress.value = 0
  try {
    let firstFrameId = ''
    if (mode.value === 'video') {
      if (selectedAssetId.value) {
        firstFrameId = selectedAssetId.value
      } else if (rawFile.value) {
        const up = await hgApi.uploadMedia(rawFile.value)
        firstFrameId = up.mediaAssetId
      } else {
        throw new Error('请先上传首帧参考图')
      }
    }
    const task = await hgApi.createTask({
      clientKey: 'hg-web-' + Date.now(),
      type: mode.value === 'video' ? 'i2v' : 't2i',
      prompt: positive.value.trim(),
      negativePrompt: negative.value.trim() || undefined,
      ratio: ratio.value,
      width: customWidth.value || undefined,
      height: customHeight.value || undefined,
      count: count.value,
      seed: seed.value ?? undefined,
      sampling: { steps: steps.value, sampler: sampler.value, scheduler: scheduler.value, cfg: cfg.value },
      loras: loras.value.length ? loras.value : undefined,
      modelId: modelId.value || undefined,
      refAssetIds: firstFrameId ? [firstFrameId] : []
    })
    const taskId = task.id
    let status = task.status
    while (status !== 'succeeded' && status !== 'failed' && status !== 'cancelled' && status !== 'reconciling') {
      await new Promise(r => setTimeout(r, 2500))
      const t = await hgApi.getTask(taskId)
      status = t.status
      resultProgress.value = t.progress || resultProgress.value
    }
    if (status === 'succeeded') {
      const detail = await hgApi.getTask(taskId)
      const assets = detail.outputAssets || []
      resultStatus.value = 'done'
      resultCredits.value = detail.billedCredits || charge.value
      if (assets.length) {
        try {
          await hgApi.createWork({ taskId: String(taskId), assetId: assets[0], kind: mode.value === 'video' ? 'video' : 'image', title: positive.value.trim().slice(0, 40), characterId: 0 })
          const works = await hgApi.listWorks()
          resultUrl.value = works[0]?.imageUrl || ''
        } catch {
          /* 入库失败仍显示完成 */
        }
      }
      try {
        const w = await hgApi.wallet()
        appCredits.value = w.balance
        balance.value = w.balance
      } catch { /* ignore */ }
    } else {
      resultStatus.value = status === 'failed' ? 'failed' : 'idle'
      genError.value = status === 'failed' ? '生成失败（积分已退回）' : '任务已取消'
      notice.value = genError.value
    }
  } catch (e: unknown) {
    resultStatus.value = 'failed'
    genError.value = e instanceof Error ? e.message : '生成失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          创作台 · 01
        </p>
        <h1>把这一幕，交给影像宇宙</h1>
        <p>选择底模与效果包，描绘画幅、采样与参考图；生成后作品自动入库。</p>
      </div>
      <button
        type="button"
        class="btn-primary"
        :disabled="submitting"
        @click="submit"
      >
        {{ submitting ? '生成中…' : '开始创作' }}
      </button>
    </div>

    <div class="composer2">
      <!-- 会话侧栏 -->
      <aside
        v-if="sessionOpen"
        class="composer2-sessions"
      >
        <div class="session-head">
          <span class="composer2-section-title">创作会话</span>
          <button
            type="button"
            class="composer2-btn-sm"
            @click="newSession"
          >+ 新建</button>
        </div>
        <div class="session-list">
          <button
            v-for="s in sessions"
            :key="s.id"
            type="button"
            class="session-item"
            :class="{ active: s.current }"
            @click="activeSessionId = s.id"
          >
            <span class="session-title">{{ s.title || '未命名创作' }}</span>
            <span class="session-meta">{{ s.state === 'active' ? '进行中' : '已归档' }}</span>
          </button>
          <p
            v-if="!sessions.length"
            class="muted"
          >暂无会话</p>
        </div>
      </aside>

      <section class="composer2-card">
        <div class="composer2-toolbar">
          <div class="composer2-modes">
            <button
              type="button"
              class="mode-chip"
              :class="{ active: mode === 'image' }"
              @click="mode = 'image'; clearReference()"
            >
              图片
            </button>
            <button
              type="button"
              class="mode-chip"
              :class="{ active: mode === 'video' }"
              @click="mode = 'video'"
            >
              视频
            </button>
          </div>
          <div class="composer2-actions">
            <button
              type="button"
              class="composer2-btn-sm"
              @click="toggleSessionPanel"
            >会话</button>
            <span class="composer2-charge">{{ charge }} 积分</span>
          </div>
        </div>

        <label class="composer2-field">
          <div class="composer2-label-row">
            <span class="composer2-label">描述你想画的内容</span>
            <button
              type="button"
              class="composer2-link"
              @click="openSnippet"
            >快捷词</button>
          </div>
          <textarea
            v-model="positive"
            rows="4"
            class="composer2-input"
            placeholder="例如：雨夜的落地窗前，妲己缓缓回眸，三条白色狐尾随风舒展，镜头从侧后方轻轻靠近。输入 @ 可唤起快捷词。"
            @input="onPromptInput"
          />
        </label>

        <!-- 快捷词选择器 -->
        <div
          v-if="snippetOpen"
          class="snippet-popover"
        >
          <div class="snippet-head">
            <div class="snippet-cats">
              <button
                v-for="c in snippetCats"
                :key="c.key"
                type="button"
                class="snippet-cat"
                :class="{ active: snippetActiveCat === c.key }"
                @click="snippetActiveCat = c.key; fetchSnippets()"
              >{{ c.labels.chinese }}</button>
            </div>
            <input
              v-model="snippetQuery"
              type="text"
              class="composer2-num snippet-search"
              placeholder="搜索…"
              @input="(e: Event) => { snippetQuery = (e.target as HTMLInputElement).value; fetchSnippets() }"
            >
            <button
              type="button"
              class="composer2-btn-sm"
              @click="closeSnippet"
            >×</button>
          </div>
          <div class="snippet-list">
            <button
              v-for="it in snippetItems"
              :key="it.id"
              type="button"
              class="snippet-item"
              @click="pickSnippet(it)"
            >
              <span class="snippet-name">{{ it.labels.chinese }}</span>
              <span class="snippet-en">{{ it.labels.english }}</span>
            </button>
            <p
              v-if="!snippetItems.length"
              class="muted"
            >无匹配快捷词</p>
          </div>
        </div>

        <button
          type="button"
          class="composer2-link"
          @click="showNegative = !showNegative"
        >
          {{ showNegative ? '收起负面提示词' : '编辑负面提示词' }}{{ negative ? '（已填写）' : '' }}
        </button>
        <label
          v-if="showNegative"
          class="composer2-field"
        >
          <textarea
            v-model="negative"
            rows="2"
            class="composer2-input"
            placeholder="不希望出现的内容：模糊、畸形手指、文字水印……"
          />
        </label>

        <div class="composer2-section">
          <div class="composer2-section-title">
            底模
          </div>
          <select
            v-model="modelId"
            class="composer2-select"
          >
            <option
              v-for="m in catalog?.models || []"
              :key="m.id"
              :value="m.id"
              :disabled="!m.selectable"
            >
              {{ m.name }}{{ !m.selectable ? '（不可用）' : '' }}
            </option>
          </select>
          <template v-if="(catalog?.loras || []).length">
            <span class="composer2-section-title">效果包（LoRA）</span>
            <div class="composer2-lora-list">
              <div
                v-for="l in catalog?.loras || []"
                :key="l.id"
                class="composer2-lora"
                :class="{ active: selectedLoraIds.includes(l.id) }"
              >
                <button
                  type="button"
                  class="composer2-lora-toggle"
                  @click="toggleLora(l.id)"
                >
                  {{ l.name }}{{ selectedLoraIds.includes(l.id) ? ' ✓' : '' }}
                </button>
                <input
                  v-if="selectedLoraIds.includes(l.id) && l.weight"
                  type="range"
                  :min="l.weight.min"
                  :max="l.weight.max"
                  :step="0.05"
                  :value="currentLoraWeight(l.fileName || l.id)"
                  @input="onLoraWeight(l.id, $event)"
                >
              </div>
            </div>
          </template>
        </div>

        <div class="composer2-section">
          <button
            type="button"
            class="composer2-section-toggle"
            @click="parametersOpen = !parametersOpen"
          >
            <span class="composer2-section-title">生成参数</span><span>{{ parametersOpen ? '收起' : '展开' }}</span>
          </button>
          <div
            v-if="parametersOpen"
            class="composer2-params"
          >
            <div class="param-row">
              <span class="param-label">画幅</span>
              <div class="composer2-ratios">
                <button
                  v-for="r in ratioPresets"
                  :key="r.ratio"
                  type="button"
                  class="ratio-chip"
                  :class="{ active: ratio === r.ratio }"
                  @click="selectRatio(r)"
                >
                  {{ r.label }}
                </button>
              </div>
            </div>
            <div class="param-row">
              <span class="param-label">尺寸</span>
              <div class="param-inline">
                <input
                  v-model.number="customWidth"
                  type="number"
                  min="512"
                  max="1536"
                  placeholder="宽"
                  class="composer2-num"
                >
                <span>×</span>
                <input
                  v-model.number="customHeight"
                  type="number"
                  min="512"
                  max="1536"
                  placeholder="高"
                  class="composer2-num"
                >
              </div>
            </div>
            <div class="param-row">
              <span class="param-label">数量</span><input
                v-model.number="count"
                type="number"
                min="1"
                max="4"
                class="composer2-num"
              >
            </div>
            <div class="param-row">
              <span class="param-label">种子</span><input
                v-model.number="seed"
                type="number"
                placeholder="随机"
                class="composer2-num"
              >
            </div>
            <div class="param-row">
              <span class="param-label">步数</span><input
                v-model.number="steps"
                type="number"
                :min="catalog?.sampling.stepsMin || 4"
                :max="catalog?.sampling.stepsMax || 50"
                class="composer2-num"
              >
            </div>
            <div class="param-row">
              <span class="param-label">采样器</span>
              <select
                v-model="sampler"
                class="composer2-select"
              >
                <option
                  v-for="s in catalog?.sampling.samplers || []"
                  :key="s"
                  :value="s"
                >
                  {{ s }}
                </option>
              </select>
            </div>
            <div class="param-row">
              <span class="param-label">调度器</span>
              <select
                v-model="scheduler"
                class="composer2-select"
              >
                <option
                  v-for="s in catalog?.sampling.schedulers || []"
                  :key="s"
                  :value="s"
                >
                  {{ s }}
                </option>
              </select>
            </div>
            <div class="param-row">
              <span class="param-label">CFG</span><input
                v-model.number="cfg"
                type="number"
                step="0.5"
                :min="catalog?.sampling.cfgMin || 0"
                :max="catalog?.sampling.cfgMax || 10"
                class="composer2-num"
              >
            </div>
          </div>
        </div>

        <div class="composer2-section">
          <span class="composer2-section-title">参考图（视频首帧 / 参考素材）</span>
          <input
            id="ref-input"
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            class="sr-only"
            @change="handleUpload"
          >
          <label
            for="ref-input"
            class="composer2-upload"
          >上传图片</label>
          <button
            type="button"
            class="composer2-btn-sm"
            @click="openAssetPicker"
          >从素材库选择</button>
          <div
            v-if="assetOpen"
            class="asset-popover"
          >
            <div class="asset-head">
              <span class="composer2-section-title">素材库</span>
              <button
                type="button"
                class="composer2-btn-sm"
                @click="closeAssetPicker"
              >×</button>
            </div>
            <div
              v-if="assetBusy"
              class="muted"
            >加载中…</div>
            <div class="asset-grid">
              <button
                v-for="a in assetItems"
                :key="a.id"
                type="button"
                class="asset-thumb"
                @click="pickAsset(a)"
              >
                <img
                  :src="a.url"
                  :alt="a.id"
                >
              </button>
            </div>
            <p
              v-if="!assetItems.length && !assetBusy"
              class="muted"
            >暂无素材</p>
          </div>
          <div
            v-if="referencePreview"
            class="composer2-ref"
          >
            <img
              :src="referencePreview"
              :alt="referenceName"
              class="composer2-ref-img"
            >
            <button
              type="button"
              @click="clearReference"
            >
              移除
            </button>
          </div>
        </div>

        <p
          v-if="notice"
          class="composer2-notice"
        >
          {{ notice }}
        </p>
      </section>

      <section class="composer2-result">
        <div
          v-if="resultStatus === 'idle'"
          class="composer2-empty"
        >
          <p>生成结果将在这里显示</p>
          <p class="muted">
            左侧填好提示词与参数，点击「开始创作」。
          </p>
        </div>
        <div
          v-else-if="resultStatus === 'working'"
          class="composer2-empty"
        >
          <p class="spin">
            正在生成… {{ resultProgress }}%
          </p>
        </div>
        <div
          v-else-if="resultStatus === 'done' && resultUrl"
          class="composer2-done"
        >
          <img
            :src="resultUrl"
            alt="生成结果"
            class="composer2-result-img"
          >
          <p class="muted">
            已生成，消耗 {{ resultCredits }} 积分，作品已入库。
          </p>
        </div>
        <div
          v-else-if="resultStatus === 'done'"
          class="composer2-empty"
        >
          <p>生成完成，但未取到产物封面。</p>
        </div>
        <div
          v-else
          class="composer2-empty"
        >
          <p class="error-text">
            {{ genError }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.composer2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 420px); gap: 1.25rem; align-items: start; }
.composer2:has(.composer2-sessions) { grid-template-columns: minmax(180px, 220px) minmax(0, 1fr) minmax(280px, 420px); }
@media (max-width: 900px) { .composer2, .composer2:has(.composer2-sessions) { grid-template-columns: 1fr; } }
.composer2-card { border: 1px solid var(--hg-line, #e2e4ea); border-radius: 1.25rem; background: #fff; padding: 1.25rem; display: grid; gap: 0.85rem; }
.composer2-toolbar { display: flex; align-items: center; justify-content: space-between; }
.composer2-modes { display: flex; gap: 0.4rem; }
.mode-chip { padding: 0.4rem 0.9rem; border-radius: 999px; font-size: 0.82rem; font-weight: 700; border: 1px solid var(--hg-line, #e2e4ea); background: transparent; cursor: pointer; color: var(--hg-muted, #777); }
.mode-chip.active { background: var(--hg-ink, #1a1a1a); color: #fff; border-color: var(--hg-ink, #1a1a1a); }
.composer2-charge { font-size: 0.82rem; font-weight: 700; color: var(--hg-accent, #b08a4f); }
.composer2-field { display: grid; gap: 0.4rem; }
.composer2-label { font-size: 0.82rem; font-weight: 700; color: var(--hg-muted, #666); }
.composer2-input { width: 100%; padding: 0.75rem 0.9rem; border-radius: 0.7rem; border: 1px solid var(--hg-line, #e2e4ea); font-size: 0.9rem; line-height: 1.6; resize: vertical; outline: none; background: #faf9f7; }
.composer2-input:focus { border-color: var(--hg-accent, #b08a4f); }
.composer2-link { font-size: 0.78rem; color: var(--hg-accent, #b08a4f); font-weight: 700; text-align: left; cursor: pointer; background: none; border: none; }
.composer2-section { border-top: 1px solid var(--hg-line, #eee); padding-top: 0.85rem; display: grid; gap: 0.6rem; }
.composer2-section-title { font-size: 0.8rem; font-weight: 800; color: #333; }
.composer2-section-toggle { display: flex; justify-content: space-between; align-items: center; cursor: pointer; background: none; border: none; width: 100%; font-size: 0.8rem; color: var(--hg-muted, #777); }
.composer2-select, .composer2-num { padding: 0.45rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--hg-line, #e2e4ea); background: #faf9f7; outline: none; font-size: 0.85rem; }
.composer2-lora-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.composer2-lora { display: grid; gap: 0.3rem; }
.composer2-lora-toggle { padding: 0.35rem 0.7rem; border-radius: 999px; border: 1px solid var(--hg-line, #e2e4ea); background: transparent; font-size: 0.78rem; font-weight: 700; cursor: pointer; }
.composer2-lora.active .composer2-lora-toggle { border-color: var(--hg-accent, #b08a4f); color: var(--hg-accent, #b08a4f); }
.composer2-params { display: grid; gap: 0.7rem; }
.param-row { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; }
.param-label { font-size: 0.8rem; color: var(--hg-muted, #666); font-weight: 600; flex-shrink: 0; }
.composer2-ratios { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.ratio-chip { padding: 0.3rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--hg-line, #e2e4ea); background: transparent; font-size: 0.75rem; cursor: pointer; }
.ratio-chip.active { background: var(--hg-amber, #f3e3c0); border-color: var(--hg-accent, #b08a4f); color: #333; font-weight: 700; }
.param-inline { display: flex; align-items: center; gap: 0.4rem; }
.composer2-num { width: 88px; }
.composer2-upload { display: inline-grid; place-items: center; padding: 0.6rem 1rem; border: 1px dashed var(--hg-line, #ccc); border-radius: 0.7rem; cursor: pointer; font-size: 0.82rem; font-weight: 700; color: var(--hg-muted, #666); }
.composer2-ref { display: flex; align-items: center; gap: 0.6rem; }
.composer2-ref-img { max-height: 72px; border-radius: 0.5rem; border: 1px solid var(--hg-line, #e2e4ea); }
.composer2-notice { font-size: 0.8rem; color: var(--hg-accent, #b08a4f); font-weight: 700; }
.composer2-result { border: 1px solid var(--hg-line, #e2e4ea); border-radius: 1.25rem; background: #fff; min-height: 320px; padding: 1rem; position: sticky; top: 1rem; }
.composer2-empty { min-height: 280px; display: grid; place-items: center; text-align: center; color: var(--hg-muted, #777); font-size: 0.88rem; gap: 0.3rem; }
.composer2-done { display: grid; gap: 0.6rem; text-align: center; }
.composer2-result-img { width: 100%; border-radius: 0.8rem; border: 1px solid var(--hg-line, #e2e4ea); }
.muted { color: var(--hg-muted, #999); }
.error-text { color: #dc2626; font-weight: 700; }
.spin { display: flex; align-items: center; gap: 0.4rem; }
.composer2-actions { display: flex; align-items: center; gap: 0.5rem; }
.composer2-label-row { display: flex; align-items: center; justify-content: space-between; }
.composer2-sessions { border: 1px solid var(--hg-line, #e2e4ea); border-radius: 1.25rem; background: #fff; padding: 1rem; min-width: 200px; display: grid; gap: 0.6rem; align-content: start; }
.session-head { display: flex; align-items: center; justify-content: space-between; }
.session-list { display: grid; gap: 0.4rem; max-height: 60vh; overflow: auto; }
.session-item { text-align: left; padding: 0.55rem 0.7rem; border-radius: 0.6rem; border: 1px solid var(--hg-line, #eee); background: transparent; cursor: pointer; display: grid; gap: 0.15rem; }
.session-item.active { border-color: var(--hg-accent, #b08a4f); background: var(--hg-amber, #f3e3c0); }
.session-title { font-size: 0.82rem; font-weight: 700; color: #333; }
.session-meta { font-size: 0.72rem; color: var(--hg-muted, #999); }
.snippet-popover { position: relative; z-index: 10; border: 1px solid var(--hg-line, #e2e4ea); border-radius: 0.8rem; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.1); display: grid; gap: 0.5rem; padding: 0.7rem; }
.snippet-head { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.snippet-cats { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.snippet-cat { padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid var(--hg-line, #e2e4ea); background: transparent; font-size: 0.74rem; font-weight: 700; cursor: pointer; color: var(--hg-muted, #666); }
.snippet-cat.active { background: var(--hg-ink, #1a1a1a); color: #fff; border-color: var(--hg-ink, #1a1a1a); }
.snippet-search { flex: 1; min-width: 100px; }
.snippet-list { display: grid; gap: 0.3rem; max-height: 260px; overflow: auto; }
.snippet-item { text-align: left; padding: 0.45rem 0.6rem; border-radius: 0.5rem; border: 1px solid transparent; background: transparent; cursor: pointer; display: grid; gap: 0.1rem; }
.snippet-item:hover { background: #faf9f7; border-color: var(--hg-line, #eee); }
.snippet-name { font-size: 0.82rem; font-weight: 700; color: #333; }
.snippet-en { font-size: 0.72rem; color: var(--hg-muted, #999); }
.asset-popover { border: 1px solid var(--hg-line, #e2e4ea); border-radius: 0.8rem; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.1); padding: 0.7rem; display: grid; gap: 0.5rem; }
.asset-head { display: flex; align-items: center; justify-content: space-between; }
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 0.4rem; max-height: 220px; overflow: auto; }
.asset-thumb { padding: 0; border: 1px solid var(--hg-line, #eee); border-radius: 0.4rem; overflow: hidden; cursor: pointer; background: none; }
.asset-thumb img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.composer2-spacer { flex: 1; }
.composer2-btn-sm { padding: 0.3rem 0.7rem; border-radius: 999px; border: 1px solid var(--hg-line, #e2e4ea); background: transparent; font-size: 0.75rem; font-weight: 700; cursor: pointer; color: var(--hg-muted, #666); }
.composer2-btn-sm:disabled { opacity: 0.5; cursor: default; }
.composer2-btn-sm:not(:disabled):hover { border-color: var(--hg-accent, #b08a4f); color: var(--hg-accent, #b08a4f); }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
