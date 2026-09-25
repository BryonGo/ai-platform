<script setup lang="ts">
import AppWorkCard from '~/components/AppWorkCard.vue'
import {
  ACTOR_GEN_ROLES,
  ACTOR_MEDIA_SLOTS,
  ACTOR_TEMPERAMENT_KEY,
  ACTOR_TAXONOMY_FIELDS,
  actorGenIsTerminal,
  actorGenRoleLabel,
  actorGenRoleNeedsRetry,
  actorGenStatusLabel,
  actorGenSummary,
  actorGenUnsupportedReason,
  actorGenerationLabel,
  actorShowsGeneration,
  buildFacetLabelMap,
  facetLabel,
  shouldContinueActorGenPolling
} from '~/utils/actor'
import { buildModelOptions, cloudDefaultQuality, cloudDefaultRatio, cloudQualities, quoteModel } from '~/composables/useModelCatalog'
import { myActorEditPath, myActorGenerationPath } from '~/utils/routes'

const api = useHougongApi()
const session = useAuthSession()
const route = useRoute()
const router = useRouter()

const character = ref<CharacterItem | null>(null)
const works = ref<WorkItem[]>([])
const loading = ref(true)
const error = ref('')

const characterId = computed(() => String(route.params.id))
/**
 * 地址里的 runId（/actors/mine/:id/generation/:runId）。
 * 有值就载入那一次运行（刷新/分享/后退都回到它）；为空表示详情页，用最近一次运行。
 */
const runIdParam = computed(() => String(route.params.runId || ''))

/** facets 的 value → label 映射（把 taxonomy 的 code 显示成中文；取不到就静默回退 value）。 */
const facetLabels = ref(buildFacetLabelMap(null))

async function loadFacetLabels() {
  try {
    const res = await api.listActors({ page: 1, pageSize: 1 })
    facetLabels.value = buildFacetLabelMap(res.facets)
  } catch {
    // 详情页不该因为字典拉不到就打不开：保持空表，标签回退显示原值。
  }
}

/** 结构化标签（新演员体系；老角色为空）。 */
const taxonomyTags = computed(() => {
  const t = character.value?.taxonomy
  if (!t) return [] as { label: string, value: string }[]
  const out: { label: string, value: string }[] = []
  for (const field of ACTOR_TAXONOMY_FIELDS) {
    const value = (t as Record<string, unknown>)[field.key]
    if (!value) continue
    out.push({ label: field.label, value: facetLabel(facetLabels.value, field.key, String(value)) })
  }
  for (const v of t.temperament || []) {
    out.push({ label: '气质', value: facetLabel(facetLabels.value, ACTOR_TEMPERAMENT_KEY, v) })
  }
  return out
})

/** 已产出的媒体槽位。 */
const mediaSlots = computed(() => {
  const media = character.value?.media || {}
  return ACTOR_MEDIA_SLOTS.filter(slot => !!media[slot.key]?.url)
})

/** 可播放的音色（后端 voice 已归一成数组；只展示有 URL 的）。 */
const voices = computed(() => (character.value?.voice || []).filter(v => !!v.url))
/** 登记了音色但没有可播地址（如实提示，不放一个点了没声的播放器）。 */
const voiceWithoutUrl = computed(() =>
  (character.value?.voice || []).filter(v => !v.url).length
)

const showGeneration = computed(() => (character.value ? actorShowsGeneration(character.value) : false))
const generationLabel = computed(() => actorGenerationLabel(character.value?.generationStatus))
function toCard(w: WorkItem) {
  return { ...w, image: w.imageUrl || '', meta: w.kind === 'video' ? '视频' : '图片', status: 'done' }
}

