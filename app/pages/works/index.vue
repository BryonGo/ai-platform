<script setup lang="ts">
import AppWorkCard from '~/components/AppWorkCard.vue'

const api = useHougongApi()
const session = useAuthSession()
const works = ref<(WorkItem & Record<string, unknown>)[]>([])
const loading = ref(false)
const error = ref('')
const filter = ref<'全部' | '视频' | '图集'>('全部')
const filters = ['全部', '视频', '图集'] as const

const filtered = computed(() => {
  if (filter.value === '全部') return works.value
  const kind = filter.value === '视频' ? 'video' : 'image'
  return works.value.filter(w => w.kind === kind)
})

onMounted(async () => {
  session.load()
  if (!session.token.value) {
    await navigateTo('/auth/login')
    return
  }
  loading.value = true
  try {
    const list = await api.listWorks()
    // 映射组件所需字段（image/meta/status/recommended）。
    works.value = list.map(w => ({ ...w, image: w.imageUrl || '', meta: w.kind === 'video' ? '视频' : '图片', status: 'done', recommended: false }) as WorkItem & Record<string, unknown>)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page-body">
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
        :work="w"
        :index="i"
      />
    </div>
  </div>
</template>
