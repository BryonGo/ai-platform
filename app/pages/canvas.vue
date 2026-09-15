<script setup lang="ts">
/**
 * 画布（织幕一期）—— 前端先行版。
 *
 * 为什么先做前端：节点、状态机、审核卡点、成本口径这些东西，画出来比写在接口文档里
 * 好判断得多；界面定稿后，字段名就是后端契约（见 ~/data/hougong-canvas.ts 的类型）。
 *
 * 三层结构（对应《织幕方案B》的 S1–S9）：
 *   1. 剧集画布：剧本 → 资产 → 15 个镜头 → 合成，节点式，Vue Flow 提供平移/缩放/小地图；
 *   2. 单镜详情：候选选片、提示词、帧数档位、重跑与驳回（右侧抽屉）；
 *   3. 手机端：画布在窄屏没法用，退化成镜头列表（同一份数据、同一套操作）。
 *
 * 本轮全部数据来自 mock，按钮只改本地状态并给出提示；接后端时替换 loadShots()/执行动作即可。
 */
import { VueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
// Vue Flow 的基础样式必须显式引入：节点定位（absolute）与连线样式都在里面，
// 少了它画布会退化成一堆堆叠的 div。
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {
  FRAME_GRID,
  MOCK_EPISODE,
  MOCK_SERIES,
  SHOT_STATUS,
  creditsToYuan,
  framesToSeconds,
  pendingCount,
  totalCost,
  type CanvasEpisode,
  type CanvasSeries,
  type CanvasShot,
  type RenderTier,
  type ShotCandidate
} from '~/data/hougong-canvas'

const hgApi = useHougongApi()

/** 是否在用本地示例数据（后端 empty=true 或读失败时为 true）。 */
const mockMode = ref(true)

/** 目录里的可选模型：关键帧用图像模型，预览/定稿用视频模型。 */
const imageModels = ref<{ id: string, name: string }[]>([])
const videoModels = ref<{ id: string, name: string }[]>([])
const pickedModel = ref('')

async function loadModels() {
  try {
    const cat = await hgApi.getCatalog()
    imageModels.value = (cat.cloudModels || []).map(m => ({ id: m.id, name: m.name }))
    videoModels.value = (cat.videoModels || []).filter(m => m.available !== false).map(m => ({ id: m.id, name: m.name }))
  } catch {
    /* 目录读不到就先不给选：提交时服务端会明确要求选模型 */
  }
}

const episode = ref<CanvasEpisode>(structuredClone(MOCK_EPISODE))
const series = ref<CanvasSeries>(structuredClone(MOCK_SERIES))
const shots = ref<CanvasShot[]>(structuredClone(MOCK_EPISODE.shots))
const frameGrid = ref<number[]>([...FRAME_GRID])

/**
 * 拉后端数据；`empty` 或失败就保持示例数据。
 *
 * 为什么保留示例兜底：写侧（生成分镜、提交渲染）还没接，绝大多数账号此刻确实没有
 * 画布数据 —— 直接给空页面既看不出设计，也没法评审。真实数据一旦存在就自动切换。
 */
async function loadCanvas() {
  try {
    const data = await hgApi.getCanvasOverview()
    if (!data || data.empty || !data.shots?.length) return
    mockMode.value = false
    series.value = data.series as unknown as CanvasSeries
    episode.value = {
      id: data.episode.id,
      title: data.episode.title,
      budgetCredits: data.episode.budgetCredits,
      shots: [],
      costs: data.costs
    }
    shots.value = data.shots as unknown as CanvasShot[]
    if (data.frameGrid?.length) frameGrid.value = data.frameGrid
    selectedId.value = shots.value[3]?.id ?? shots.value[0]?.id ?? ''
  } catch {
    /* 读失败保持示例数据，不打扰用户 */
  }
}
const selectedId = ref<string>(shots.value[3]?.id ?? '')
const tier = ref<RenderTier>('final')
const draftFrames = ref<number>(158)
const toast = ref('')
const busy = ref(false)

/** 当前集的 id（真实数据来自后端；示例数据下为空串）。 */
const episodeId = computed(() => episode.value.id ?? '')

/** 画布只在宽屏挂载：窄屏下容器 display:none，Vue Flow 量不到尺寸只会刷警告。 */
const wideScreen = ref(true)
/** 窄屏详情抽屉开关（宽屏常驻，不用这个）。 */
const mobileDetailOpen = ref(false)
onMounted(() => {
  void loadCanvas()
  void loadModels()
  const mq = window.matchMedia('(min-width: 761px)')
  wideScreen.value = mq.matches
  mq.addEventListener('change', (e) => {
    wideScreen.value = e.matches
  })
})

const selected = computed(() => shots.value.find(s => s.id === selectedId.value) ?? null)
const spent = computed(() => totalCost(shots.value))
const pending = computed(() => pendingCount(shots.value))
const progress = computed(() => Math.round((shots.value.filter(s => s.status === 'approved').length / shots.value.length) * 100))

/** 当前预览的候选（默认取已选中的那张，没有就取第一张）。 */
const activeCandidateId = ref<string>('')
const activeCandidate = computed<ShotCandidate | null>(() => {
  const list = selected.value?.candidates ?? []
  return list.find(c => c.id === activeCandidateId.value) ?? list.find(c => c.picked) ?? list[0] ?? null
})

watch(selectedId, () => {
  activeCandidateId.value = ''
  draftFrames.value = selected.value?.frames ?? 158
})

function flash(message: string) {
  toast.value = message
  window.setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, 2400)
}

