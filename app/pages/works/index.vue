<script setup lang="ts">
import AppWorkCard from '~/components/AppWorkCard.vue'

const api = useHougongApi()
const session = useAuthSession()
// 成人内容的可用性只取服务端算好的 canUseAdult，前端不自己推导。
const gate = useAdultGate()
const works = ref<(WorkItem & Record<string, unknown>)[]>([])
const charNames = ref<Record<number, string>>({})
const loading = ref(false)
const error = ref('')
const filter = ref<'全部' | '视频' | '图集'>('全部')

// ── 社区发布（platform work）──
// 与上面「影像作品」是两套模型：这里是**发布到社区**的作品（首页探索流读的就是它），
// 含草稿/未发布/隐藏三种状态，因此单独一段列出并给管理动作。
const published = ref<PublicationWork[]>([])
const publishedLoading = ref(false)
const publishOpen = ref(false)
const publishPending = ref(false)
const editingWork = ref<PublicationWork | null>(null)

async function loadPublished() {
  publishedLoading.value = true
  try {
    const { items } = await api.listMyPublishedWorks(1, 30)
    published.value = items
  } catch {
    published.value = []
  } finally {
    publishedLoading.value = false
  }
}

const STATE_LABEL: Record<string, string> = {
  draft: '草稿', published: '已发布', unpublished: '已下架', hidden: '已隐藏'
}

function openPublish(work?: PublicationWork) {
  editingWork.value = work || null
  publishOpen.value = true
}

async function submitPublish(payload: { mode: 'draft' | 'publish', title: string, content: string, contentRating: string }) {
  if (publishPending.value) return
  publishPending.value = true
  error.value = ''
  try {
    if (editingWork.value) {
      // 编辑既有作品：保存后仍是原状态；只有"发布"动作才置为 published。
      await api.saveWorkDraft({
        id: editingWork.value.id,
        title: payload.title,
        content: payload.content,
        contentRating: payload.contentRating || undefined
      })
      if (payload.mode === 'publish' && editingWork.value.state !== 'published') {
        await api.publishWork(editingWork.value.id)
      }
    } else {
      const editor = await api.saveWorkDraft({
        title: payload.title,
        content: payload.content,
        contentRating: payload.contentRating || undefined
      })
      if (payload.mode === 'publish' && editor?.id) await api.publishWork(editor.id)
    }
    publishOpen.value = false
    editingWork.value = null
    await loadPublished()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '发布失败'
  } finally {
    publishPending.value = false
  }
}

