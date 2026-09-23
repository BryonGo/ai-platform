<script setup lang="ts">
// 单个创作工具页（/tool/:code）。
//
// 布局对齐参考产品（undress.xxx 的 effect 页）：**左侧表单 / 右侧结果**。
// 工具是有明确输入输出的动作（放大、脱衣、换脸…），不是聊天 —— 塞进对话页会让
// "我传了图、点了生成、结果在哪"变成一段需要读的流水账。自由对话创作仍在 /create。
//
// 前端只认工具 code：预置提示词、LoRA、工作流都由后端拼并在建任务时冻结。
import { FEATURES } from '~/config/features'
import { toolNotice } from '~/data/tool-notice'
import { safeHref } from '~/composables/useSafeUrl'
import { vAutoPlayVideo } from '~/composables/useAutoPlayVideo'

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
// 输入槽位：单图工具只用 slots[0]，双图工具（image_pair）用两个。
//
// 顺序即语义，不能反：后端约定 refAssetIds[0] 是**目标图**（保留画面），
// refAssetIds[1] 是**人脸图**（提供身份）。换脸类工具把两张图接反了，
// 出来的是"把目标图的脸换到人脸图的身上"，用户会以为功能坏了。
interface InputSlot { file: File | null, preview: string, assetId: string }
function emptySlot(): InputSlot {
  return { file: null, preview: '', assetId: '' }
}
const slots = reactive<InputSlot[]>([emptySlot(), emptySlot()])
const uploading = ref(false)
const prompt = ref('')
const inputKind = computed(() => tool.value?.input || 'text')
const needsImage = computed(() => ['image', 'image_pair', 'image_mask', 'image_audio', 'video_pair'].includes(inputKind.value))
const isPair = computed(() => inputKind.value === 'image_pair')
/** 视频换脸：第一个槽位是**视频**，第二个是人脸图（accept 与预览都不同）。 */
const isVideoPair = computed(() => inputKind.value === 'video_pair')
/** 局部重绘：用户涂抹出要改的区域（image_mask 输入形态）。 */
const isMask = computed(() => inputKind.value === 'image_mask')
/** 角色延展：文字 + 必须选一个角色（character 输入形态）。 */
const isCharacter = computed(() => inputKind.value === 'character')
const characters = ref<{ id: number, name: string, alias?: string }[]>([])
const characterId = ref('')
/** 参与提交的槽位数：双图工具要求两张都齐。 */
const slotCount = computed(() => (isPair.value || isVideoPair.value ? 2 : 1))
const filledSlots = computed(() => slots.slice(0, slotCount.value))

/* ---------------- 涂抹画布 ---------------- */
// 蒙版是一张与源图同尺寸的黑白图（白 = 要重绘的区域），提交时作为第二个资产上传。
// 为什么在前端画：后端没有可用的分割权重（见 workflow/undress.go 的说明），
// 与其猜"哪里是衣服"，不如让用户直接刷 —— 刷出来的范围一定是对的。
// 注意：画布在 v-for 里，`ref="maskCanvas"` 会收集成**数组**，
// 那时 canvas.value 是数组，getContext 是 undefined —— 表现为"按钮亮了但一笔没画上"，
// 最后提交时报"请先涂抹"。所以用函数式 ref 显式取单个元素。
const maskCanvas = ref<HTMLCanvasElement | null>(null)

function setMaskCanvas(el: Element | { $el?: Element } | null) {
  const node = el && '$el' in el ? el.$el : el
  maskCanvas.value = (node as HTMLCanvasElement | null) ?? null
  if (maskCanvas.value) nextTick(syncMaskCanvas)
}
const brushSize = ref(40)
const hasStroke = ref(false)
let painting = false
let lastPoint: { x: number, y: number } | null = null

const canSubmit = computed(() =>
  !!tool.value && !busy.value
  && (!needsImage.value || filledSlots.value.every(s => !!s.assetId || !!s.file))
  && (!isMask.value || hasStroke.value)
  // 角色必填：后端也会拒，但在这里挡住能让用户当场知道少选了什么
  && (!isCharacter.value || !!characterId.value))

/* ---------------- 任务与结果 ---------------- */
interface ToolOutput {
  id: string
  url: string
  width?: number
  height?: number
  /** MIME：**视频工具必须靠它决定用 <video> 还是 <img> 渲染**。
   *  视频资产的 width/height 是 0，只判尺寸会把视频当成 0×0 的图片，
   *  结果区一片空白（实测：文字转视频出片了，前台却看不到）。 */
  mime: string
  /** 作用域：temp=临时生成产物（默认）/ permanent=已保存到我的资产。 */
  scope?: 'temp' | 'permanent'
}
interface ToolRun {
  id: string
  status: string
  progress: number
  outputs: ToolOutput[]
  error: string
}
const runs = ref<ToolRun[]>([])
const busy = ref(false)
const notice = ref('')
/** 对比用的"原图"：双图工具看目标图，单图工具看唯一那张。 */
const sourceUrl = computed(() => slots[0]!.preview)
/** 最近一次成功的产物（右侧主展示位）。 */
const latest = computed(() => runs.value.find(r => r.outputs.length))