/* ---------------- 节点图 ---------------- */

const COL = 178
const ROW = 300

const nodes = computed<Node[]>(() => {
  const list: Node[] = []
  // 阶段节点：剧本（S1–S3）与资产（S4）在左，合成（S8–S9）在右。
  list.push({
    id: 'stage-script',
    type: 'stage',
    position: { x: 0, y: 0 },
    data: { title: '剧本与分镜', sub: 'S1–S3 · Grok', value: '15 镜 · 已校验', tone: 'ok' },
    draggable: true
  })
  list.push({
    id: 'stage-asset',
    type: 'stage',
    position: { x: 0, y: ROW },
    data: { title: '角色与场景', sub: 'S4 · Seedream', value: '64 张 · 已定稿', tone: 'ok' },
    draggable: true
  })
  // 15 个镜头分两行排，编导一眼能看完整集。
  const row1 = shots.value.slice(0, 8)
  const row2 = shots.value.slice(8)
  row1.forEach((s, i) => list.push(shotNode(s, 240 + i * COL, 0)))
  row2.forEach((s, i) => list.push(shotNode(s, 240 + i * COL, ROW)))
  list.push({
    id: 'stage-compose',
    type: 'stage',
    position: { x: 240 + 8 * COL + 20, y: ROW / 2 },
    data: { title: '合成与标识', sub: 'S8–S9 · ffmpeg', value: `${progress.value}% 镜头已定稿`, tone: progress.value === 100 ? 'ok' : 'muted' },
    draggable: true
  })
  return list
})

function shotNode(s: CanvasShot, x: number, y: number): Node {
  return {
    id: s.id,
    type: 'shot',
    position: { x, y },
    data: { shot: s, active: s.id === selectedId.value },
    draggable: true
  }
}

const edges = computed<Edge[]>(() => {
  const list: Edge[] = []
  shots.value.forEach((s) => {
    list.push({ id: `e-script-${s.id}`, source: 'stage-script', target: s.id, animated: s.status === 'draft' })
    list.push({ id: `e-${s.id}-compose`, source: s.id, target: 'stage-compose', animated: s.status !== 'approved' })
  })
  list.push({ id: 'e-script-asset', source: 'stage-script', target: 'stage-asset' })
  list.push({ id: 'e-asset-compose', source: 'stage-asset', target: 'stage-compose' })
  return list
})

/* ---------------- 交互（本轮只改本地状态） ---------------- */

function pickShot(id: string) {
  selectedId.value = id
  // 窄屏：详情是底部抽屉，点条目即打开（宽屏详情常驻右侧，不受影响）。
  if (!wideScreen.value) mobileDetailOpen.value = true
}

function applyToSelected(patch: Partial<CanvasShot>, message: string) {
  const s = selected.value
  if (!s) return
  Object.assign(s, patch)
  s.updatedAt = '刚刚'
  flash(message)
}

