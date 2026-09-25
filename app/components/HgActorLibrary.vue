<script setup lang="ts">
// 演员库 —— 平台演员（/actors）与我的演员（/actors/mine）共用的组件，来源由路由决定。
//
// 两个来源，两套真相：
//   平台演员 = 运营维护的公共库，走**真实分页接口** `GET /hougong/actors`
//              （筛选/排序/分页全部服务端做；facets 给筛选面板的可选值）。
//   我的演员 = 本账号自建 / 从平台复制来的角色，沿用 `GET /hougong/characters`。
//
// 公共库只读：收藏（POST/DELETE …/favorite）与复制到我的演员（POST …/clone）是仅有的两个写动作。
// 复制成功后回「我的演员」页（/actors/mine）—— 不再跳到旧的 /characters 列表。
import {
  ACTOR_TAXONOMY_FIELDS,
  actorCardMedia,
  actorGenerationLabel,
  actorShowsGeneration
} from '~/utils/actor'
import { actorSourcePath, myActorEditPath, myActorPath } from '~/utils/routes'
import type { ActorSource } from '~/utils/routes'

const api = useHougongApi()
const session = useAuthSession()

/**
 * 来源由**地址**决定（/actors = 平台，/actors/mine = 我的），不再靠 ?source= 组件状态。
 * 这样刷新、后退、分享都停在同一来源；切来源就是切页面。
 */
const props = withDefaults(defineProps<{ source?: ActorSource }>(), { source: 'platform' })
const source = computed(() => props.source)
/** 平台演员接口需要登录（匿名会 401）：未登录时不发请求，页面给出登录提示。 */
const loggedIn = computed(() => !!session.token.value)

const PAGE_SIZE = 24

// ── 平台演员 ──
const platform = reactive({
  items: [] as ActorItem[],
  total: 0,
  page: 1,
  loading: false,
  error: '',
  facets: {} as ActorFacets
})
const filters = reactive({
  keyword: '',
  // 首屏两维：时代大类 + 地区。
  eraCategory: '',
  region: '',
  // 更多筛选：具体时代 + 其余维度。
  era: '',
  gender: '',
  ageGroup: '',
  species: '',
  bodyType: '',
  height: '',
  skinTone: '',
  hairLength: '',
  hairColor: '',
  temperament: [] as string[],
  favorite: false,
  sort: 'recommended' as ActorListQuery['sort'] & string
})
const moreOpen = ref(false)
const favoriteBusy = ref<Record<string, boolean>>({})

const pageCount = computed(() => Math.max(1, Math.ceil(platform.total / PAGE_SIZE)))
/** 首屏之外（更多筛选里）是否已选中任何维度，用于「更多筛选」上的小圆点提示。 */
const hasMoreFilters = computed(() =>
  !!filters.era || !!filters.gender || !!filters.ageGroup || !!filters.species || !!filters.bodyType
  || !!filters.height || !!filters.skinTone || !!filters.hairLength || !!filters.hairColor
  || filters.temperament.length > 0
)

/** 单个筛选维度用哪些选项：只认后端 facets 给的，没给就不渲染（不猜选项）。 */
function facetOptions(key: string) {
  const list = (platform.facets as Record<string, { value: string, label?: string }[] | undefined>)[key]
  return list || []
}

// 卡片已按参考站收敛为「图片 + 收藏 + 名称」：taxonomy 标签只在**详情页**展示。
// 中文 label 映射没有丢 —— 它在详情页（HgActorDetail / characters/[id]）继续使用，
// 与筛选区的 facets 展示同源（utils/actor 的 buildFacetLabelMap）。

/** 「全部」= 清关键词/筛选、回到推荐序。 */
function showAll() {
  resetFilters()
}

/** 「最近」= 只看最新（sort=newest），并清掉其他筛选与关键词。 */
function showRecent() {
  resetFilters()
  filters.sort = 'newest'
}

/** 当前是否处于「全部」态（无任何筛选 + 推荐序），用于按钮高亮。 */
const isAllActive = computed(() =>
  !filters.keyword.trim()
  && !filters.eraCategory && !filters.era && !filters.region
  && !filters.gender && !filters.ageGroup && !filters.species && !filters.bodyType
  && !filters.height && !filters.skinTone && !filters.hairLength && !filters.hairColor
  && filters.temperament.length === 0
  && !filters.favorite
  && filters.sort === 'recommended'
)