async function load() {
  await session.load()
  if (!session.token.value) {
    await goLogin()
    return
  }
  loading.value = true
  error.value = ''
  character.value = null
  works.value = []
  try {
    // 字典与主体数据并行；字典失败不影响角色与作品照常展示。
    void loadFacetLabels()
    const c = await api.getCharacter(characterId.value)
    character.value = c
    // 归属判定：列表接口就是「我的角色」口径，能查到才算本账号的。
    const mine = await api.listCharacters().catch(() => [] as CharacterItem[])
    isOwnCharacter.value = mine.some(item => item.id === c.id)
    const list = await api.listWorks()
    works.value = list.filter(w => String(w.characterId) === characterId.value)
    // 只有本账号角色才需要模型目录与最近一次 run。
    if (isOwnCharacter.value) {
      void loadCatalog()
      void loadLatestRun()
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

// 恢复自动封面（清除手动指定）
const coverBusy = ref(false)
const coverNote = ref('')

async function resetCover() {
  if (!character.value) return
  coverBusy.value = true
  coverNote.value = ''
  try {
    character.value = await api.setCharacterCover(character.value.id, 0)
    coverNote.value = '已恢复为自动封面（取最近作品产物）'
  } catch (e: unknown) {
    coverNote.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    coverBusy.value = false
  }
}

onMounted(load)
watch(characterId, load)
// 地址里的 runId 变了（前进/后退）就切到对应的那一次运行；同一页面组件不重挂时靠这里。
watch(runIdParam, () => {
  if (isOwnCharacter.value) void loadLatestRun()
})

// 角色封面/作品缩略图都是限时签名地址：过期后收到自愈信号重新取一次。
useMediaAutoRefresh(() => load())

/* ───────────── 演员资产生成 ───────────── */

/**
 * 是否展示生成区块。
 *
 * 三个条件缺一不可：
 *   ① 角色属于当前账号（`listCharacters` 里能找到它 —— 后端 ownedCharacter 口径）；
 *   ② 有源图（portrait/headshot/coverAssetId），没有源图就无从派生；
 *   ③ 有 taxonomy —— 生成提示词要靠它描述形象，缺了会生成"另一个人"。
 * 不满足时按钮禁用并**说明原因**，不给一个按了没反应的按钮。
 */
const generationGate = computed<{ allowed: boolean, reason: string }>(() => {
  const c = character.value
  if (!c) return { allowed: false, reason: '' }
  if (!isOwnCharacter.value) return { allowed: false, reason: '这不是当前账号的角色，无法为它生成资产。' }
  if (!sourceAssetId.value) return { allowed: false, reason: '这位角色还没有源图：请先在编辑页上传一张角色源图。' }
  if (!hasTaxonomy.value) return { allowed: false, reason: '这位角色还没有结构化标签：生成需要它来稳定形象，请先补全。' }
  return { allowed: true, reason: '' }
})

/** 角色是否属于当前账号（列表接口就是"我的角色"口径）。 */
const isOwnCharacter = ref(false)
/** 源图资产 id（生成接口的 sourceAssetId 由后端从角色上取，这里只用于判断"有没有源图"）。 */
const sourceAssetId = computed(() => {
  const c = character.value
  if (!c) return ''
  const fromMedia = c.media?.portrait?.assetId || c.media?.headshot?.assetId
  return fromMedia || (c.coverAssetId || '')
})
const hasTaxonomy = computed(() => !!character.value?.taxonomy && Object.keys(character.value.taxonomy).length > 0)

// ── 模型目录（复用现有目录，不另造列表）──
const catalog = ref<Catalog | null>(null)
const catalogError = ref('')

/** 可用的云端图像模型：筛选走现有 buildModelOptions 的 cloud 通道。 */
const imageModels = computed(() =>
  buildModelOptions(catalog.value, 'image').filter(m => m.channel === 'cloud' && m.available)
)
const selectedModelId = ref('')

const selectedModel = computed(() => imageModels.value.find(m => m.id === selectedModelId.value))
/** 选中模型的清晰度档（没有就不传 quality，交给后端默认）。 */
const qualityOptions = computed(() => (selectedModel.value ? cloudQualities(catalog.value, selectedModel.value.id) : []))
const selectedQuality = ref('')
/** 报价：拿不到就显示"费用待确认"，不编造数字。 */
const priceLabel = computed(() => {
  if (!selectedModel.value) return ''
  const ratio = cloudDefaultRatio(catalog.value, selectedModel.value.id) || '1:1'
  const q = quoteModel(catalog.value, selectedModel.value, { ratio, seconds: 0, count: 4 })
  if (!q) return '费用待确认'
  return `4 个任务约 ${q.amount} ${q.unit}（以实际扣费为准）`
})

async function loadCatalog() {
  catalogError.value = ''
  try {
    const res = await api.getCatalog()
    catalog.value = res
    // 默认选第一个可用图像模型（顺序即目录顺序）。
    if (!selectedModelId.value && imageModels.value.length) {
      selectedModelId.value = imageModels.value[0]!.id
    }
    syncQuality()
  } catch (e: unknown) {
    catalog.value = null
    catalogError.value = e instanceof Error ? e.message : '模型目录读取失败'
  }
}

function syncQuality() {
  const id = selectedModelId.value
  if (!id) {
    selectedQuality.value = ''
    return
  }
  const qualities = cloudQualities(catalog.value, id)
  selectedQuality.value = cloudDefaultQuality(catalog.value, id) || qualities[0] || ''
}

watch(selectedModelId, syncQuality)

// ── run 状态与轮询 ──
const run = ref<ActorGenRun | null>(null)
const runBusy = ref(false)
const runError = ref('')
const runNotice = ref('')
const retryBusy = ref<Record<string, boolean>>({})

/** 组件是否已卸载：卸载后停止轮询，且不再写状态。 */
let pollStopped = false
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollAttempts = 0
/** 后端一直不收敛时的兜底；文案会说"已停止自动刷新"，不假装还在跑。 */
const MAX_POLL_ATTEMPTS = 120
const POLL_INTERVAL_MS = 4000

function stopPolling() {
  pollStopped = true
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function schedulePoll() {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(() => void poll(), POLL_INTERVAL_MS)
}

/**
 * 轮询 run 状态。
 *
 * 权威是 GET（轮询），不是本地计时器 —— 不做假进度：界面上的每个数字都来自后端字段。
 * 到达终态后重新拉一次角色详情，让新生成的 media 出现在已有图片区。
 */
async function poll() {
  const current = run.value
  if (!current || pollStopped) return
  pollAttempts += 1
  try {
    const next = await api.getActorGeneration(characterId.value, current.id)
    if (pollStopped) return
    const wasTerminal = actorGenIsTerminal(current.status)
    run.value = next
    if (actorGenIsTerminal(next.status) && !wasTerminal) {
      // 终态：把新产物拉回来（成功资产已进 media[]，老 portrait 源图保留）。
      await reloadCharacterData()
    }
  } catch (e: unknown) {
    if (pollStopped) return
    runError.value = e instanceof Error ? e.message : '状态读取失败'
  }
  if (shouldContinuePolling()) schedulePoll()
  else if (run.value && !actorGenIsTerminal(run.value.status)) {
    runNotice.value = '自动刷新已停止，请稍后手动刷新页面查看结果。'
  }
}

function shouldContinuePolling(): boolean {
  const current = run.value
  if (!current) return false
  return shouldContinueActorGenPolling({
    status: current.status,
    stopped: pollStopped,
    attempts: pollAttempts,
    maxAttempts: MAX_POLL_ATTEMPTS
  })
}

/** 只重拉角色详情（不动作品/字典），用于生成终态后刷新 media。 */
async function reloadCharacterData() {
  try {
    const c = await api.getCharacter(characterId.value)
    if (!pollStopped) character.value = c
  } catch {
    // 重拉失败不该把页面打回错误态：留着旧的详情，用户手动刷新即可。
  }
}

/** 首次进入：读最近一次 run（同页刷新后继续显示上一次结果）；地址带 runId 就读那一次。 */
async function loadLatestRun() {
  const wanted = runIdParam.value
  try {
    run.value = wanted
      ? await api.getActorGeneration(characterId.value, wanted)
      : await api.getLatestActorGeneration(characterId.value)
  } catch {
    // 「没有跑过」与"读取失败"在这里都不该阻断页面：保持 null 即可。
    run.value = null
  }
  if (run.value && !actorGenIsTerminal(run.value.status)) {
    pollStopped = false
    pollAttempts = 0
    schedulePoll()
  }
}

async function startGeneration() {
  if (!generationGate.value.allowed || runBusy.value) return
  if (!selectedModelId.value) {
    runError.value = '请先选择一个图像模型'
    return
  }
  runBusy.value = true
  runError.value = ''
  runNotice.value = ''
  try {
    const started = await api.startActorGeneration(characterId.value, {
      modelId: selectedModelId.value,
      ...(selectedQuality.value ? { quality: selectedQuality.value } : {})
    })
    run.value = started
    pollStopped = false
    pollAttempts = 0
    // 把这次 run 写进地址（/actors/mine/:id/generation/:runId）：刷新/分享/后退都回到它。
    if (started.id && runIdParam.value !== String(started.id)) {
      void router.replace(myActorGenerationPath(characterId.value, started.id))
    }
    if (!actorGenIsTerminal(started.status)) schedulePoll()
  } catch (e: unknown) {
    runError.value = e instanceof Error ? e.message : '发起生成失败'
  } finally {
    runBusy.value = false
  }
}

async function retryRole(role: ActorGenRole) {
  const current = run.value
  if (!current || retryBusy.value[role.role]) return
  retryBusy.value = { ...retryBusy.value, [role.role]: true }
  runError.value = ''
  try {
    const next = await api.retryActorGeneration(characterId.value, current.id)
    run.value = next
    pollStopped = false
    pollAttempts = 0
    if (!actorGenIsTerminal(next.status)) schedulePoll()
  } catch (e: unknown) {
    runError.value = e instanceof Error ? e.message : '重试失败'
  } finally {
    const rest = { ...retryBusy.value }
    delete rest[role.role]
    retryBusy.value = rest
  }
}

/** 把 run.roles 按固定顺序补全：后端只回已建的 role 时，界面仍显示 4 格。 */
const runRoles = computed(() => {
  const byRole = new Map((run.value?.roles || []).map(r => [r.role, r]))
  const ordered = ACTOR_GEN_ROLES.map(item => byRole.get(item.role) || {
    role: item.role,
    kind: item.role,
    status: 'pending',
    taskId: '',
    assetIds: [],
    assetCount: 0,
    error: ''
  } as ActorGenRole)
  // 后端若有固定 4 个之外的新 role，也照实显示，不隐藏。
  const extra = (run.value?.roles || []).filter(r => !ACTOR_GEN_ROLES.some(item => item.role === r.role))
  return [...ordered, ...extra]
})

/** 不支持的 role 展示：已知项给稳定文案，未知项用后端给的原因。 */
const unsupportedRoles = computed(() =>
  (run.value?.unsupportedRoles || []).map(item => ({
    role: item.role,
    label: actorGenRoleLabel(item.role),
    reason: actorGenUnsupportedReason(item.role) || item.reason || '当前版本不支持'
  }))
)

/** 是否已有一次**还在跑**的运行（用于按钮禁用与措辞）。 */
const isRunActive = computed(() => !!run.value && !actorGenIsTerminal(run.value.status))

onUnmounted(stopPolling)
</script>

<template>
  <div
    v-if="loading"
    class="page-body"
  >
    <p class="empty-tip">
      正在加载角色…
    </p>
  </div>

  <div
    v-else-if="character"
    class="page-body"
  >
    <div class="detail-grid">
      <div>
        <div class="media-frame portrait">
          <img
            v-if="character.coverUrl"
            :src="character.coverUrl"
            :alt="character.name"
          >
          <div
            v-else
            class="portrait-placeholder"
          >
            <span>{{ character.name.slice(0, 1) }}</span>
          </div>
          <span
            class="story-wash"
            aria-hidden="true"
          />
          <div class="story-info">
            <small>{{ character.age }}</small>
            <h3>{{ character.name }}</h3>
            <div><span>{{ character.alias }}</span></div>
          </div>
        </div>
      </div>

      <div class="media-detail">
        <p class="detail-kicker">
          角色设定<template v-if="character.coverAssetId">
            · 手动封面
          </template>
        </p>
        <h1 class="detail-title">
          {{ character.name }}
        </h1>
        <p class="detail-desc">
          {{ character.tagline }}
        </p>

        <div class="detail-actions">
          <NuxtLink
            to="/actors"
            class="btn-primary"
          >演员库</NuxtLink>
          <NuxtLink
            :to="myActorEditPath(character.id)"
            class="btn-ghost"
          >编辑档案</NuxtLink>
          <button
            v-if="character.coverAssetId"
            type="button"
            class="btn-ghost"
            :disabled="coverBusy"
            @click="resetCover"
          >
            恢复自动封面
          </button>
        </div>

        <p
          v-if="coverNote"
          class="empty-tip"
        >
          {{ coverNote }}
        </p>

        <p class="hint">
          创作页尚未开放「选择演员」的入口，本页不提供按了没反应的「用她创作」；
          该演员已保存，可在演员库统一管理，入口开放后即可直接引用。
        </p>

        <p
          v-if="showGeneration"
          class="hint"
        >
          生成状态：<b>{{ generationLabel }}</b> —— 后台生成流水线尚未接入，当前只保存已上传的源图。
        </p>
        <p
          v-if="character.sourceActorId"
          class="hint"
        >
          复制自平台演员 #{{ character.sourceActorId }}
        </p>

        <section
          v-if="taxonomyTags.length"
          class="panel-block"
        >
          <h2>结构化标签</h2>
          <div class="tag-row">
            <span
              v-for="tag in taxonomyTags"
              :key="`${tag.label}-${tag.value}`"
              class="chip"
            >{{ tag.value }}</span>
          </div>
        </section>

        <section
          v-if="mediaSlots.length"
          class="panel-block"
        >
          <h2>图片</h2>
          <div class="hg-media-grid">
            <figure
              v-for="slot in mediaSlots"
              :key="slot.key"
            >
              <img
                :src="character.media?.[slot.key]?.url"
                :alt="`${character.name} · ${slot.label}`"
                loading="lazy"
              >
              <figcaption>{{ slot.label }}</figcaption>
            </figure>
          </div>
        </section>

        <section
          v-if="voices.length || voiceWithoutUrl"
          class="panel-block"
        >
          <h2>音色</h2>
          <div class="hg-voice-list">
            <figure
              v-for="(voice, i) in voices"
              :key="voice.id || i"
            >
              <figcaption>{{ voice.name || `音色 ${i + 1}` }}</figcaption>
              <!-- preload=none：签名地址是限时的，不进页面就加载会白白拉流量 -->
              <audio
                class="hg-audio"
                controls
                preload="none"
                :src="voice.url"
                :aria-label="`${character.name} 的音色${voice.name ? ` · ${voice.name}` : ''}`"
              />
            </figure>
          </div>
          <p
            v-if="voiceWithoutUrl"
            class="hint"
          >
            有 {{ voiceWithoutUrl }} 条音色登记，但后端没有下发可播放地址。
          </p>
        </section>

        <section
          v-if="isOwnCharacter"
          class="panel-block gen-block"
          aria-labelledby="actor-gen-heading"
        >
          <h2 id="actor-gen-heading">
            生成演员资产
          </h2>
          <p class="hint">
            从这张源图派生 <b>头像 / 全身 / 表情集 / 三视图</b> 四类视觉资产，
            会创建 <b>4 个图像任务，可能产生费用</b>。产物完成后会出现在上方「图片」区，
            源图保留不变。
          </p>

          <!-- 模型选择：来自现有目录（云端可用图像模型）。选不到就如实说明，不编造列表。 -->
          <div class="gen-form">
            <label class="gen-field">
              <span>图像模型</span>
              <select
                v-model="selectedModelId"
                class="gen-select"
                :disabled="!generationGate.allowed || runBusy"
                aria-label="选择生成用的图像模型"
              >
                <option value="">
                  {{ imageModels.length ? '请选择模型' : '没有可用的图像模型' }}
                </option>
                <option
                  v-for="m in imageModels"
                  :key="m.id"
                  :value="m.id"
                >
                  {{ m.name }}
                </option>
              </select>
            </label>
            <label
              v-if="qualityOptions.length"
              class="gen-field"
            >
              <span>清晰度</span>
              <select
                v-model="selectedQuality"
                class="gen-select"
                :disabled="!generationGate.allowed || runBusy"
                aria-label="选择清晰度"
              >
                <option
                  v-for="q in qualityOptions"
                  :key="q"
                  :value="q"
                >
                  {{ q }}
                </option>
              </select>
            </label>
          </div>

          <p
            v-if="!imageModels.length"
            class="hint"
          >
            <template v-if="catalogError">
              模型目录读取失败：{{ catalogError }}
            </template>
            <template v-else>
              目录里暂时没有可用的云端图像模型：请让运营在后台启用一个图像模型后再来。
            </template>
          </p>
          <p
            v-else-if="priceLabel"
            class="hint"
          >
            {{ priceLabel }}
          </p>

          <p
            v-if="!generationGate.allowed"
            class="hint gen-disabled"
          >
            {{ generationGate.reason }}
          </p>

          <div class="gen-actions">
            <button
              type="button"
              class="btn-primary"
              :disabled="!generationGate.allowed || !selectedModelId || runBusy || isRunActive"
              @click="startGeneration"
            >
              {{ runBusy ? '正在创建任务…' : (isRunActive ? '生成中…' : '开始生成') }}
            </button>
          </div>

          <p
            v-if="runError"
            class="form-error"
            role="alert"
          >
            {{ runError }}
          </p>

          <!-- 最近一次运行：刷新页面后继续显示（不从本地计时器编进度） -->
          <div
            v-if="run"
            class="gen-run"
          >
            <p class="gen-run__head">
              <strong>{{ actorGenSummary(run) }}</strong>
              <small>模型 {{ run.modelId || '—' }} · 运行 #{{ run.id }}</small>
            </p>
            <p
              v-if="run.error"
              class="hint"
            >
              {{ run.error }}
            </p>
            <ul
              class="gen-roles"
              aria-label="各资产生成状态"
            >
              <li
                v-for="r in runRoles"
                :key="r.role"
                class="gen-role"
                :class="`is-${r.status}`"
              >
                <span class="gen-role__name">{{ actorGenRoleLabel(r.role) }}</span>
                <span class="gen-role__status">{{ actorGenStatusLabel(r.status) }}</span>
                <span class="gen-role__count">
                  <!-- 只显示后端给的 assetCount，不预估张数 -->
                  <template v-if="r.assetCount">{{ r.assetCount }} 张</template>
                  <template v-else>—</template>
                </span>
                <button
                  v-if="actorGenRoleNeedsRetry(r.status)"
                  type="button"
                  class="gen-retry"
                  :disabled="retryBusy[r.role]"
                  :aria-label="`重试 ${actorGenRoleLabel(r.role)}`"
                  @click="retryRole(r)"
                >
                  {{ retryBusy[r.role] ? '重试中…' : '重试' }}
                </button>
                <small
                  v-if="r.error"
                  class="gen-role__error"
                >{{ r.error }}</small>
              </li>
            </ul>

            <!-- 明确不支持的能力：如实说明，不放假播放器 -->
            <ul
              v-if="unsupportedRoles.length"
              class="gen-unsupported"
              aria-label="暂不支持的资产"
            >
              <li
                v-for="u in unsupportedRoles"
                :key="u.role"
              >
                <strong>{{ u.label }}</strong>
                <small>{{ u.reason }}</small>
              </li>
            </ul>

            <p
              v-if="runNotice"
              class="hint"
            >
              {{ runNotice }}
            </p>
          </div>
        </section>

        <section class="panel-block">
          <h2>性格</h2>
          <div class="tag-row">
            <span
              v-for="t in character.traits"
              :key="t"
              class="chip"
            >{{ t }}</span>
          </div>
        </section>

        <section class="panel-block">
          <h2>外观锚点</h2>
          <p class="hint">
            生成时按这些特征保持形象一致
          </p>
          <dl class="spec-list">
            <div
              v-for="item in character.appearance"
              :key="item.label"
              class="spec-row"
            >
              <dt class="spec-label">
                {{ item.label }}
              </dt>
              <dd class="spec-value">
                {{ item.value }}
              </dd>
            </div>
            <p
              v-if="!character.appearance.length"
              class="hint"
            >
              还没有外观锚点。
            </p>
          </dl>
        </section>

        <section class="panel-block">
          <h2>服装预设</h2>
          <p class="hint">
            本次出演造型与档案分离，历史任务保留当时快照
          </p>
          <div
            v-if="character.outfits.length"
            class="outfit-row"
          >
            <div
              v-for="o in character.outfits"
              :key="o.id"
              class="outfit-item"
              :class="{ current: o.current }"
            >
              <span
                class="outfit-swatch"
                :style="{ background: o.swatch }"
                aria-hidden="true"
              />
              <strong>{{ o.name }}</strong>
              <small>{{ o.note }}</small>
              <span
                v-if="o.current"
                class="current-tag"
              >当前默认</span>
              <span
                v-else
                class="history-tag"
              >历史</span>
            </div>
          </div>
          <p
            v-else
            class="hint"
          >
            还没有服装预设。
          </p>
        </section>
      </div>
    </div>

    <section style="margin-top: 56px">
      <div class="page-head">
        <div>
          <h1 style="font-size: 24px">
            她的作品
          </h1>
          <p>{{ works.length }} 部 · 每次任务保存实际配置快照</p>
        </div>
      </div>
      <p
        v-if="!works.length"
        class="empty-tip"
      >
        还没有作品。用她创作一次，产物会自动入库并归到这个角色下。
      </p>
      <div class="story-grid">
        <AppWorkCard
          v-for="(w, i) in works"
          :key="w.id"
          :work="toCard(w)"
          :index="i"
          :character-name="character.name"
        />
      </div>
    </section>
  </div>

  <div
    v-else
    class="empty-state"
  >
    <p>{{ error ? `加载失败：${error}` : '没有找到这位角色' }}</p>
    <NuxtLink
      to="/actors/mine"
      class="btn-ghost small"
      style="margin-top: 16px; display: inline-flex"
    >返回我的演员</NuxtLink>
  </div>
</template>

<style scoped>
.portrait-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(160deg, #2b2b31, #171717);
  color: var(--amber-soft);
  font-size: clamp(48px, 7vw, 96px);
  font-weight: 800;
}
.hg-media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}
.hg-media-grid figure {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #141416;
}
.hg-media-grid img {
  display: block;
  width: 100%;
  aspect-ratio: 3 / 4;
  object-fit: cover;
}
.hg-media-grid figcaption {
  padding: 6px 8px;
  color: var(--faint);
  font-size: 11px;
}
.hg-voice-list {
  display: grid;
  gap: 12px;
}
.hg-voice-list figure {
  margin: 0;
}
.hg-voice-list figcaption {
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 12px;
}
.hg-audio {
  width: min(420px, 100%);
}

/* ── 生成演员资产 ── */
.gen-block {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 18px;
  background: rgb(255 255 255 / 2%);
}
.gen-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  margin: 12px 0;
}
.gen-field {
  display: grid;
  gap: 6px;
  min-width: 200px;
  color: var(--muted);
  font-size: 12px;
}
.gen-select {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgb(255 255 255 / 3%);
  color: var(--ink);
  font-family: inherit;
  font-size: 13px;
}
.gen-select:disabled {
  opacity: 0.55;
}
.gen-select:focus-visible,
.gen-retry:focus-visible {
  outline: 2px solid var(--hg-accent);
  outline-offset: 2px;
}
.gen-disabled {
  color: #f0a5ac;
}
.gen-actions {
  margin: 8px 0 12px;
}
.gen-run {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.gen-run__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 8px;
}
.gen-run__head small {
  color: var(--faint);
  font-size: 11px;
}
.gen-roles {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.gen-role {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
}
.gen-role.is-succeeded {
  border-color: rgb(46 223 154 / 35%);
}
.gen-role.is-failed {
  border-color: rgb(217 83 79 / 45%);
}
.gen-role__name {
  min-width: 56px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
}
.gen-role__status {
  color: var(--muted);
  font-size: 12px;
}
.gen-role__count {
  color: var(--faint);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.gen-role__error {
  flex: 1 1 100%;
  color: #f0a5ac;
  font-size: 11.5px;
}
.gen-retry {
  min-height: 36px;
  margin-left: auto;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--hg-accent-hi);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.gen-retry:disabled {
  opacity: 0.55;
  cursor: default;
}
.gen-unsupported {
  display: grid;
  gap: 4px;
  margin: 10px 0 0;
  padding: 10px 12px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  list-style: none;
}
.gen-unsupported li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}
.gen-unsupported strong {
  color: var(--muted);
  font-size: 12px;
}
.gen-unsupported small {
  color: var(--faint);
  font-size: 11.5px;
}
</style>

<style scoped>
.history-tag {
  color: var(--text-dim, #8a8f98);
  font-size: 12px;
}
</style>