/** 提交渲染：走平台任务链路，返回任务 id；产物与花费由读模型自动回挂。 */
async function submitRender(stage: 'keyframe' | 'preview' | 'final') {
  const s = selected.value
  if (!s) return
  if (mockMode.value) {
    flash('当前是示例数据：先有真实的一集（或让后端生成）才能提交渲染')
    return
  }
  if (!pickedModel.value) {
    flash('请先选择模型')
    return
  }
  busy.value = true
  try {
    const res = await hgApi.renderCanvasShot({
      episodeId: episodeId.value,
      idx: s.index,
      stage,
      modelId: pickedModel.value,
      count: stage === 'keyframe' ? 3 : undefined
    })
    const clamped = stage === 'keyframe' && res.count && res.count < 3
    flash(clamped
      ? `已提交（任务 #${res.taskId}）：该模型一次只出 ${res.count} 张，可再点一次补候选`
      : `已提交渲染（任务 #${res.taskId}，预占 ${res.reservedCredits} 分）`)
    // 任务在跑：等一会儿再刷新，能立刻看到候选与花费
    window.setTimeout(() => void loadCanvas(), 12000)
  } catch (e) {
    flash(e instanceof Error ? e.message : '提交失败')
  } finally {
    busy.value = false
  }
}

/** 关键帧：一镜一次出 3 张候选（模型不支持多张时服务端会夹到 1）。 */
function rerollKeyframes() {
  return submitRender('keyframe')
}

function renderTier(next: RenderTier) {
  tier.value = next
  return submitRender(next === 'preview' ? 'preview' : 'final')
}