async function togglePublishState(work: PublicationWork) {
  error.value = ''
  try {
    if (work.state === 'published') await api.unpublishWork(work.id)
    else await api.publishWork(work.id)
    await loadPublished()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function removePublished(work: PublicationWork) {
  if (!window.confirm(`删除已发布的作品《${work.title || '未命名'}》？删除后无法恢复。`)) return
  error.value = ''
  try {
    await api.deleteWork(work.id)
    await loadPublished()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}
const filters = ['全部', '视频', '图集'] as const

const filtered = computed(() => {
  if (filter.value === '全部') return works.value
  const kind = filter.value === '视频' ? 'video' : 'image'
  return works.value.filter(w => w.kind === kind)
})

const maskedIds = computed(() => new Set(
  works.value
    .filter(w => (w as { contentRating?: string }).contentRating === 'r18' && !gate.status.value.canUseAdult)
    .map(w => w.id)
))

/** 我的作品（后宫作品库）+ 角色名映射；onMounted 与「签名地址过期自愈」共用。 */
async function loadWorks() {
  loading.value = true
  try {
    const [list, chars] = await Promise.all([
      api.listWorks(),
      api.listCharacters().catch(() => [] as CharacterItem[])
    ])
    charNames.value = Object.fromEntries(chars.map(c => [c.id, c.name]))
    // 映射组件所需字段（image/meta/status/recommended）。
    // masked 在渲染时按 canUseAdult 现算（见 maskedIds），这里只把分级带进卡片。
    works.value = list.map(w => ({ ...w, image: w.imageUrl || '', meta: w.kind === 'video' ? '视频' : '图片', status: 'done', recommended: false }) as WorkItem & Record<string, unknown>)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await session.load()
  if (!session.token.value) {
    await navigateTo('/auth/login')
    return
  }
  gate.refresh()
  await loadWorks()
  await loadPublished()
})

// 作品卡与我的发布都是限时签名地址：挂久了会 403，收到自愈信号重取一遍。
// 见 ~/composables/useMediaRefresh。
useMediaAutoRefresh(() => Promise.all([loadWorks(), loadPublished()]))
</script>

<template>
  <div class="page-body">
    <AssetSectionNav />
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          作品库
        </p>
        <h1>你的影像作品</h1>
        <p>图片与视频自动入库，可继续创作同一故事。</p>
      </div>
      <NuxtLink
        to="/create"
        class="btn-primary"
      >+ 创作</NuxtLink>
    </div>

    <div
      class="filters"
      role="tablist"
      aria-label="作品筛选"
    >
      <button
        v-for="f in filters"
        :key="f"
        type="button"
        role="tab"
        class="filter-btn"
        :class="{ active: filter === f }"
        @click="filter = f"
      >
        {{ f }}
      </button>
    </div>

    <p
      v-if="error"
      class="empty-tip"
    >
      加载失败：{{ error }}<NuxtLink to="/auth/login">重新登录</NuxtLink>
    </p>
    <p
      v-else-if="!loading && !filtered.length"
      class="empty-tip"
    >
      还没有作品。从创作页开始生成图片或视频，作品会自动入库。
    </p>
    <div class="story-grid">
      <AppWorkCard
        v-for="(w, i) in filtered"
        :key="w.id"
        :work="{ ...w, masked: maskedIds.has(w.id) }"
        :index="i"
        :character-name="charNames[w.characterId]"
      />
    </div>

    <section class="published-section">
      <header class="published-head">
        <div>
          <p class="detail-kicker">
            社区发布
          </p>
          <h2>已发布到探索流的作品</h2>
          <p class="published-sub">
            这里是与「影像作品」不同的另一套记录：发布后首页「探索」流会展示它，
            下架或隐藏后立即从探索流消失。
          </p>
        </div>
        <button
          type="button"
          class="btn-primary"
          @click="openPublish()"
        >
          + 发布作品
        </button>
      </header>

      <p
        v-if="publishedLoading"
        class="empty-tip"
      >
        正在加载…
      </p>
      <p
        v-else-if="!published.length"
        class="empty-tip"
      >
        还没有发布过作品。可以在这里新建，或在「素材」里选中一张图点「发布作品」。
      </p>
      <ul
        v-else
        class="published-list"
      >
        <li
          v-for="w in published"
          :key="w.id"
          class="published-item"
        >
          <img
            v-if="w.coverUrl"
            :src="w.coverUrl"
            :alt="w.title"
          >
          <div
            v-else
            class="published-item__empty"
          >
            <UIcon name="i-lucide-image-off" />
          </div>
          <div class="published-item__body">
            <strong>{{ w.title || '未命名作品' }}</strong>
            <span
              class="published-state"
              :class="`is-${w.state}`"
            >{{ STATE_LABEL[w.state] || w.state }}</span>
            <small>赞 {{ w.stats?.likes ?? 0 }} · 收藏 {{ w.stats?.favorites ?? 0 }} · 评论 {{ w.stats?.comments ?? 0 }}</small>
          </div>
          <div class="published-item__acts">
            <button
              type="button"
              @click="openPublish(w)"
            >
              编辑
            </button>
            <button
              type="button"
              @click="togglePublishState(w)"
            >
              {{ w.state === 'published' ? '下架' : '发布' }}
            </button>
            <button
              type="button"
              class="danger"
              @click="removePublished(w)"
            >
              删除
            </button>
          </div>
        </li>
      </ul>
    </section>

    <HgPublishDialog
      v-model:open="publishOpen"
      :initial-title="editingWork?.title || ''"
      :initial-rating="editingWork?.contentRating || ''"
      :cover-url="editingWork?.coverUrl || ''"
      :cover-name="editingWork?.title || ''"
      :editing="!!editingWork"
      :pending="publishPending"
      @submit="submitPublish"
    />
  </div>
</template>

<style scoped>
/* ── 社区发布段（本页原先没有 style 块，这一段是本轮新增的样式）── */
.published-section {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--hg-line);
}
.published-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.published-head h2 {
  margin: 4px 0 0;
  font-size: 18px;
}
.published-sub {
  margin: 6px 0 0;
  max-width: 56ch;
  color: var(--hg-muted);
  font-size: 12.5px;
  line-height: 1.7;
}
.published-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.published-item {
  display: grid;
  grid-template-columns: 64px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--hg-line);
  border-radius: 12px;
  background: var(--hg-card);
}
.published-item img,
.published-item__empty {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  object-fit: cover;
  background: #1b1d21;
}
.published-item__empty {
  display: grid;
  place-items: center;
  color: var(--hg-faint);
}
.published-item__body {
  display: grid;
  gap: 3px;
  min-width: 0;
  justify-items: start;
}
.published-item__body strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.published-item__body small {
  color: var(--hg-faint);
  font-size: 12px;
}
.published-state {
  padding: 1px 8px;
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  color: var(--hg-muted);
  font-size: 11px;
}
.published-state.is-published {
  background: rgb(46 223 154 / 14%);
  color: var(--hg-ok, #2edf9a);
}
.published-state.is-draft {
  background: rgb(255 180 84 / 16%);
  color: var(--hg-warn, #ffb454);
}
.published-item__acts {
  display: flex;
  gap: 6px;
}
.published-item__acts button {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--hg-line);
  border-radius: 8px;
  background: transparent;
  color: var(--hg-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.published-item__acts button:hover {
  border-color: var(--hg-accent);
  color: var(--hg-accent);
}
.published-item__acts button.danger:hover {
  border-color: #ff707a;
  color: #ff707a;
}
@media (max-width: 640px) {
  .published-item {
    grid-template-columns: 52px 1fr;
  }
  .published-item__acts {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}
</style>
