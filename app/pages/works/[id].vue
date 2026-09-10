<script setup lang="ts">
import AppWorkCard from '~/components/AppWorkCard.vue'

const api = useHougongApi()
const session = useAuthSession()
const route = useRoute()

const work = ref<WorkItem | null>(null)
const owner = ref<CharacterItem | null>(null)
const related = ref<WorkItem[]>([])
const loading = ref(true)
const error = ref('')
const favBusy = ref(false)

const workId = computed(() => String(route.params.id))
const kindLabel = computed(() => (work.value?.kind === 'video' ? '视频' : '图片'))
const createdText = computed(() => {
  const ts = work.value?.createdAt || 0
  return ts ? new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false }) : ''
})

// 卡片展示字段（与作品库列表同一映射口径）
function toCard(w: WorkItem) {
  return { ...w, image: w.imageUrl || '', meta: w.kind === 'video' ? '视频' : '图片', status: 'done' }
}

async function load() {
  session.load()
  if (!session.token.value) {
    await navigateTo('/auth/login')
    return
  }
  loading.value = true
  error.value = ''
  work.value = null
  owner.value = null
  related.value = []
  try {
    const w = await api.getHougongWork(workId.value)
    work.value = w
    if (w.characterId) {
      owner.value = await api.getCharacter(w.characterId).catch(() => null)
      const list = await api.listWorks()
      related.value = list.filter(x => x.characterId === w.characterId && x.id !== w.id).slice(0, 3)
    }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleFavorite() {
  if (!work.value || favBusy.value) return
  favBusy.value = true
  try {
    const updated = await api.favoriteHougongWork(work.value.id, !work.value.favorite)
    work.value = { ...work.value, favorite: updated.favorite }
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    favBusy.value = false
  }
}

onMounted(load)
watch(workId, load)
</script>

<template>
  <div
    v-if="loading"
    class="page-body"
  >
    <p class="empty-tip">
      正在加载作品…
    </p>
  </div>

  <div
    v-else-if="work"
    class="page-body"
  >
    <div class="detail-grid">
      <div>
        <div class="media-frame wide">
          <img
            v-if="work.imageUrl"
            :src="work.imageUrl"
            :alt="work.title"
          >
          <div
            v-else
            class="media-placeholder"
          >
            <span>{{ work.title.slice(0, 1) }}</span>
          </div>
        </div>
      </div>

      <div class="media-detail">
        <p class="detail-kicker">
          {{ kindLabel }}<template v-if="createdText">
            · {{ createdText }}
          </template>
          <span
            v-if="work.favorite"
            style="color: var(--amber-soft)"
          >· 已收藏</span>
        </p>
        <h1 class="detail-title">
          {{ work.title }}
        </h1>
        <NuxtLink
          v-if="owner"
          :to="`/characters/${owner.id}`"
          class="detail-sub"
          style="text-decoration: none"
        >
          出演：{{ owner.name }}<template v-if="owner.alias"> · {{ owner.alias }}</template>
        </NuxtLink>

        <p
          v-if="error"
          class="empty-tip"
        >
          {{ error }}
        </p>

        <div class="detail-actions">
          <a
            v-if="work.imageUrl"
            :href="work.imageUrl"
            target="_blank"
            rel="noopener"
            class="btn-ghost"
          >查看原图</a>
          <NuxtLink
            :to="`/create?work=${work.id}`"
            class="btn-primary"
          >继续创作</NuxtLink>
          <button
            type="button"
            class="btn-ghost"
            :disabled="favBusy"
            @click="toggleFavorite"
          >
            {{ work.favorite ? '取消收藏' : '收藏' }}
          </button>
        </div>

        <section class="panel-block">
          <h2>生成信息</h2>
          <dl>
            <div class="info-line">
              <dt>角色</dt>
              <dd>{{ owner?.name || `#${work.characterId || '-'}` }}</dd>
            </div>
            <div class="info-line">
              <dt>类型</dt>
              <dd>{{ kindLabel }}</dd>
            </div>
            <div class="info-line">
              <dt>生成时间</dt>
              <dd>{{ createdText || '-' }}</dd>
            </div>
            <div class="info-line">
              <dt>任务号</dt>
              <dd>{{ work.taskId || '-' }}</dd>
            </div>
            <div class="info-line">
              <dt>可见性</dt>
              <dd>私密（默认）</dd>
            </div>
            <div class="info-line">
              <dt>计费</dt>
              <dd>已结算 · 失败自动退回</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>

    <section
      v-if="related.length"
      style="margin-top: 56px"
    >
      <div class="page-head">
        <div>
          <h1 style="font-size: 24px">
            同角色作品
          </h1>
        </div>
      </div>
      <div class="story-grid">
        <AppWorkCard
          v-for="(x, i) in related"
          :key="x.id"
          :work="toCard(x)"
          :index="i"
          :character-name="owner?.name"
        />
      </div>
    </section>
  </div>

  <div
    v-else
    class="empty-state"
  >
    <p>{{ error ? `加载失败：${error}` : '没有找到这部作品' }}</p>
    <NuxtLink
      to="/works"
      class="btn-ghost small"
      style="margin-top: 16px; display: inline-flex"
    >返回作品库</NuxtLink>
  </div>
</template>

<style scoped>
.media-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: linear-gradient(160deg, #26272c, #17181b);
  color: var(--amber-soft);
  font-size: clamp(48px, 7vw, 96px);
  font-weight: 800;
}
</style>