/** 审核动作：pick=选为定稿 / approve=通过 / reject=驳回重跑。 */
async function review(action: 'pick' | 'approve' | 'reject', assetId?: string) {
  const s = selected.value
  if (!s) return
  if (mockMode.value) {
    // 示例数据下只改本地状态，保证交互能被评审
    if (action === 'reject') applyToSelected({ status: 'rejected' }, '已驳回（示例数据，未提交）')
    else applyToSelected({ status: 'approved' }, '已通过（示例数据，未提交）')
    return
  }
  try {
    const res = await hgApi.reviewCanvasShot({
      episodeId: episodeId.value, idx: s.index, action, assetId
    })
    s.status = res.status as CanvasShot['status']
    if (action === 'pick') {
      s.candidates.forEach((c) => {
        c.picked = c.id === assetId
      })
      flash('已选为定稿')
    } else if (action === 'reject') {
      flash('已驳回，可重新提交渲染')
    } else {
      flash('已通过，进入合成队列')
    }
  } catch (e) {
    flash(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <div class="canvas-page">
    <!-- 顶栏：项目/集 + 本集账 -->
    <header class="cv-head">
      <div class="cv-head-left">
        <span class="cv-series">{{ series.title }}</span>
        <span class="cv-episode">{{ episode.title }}</span>
        <span
          v-if="pending"
          class="cv-pending"
        >
          <UIcon name="i-lucide-circle-alert" /> {{ pending }} 处待处理
        </span>
      </div>
      <div class="cv-head-right">
        <span
          v-if="mockMode"
          class="cv-mock"
          title="写侧还没接：这一集是本地示例数据"
        >示例数据</span>
        <span class="cv-stat"><b>{{ progress }}%</b> 已定稿</span>
        <span class="cv-stat"><b>{{ creditsToYuan(spent) }}</b> / 预算 {{ creditsToYuan(episode.budgetCredits) }}</span>
      </div>
    </header>

    <div class="cv-body">
      <!-- 左：分集与成本构成 -->
      <aside class="cv-side">
        <p class="cv-side-title">
          分集
        </p>
        <ul class="cv-eps">
          <li
            v-for="ep in series.episodes"
            :key="ep.id"
            :class="['cv-ep', { 'is-active': ep.id === episode.id }]"
          >
            <span
              class="cv-ep-dot"
              :data-status="ep.status"
            />
            <span class="cv-ep-name">{{ ep.title }}</span>
            <span class="cv-ep-state">{{ ep.status === 'running' ? '进行中' : ep.status === 'done' ? '已完成' : '未开始' }}</span>
          </li>
        </ul>

        <p class="cv-side-title">
          成本构成
        </p>
        <ul class="cv-costs">
          <li
            v-for="c in episode.costs"
            :key="c.stage"
          >
            <span class="cv-cost-stage">{{ c.stage }}</span>
            <span class="cv-cost-value">{{ creditsToYuan(c.credits) }}</span>
            <span class="cv-cost-bar">
              <i :style="{ width: `${Math.round((c.credits / spent) * 100)}%` }" />
            </span>
          </li>
        </ul>
        <p class="cv-hint">
          一次定稿渲染 ≈ 几分钟 GPU，关键帧只要几毛钱 —— 卡点都放在"下一步更贵"的位置。
        </p>
      </aside>

      <!-- 中：节点画布 -->
      <section class="cv-stage">
        <ClientOnly>
          <VueFlow
            v-if="wideScreen"
            :nodes="nodes"
            :edges="edges"
            :min-zoom="0.3"
            :max-zoom="1.6"
            :default-viewport="{ x: 28, y: 36, zoom: 0.72 }"
            :nodes-connectable="false"
            :elements-selectable="true"
            class="cv-flow"
            @node-click="(e) => e.node.type === 'shot' && pickShot(e.node.id)"
          >
            <template #node-shot="{ data }">
              <div :class="['cv-node', 'cv-node--shot', { 'is-active': data.active }]">
                <div class="cv-node-top">
                  <span class="cv-node-id">{{ data.shot.id }}</span>
                  <span
                    class="cv-tag"
                    :data-tone="SHOT_STATUS[data.shot.status as keyof typeof SHOT_STATUS].tone"
                  >{{ SHOT_STATUS[data.shot.status as keyof typeof SHOT_STATUS].label }}</span>
                </div>
                <div class="cv-node-media">
                  <img
                    v-if="data.shot.candidates.length"
                    class="media-fg"
                    :src="data.shot.candidates[0]?.url"
                    alt=""
                  >
                  <span
                    v-else
                    class="cv-node-empty"
                  >
                    <UIcon name="i-lucide-image-plus" />
                  </span>
                </div>
                <div class="cv-node-foot">
                  <span>{{ data.shot.shotSize }} · {{ framesToSeconds(data.shot.frames) }}s</span>
                  <span class="cv-node-cost">{{ data.shot.costCredits ? creditsToYuan(data.shot.costCredits) : '—' }}</span>
                </div>
              </div>
            </template>
            <template #node-stage="{ data }">
              <div class="cv-node cv-node--stage">
                <p class="cv-stage-title">
                  {{ data.title }}
                </p>
                <p class="cv-stage-sub">
                  {{ data.sub }}
                </p>
                <p
                  class="cv-stage-value"
                  :data-tone="data.tone"
                >
                  {{ data.value }}
                </p>
              </div>
            </template>
            <Background
              pattern-color="#2a2d33"
              :gap="26"
              :size="1.4"
            />
            <Controls position="bottom-right" />
            <MiniMap
              pannable
              zoomable
              class="cv-minimap"
              node-color="#3b3f47"
              mask-color="rgb(16 17 20 / 72%)"
            />
          </VueFlow>
        </ClientOnly>

        <!-- 手机端：画布换成列表（同一份数据、同一套操作） -->
        <ul class="cv-list">
          <li
            v-for="s in shots"
            :key="s.id"
            :class="['cv-list-item', { 'is-active': s.id === selectedId }]"
            @click="pickShot(s.id)"
          >
            <span class="cv-list-media">
              <img
                v-if="s.candidates.length"
                class="media-fg"
                :src="s.candidates[0]?.url"
                alt=""
              >
            </span>
            <span class="cv-list-body">
              <span class="cv-list-top">
                <b>{{ s.id }}</b>
                <span
                  class="cv-tag"
                  :data-tone="SHOT_STATUS[s.status].tone"
                >{{ SHOT_STATUS[s.status].label }}</span>
              </span>
              <span class="cv-list-sub">{{ s.shotSize }} · {{ framesToSeconds(s.frames) }}s · {{ s.renders }} 次渲染</span>
            </span>
            <span class="cv-list-cost">{{ s.costCredits ? creditsToYuan(s.costCredits) : '—' }}</span>
          </li>
        </ul>
      </section>

      <!-- 右：单镜详情（窄屏是底部抽屉） -->
      <div
        v-if="selected && mobileDetailOpen && !wideScreen"
        class="cv-sheet-mask"
        @click="mobileDetailOpen = false"
      />
      <aside
        v-if="selected && (wideScreen || mobileDetailOpen)"
        class="cv-detail"
      >
        <header class="cv-detail-head">
          <div>
            <p class="cv-detail-id">
              {{ selected.id }}
            </p>
            <p class="cv-detail-sub">
              {{ selected.shotSize }} · {{ selected.camera }} · {{ selected.frames }} 帧 /
              {{ framesToSeconds(selected.frames) }}s
            </p>
          </div>
          <div class="cv-detail-tags">
            <span
              class="cv-tag"
              :data-tone="SHOT_STATUS[selected.status].tone"
            >{{ SHOT_STATUS[selected.status].label }}</span>
            <button
              type="button"
              class="cv-sheet-close"
              aria-label="收起详情"
              @click="mobileDetailOpen = false"
            >
              <UIcon name="i-lucide-chevron-down" />
            </button>
          </div>
        </header>

        <div class="cv-preview">
          <img
            v-if="activeCandidate"
            class="media-fg"
            :src="activeCandidate.url"
            alt=""
          >
          <span
            v-else
            class="cv-node-empty"
          >
            <UIcon name="i-lucide-image-plus" /> 还没有候选
          </span>
        </div>

        <div
          v-if="selected.candidates.length"
          class="cv-cands"
        >
          <button
            v-for="c in selected.candidates"
            :key="c.id"
            type="button"
            :class="['cv-cand', { 'is-active': c.id === activeCandidate?.id, 'is-picked': c.picked }]"
            @click="activeCandidateId = c.id"
          >
            <img
              class="media-fg"
              :src="c.url"
              alt=""
            >
            <span>{{ c.note }}</span>
            <i
              v-if="c.picked"
              class="cv-cand-check"
            ><UIcon name="i-lucide-check" /></i>
          </button>
        </div>

        <label class="cv-model">
          <span>模型</span>
          <select v-model="pickedModel">
            <option value="">
              选择模型…
            </option>
            <option
              v-for="m in selected.candidates.some(c => c.stage !== 'keyframe') ? videoModels : imageModels"
              :key="m.id"
              :value="m.id"
            >{{ m.name }}</option>
          </select>
        </label>

        <div class="cv-actions">
          <button
            type="button"
            class="cv-btn"
            :disabled="busy"
            @click="rerollKeyframes"
          >
            <UIcon name="i-lucide-refresh-cw" /> 重出关键帧
          </button>
          <button
            type="button"
            class="cv-btn"
            :class="{ 'is-on': tier === 'preview' }"
            :disabled="busy"
            @click="renderTier('preview')"
          >
            <UIcon name="i-lucide-play" /> 预览 ¥0.18
          </button>
          <button
            type="button"
            class="cv-btn cv-btn--primary"
            :class="{ 'is-on': tier === 'final' }"
            :disabled="busy"
            @click="renderTier('final')"
          >
            <UIcon name="i-lucide-clapperboard" /> 定稿 ¥0.96
          </button>
        </div>

        <!-- 审核行常驻：驳回/通过不需要先有候选（"这一批都不用" 本身就是一种审核结论），
             只有"选为定稿"要求先选中一张。 -->
        <div class="cv-actions cv-actions--review">
          <button
            type="button"
            class="cv-btn"
            :disabled="busy || !activeCandidate"
            @click="activeCandidate && review('pick', activeCandidate.id)"
          >
            <UIcon name="i-lucide-check-check" /> 选为定稿
          </button>
          <button
            type="button"
            class="cv-btn"
            :disabled="busy"
            @click="review('reject')"
          >
            <UIcon name="i-lucide-x" /> 驳回重跑
          </button>
          <button
            type="button"
            class="cv-btn cv-btn--ghost"
            :disabled="busy"
            @click="review('approve')"
          >
            <UIcon name="i-lucide-arrow-right" /> 通过
          </button>
        </div>

        <section class="cv-field">
          <p class="cv-field-title">
            帧数（H3 网格）
          </p>
          <div class="cv-frames">
            <button
              v-for="f in frameGrid"
              :key="f"
              type="button"
              :class="['cv-frame', { 'is-active': draftFrames === f }]"
              @click="draftFrames = f"
            >
              {{ f }}
              <i>{{ framesToSeconds(f) }}s</i>
            </button>
          </div>
          <p
            v-if="!frameGrid.includes(draftFrames)"
            class="cv-warn"
          >
            不在网格上的帧数会被上游静默吸附，务必从上面这 15 个值里选。
          </p>
        </section>

        <section class="cv-field">
          <p class="cv-field-title">
            关键帧提示词
          </p>
          <p class="cv-field-body">
            {{ selected.keyframePrompt }}
          </p>
        </section>

        <section class="cv-field">
          <p class="cv-field-title">
            H3 提示词
          </p>
          <p class="cv-field-body">
            <b>画面</b>{{ selected.h3Prompt.description }}
          </p>
          <p class="cv-field-body">
            <b>环境音</b>{{ selected.h3Prompt.soundscape }}
          </p>
          <p class="cv-field-body">
            <b>配乐</b>{{ selected.h3Prompt.music || '留空（整集在 S9 统一铺 BGM）' }}
          </p>
        </section>

        <section class="cv-field">
          <p class="cv-field-title">
            台词与角色
          </p>
          <p
            v-for="d in selected.dialogue"
            :key="d.start"
            class="cv-field-body"
          >
            <b>{{ d.speaker }}</b>{{ d.start }} · {{ d.line }}
          </p>
          <p class="cv-field-body">
            <b>场景</b>{{ selected.scene }}
          </p>
        </section>

        <footer class="cv-detail-foot">
          <span>已花费 {{ creditsToYuan(selected.costCredits) }}</span>
          <span>渲染 {{ selected.renders }} 次</span>
          <span>{{ selected.updatedAt }}</span>
        </footer>
      </aside>
    </div>

    <p
      v-if="toast"
      class="cv-toast"
    >
      {{ toast }}
    </p>
  </div>
</template>

<style scoped>
/* 画布页占满内容区：外壳已按 isFullBleed 去掉页面内边距 */
.canvas-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--hg3-canvas);
}

.cv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--hg3-line);
  background: var(--hg3-well);
}
.cv-head-left,
.cv-head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.cv-series {
  font-size: 12px;
  color: var(--hg3-muted);
}
.cv-episode {
  font-size: 15px;
  font-weight: 600;
  color: var(--hg3-ink);
}
.cv-mock {
  padding: 3px 8px;
  border: 1px dashed var(--hg3-line-strong);
  border-radius: 999px;
  color: var(--hg3-faint);
  font-size: 11px;
}
.cv-pending {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--hg3-accent-line);
  border-radius: 999px;
  background: var(--hg3-accent-soft);
  color: var(--hg3-accent-hi);
  font-size: 12px;
}
.cv-stat {
  font-size: 12px;
  color: var(--hg3-muted);
}
.cv-stat b {
  color: var(--hg3-ink);
  font-weight: 600;
}

