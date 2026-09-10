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
const coverBusy = ref(false)
const coverNote = ref('')

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

// 删除作品（后端 DELETE /hougong/works/{id}，此前前端没有入口）
async function removeWork() {
  if (!work.value) return
  if (!window.confirm('删除这部作品？删除后无法恢复。')) return
  try {
    await api.deleteHougongWork(work.value.id)
    await navigateTo('/works')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

// 把这部作品设为出演角色的封面（后端校验素材归属）
async function setAsCover() {
  if (!work.value || !work.value.characterId || !work.value.assetId) return
  coverBusy.value = true
  coverNote.value = ''
  try {
    await api.setCharacterCover(work.value.characterId, work.value.assetId)
    coverNote.value = '已设为该角色的封面'
  } catch (e: unknown) {
    coverNote.value = e instanceof Error ? e.message : '设置失败'
  } finally {
    coverBusy.value = false
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
        <p
          v-else-if="coverNote"
          class="empty-tip"
        >
          {{ coverNote }}
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
          <button
            v-if="work.characterId && work.assetId"
            type="button"
            class="btn-ghost"
            :disabled="coverBusy"
            @click="setAsCover"
          >
            设为 TA 的封面
          </button>
          <button
            type="button"
            class="btn-ghost danger"
            @click="removeWork"
          >
            删除
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

<style scoped>
.btn-ghost.danger {
  color: #d9534f;
  border-color: rgba(217, 83, 79, 0.4);
}
</style>