/**
 * 「保存到我的资产」的状态。
 *
 * 生成产物默认是临时的（scope=temp）；这里按产物 id 记录保存态：
 *   · savedIds  —— 已永久（后端返回 permanent，或本次保存成功）；
 *   · savingIds —— 正在保存（按钮显示"保存中…"）。
 * 刷新页面后由 resolveOutputs 从 assetSelectByIds 返回的 scope 重建 savedIds，
 * 所以「已保存」态不会因为刷新而丢。
 */
const savedIds = ref<Record<string, boolean>>({})
const savingIds = ref<Record<string, boolean>>({})

/** latest 的产物是否全部已保存（全部已保存则按钮置灰）。 */
const allOutputsSaved = computed(() =>
  !!latest.value && latest.value.outputs.length > 0 && latest.value.outputs.every(o => savedIds.value[o.id])
)
/** latest 是否有产物正在保存。 */
const anyOutputSaving = computed(() =>
  !!latest.value && latest.value.outputs.some(o => savingIds.value[o.id])
)

/**
 * 把结果区当前产物**全部**保存到「我的资产」：一次一个接口、逐个显示保存中。
 *
 * 只改服务端 scope（幂等），不重新上传、不重新生成；失败的产物保留临时态并提示，
 * 成功的即时置为已保存，用户可单独重试失败的（再点一次只会处理未保存的）。
 */
async function saveOutputs() {
  const outs = latest.value?.outputs || []
  const todo = outs.filter(o => !savedIds.value[o.id] && !savingIds.value[o.id])
  if (!todo.length) return
  notice.value = ''
  let failed = 0
  for (const out of todo) {
    savingIds.value = { ...savingIds.value, [out.id]: true }
    try {
      const asset = await api.saveAsset(out.id)
      const scope = asset?.scope || 'permanent'
      savedIds.value = { ...savedIds.value, [out.id]: scope !== 'temp' }
      out.scope = scope
    } catch {
      failed++
    } finally {
      const next = { ...savingIds.value }
      delete next[out.id]
      savingIds.value = next
    }
  }
  notice.value = failed ? `有 ${failed} 个产物保存失败，可再点一次重试` : '已保存到我的资产'
}

/** 当前玩法自己的封面（后台在模板上填了才有）。 */
const templateCover = computed(() => templates.value.find(t => t.code === template.value)?.cover || '')
/** 当前玩法自己的对比原图。 */
const templateCoverBefore = computed(() => templates.value.find(t => t.code === template.value)?.coverBefore || '')

/**
 * 效果示例的**预览视频**（后台 hougong_tool.cover_video）。
 *
 * 有视频时它优先于对比滑块：对比是"同一画面的前后两帧"，而视频给不出同坐标的第二帧，
 * 硬凑一个滑块只会让人以为能拖。视频工具的交互就是直接播（进视口静音循环），
 * 下面 `demo` 里的 cover 在这里退化为它的封面帧。
 *
 * 只有工具级有这个字段（后端 hougong_tool.cover_video），玩法没有，所以不按玩法回落。
 */
const demoVideo = computed(() => tool.value?.coverVideo || '')

/**
 * 生成前右半边展示的「效果示例」。
 *
 * 由**后台**配置驱动（hougong_tool.cover 效果图 / cover_before 原图）——
 * 换素材是运营的活儿，不该等一次前端发版。玩法级优先，回落工具级。
 *
 *   demoVideo 有值        → 直接播循环预览（视频工具，不出对比）
 *   cover + coverBefore 都有 → 可拖动的对比滑块
 *   只有 cover              → 单图
 *   都没有                  → null，回到原来的空态文案
 *
 * 只有 cover 时**不**硬凑对比：拿同一张当原图和效果，拖起来毫无变化，比单图更糟。
 */
const demo = computed<{ before: string, after: string } | null>(() => {
  const cover = templateCover.value || tool.value?.cover || ''
  const before = templateCoverBefore.value || tool.value?.coverBefore || ''
  if (cover && before) return { before, after: cover }
  const one = cover || before
  return one ? { before: '', after: one } : null
})