.cv-body {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr) 336px;
  flex: 1;
  min-height: 0;
}

/* 左栏 */
.cv-side {
  padding: 12px;
  border-right: 1px solid var(--hg3-line);
  background: var(--hg3-well);
  overflow-y: auto;
}
.cv-side-title {
  margin: 12px 0 8px;
  color: var(--hg3-faint);
  font-size: 11px;
  letter-spacing: 0.06em;
}
.cv-side-title:first-child {
  margin-top: 0;
}
.cv-eps,
.cv-costs {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.cv-ep {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--hg3-tile);
  font-size: 12px;
}
.cv-ep.is-active {
  border-color: var(--hg3-accent-line);
  background: var(--hg3-accent-soft);
}
.cv-ep-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--hg3-faint);
}
.cv-ep-dot[data-status='running'] {
  background: var(--hg3-run);
}
.cv-ep-dot[data-status='done'] {
  background: var(--hg3-ok);
}
.cv-ep-name {
  overflow: hidden;
  color: var(--hg3-ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cv-ep-state {
  color: var(--hg3-faint);
  font-size: 11px;
}
.cv-costs li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
  font-size: 12px;
  color: var(--hg3-muted);
}
.cv-cost-value {
  color: var(--hg3-ink);
}
.cv-cost-bar {
  grid-column: 1 / -1;
  height: 4px;
  border-radius: 999px;
  background: var(--hg3-rail);
  overflow: hidden;
}
.cv-cost-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--hg3-accent), var(--hg3-accent-hi));
}
.cv-hint {
  margin-top: 14px;
  color: var(--hg3-faint);
  font-size: 11px;
  line-height: 1.6;
}