/** 「最近」态：最新序且没有其它筛选（否则高亮「全部」更诚实）。 */
const isRecentActive = computed(() => filters.sort === 'newest' && !filters.keyword.trim()
  && !filters.eraCategory && !filters.era && !filters.region
  && !filters.gender && !filters.ageGroup && !filters.species && !filters.bodyType
  && !filters.height && !filters.skinTone && !filters.hairLength && !filters.hairColor
  && filters.temperament.length === 0 && !filters.favorite)

function buildQuery(page: number): ActorListQuery {
  return {
    keyword: filters.keyword.trim(),
    eraCategory: filters.eraCategory,
    era: filters.era,
    region: filters.region,
    gender: filters.gender,
    ageGroup: filters.ageGroup,
    species: filters.species,
    bodyType: filters.bodyType,
    height: filters.height,
    skinTone: filters.skinTone,
    hairLength: filters.hairLength,
    hairColor: filters.hairColor,
    temperament: filters.temperament,
    favorite: filters.favorite,
    sort: filters.sort,
    page,
    pageSize: PAGE_SIZE
  }
}

// seq 是竞态闸门：连续切筛选时，先发的请求可能后到，旧结果会盖掉新结果。
let seq = 0

async function loadPlatform(page = 1) {
  // 平台演员接口需要登录：匿名直接请求会换回 401（控制台报错）。这里不发。
  await session.load()
  if (!loggedIn.value) return
  const mine = ++seq
  platform.loading = true
  platform.error = ''
  try {
    const res = await api.listActors(buildQuery(page))
    if (mine !== seq) return
    platform.items = res.items
    platform.total = res.total
    platform.page = res.page || page
    // 分面跟着筛选变化：只在请求确实是当前筛选时覆盖，避免旧请求的 facets 盖掉新的。
    if (Object.keys(res.facets).length) platform.facets = res.facets
  } catch (e: unknown) {
    if (mine !== seq) return
    platform.error = e instanceof Error ? e.message : '加载失败'
    platform.items = []
    platform.total = 0
  } finally {
    if (mine === seq) platform.loading = false
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => filters.keyword, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void loadPlatform(1), 300)
})
watch(
  () => [
    filters.eraCategory, filters.era, filters.region, filters.gender, filters.ageGroup, filters.species,
    filters.bodyType, filters.height, filters.skinTone, filters.hairLength, filters.hairColor,
    filters.favorite, filters.sort, filters.temperament.join(',')
  ],
  () => {
    if (searchTimer) clearTimeout(searchTimer)
    void loadPlatform(1)
  }
)

function toggleTemperament(value: string) {
  const i = filters.temperament.indexOf(value)
  if (i >= 0) filters.temperament.splice(i, 1)
  else filters.temperament.push(value)
}

function resetFilters() {
  filters.keyword = ''
  for (const field of ACTOR_TAXONOMY_FIELDS) {
    (filters as Record<string, unknown>)[field.key] = ''
  }
  filters.temperament = []
  filters.favorite = false
  filters.sort = 'recommended'
}

async function toggleFavorite(item: ActorItem) {
  if (!item.id || favoriteBusy.value[item.id]) return
  const next = !item.favorite
  favoriteBusy.value = { ...favoriteBusy.value, [item.id]: true }
  // 乐观更新：失败回滚，并把原因显示出来（不静默吞掉）。
  item.favorite = next
  try {
    const res = await api.favoriteActor(item.id, next)
    item.favorite = res.favorited
  } catch (e: unknown) {
    item.favorite = !next
    platform.error = e instanceof Error ? e.message : '收藏操作失败'
  } finally {
    const rest = { ...favoriteBusy.value }
    delete rest[item.id]
    favoriteBusy.value = rest
  }
}

// ── 我的演员 ──
const mineState = reactive({
  items: [] as CharacterItem[],
  loading: false,
  error: ''
})

async function loadMine() {
  await session.load()
  if (!session.token.value) {
    mineState.items = []
    return
  }
  mineState.loading = true
  mineState.error = ''
  try {
    mineState.items = await api.listCharacters()
  } catch (e: unknown) {
    mineState.error = e instanceof Error ? e.message : '加载失败'
    mineState.items = []
  } finally {
    mineState.loading = false
  }
}