/** 示例图的 alt：目录是客户端才拉到的，SSR 时 tool 还没有 —— 别渲染出 "undefined效果"。 */
const demoAlt = computed(() => (tool.value?.name ? `${tool.value.name}效果示例` : '效果示例'))

/**
 * 这个工具的能力边界提示（目前只有脱衣：仅单人女性）。
 * 刻意叫 restriction 而不是 notice —— 下面已经有个 `notice` ref 装提交错误了。
 */
const restriction = computed(() => toolNotice(code.value))

/** 双图工具的槽位文案：目标图与参考脸各说清要传什么，避免传反。 */
const SLOT_LABELS = [
  { title: '目标图片', hint: '要保留的画面（人物 / 服装 / 场景）' },
  { title: '人脸图片', hint: '提供五官的清晰正脸照，脸越大越准' }
] as const

function slotLabel(i: number) {
  if (isVideoPair.value) {
    return i === 0
      ? { title: '上传视频', hint: '要换脸的视频，建议 10 秒内、人物清晰' }
      : { title: '人脸图片', hint: '提供五官的清晰正脸照' }
  }
  if (isPair.value) return SLOT_LABELS[i] ?? SLOT_LABELS[0]
  return { title: '上传包含人物的图片', hint: '支持 PNG / JPG / WebP' }
}

const cost = ref(0)

function onPick(e: Event, index: number) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) setFile(f, index)
  // 允许重复选同一张：清空 value，否则第二次选同名文件不触发 change
  input.value = ''
}

function setFile(f: File, index: number) {
  const slot = slots[index]
  if (!slot) return
  if (slot.preview) URL.revokeObjectURL(slot.preview)
  slot.file = f
  slot.assetId = ''
  slot.preview = URL.createObjectURL(f)
}

function clearFile(index: number) {
  const slot = slots[index]
  if (!slot) return
  if (slot.preview) URL.revokeObjectURL(slot.preview)
  slot.file = null
  slot.preview = ''
  slot.assetId = ''
  if (index === 0) resetMask()
}

/* ---------------- 涂抹画布：绘制与导出 ---------------- */

/** syncMaskCanvas 让画布尺寸与"显示中的图片"一致（保持同比例，导出时再放大到原图尺寸）。 */
function syncMaskCanvas() {
  const canvas = maskCanvas.value
  const img = canvas?.parentElement?.querySelector('img')
  if (!canvas || !img) return
  const w = img.clientWidth
  const h = img.clientHeight
  if (!w || !h) return
  if (canvas.width === w && canvas.height === h) return
  // 尺寸变了要保留已有笔迹：先拷贝再重设尺寸
  const snapshot = canvas.width && canvas.height ? canvas.toDataURL() : ''
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  if (snapshot) {
    const prev = new Image()
    prev.onload = () => ctx.drawImage(prev, 0, 0, w, h)
    prev.src = snapshot
  }
}

function resetMask() {
  const canvas = maskCanvas.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  hasStroke.value = false
}

function pointOf(e: PointerEvent) {
  const canvas = maskCanvas.value!
  const rect = canvas.getBoundingClientRect()
  // 画布 CSS 尺寸与像素尺寸可能不同（响应式），换算回像素坐标
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  }
}

function strokeTo(from: { x: number, y: number }, to: { x: number, y: number }) {
  const ctx = maskCanvas.value?.getContext('2d')
  if (!ctx) return
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // 笔刷宽度按显示尺寸给，换算到画布像素
  const scale = maskCanvas.value ? maskCanvas.value.width / maskCanvas.value.clientWidth : 1
  ctx.lineWidth = brushSize.value * scale
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(to.x, to.y, (brushSize.value * scale) / 2, 0, Math.PI * 2)
  ctx.fill()
}

function onMaskDown(e: PointerEvent) {
  if (!maskCanvas.value) return
  painting = true
  hasStroke.value = true
  const p = pointOf(e)
  lastPoint = p
  strokeTo(p, p)
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}

function onMaskMove(e: PointerEvent) {
  if (!painting || !lastPoint) return
  const p = pointOf(e)
  strokeTo(lastPoint, p)
  lastPoint = p
}

function onMaskUp() {
  painting = false
  lastPoint = null
}

/** exportMask 导出与**原图同尺寸**的黑白蒙版。 */
async function exportMask(): Promise<File | null> {
  const canvas = maskCanvas.value
  const img = canvas?.parentElement?.querySelector('img') as HTMLImageElement | null
  if (!canvas || !img || !hasStroke.value) return null
  const out = document.createElement('canvas')
  out.width = img.naturalWidth || canvas.width
  out.height = img.naturalHeight || canvas.height
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(canvas, 0, 0, out.width, out.height)
  const blob = await new Promise<Blob | null>(resolve => out.toBlob(resolve, 'image/png'))
  if (!blob) return null
  return new File([blob], 'mask.png', { type: 'image/png' })
}