/* 画布 */
.cv-stage {
  position: relative;
  min-width: 0;
  background: var(--hg3-canvas);
}
.cv-flow {
  width: 100%;
  height: 100%;
}
.cv-list {
  display: none;
}
.cv-minimap {
  background: var(--hg3-well) !important;
}

.cv-node {
  width: 150px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 12px;
  background: var(--hg3-card);
  overflow: hidden;
  font-family: inherit;
}
.cv-node--shot.is-active {
  border-color: var(--hg3-accent);
  box-shadow: 0 0 0 2px var(--hg3-accent-soft);
}
.cv-node-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px;
}
.cv-node-id {
  color: var(--hg3-ink);
  font-size: 11px;
  font-weight: 600;
}
.cv-node-media {
  position: relative;
  aspect-ratio: 9 / 16;
  background: var(--hg3-card-soft);
}
.cv-node-media img {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: left top;
}
.cv-node-empty {
  display: grid;
  place-items: center;
  gap: 4px;
  width: 100%;
  height: 100%;
  color: var(--hg3-faint);
  font-size: 11px;
}
.cv-node-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  color: var(--hg3-muted);
  font-size: 11px;
}
.cv-node-cost {
  color: var(--hg3-ink);
}
.cv-node--stage {
  width: 168px;
  padding: 12px;
}
.cv-stage-title {
  margin: 0 0 4px;
  color: var(--hg3-ink);
  font-size: 13px;
  font-weight: 600;
}
.cv-stage-sub {
  margin: 0 0 8px;
  color: var(--hg3-faint);
  font-size: 11px;
}
.cv-stage-value {
  margin: 0;
  font-size: 12px;
  color: var(--hg3-muted);
}
.cv-stage-value[data-tone='ok'] {
  color: var(--hg3-ok);
}