/** 切换来源 = 换地址（/actors ↔ /actors/mine）；数据由目标页自己按需加载。 */
function activate(next: ActorSource) {
  if (next === props.source) return
  void navigateTo(actorSourcePath(next))
}

async function removeMine(c: CharacterItem) {
  if (!window.confirm(`删除演员「${c.name}」？`)) return
  try {
    await api.deleteCharacter(c.id)
    mineState.items = mineState.items.filter(x => x.id !== c.id)
  } catch (e: unknown) {
    mineState.error = e instanceof Error ? e.message : '删除失败'
  }
}

/** 卡片媒体：肖像 + 全身双图块（缺图时的回退由纯函数决定，见 utils/actor）。 */
function cardMedia(item: ActorItem) {
  return actorCardMedia(item.media, item.coverUrl)
}

onMounted(() => {
  void loadPlatform(1)
  void loadMine()
})

// 签名地址过期自愈：只重取当前来源的数据。
useMediaAutoRefresh(() => {
  if (props.source === 'platform') void loadPlatform(platform.page)
  else void loadMine()
})
</script>

<template>
  <section class="actor-lib">
    <div class="actor-bar">
      <!-- 来源分段控件：平台 / 我的。同一件事的两个来源，不是两个功能。 -->
      <div
        class="actor-seg"
        role="tablist"
        aria-label="演员来源"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="source === 'platform'"
          class="actor-seg__btn"
          :class="{ active: source === 'platform' }"
          @click="activate('platform')"
        >
          平台演员
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="source === 'mine'"
          class="actor-seg__btn"
          :class="{ active: source === 'mine' }"
          @click="activate('mine')"
        >
          我的演员 <b>{{ mineState.items.length }}</b>
        </button>
      </div>
      <NuxtLink
        v-if="source === 'mine'"
        class="actor-new"
        to="/actors/new"
      >
        + 新建演员
      </NuxtLink>
    </div>

    <!-- ───────────── 平台演员 ───────────── -->
    <template v-if="source === 'platform'">
      <!-- 参考站结构：筛选纵向堆叠在内容左上（不是横向 toolbar、也不是独立侧栏），
           同一行右侧是搜索框；网格在它们**下方**铺满内容宽度。 -->
      <div class="actor-head">
        <aside
          class="actor-filters"
          aria-label="演员筛选"
        >
          <div
            class="actor-quick"
            role="group"
            aria-label="快捷筛选"
          >
            <button
              type="button"
              class="actor-quick__btn"
              :class="{ active: isAllActive }"
              :aria-pressed="isAllActive"
              @click="showAll"
            >
              全部
            </button>
            <button
              type="button"
              class="actor-quick__btn"
              :class="{ active: isRecentActive }"
              :aria-pressed="isRecentActive"
              @click="showRecent"
            >
              最近
            </button>
          </div>

          <label class="actor-field">
            <span class="sr-only">时代大类</span>
            <select
              v-model="filters.eraCategory"
              class="actor-select"
              aria-label="全部时代大类"
            >
              <option value="">
                全部时代大类
              </option>
              <option
                v-for="opt in facetOptions('eraCategory')"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label || opt.value }}
              </option>
            </select>
          </label>

          <label class="actor-field">
            <span class="sr-only">地区</span>
            <select
              v-model="filters.region"
              class="actor-select"
              aria-label="全部地区"
            >
              <option value="">
                全部地区
              </option>
              <option
                v-for="opt in facetOptions('region')"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label || opt.value }}
              </option>
            </select>
          </label>

          <button
            type="button"
            class="actor-toggle"
            :class="{ active: filters.favorite }"
            :aria-pressed="filters.favorite"
            @click="filters.favorite = !filters.favorite"
          >
            <UIcon
              name="i-lucide-heart"
              aria-hidden="true"
            />
            我的收藏
          </button>

          <button
            type="button"
            class="actor-more"
            :aria-expanded="moreOpen"
            aria-controls="actor-more-filters"
            @click="moreOpen = !moreOpen"
          >
            更多筛选
            <span
              v-if="hasMoreFilters"
              class="actor-more__dot"
              aria-hidden="true"
            />
            <UIcon
              :name="moreOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              aria-hidden="true"
            />
          </button>

          <div
            v-show="moreOpen"
            id="actor-more-filters"
            class="actor-more-panel"
          >
            <label class="actor-select-field">
              <span>具体时代</span>
              <select
                v-model="filters.era"
                class="actor-select"
                aria-label="全部具体时代"
              >
                <option value="">
                  全部具体时代
                </option>
                <option
                  v-for="opt in facetOptions('era')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>
            <label class="actor-select-field">
              <span>性别</span>
              <select
                v-model="filters.gender"
                class="actor-select"
                aria-label="全部性别"
              >
                <option value="">
                  全部性别
                </option>
                <option
                  v-for="opt in facetOptions('gender')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>
            <label class="actor-select-field">
              <span>年龄段</span>
              <select
                v-model="filters.ageGroup"
                class="actor-select"
                aria-label="全部年龄段"
              >
                <option value="">
                  全部年龄段
                </option>
                <option
                  v-for="opt in facetOptions('ageGroup')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>
            <label class="actor-select-field">
              <span>物种</span>
              <select
                v-model="filters.species"
                class="actor-select"
                aria-label="全部物种"
              >
                <option value="">
                  全部物种
                </option>
                <option
                  v-for="opt in facetOptions('species')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>
            <label class="actor-select-field">
              <span>体型</span>
              <select
                v-model="filters.bodyType"
                class="actor-select"
                aria-label="全部体型"
              >
                <option value="">
                  全部体型
                </option>
                <option
                  v-for="opt in facetOptions('bodyType')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>
            <label class="actor-select-field">
              <span>身高</span>
              <select
                v-model="filters.height"
                class="actor-select"
                aria-label="全部身高"
              >
                <option value="">
                  全部身高
                </option>
                <option
                  v-for="opt in facetOptions('height')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>
            <label class="actor-select-field">
              <span>肤色</span>
              <select
                v-model="filters.skinTone"
                class="actor-select"
                aria-label="全部肤色"
              >
                <option value="">
                  全部肤色
                </option>
                <option
                  v-for="opt in facetOptions('skinTone')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>
            <label class="actor-select-field">
              <span>发长</span>
              <select
                v-model="filters.hairLength"
                class="actor-select"
                aria-label="全部发长"
              >
                <option value="">
                  全部发长
                </option>
                <option
                  v-for="opt in facetOptions('hairLength')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>
            <label class="actor-select-field">
              <span>发色</span>
              <select
                v-model="filters.hairColor"
                class="actor-select"
                aria-label="全部发色"
              >
                <option value="">
                  全部发色
                </option>
                <option
                  v-for="opt in facetOptions('hairColor')"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label || opt.value }}
                </option>
              </select>
            </label>

            <div class="actor-temperament">
              <span>气质（可多选）</span>
              <div class="actor-chips">
                <button
                  v-for="opt in facetOptions('temperament')"
                  :key="opt.value"
                  type="button"
                  class="actor-chip"
                  :class="{ active: filters.temperament.includes(opt.value) }"
                  :aria-pressed="filters.temperament.includes(opt.value)"
                  @click="toggleTemperament(opt.value)"
                >
                  {{ opt.label || opt.value }}
                </button>
                <small v-if="!facetOptions('temperament').length">暂无可选气质</small>
              </div>
            </div>

            <button
              type="button"
              class="actor-reset"
              @click="resetFilters"
            >
              重置筛选
            </button>
          </div>
        </aside>

        <div class="actor-head__main">
          <label class="actor-search">
            <span class="sr-only">搜索演员</span>
            <UIcon
              name="i-lucide-search"
              aria-hidden="true"
            />
            <input
              v-model="filters.keyword"
              type="search"
              placeholder="搜索演员名称 / 关键词"
              aria-label="搜索演员"
            >
          </label>
          <p class="actor-count">
            <!-- 加载中不显示上一次的数字：切筛选时旧数字会让人以为筛选没生效 -->
            <template v-if="platform.loading && !platform.items.length">
              正在读取演员…
            </template>
            <template v-else>
              {{ platform.total }} 位演员 · 平台只读
            </template>
          </p>
        </div>
      </div>

      <p
        v-if="!loggedIn"
        class="actor-state"
        role="status"
      >
        登录后可以浏览平台演员库。
      </p>

      <p
        v-else-if="platform.error"
        class="actor-state actor-state--error"
        role="alert"
      >
        {{ platform.error }}
        <button
          type="button"
          class="actor-retry"
          @click="loadPlatform(platform.page)"
        >
          重试
        </button>
      </p>

      <div
        v-else-if="platform.loading && !platform.items.length"
        class="actor-grid"
        aria-hidden="true"
      >
        <span
          v-for="i in 6"
          :key="i"
          class="actor-skeleton"
        />
      </div>

      <template v-else-if="platform.items.length">
        <div class="actor-grid">
          <article
            v-for="item in platform.items"
            :key="item.id"
            class="actor-card"
            :class="`is-${cardMedia(item).mode}`"
          >
            <NuxtLink
              class="actor-frame"
              :to="`/actors/${item.id}`"
              :aria-label="`查看演员 ${item.name}`"
            >
              <!-- 双图块：左肖像、右全身，各自 object-fit: contain（深色底、极细分隔）。
                   缺全身 → 肖像居中铺满；两张都没有 → 封面；再没有 → 首字占位。 -->
              <span
                v-if="cardMedia(item).mode === 'pair'"
                class="actor-frame__half"
              >
                <img
                  :src="cardMedia(item).portrait"
                  :alt="`${item.name} 肖像`"
                  loading="lazy"
                >
              </span>
              <span
                v-if="cardMedia(item).mode === 'pair'"
                class="actor-frame__half"
              >
                <img
                  :src="cardMedia(item).fullBody"
                  :alt="`${item.name} 全身`"
                  loading="lazy"
                >
              </span>
              <img
                v-else-if="cardMedia(item).mode === 'single' && cardMedia(item).portrait"
                :src="cardMedia(item).portrait"
                :alt="item.name"
                loading="lazy"
              >
              <img
                v-else-if="cardMedia(item).mode === 'single'"
                :src="cardMedia(item).fallback"
                :alt="item.name"
                loading="lazy"
              >
              <span
                v-else
                class="actor-fallback"
                aria-hidden="true"
              >{{ item.name.slice(0, 1) }}</span>
              <span
                class="actor-scrim"
                aria-hidden="true"
              />
              <span class="actor-name">{{ item.name }}</span>
            </NuxtLink>
            <button
              type="button"
              class="actor-fav"
              :class="{ active: item.favorite }"
              :aria-pressed="!!item.favorite"
              :aria-label="item.favorite ? `取消收藏 ${item.name}` : `收藏 ${item.name}`"
              :disabled="favoriteBusy[item.id]"
              @click="toggleFavorite(item)"
            >
              <UIcon
                name="i-lucide-heart"
                aria-hidden="true"
              />
            </button>
            <small class="actor-meta actor-meta--in">
              <!-- imageCount/outfitCount 是后端真实计数，直接显示；没有就不写这行。 -->
              <template v-if="item.imageCount">
                {{ item.imageCount }} 图
              </template>
              <template v-if="item.imageCount && item.outfitCount">
                ·
              </template>
              <template v-if="item.outfitCount">
                {{ item.outfitCount }} 造型
              </template>
            </small>
          </article>
        </div>

        <nav
          class="actor-pager"
          aria-label="演员分页"
        >
          <button
            type="button"
            class="actor-page-btn"
            :disabled="platform.page <= 1 || platform.loading"
            @click="loadPlatform(platform.page - 1)"
          >
            上一页
          </button>
          <span class="actor-page-now">第 {{ platform.page }} / {{ pageCount }} 页 · 共 {{ platform.total }} 位</span>
          <button
            type="button"
            class="actor-page-btn"
            :disabled="platform.page >= pageCount || platform.loading"
            @click="loadPlatform(platform.page + 1)"
          >
            下一页
          </button>
        </nav>
      </template>

      <div
        v-else
        class="actor-empty"
      >
        <p>{{ filters.favorite ? '还没有收藏的演员' : '没有符合条件的演员' }}</p>
        <small>换个筛选条件试试；公共库的可选标签由后端 facets 下发，没给值的维度这里不会显示。</small>
        <button
          v-if="hasMoreFilters || filters.keyword || filters.favorite"
          type="button"
          class="actor-empty-cta"
          @click="resetFilters"
        >
          重置筛选
        </button>
      </div>
    </template>

    <!-- ───────────── 我的演员 ───────────── -->
    <template v-else>
      <p class="actor-rule">
        自建与复制来的演员默认<b>私有</b>，只有你自己能用。
      </p>

      <p
        v-if="mineState.error"
        class="actor-state actor-state--error"
        role="alert"
      >
        {{ mineState.error }}
        <button
          type="button"
          class="actor-retry"
          @click="loadMine"
        >
          重试
        </button>
      </p>

      <p
        v-else-if="mineState.loading && !mineState.items.length"
        class="actor-state"
      >
        正在读取演员…
      </p>

      <div
        v-else-if="mineState.items.length"
        class="actor-grid"
      >
        <article
          v-for="item in mineState.items"
          :key="item.id"
          class="actor-card"
          :class="`is-${cardMedia(item).mode}`"
        >
          <NuxtLink
            class="actor-frame"
            :to="myActorPath(item.id)"
            :aria-label="`查看演员 ${item.name}`"
          >
            <!-- 与平台卡片同一套双图块（我的演员也有 media 数组，口径一致）。 -->
            <span
              v-if="cardMedia(item).mode === 'pair'"
              class="actor-frame__half"
            >
              <img
                :src="cardMedia(item).portrait"
                :alt="`${item.name} 肖像`"
                loading="lazy"
              >
            </span>
            <span
              v-if="cardMedia(item).mode === 'pair'"
              class="actor-frame__half"
            >
              <img
                :src="cardMedia(item).fullBody"
                :alt="`${item.name} 全身`"
                loading="lazy"
              >
            </span>
            <img
              v-else-if="cardMedia(item).mode === 'single' && cardMedia(item).portrait"
              :src="cardMedia(item).portrait"
              :alt="item.name"
              loading="lazy"
            >
            <img
              v-else-if="cardMedia(item).mode === 'single'"
              :src="cardMedia(item).fallback"
              :alt="item.name"
              loading="lazy"
            >
            <span
              v-else
              class="actor-fallback"
              aria-hidden="true"
            >{{ item.name.slice(0, 1) }}</span>
            <span
              v-if="actorShowsGeneration(item)"
              class="actor-badge"
            >{{ actorGenerationLabel(item.generationStatus) }}</span>
            <span
              class="actor-scrim"
              aria-hidden="true"
            />
            <span class="actor-name">{{ item.name }}</span>
          </NuxtLink>
          <small class="actor-meta actor-meta--in">
            {{ item.alias ? item.alias + ' · ' : '' }}{{ item.workCount }} 部作品
            <template v-if="item.sourceActorId"> · 复制自平台演员</template>
          </small>
          <footer class="actor-foot">
            <NuxtLink
              class="actor-edit"
              :to="myActorEditPath(item.id)"
            >
              编辑
            </NuxtLink>
            <button
              type="button"
              class="actor-del"
              @click="removeMine(item)"
            >
              删除
            </button>
          </footer>
        </article>
      </div>

      <div
        v-else
        class="actor-empty"
      >
        <p>还没有自建演员</p>
        <small>演员是一张可复用的「脸和人设」：建好之后，每次创作都能直接引用，不用每次重描。</small>
        <NuxtLink
          class="actor-empty-cta"
          to="/actors/new"
        >
          新建演员
        </NuxtLink>
      </div>
    </template>
  </section>
