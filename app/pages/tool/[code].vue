<script setup lang="ts">
// 单个创作工具页（/tool/:code）。
//
// 布局对齐参考产品（undress.xxx 的 effect 页）：**左侧表单 / 右侧结果**。
// 工具是有明确输入输出的动作（放大、脱衣、换脸…），不是聊天 —— 塞进对话页会让
// "我传了图、点了生成、结果在哪"变成一段需要读的流水账。自由对话创作仍在 /create。
//
// 前端只认工具 code：预置提示词、LoRA、工作流都由后端拼并在建任务时冻结。
useSeoMeta({ title: '创作工具 · 后宫' })

const route = useRoute()
const api = useHougongApi()
const session = useAuthSession()
const catalog = useToolCatalog()

const code = computed(() => String(route.params.code || ''))

/* ---------------- 工具 ---------------- */
const tool = computed(() => catalog.get(code.value))
const templates = computed(() => catalog.templatesOf(code.value))
const template = ref('')
const toolMissing = computed(() => catalog.loaded.value && !tool.value)

/* ---------------- 输入 ---------------- */
const file = ref<File | null>(null)
const preview = ref('')
const assetId = ref('')
const uploading = ref(false)
const prompt = ref('')
const inputKind = computed(() => tool.value?.input || 'text')
const needsImage = computed(() => ['image', 'image_pair', 'image_mask', 'image_audio'].includes(inputKind.value))
const canSubmit = computed(() =>
  !!tool.value && !busy.value && (!needsImage.value || !!assetId.value || !!file.value))

/* ---------------- 任务与结果 ---------------- */
interface ToolRun {
  id: string
  status: string
  progress: number
  outputs: { id: string, url: string, width?: number, height?: number }[]
  error: string
}
const runs = ref<ToolRun[]>([])
const busy = ref(false)
const notice = ref('')
const sourceUrl = computed(() => preview.value)
/** 最近一次成功的产物（右侧主展示位）。 */
const latest = computed(() => runs.value.find(r => r.outputs.length))

const cost = ref(0)

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) setFile(f)
}

function setFile(f: File) {
  if (preview.value) URL.revokeObjectURL(preview.value)
  file.value = f
  assetId.value = ''
  preview.value = URL.createObjectURL(f)
}

function clearFile() {
  if (preview.value) URL.revokeObjectURL(preview.value)
  file.value = null
  preview.value = ''
  assetId.value = ''
}

async function submit() {
  if (!canSubmit.value || !tool.value) return
  busy.value = true
  notice.value = ''
  try {
    let refId = assetId.value
    if (!refId && file.value) {
      uploading.value = true
      const up = await api.uploadAsset(file.value)
      refId = up.assetId
      assetId.value = refId
      uploading.value = false
    }
    // 必须是 reactive：unshift 进 ref 数组后，若继续改这个原始对象，
    // 数据变了但视图不会更新（任务成功页面却一直显示"生成中 0%"）。
    const run = reactive<ToolRun>({ id: '', status: 'creating', progress: 0, outputs: [], error: '' })
    runs.value.unshift(run)
    const created = await api.createTask({
      clientKey: `tool-${tool.value.code}-${Date.now()}`,
      type: tool.value.category === 'video' ? 'i2v' : 't2i',
      prompt: prompt.value.trim(),
      ratio: '1:1',
      tool: tool.value.code,
      template: template.value || undefined,
      refAssetIds: refId ? [refId] : []
    })
    run.id = String(created.id)
    run.status = String(created.status || 'queued')
    await poll(run)
  } catch (e) {
    const reason = e instanceof Error ? e.message : '生成失败'
    notice.value = reason
    // 任务从未创建（余额不足 / 工具被停用 / 缺图）：不留假卡片
    const first = runs.value[0]
    if (first && !first.id) {
      runs.value.shift()
    } else if (first) {
      first.status = 'failed'
      first.error = reason
    }
  } finally {
    busy.value = false
    uploading.value = false
  }
}

/** 轮询到终态；成功后把产物 asset 解析成可展示的 URL。 */
async function poll(run: ToolRun) {
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const t = await api.getTask(run.id).catch(() => null)
    if (!t) continue
    run.status = String(t.status || run.status)
    run.progress = t.progress || run.progress
    if (['succeeded', 'failed', 'cancelled'].includes(run.status)) break
  }
  if (run.status === 'succeeded') {
    const detail = await api.getTask(run.id).catch(() => null)
    const outIds = (detail?.outputAssets || []).map(String)
    run.outputs = await resolveOutputs(outIds)
    if (!run.outputs.length) {
      // 任务成功但产物读不出来：必须明说。停在"生成中"会让用户以为还在跑，
      // 然后重复提交、重复计费。
      run.error = '生成已完成，但产物读取失败，请到作品库查看'
    }
  } else if (run.status === 'failed') {
    run.error = '生成失败，积分已退回'
  }
}