.cv-tag {
  padding: 2px 6px;
  border-radius: 6px;
  font-size: 10px;
  white-space: nowrap;
}
.cv-tag[data-tone='muted'] {
  background: var(--hg3-rail);
  color: var(--hg3-muted);
}
.cv-tag[data-tone='run'] {
  background: rgb(101 198 251 / 18%);
  color: var(--hg3-run);
}
.cv-tag[data-tone='warn'] {
  background: rgb(255 180 84 / 18%);
  color: var(--hg3-warn);
}
.cv-tag[data-tone='ok'] {
  background: rgb(46 223 154 / 16%);
  color: var(--hg3-ok);
}
.cv-tag[data-tone='bad'] {
  background: rgb(255 112 122 / 16%);
  color: var(--hg3-i-coral);
}

/* 右栏详情 */
.cv-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* 子项一律不参与收缩：flex 列里 aspect-ratio 定的高度会被 flex-shrink 压成 0
     （预览区就是这么变成 0 高的），滚动交给容器自己。 */
}
.cv-detail > * {
  flex: none;
  padding: 12px;
  border-left: 1px solid var(--hg3-line);
  background: var(--hg3-well);
  overflow-y: auto;
}
.cv-sheet-mask,
.cv-sheet-close {
  display: none;
}
.cv-detail-tags {
  display: flex;
  align-items: center;
  gap: 8px;
}
.cv-sheet-close {
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 999px;
  background: var(--hg3-tile);
  color: var(--hg3-muted);
  cursor: pointer;
}
.cv-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.cv-detail-id {
  margin: 0;
  color: var(--hg3-ink);
  font-size: 14px;
  font-weight: 600;
}
.cv-detail-sub {
  margin: 4px 0 0;
  color: var(--hg3-faint);
  font-size: 11px;
}
.cv-preview {
  position: relative;
  height: 320px;
  border-radius: 12px;
  background: var(--hg3-card-soft);
  overflow: hidden;
}
.cv-preview img {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: left top;
}
.cv-cands {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.cv-cand {
  position: relative;
  display: grid;
  gap: 4px;
  padding: 0;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 10px;
  background: var(--hg3-tile);
  color: var(--hg3-muted);
  font-size: 10px;
  overflow: hidden;
  cursor: pointer;
}
.cv-cand img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
  object-position: left top;
}
.cv-cand span {
  padding: 0 0 6px;
}
.cv-cand.is-active {
  border-color: var(--hg3-accent);
}
.cv-cand-check {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--hg3-ok);
  color: #06231a;
  font-size: 10px;
}
.cv-model {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--hg3-faint);
  font-size: 11px;
}
.cv-model select {
  flex: 1;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 8px;
  background: var(--hg3-tile);
  color: var(--hg3-ink);
  font-size: 12px;
}
.cv-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cv-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.cv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 10px;
  background: var(--hg3-tile);
  color: var(--hg3-ink);
  font-size: 12px;
  cursor: pointer;
}
.cv-btn:hover {
  border-color: var(--hg3-accent-line);
}
.cv-btn--primary {
  border-color: transparent;
  background: linear-gradient(180deg, var(--hg3-accent-hi), var(--hg3-accent));
  color: var(--hg3-accent-ink);
  font-weight: 600;
}
.cv-btn--ghost {
  background: transparent;
}
.cv-field-title {
  margin: 0 0 6px;
  color: var(--hg3-faint);
  font-size: 11px;
}
.cv-field-body {
  margin: 0 0 4px;
  color: var(--hg3-muted);
  font-size: 12px;
  line-height: 1.6;
}
.cv-field-body b {
  margin-right: 6px;
  color: var(--hg3-ink);
  font-weight: 600;
}
.cv-frames {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cv-frame {
  display: grid;
  place-items: center;
  min-width: 42px;
  padding: 4px 6px;
  border: 1px solid var(--hg3-line-strong);
  border-radius: 8px;
  background: var(--hg3-tile);
  color: var(--hg3-ink);
  font-size: 11px;
  cursor: pointer;
}
.cv-frame i {
  color: var(--hg3-faint);
  font-size: 9px;
  font-style: normal;
}
.cv-frame.is-active {
  border-color: var(--hg3-accent);
  background: var(--hg3-accent-soft);
}
.cv-warn {
  margin: 6px 0 0;
  color: var(--hg3-i-coral);
  font-size: 11px;
}
.cv-detail-foot {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--hg3-line);
  color: var(--hg3-faint);
  font-size: 11px;
}