</template>

<style scoped>
.actor-lib { display: flex; flex-direction: column; }
.actor-bar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.actor-seg { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: rgb(255 255 255 / 3%); }
/* 触控目标 ≥ 44px（移动端可点） */
.actor-seg__btn { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-family: inherit; font-size: 13px; cursor: pointer; }
.actor-seg__btn.active { background: rgb(255 255 255 / 10%); color: var(--ink); }
.actor-seg__btn:focus-visible { outline: 2px solid var(--hg-accent); outline-offset: 2px; }
.actor-seg b { font-variant-numeric: tabular-nums; font-weight: 500; }
.actor-new { margin-left: auto; display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px; border-radius: 999px; background: var(--hg-accent); color: var(--hg-accent-ink); font-size: 13px; font-weight: 600; text-decoration: none; }
.actor-rule { margin: 12px 0 16px; color: var(--faint); font-size: 12px; }
.actor-rule b { color: var(--muted); font-weight: 600; }

/* 参考站结构：筛选列（左，纵向堆叠）+ 搜索（右）在同一个 header flex 里；
   网格在 header **下方**铺满内容宽度。窄屏时上下堆叠。 */
.actor-head { display: flex; gap: 20px; align-items: flex-start; margin-bottom: 16px; }
/* 窄的纵向筛选列：约 180-200px，可收缩，窄屏时整列占满一行。 */
.actor-filters { display: flex; flex: 1 1 180px; flex-direction: column; gap: 10px; max-width: 200px; }
.actor-head__main { display: flex; flex: 3 1 320px; flex-direction: column; gap: 8px; min-width: 0; }
.actor-count { margin: 0; color: var(--faint); font-size: 12px; }