async function resolveOutputs(ids: string[]) {
  if (!ids.length) return []
  try {
    const choices = await api.assetSelectByIds(ids)
    return choices
      .map(({ asset }) => ({ id: asset.id, url: asset.url, width: asset.width, height: asset.height }))
      .filter(a => !!a.url)
  } catch {
    return []
  }
}

function download(url: string) {
  window.open(url, '_blank', 'noopener')
}

onMounted(async () => {
  session.load()
  await catalog.ensure()
  // 模板默认取第一个：参考产品的模板是"选一个即可"，默认空着会让人以为必须先点
  const first = templates.value[0]
  if (first && !template.value) template.value = first.code
})

// 目录后到（首次进入直接深链）时补一次默认模板
watch(templates, (list) => {
  if (!template.value && list.length) template.value = list[0]!.code
})
</script>

<template>
  <div class="page-body tool-page">
    <!-- 工具被停用/删除：明确说明，不静默回落成普通创作 -->
    <div
      v-if="toolMissing"
      class="tool-missing"
    >
      <h1>该工具已下线</h1>
      <p>运营在后台停用了这个工具。你可以在「全部工具」里看看还有哪些可用。</p>
      <NuxtLink
        to="/effects"
        class="btn-primary"
      >
        返回全部工具
      </NuxtLink>
    </div>

    <div
      v-else
      class="tool-split"
    >
      <!-- 左：输入 -->
      <section class="tool-form">
        <header class="form-head">
          <NuxtLink
            to="/effects"
            class="back-link"
          >
            <UIcon name="i-lucide-arrow-left" />返回效果
          </NuxtLink>
          <h1>{{ tool?.name || '创作工具' }}</h1>
          <p
            v-if="tool?.summary"
            class="form-sub"
          >
            {{ tool.summary }}
          </p>
        </header>

        <template v-if="needsImage">
          <div class="field-label">
            上传包含人物的图片
          </div>
          <label
            class="drop"
            :class="{ filled: !!preview }"
          >
            <input
              type="file"
              accept="image/*"
              @change="onPick"
            >
            <img
              v-if="preview"
              :src="preview"
              alt="已选图片"
            >
            <template v-else>
              <UIcon name="i-lucide-image-plus" />
              <strong>点击或拖拽图片到此处</strong>
              <small>支持 PNG / JPG / WebP</small>
            </template>
          </label>
          <button
            v-if="preview"
            type="button"
            class="link-btn"
            @click="clearFile"
          >
            换一张
          </button>
        </template>

        <template v-else>
          <div class="field-label">
            描述
          </div>
          <textarea
            v-model="prompt"
            class="text-input"
            rows="3"
            placeholder="描述你想要的画面"
          />
        </template>

        <div
          v-if="templates.length"
          class="field-block"
        >
          <div class="field-label">
            {{ tool?.name }}方式
          </div>
          <div class="tpl-row">
            <button
              v-for="tpl in templates"
              :key="tpl.code"
              type="button"
              class="tpl-pill"
              :class="{ active: template === tpl.code }"
              @click="template = tpl.code"
            >
              {{ tpl.name }}
            </button>
          </div>
        </div>

        <div class="cost-row">
          <span>所需积分</span>
          <strong>{{ cost || 8 }}</strong>
        </div>

        <p
          v-if="notice"
          class="form-error"
          role="alert"
        >
          {{ notice }}
        </p>

        <button
          type="button"
          class="btn-primary submit"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{ busy ? (uploading ? '上传中…' : '生成中…') : (session.token.value ? '开始生成' : '登录后创建') }}
        </button>
      </section>

      <!-- 右：结果 -->
      <section class="tool-result">
        <div
          v-if="latest"
          class="result-live"
        >
          <div class="result-media">
            <img
              :src="latest.outputs[0]!.url"
              :alt="tool?.name"
            >
          </div>
          <div class="result-actions">
            <span class="result-meta">
              {{ latest.outputs[0]!.width }}×{{ latest.outputs[0]!.height }}
            </span>
            <button
              type="button"
              class="link-btn"
              @click="download(latest.outputs[0]!.url)"
            >
              打开原图
            </button>
            <NuxtLink
              to="/works"
              class="link-btn"
            >
              去作品库
            </NuxtLink>
          </div>
          <div
            v-if="sourceUrl"
            class="compare"
          >
            <div>
              <small>原图</small>
              <img
                :src="sourceUrl"
                alt="原图"
              >
            </div>
            <div>
              <small>结果</small>
              <img
                :src="latest.outputs[0]!.url"
                alt="结果"
              >
            </div>
          </div>
        </div>

        <div
          v-else-if="runs.length && runs[0]!.error"
          class="result-empty"
        >
          <UIcon name="i-lucide-circle-alert" />
          <strong>{{ runs[0]!.error }}</strong>
          <small>任务 ID：{{ runs[0]!.id }}</small>
        </div>

        <div
          v-else-if="runs.length"
          class="result-pending"
        >
          <UIcon name="i-lucide-loader-circle" />
          <strong>正在生成…</strong>
          <small>{{ runs[0]!.status }} · {{ runs[0]!.progress }}%</small>
          <p>放大与精修通常需要 30–90 秒，可以先去做别的。</p>
        </div>

        <div
          v-else
          class="result-empty"
        >
          <UIcon name="i-lucide-image" />
          <strong>还没有{{ tool?.name }}结果</strong>
          <small>上传图片开始创建{{ tool?.name }}效果</small>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tool-page { max-width: 1280px; }