/** 交换目标图与人脸图：换脸类工具最常见的误操作就是传反。 */
function swapSlots() {
  const [a, b] = [slots[0]!, slots[1]!]
  slots[0] = { ...b }
  slots[1] = { ...a }
}

async function submit() {
  if (!canSubmit.value || !tool.value) return
  busy.value = true
  notice.value = ''
  try {
    // 逐槽上传并保持顺序：后端按 refAssetIds 的下标取图。
    const refIds: string[] = []
    for (const slot of filledSlots.value) {
      let id = slot.assetId
      if (!id && slot.file) {
        uploading.value = true
        const up = await api.uploadAsset(slot.file)
        id = up.assetId
        slot.assetId = id
        uploading.value = false
      }
      if (id) refIds.push(id)
    }
    // 涂抹工具：把画布导出成蒙版并作为第二个资产上传（后端约定 [图, 蒙版]）
    if (isMask.value) {
      const maskFile = await exportMask()
      if (!maskFile) throw new Error('请先在图片上涂抹要修改的区域')
      uploading.value = true
      const up = await api.uploadAsset(maskFile)
      uploading.value = false
      refIds.push(up.assetId)
    }
    // 必须是 reactive：unshift 进 ref 数组后，若继续改这个原始对象，
    // 数据变了但视图不会更新（任务成功页面却一直显示"生成中 0%"）。
    const run = reactive<ToolRun>({ id: '', status: 'creating', progress: 0, outputs: [], error: '' })
    runs.value.unshift(run)
    const created = await api.createTask({
      clientKey: `tool-${tool.value.code}-${Date.now()}`,
      // 视频工具分两种：带图的走图生视频（i2v，首帧来自上传图），
      // 纯文字的走文生视频（t2v，云端 Seedance）。类型传错的表现是
      // "任务建了但 worker 找不到首帧直接失败"，而用户只会看到生成失败。
      type: tool.value.category === 'video' ? (needsImage.value ? 'i2v' : 't2v') : 't2i',
      prompt: prompt.value.trim(),
      ratio: '1:1',
      tool: tool.value.code,
      template: template.value || undefined,
      characterId: isCharacter.value ? characterId.value : undefined,
      refAssetIds: refIds
    })
    run.id = String(created.id)
    run.status = String(created.status || 'queued')
    await poll(run)
  } catch (e) {
    const reason = e instanceof Error ? e.message : '生成失败'
    notice.value = reason
    // 任务从未创建（金币不足 / 工具被停用 / 缺图）：不留假卡片
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
    run.error = '生成失败，费用状态确认中'
  }
}

async function resolveOutputs(ids: string[]) {
  if (!ids.length) return []
  try {
    const choices = await api.assetSelectByIds(ids)
    return choices
      .map(({ asset }) => ({
        id: asset.id, url: asset.url, mime: String(asset.mimeType || ''),
        width: asset.width, height: asset.height, scope: asset.scope
      }))
      .filter(a => !!a.url)
      .map((a) => {
        // 已是永久的产物（保存过 / 历史永久资产）：重建「已保存」态，刷新不丢。
        if (a.scope === 'permanent') savedIds.value = { ...savedIds.value, [a.id]: true }
        return a
      })
  } catch {
    return []
  }
}

/** isVideoUrl 判断产物是不是视频：优先看 MIME，兜底看扩展名。 */
function isVideoUrl(out: ToolOutput) {
  if (out.mime.startsWith('video/')) return true
  return /\.(mp4|webm|mov|mkv)(\?|$)/i.test(out.url)
}

/** outputLabel 产物信息：视频没有宽高（资产表里是 0），显示格式而不是 0×0。 */
function outputLabel(out: ToolOutput) {
  if (isVideoUrl(out)) {
    const kind = out.mime ? out.mime.replace('video/', '').toUpperCase() : '视频'
    return `${kind} 视频`
  }
  if (out.width && out.height) return `${out.width}×${out.height}`
  return '图片'
}

function download(url: string) {
  const target = safeHref(url)
  if (target) window.open(target, '_blank', 'noopener')
}

onMounted(async () => {
  await session.load()
  await catalog.ensure()
  // 从效果列表点进来时带着玩法（?template=裸体姿势 对应的 code），要预选上；
  // 否则用户点了"大字型"，进去看到的却是默认玩法。
  const wanted = String(route.query.template || '')
  if (wanted && catalog.templatesOf(code.value).some(t => t.code === wanted)) {
    template.value = wanted
  }
  // 角色延展工具需要角色清单：只在这个输入形态下拉取，避免每个工具页都请求一次
  if (isCharacter.value) {
    characters.value = await api.listCharacters().catch(() => [])
    if (characters.value.length && !characterId.value) characterId.value = String(characters.value[0]!.id)
  }
  // 模板默认取第一个：参考产品的模板是"选一个即可"，默认空着会让人以为必须先点
  const first = templates.value[0]
  if (first && !template.value) template.value = first.code
})