.actor-quick { display: flex; gap: 8px; }
.actor-quick__btn {
  flex: 1; min-height: 44px; padding: 0 12px; border: 1px solid var(--line); border-radius: 12px;
  background: rgb(255 255 255 / 3%); color: var(--muted); font-family: inherit; font-size: 13px; cursor: pointer;
}
.actor-quick__btn.active { border-color: var(--hg-accent); background: rgb(232 50 176 / 10%); color: var(--hg-accent-hi); }
.actor-field { display: block; }

.actor-search { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 12px; background: rgb(255 255 255 / 3%); color: var(--muted); }
.actor-search input { flex: 1; min-width: 0; height: 42px; border: 0; background: transparent; color: var(--ink); font-family: inherit; font-size: 13px; outline: none; }
.actor-search input::placeholder { color: var(--faint); }
.actor-select, .actor-toggle, .actor-more {
  width: 100%; min-height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 12px;
  background: rgb(255 255 255 / 3%); color: var(--ink); font-family: inherit; font-size: 13px; cursor: pointer;
}
.actor-toggle, .actor-more { display: inline-flex; align-items: center; gap: 6px; }
.actor-toggle.active { border-color: var(--hg-accent); color: var(--hg-accent-hi); }
.actor-more { position: relative; justify-content: space-between; }
.actor-more__dot { width: 6px; height: 6px; border-radius: 999px; background: var(--hg-accent); }
.actor-select:focus-visible, .actor-toggle:focus-visible, .actor-more:focus-visible,
.actor-quick__btn:focus-visible,
.actor-search:focus-within, .actor-chip:focus-visible { outline: 2px solid var(--hg-accent); outline-offset: 2px; }