.tool-split { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 28px; align-items: start; }
.tool-form { padding: 20px; border: 1px solid var(--hg-line); border-radius: 12px; background: var(--hg-card); }
.form-head { margin-bottom: 18px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 10px; color: var(--hg-muted); font-size: 13px; text-decoration: none; }
.form-head h1 { margin: 0; font-size: 22px; }
.form-sub { margin: 6px 0 0; color: var(--hg-muted); font-size: 13px; line-height: 1.6; }
.field-label { margin-bottom: 8px; font-size: 13px; color: var(--hg-muted); }
.field-block { margin-top: 18px; }
.drop { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 180px; padding: 16px; border: 1px dashed var(--hg-line); border-radius: 10px; background: #141416; color: var(--hg-muted); cursor: pointer; text-align: center; }
.drop.filled { border-style: solid; padding: 0; overflow: hidden; }
.drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.drop img { display: block; width: 100%; max-height: 320px; object-fit: contain; }
.drop strong { color: var(--ink); font-size: 14px; }
.drop small { font-size: 12px; }
.text-input { width: 100%; padding: 10px 12px; border: 1px solid var(--hg-line); border-radius: 8px; background: #141416; color: var(--ink); font: inherit; resize: vertical; }
.tpl-row { display: flex; flex-wrap: wrap; gap: 8px; }
.tpl-pill { padding: 7px 12px; border: 1px solid var(--hg-line); border-radius: 999px; background: transparent; color: var(--hg-muted); font-size: 13px; cursor: pointer; }
.tpl-pill.active { border-color: var(--hg-accent); color: var(--ink); }
.cost-row { display: flex; align-items: baseline; justify-content: space-between; margin: 18px 0 10px; font-size: 14px; color: var(--hg-muted); }
.cost-row strong { font-size: 20px; color: var(--ink); }
.form-error { margin: 0 0 10px; font-size: 13px; color: #f87171; }
.submit { width: 100%; }
.link-btn { padding: 0; border: 0; background: transparent; color: var(--hg-muted); font-size: 13px; text-decoration: underline; cursor: pointer; }
.tool-result { min-height: 420px; padding: 20px; border: 1px solid var(--hg-line); border-radius: 12px; background: var(--hg-card); display: flex; flex-direction: column; }
.result-empty, .result-pending { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--hg-muted); text-align: center; }
.result-empty strong, .result-pending strong { color: var(--ink); font-size: 15px; }
.result-empty p, .result-pending p { max-width: 320px; font-size: 12px; }
.result-live { display: flex; flex-direction: column; gap: 14px; }
.result-media { display: grid; place-items: center; background: #141416; border-radius: 10px; overflow: hidden; }
.result-media img { display: block; max-width: 100%; max-height: 520px; object-fit: contain; }
.result-actions { display: flex; align-items: center; gap: 14px; }
.result-meta { font-size: 13px; color: var(--hg-muted); }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.compare > div { display: flex; flex-direction: column; gap: 6px; }
.compare small { color: var(--hg-muted); font-size: 12px; }
.compare img { width: 100%; border-radius: 8px; background: #141416; }
.tool-missing { max-width: 520px; margin: 60px auto; padding: 28px; border: 1px solid var(--hg-line); border-radius: 12px; background: var(--hg-card); text-align: center; }
.tool-missing h1 { margin: 0 0 10px; font-size: 20px; }
.tool-missing p { margin: 0 0 18px; color: var(--hg-muted); }
@media (max-width: 900px) {
  .tool-split { grid-template-columns: 1fr; }
}
</style>