// 目录后到（首次进入直接深链）时补一次默认模板
watch(templates, (list) => {
  if (!template.value && list.length) template.value = list[0]!.code
})

// 图片加载/窗口尺寸变化后，涂抹画布要跟上显示尺寸（否则笔迹会错位）
watch(() => slots[0]!.preview, () => nextTick(syncMaskCanvas))
onMounted(() => window.addEventListener('resize', syncMaskCanvas))
onUnmounted(() => window.removeEventListener('resize', syncMaskCanvas))

/**
 * 结果视频/图片是限时签名地址（3600s）：挂着不动一小时后，视频续传或重新解码就是 403。
 * 收到自愈信号时**按产物 id 重新解析一次**（resolveOutputs）——
 * 不重新提交任务、不重新计费，只是换一批新签名地址。
 */
useMediaAutoRefresh(async () => {
  for (const run of runs.value) {
    if (!run.outputs.length) continue
    run.outputs = await resolveOutputs(run.outputs.map(o => o.id))
  }
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

        <template v-if="isCharacter">
          <div class="field-label">
            选择角色
          </div>
          <select
            v-if="characters.length"
            v-model="characterId"
            class="text-input"
          >
            <option
              v-for="c in characters"
              :key="c.id"
              :value="String(c.id)"
            >
              {{ c.name }}{{ c.alias ? ` · ${c.alias}` : '' }}
            </option>
          </select>
          <!-- 角色资产入口撤下期间不能让人"去角色资产创建一个"（那是个死胡同），
               按开关给一句能落地的话；功能恢复后自动变回原来的引导。 -->
          <p
            v-else
            class="mask-warn"
          >
            {{ FEATURES.characterAssets
              ? '你还没有角色，先去「角色资产」创建一个再来用这个工具。'
              : '这个工具需要角色资产；角色资产入口暂时下线，恢复后再来使用。' }}
          </p>
        </template>

        <template v-if="needsImage">
          <!-- 能力边界写在传图之前。等出图了再说"不支持男性"就晚了：
               用户已经等了一两分钟、金币也扣了，最后拿到一张废图。 -->
          <div
            v-if="restriction"
            class="limit-note"
          >
            <span class="limit-icon"><UIcon name="i-lucide-info" /></span>
            <div>
              <strong>{{ restriction.text }}</strong>
              <small v-if="restriction.detail">{{ restriction.detail }}</small>
            </div>
          </div>

          <div
            class="slot-grid"
            :class="{ pair: isPair }"
          >
            <div
              v-for="i in slotCount"
              :key="i"
              class="slot"
            >
              <div class="field-label">
                {{ slotLabel(i - 1).title }}
              </div>
              <label
                class="drop"
                :class="{ filled: !!slots[i - 1]!.preview }"
              >
                <input
                  type="file"
                  :accept="isVideoPair && i === 1 ? 'video/*' : 'image/*'"
                  @change="e => onPick(e, i - 1)"
                >
                <video
                  v-if="isVideoPair && i === 1 && slots[i - 1]!.preview"
                  :src="slots[i - 1]!.preview"
                  class="drop-video"
                  controls
                  muted
                  playsinline
                />
                <img
                  v-else-if="slots[i - 1]!.preview"
                  :src="slots[i - 1]!.preview"
                  :alt="slotLabel(i - 1).title"
                  @load="syncMaskCanvas"
                >
                <!-- 局部重绘：直接在图上涂抹要改的区域（白色笔迹 = 重绘范围） -->
                <canvas
                  v-if="isMask && slots[i - 1]!.preview"
                  :ref="setMaskCanvas"
                  class="mask-canvas"
                  @pointerdown.prevent="onMaskDown"
                  @pointermove.prevent="onMaskMove"
                  @pointerup="onMaskUp"
                  @pointercancel="onMaskUp"
                />
                <!-- 占位提示只在**没图**时出现。
                     这里原来是 <template v-else>，挂在上面的 <canvas v-if> 上 ——
                     非涂抹工具传完图，图下面还压着"点击或拖拽图片"，看起来像没传上。 -->
                <template v-if="!slots[i - 1]!.preview">
                  <UIcon name="i-lucide-image-plus" />
                  <strong>点击或拖拽图片</strong>
                  <small>{{ slotLabel(i - 1).hint }}</small>
                </template>
              </label>
              <button
                v-if="slots[i - 1]!.preview"
                type="button"
                class="link-btn"
                @click="clearFile(i - 1)"
              >
                换一张
              </button>
            </div>
          </div>
          <button
            v-if="isPair"
            type="button"
            class="link-btn swap-btn"
            @click="swapSlots"
          >
            <UIcon name="i-lucide-arrow-left-right" />交换目标图与人脸图
          </button>

          <!-- 涂抹工具：笔刷 + 清除 + 说明 -->
          <div
            v-if="isMask && slots[0]!.preview"
            class="mask-tools"
          >
            <div class="field-label">
              涂抹要修改的区域（只改涂到的地方）
            </div>
            <div class="mask-row">
              <span class="mask-hint">笔刷</span>
              <input
                v-model.number="brushSize"
                type="range"
                min="8"
                max="120"
                step="2"
              >
              <span class="mask-hint">{{ brushSize }}px</span>
              <button
                type="button"
                class="link-btn"
                @click="resetMask"
              >
                清除涂抹
              </button>
            </div>
            <p
              v-if="!hasStroke"
              class="mask-warn"
            >
              还没涂任何区域 —— 涂完才能开始生成。
            </p>
          </div>
        </template>

        <template v-if="!needsImage || isMask">
          <div
            class="field-label"
            :class="{ 'mt-block': isMask }"
          >
            {{ isMask ? '想改成什么（描述涂抹区域的内容）' : '描述' }}
          </div>
          <textarea
            v-model="prompt"
            class="text-input"
            rows="3"
            :placeholder="isMask ? '例如：换成白色毛衣 / 加一副墨镜 / 背景换成海滩' : '描述你想要的画面'"
          />
        </template>

        <div
          v-if="templates.length > 1"
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
          <span>所需金币</span>
          <strong v-if="cost > 0">{{ cost }}</strong>
          <span
            v-else
            class="cost-pending"
          >以实际结算为准</span>
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
            <!-- 结果视频进视口就静音循环播：工具页右半边是"结果展示位"，
                 要用户先点一下播放键才动，等于把最想给人看的那一下藏起来了。
                 控件保留，想听声音/拖进度自己点。 -->
            <video
              v-if="isVideoUrl(latest.outputs[0]!)"
              v-auto-play-video
              :src="latest.outputs[0]!.url"
              class="result-video"
              controls
              muted
              loop
              playsinline
              preload="metadata"
            />
            <img
              v-else
              :src="latest.outputs[0]!.url"
              :alt="tool?.name"
            >
          </div>
          <div class="result-actions">
            <span class="result-meta">
              {{ outputLabel(latest.outputs[0]!) }}
            </span>
            <button
              v-if="latest.outputs.length"
              type="button"
              class="link-btn"
              :disabled="anyOutputSaving || allOutputsSaved"
              :title="allOutputsSaved ? '这些产物已在「我的资产」里' : '把这些产物转为永久素材'"
              @click="saveOutputs"
            >
              {{ allOutputsSaved ? '已保存到我的资产' : (anyOutputSaving ? '保存中…' : '保存到我的资产') }}
            </button>
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
            v-if="sourceUrl && !isVideoUrl(latest.outputs[0]!)"
            class="compare"
            :class="{ three: isPair && slots[1]!.preview }"
          >
            <div>
              <small>{{ isPair ? '目标图' : '原图' }}</small>
              <img
                :src="sourceUrl"
                alt="原图"
              >
            </div>
            <div v-if="isPair && slots[1]!.preview">
              <small>人脸图</small>
              <img
                :src="slots[1]!.preview"
                alt="人脸图"
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

        <!-- 生成中（有原图）：把用户自己那张图铺满，进度压在上面。
             一个转圈的灰框说明不了"在改的是哪张"；垫上原图之后，等待的一两分钟里
             用户看着的是自己这张。没有原图的工具（纯文字）走下面那个分支。 -->
        <div
          v-else-if="runs.length && sourceUrl"
          class="result-pending-live"
        >
          <div class="result-media pending-media">
            <video
              v-if="isVideoPair"
              v-auto-play-video
              :src="sourceUrl"
              class="result-video"
              muted
              loop
              playsinline
              preload="metadata"
            />
            <img
              v-else
              :src="sourceUrl"
              alt="正在处理的图片"
            >
            <div class="pending-overlay">
              <UIcon
                name="i-lucide-loader-circle"
                class="pending-spin"
              />
              <strong>正在生成…</strong>
              <small>
                {{ runs[0]!.status }}
                <template v-if="runs[0]!.progress > 0"> · {{ runs[0]!.progress }}%</template>
              </small>
              <div
                v-if="runs[0]!.progress > 0"
                class="pending-bar"
              >
                <span :style="{ width: `${Math.min(100, runs[0]!.progress)}%` }" />
              </div>
            </div>
          </div>
          <div class="result-actions">
            <span class="result-meta">大多需要 60–120 秒，可以先去做别的</span>
          </div>
        </div>

        <div
          v-else-if="runs.length"
          class="result-pending"
        >
          <UIcon name="i-lucide-loader-circle" />
          <strong>正在生成…</strong>
          <small>{{ runs[0]!.status }} · {{ runs[0]!.progress }}%</small>
          <p>大多需要 30–90 秒，可以先去做别的。</p>
        </div>

        <!-- 已上传、还没点生成：右半边换成用户自己的图。
             这里继续放效果示例是错的 —— 用户刚传完图，再看一张别人的前后对比，
             会以为"我传的没生效"。顺便把"下一步点哪"写在这儿。 -->
        <div
          v-else-if="sourceUrl"
          class="result-ready"
        >
          <div class="result-media">
            <video
              v-if="isVideoPair"
              v-auto-play-video
              :src="sourceUrl"
              class="result-video"
              muted
              loop
              playsinline
              preload="metadata"
            />
            <img
              v-else
              :src="sourceUrl"
              alt="待处理的图片"
            >
          </div>
          <div class="result-actions">
            <span class="result-meta">图片已就绪</span>
            <span class="demo-tip">点左侧「{{ session.token.value ? '开始生成' : '登录后创建' }}」</span>
          </div>
        </div>

        <!-- 还没传图：右半边不放"还没有结果"的灰框，放这个工具的效果示例。
             用户点进「脱衣」就是想看能变成什么样 —— 把原图/效果同坐标摆在第一屏，
             比任何文案都有说服力；等上面几个分支接手，示例自动让位。 -->
        <div
          v-else-if="demo || demoVideo"
          class="result-demo"
        >
          <div class="demo-media">
            <!-- 视频工具直接播循环预览，不摆对比滑块：对比是"同一画面的前后两帧"，
                 视频给不出同坐标的第二帧，硬凑只会让人以为能拖（用户口径：
                 只有图片脱衣那张卡出对比）。cover 在这里是视频的封面帧。 -->
            <video
              v-if="demoVideo"
              v-auto-play-video
              class="media-fg"
              :src="demoVideo"
              :poster="demo?.after || undefined"
              muted
              loop
              playsinline
              preload="none"
            />
            <HgCompareSlider
              v-else-if="demo && demo.before"
              fit="contain"
              :before="demo.before"
              :after="demo.after"
              :alt="demoAlt"
              :label="`${tool?.name || '效果'} 原图与效果对比`"
            />
            <img
              v-else-if="demo"
              :src="demo.after"
              :alt="demoAlt"
            >
          </div>
          <div class="demo-actions">
            <span class="result-meta">效果示例</span>
            <span
              v-if="demoVideo"
              class="demo-tip"
            >进视口自动播放</span>
            <span
              v-else-if="demo && demo.before"
              class="demo-tip"
            >拖动中间滑块看对比</span>
          </div>
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
.slot-grid.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.slot { display: flex; flex-direction: column; align-items: flex-start; }
.slot .drop { width: 100%; }
.slot-grid.pair .drop { min-height: 150px; }
.slot-grid.pair .drop strong { font-size: 13px; }
.slot-grid.pair .drop small { font-size: 11px; line-height: 1.5; }
.slot-grid.pair .drop img { max-height: 200px; }
.swap-btn { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; }
.slot .drop { position: relative; }
.mask-canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; opacity: 0.45; touch-action: none; }
.mask-tools { margin-top: 14px; }
.mask-row { display: flex; align-items: center; gap: 10px; }
.mask-row input[type="range"] { flex: 1; }
.mask-hint { color: var(--hg-muted); font-size: 12px; }
.mask-warn { margin: 8px 0 0; color: #f59e0b; font-size: 12px; }
.mt-block { margin-top: 16px; }
.drop { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 180px; padding: 16px; border: 1px dashed var(--hg-line); border-radius: 10px; background: #141416; color: var(--hg-muted); cursor: pointer; text-align: center; }
.drop.filled { border-style: solid; padding: 0; overflow: hidden; }
.drop input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.drop img { display: block; width: 100%; max-height: 320px; object-fit: contain; }
.drop-video { display: block; width: 100%; max-height: 320px; background: #000; }
.drop strong { color: var(--ink); font-size: 14px; }
.drop small { font-size: 12px; }
.text-input { width: 100%; padding: 10px 12px; border: 1px solid var(--hg-line); border-radius: 8px; background: #141416; color: var(--ink); font: inherit; resize: vertical; }
.tpl-row { display: flex; flex-wrap: wrap; gap: 8px; }
.tpl-pill { padding: 7px 12px; border: 1px solid var(--hg-line); border-radius: 999px; background: transparent; color: var(--hg-muted); font-size: 13px; cursor: pointer; }
.tpl-pill.active { border-color: var(--hg-accent); color: var(--ink); }
.cost-row { display: flex; align-items: baseline; justify-content: space-between; margin: 18px 0 10px; font-size: 14px; color: var(--hg-muted); }
.cost-row strong { font-size: 20px; color: var(--ink); }
.cost-pending { font-size: 13px; color: var(--hg-muted); }
.form-error { margin: 0 0 10px; font-size: 13px; color: #f87171; }
.submit { width: 100%; }
.link-btn { padding: 0; border: 0; background: transparent; color: var(--hg-muted); font-size: 13px; text-decoration: underline; cursor: pointer; }
.link-btn:disabled { color: var(--hg-faint); text-decoration: none; cursor: default; }
.tool-result { min-height: 420px; padding: 20px; border: 1px solid var(--hg-line); border-radius: 12px; background: var(--hg-card); display: flex; flex-direction: column; }
.result-empty, .result-pending { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--hg-muted); text-align: center; }
.result-empty strong, .result-pending strong { color: var(--ink); font-size: 15px; }
.result-empty p, .result-pending p { max-width: 320px; font-size: 12px; }
.result-live, .result-ready, .result-pending-live { display: flex; flex-direction: column; gap: 14px; }
/* 生成中：原图铺满，进度压在**下缘**。
   刻意不用整块平铺的暗色遮罩 —— 那会把用户那张图糊掉，而铺原图的意义正是
   "等待的一两分钟里看着自己这张"。改成自下而上的渐变，人像主体仍看得清，
   文字压在渐变上保证可读。 */
.pending-media { position: relative; }
.pending-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 6px; padding: 16px 16px 22px; background: linear-gradient(to top, rgb(10 11 13 / 90%) 0%, rgb(10 11 13 / 62%) 24%, rgb(10 11 13 / 0%) 56%); color: #fff; text-align: center; }
.pending-overlay strong { font-size: 15px; text-shadow: 0 1px 3px rgb(0 0 0 / 55%); }
.pending-overlay small { font-size: 12px; opacity: 0.86; text-shadow: 0 1px 3px rgb(0 0 0 / 55%); }
.pending-spin { font-size: 26px; filter: drop-shadow(0 1px 3px rgb(0 0 0 / 55%)); animation: hg-spin 1.1s linear infinite; }
@keyframes hg-spin { to { transform: rotate(360deg); } }
.pending-bar { width: 56%; height: 4px; margin-top: 8px; border-radius: 999px; background: rgb(255 255 255 / 26%); overflow: hidden; }
.pending-bar span { display: block; height: 100%; border-radius: 999px; background: var(--hg-accent); transition: width 400ms ease; }
/* 能力边界提示：琥珀色，与 .mask-warn 同一套语义色。 */
.limit-note { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid rgb(245 158 11 / 32%); border-radius: 8px; background: rgb(245 158 11 / 8%); }
.limit-icon { flex: 0 0 auto; margin-top: 1px; color: #f59e0b; }
.limit-note strong { display: block; font-size: 13px; font-weight: 600; }
.limit-note small { display: block; margin-top: 3px; color: var(--hg-muted); font-size: 12px; line-height: 1.6; }
/* 效果示例：竖图为主，按高度定尺寸、宽度由比例推出来，上限内不撑破右栏。 */
.result-demo { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; }
.demo-media { position: relative; flex: 0 0 auto; height: min(560px, 64vh); aspect-ratio: 2 / 3; border-radius: 10px; overflow: hidden; background: #141416; }
.demo-media img, .demo-media video { display: block; width: 100%; height: 100%; object-fit: contain; object-position: center; }
.demo-actions { display: flex; align-items: center; gap: 12px; }
.demo-tip { color: var(--hg-muted); font-size: 12px; opacity: 0.75; }
.result-media { display: grid; place-items: center; background: #141416; border-radius: 10px; overflow: hidden; }
.result-media img { display: block; max-width: 100%; max-height: 520px; object-fit: contain; }
.result-video { display: block; width: 100%; max-height: 520px; background: #000; }
.result-actions { display: flex; align-items: center; gap: 14px; }
.result-meta { font-size: 13px; color: var(--hg-muted); }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.compare.three { grid-template-columns: repeat(3, 1fr); }
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