.actor-more-panel { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: rgb(255 255 255 / 2%); }
.actor-select-field { display: grid; gap: 6px; font-size: 12px; color: var(--muted); }
.actor-temperament { display: grid; gap: 6px; font-size: 12px; color: var(--muted); }
.actor-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.actor-chip { min-height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: transparent; color: var(--muted); font-family: inherit; font-size: 12px; cursor: pointer; }
.actor-chip.active { border-color: var(--hg-accent); background: rgb(232 50 176 / 12%); color: var(--hg-accent-hi); }
.actor-reset { min-height: 44px; padding: 0 16px; border: 1px solid var(--line); border-radius: 12px; background: transparent; color: var(--muted); font-family: inherit; font-size: 13px; cursor: pointer; }

.actor-state { margin: 40px 0; text-align: center; color: var(--muted); font-size: 13px; }
.actor-state--error { color: #ff9aa2; }
.actor-retry { margin-left: 8px; min-height: 44px; padding: 0 14px; border: 1px solid var(--line); border-radius: 10px; background: transparent; color: var(--hg-accent-hi); font-family: inherit; font-size: 13px; cursor: pointer; }

/* 桌面 ~3 列（minmax 320 + gap16）；窄屏 1 列。 */
.actor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
/* 卡片 = 4:3 媒体块（参考站 420×315），圆角 16，深底，信息克制：图 + 收藏 + 名称。 */
.actor-card { position: relative; overflow: hidden; border-radius: 16px; background: var(--hg3-canvas, #0d0d0d); }
.actor-card:hover { outline: 1px solid rgb(255 255 255 / 18%); outline-offset: -1px; }
.actor-frame { position: relative; display: flex; aspect-ratio: 4 / 3; overflow: hidden; background: #0d0d0d; }
/* 双图块：左右各半，各自 contain（不裁成横向大图）。极细分隔用右半的左边框。 */
.actor-frame__half { display: flex; flex: 1 1 50%; min-width: 0; align-items: center; justify-content: center; }
.actor-frame__half + .actor-frame__half { border-left: 1px solid rgb(255 255 255 / 8%); }
.actor-frame img { display: block; width: 100%; height: 100%; object-fit: contain; }
/* 底部渐变叠层：名称左下，图上压字也要看得清。 */
.actor-scrim { position: absolute; inset: auto 0 0 0; height: 52%; background: linear-gradient(to top, rgb(0 0 0 / 78%), transparent); pointer-events: none; }
.actor-name { position: absolute; left: 12px; bottom: 12px; right: 56px; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.actor-fallback { display: grid; place-items: center; width: 100%; height: 100%; background: radial-gradient(circle at 50% 30%, #26262c 0%, #0d0d0d 70%); color: var(--muted); font-size: 40px; }
.actor-badge { position: absolute; top: 8px; left: 8px; padding: 3px 8px; border-radius: 6px; background: rgb(0 0 0 / 65%); color: #f0c9e4; font-size: 10px; line-height: 16px; }
.actor-fav { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 999px; background: rgb(0 0 0 / 35%); color: #fff; cursor: pointer; }
.actor-fav:hover { background: rgb(0 0 0 / 55%); }
.actor-fav.active { color: var(--hg-accent); }
.actor-fav:focus-visible { outline: 2px solid var(--hg-accent); outline-offset: -2px; }
/* 卡片上的计数：名称上方一行小字（可缺省）。 */
.actor-meta--in { position: absolute; left: 12px; bottom: 32px; right: 56px; color: rgb(255 255 255 / 62%); font-size: 11px; }
.actor-body { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px 6px; }
.actor-meta { color: var(--faint); font-size: 11px; }
.actor-foot { display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding: 4px 12px 10px; }
.actor-edit, .actor-del { display: inline-flex; align-items: center; min-height: 44px; color: var(--muted); font-family: inherit; font-size: 12px; text-decoration: none; }
.actor-del { border: 0; background: transparent; color: var(--faint); cursor: pointer; }
.actor-del:hover { color: #ff707a; }
.actor-edit:hover { color: var(--ink); }

.actor-pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 20px; }
.actor-page-btn { min-height: 44px; padding: 0 20px; border: 1px solid var(--line); border-radius: 12px; background: transparent; color: var(--ink); font-family: inherit; font-size: 13px; cursor: pointer; }
.actor-page-btn:disabled { opacity: 0.4; cursor: default; }
.actor-page-now { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }

.actor-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 44px 24px; border: 1px dashed var(--line); border-radius: 14px; text-align: center; }
.actor-empty p { margin: 0; color: var(--muted); font-size: 13px; }
.actor-empty small { max-width: 400px; color: var(--faint); font-size: 11.5px; line-height: 18px; }
.actor-empty-cta { margin-top: 4px; display: inline-flex; align-items: center; min-height: 44px; padding: 0 20px; border: 1px solid var(--hg-accent); border-radius: 999px; background: transparent; color: var(--hg-accent-hi); font-family: inherit; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; }

/* 骨架屏与卡片同为 4:3。 */
.actor-skeleton { display: block; aspect-ratio: 4 / 3; border-radius: 16px; background: #202127; animation: actor-pulse 1.2s ease-in-out infinite; }
@keyframes actor-pulse { 50% { opacity: 0.55; } }

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

/* 窄屏：筛选列与搜索上下堆叠，筛选占满宽度；网格落到 1 列（minmax 320 已天然保证）。 */
@media (max-width: 720px) {
  .actor-head { flex-direction: column; gap: 12px; }
  .actor-filters { max-width: none; width: 100%; flex: 0 0 auto; }
  .actor-head__main { flex: 0 0 auto; width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .actor-skeleton { animation: none; }
  .actor-card, .actor-frame img, .actor-fav { transition: none; }
}
</style>
