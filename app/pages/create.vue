<script setup lang="ts">
const hgApi = useHougongApi()
const session = useAuthSession()
const localePath = useLocalePath()
const appStore = useAppStore()

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
    await navigateTo(localePath('/auth/login'))
    return
  }
  try {
    const [cat, wallet] = await Promise.all([
      hgApi.getCatalog(),
      hgApi.wallet().catch(() => ({ balance: 0, holds: 0 }))
    ])
    catalog.value = cat
    balance.value = wallet.balance
    appStore.credits = wallet.balance
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
      if (!rawFile.value) throw new Error('请先上传首帧参考图')
      const up = await hgApi.uploadMedia(rawFile.value)
      firstFrameId = up.mediaAssetId
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
        appStore.credits = w.balance
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
          <span class="composer2-charge">{{ charge }} 积分</span>
        </div>

        <label class="composer2-field">
          <span class="composer2-label">描述你想画的内容</span>
          <textarea
            v-model="positive"
            rows="4"
            class="composer2-input"
            placeholder="例如：雨夜的落地窗前，妲己缓缓回眸，三条白色狐尾随风舒展，镜头从侧后方轻轻靠近。"
          />
        </label>

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
@media (max-width: 900px) { .composer2 { grid-template-columns: 1fr; } }
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
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