.cv-toast {
  position: absolute;
  bottom: 20px;
  left: 50%;
  margin: 0;
  padding: 8px 14px;
  border: 1px solid var(--hg3-accent-line);
  border-radius: 999px;
  background: var(--hg3-well);
  color: var(--hg3-ink);
  font-size: 12px;
  transform: translateX(-50%);
}

/* 窄屏：画布换成列表，左右栏收起 */
@media (max-width: 1100px) {
  .cv-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .cv-side {
    display: none;
  }
  .cv-detail {
    border-left: 0;
    border-top: 1px solid var(--hg3-line);
  }
}
@media (max-width: 760px) {
  .cv-flow {
    display: none;
  }
  .cv-list {
    display: grid;
    gap: 8px;
    padding: 10px;
    margin: 0;
    list-style: none;
  }
  .cv-list-item {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border: 1px solid var(--hg3-line);
    border-radius: 12px;
    background: var(--hg3-card);
  }
  .cv-list-item.is-active {
    border-color: var(--hg3-accent);
  }
  .cv-list-media {
    position: relative;
    display: block;
    width: 46px;
    aspect-ratio: 9 / 16;
    border-radius: 8px;
    background: var(--hg3-card-soft);
    overflow: hidden;
  }
  .cv-list-media img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: left top;
  }
  .cv-list-top {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--hg3-ink);
    font-size: 12px;
  }
  .cv-list-sub {
    display: block;
    margin-top: 2px;
    color: var(--hg3-faint);
    font-size: 11px;
  }
  .cv-list-cost {
    color: var(--hg3-ink);
    font-size: 12px;
  }
  /* 窄屏：详情做成底部抽屉 —— 列表有 15 条，把详情排在列表后面等于用户永远看不到 */
  .cv-detail {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 41;
    max-height: 82vh;
    border-top: 1px solid var(--hg3-line-strong);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -18px 40px rgb(0 0 0 / 45%);
  }
  .cv-sheet-mask {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: block;
    background: rgb(8 9 11 / 62%);
  }
  .cv-sheet-close {
    display: grid;
  }
}
</style>
