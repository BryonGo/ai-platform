<script setup lang="ts">
import AppStoryCard from '~/components/AppStoryCard.vue'

const api = useHougongApi()
const session = useAuthSession()

const stories = ref<StoryItem[]>([])
const covers = ref<Record<string, string>>({})
const charNames = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  session.load()
  if (!session.token.value) {
    await navigateTo('/auth/login')
    return
  }
  try {
    const [list, chars, works] = await Promise.all([
      api.listStories(),
      api.listCharacters().catch(() => [] as CharacterItem[]),
      api.listWorks().catch(() => [] as WorkItem[])
    ])
    stories.value = list
    charNames.value = Object.fromEntries(chars.map(c => [String(c.id), c.name]))
    // 封面取该故事首个片段的成品图
    const byId = Object.fromEntries(works.map(w => [String(w.id), w.imageUrl || '']))
    covers.value = Object.fromEntries(list.map((s) => {
      const first = [...s.clips].sort((a, b) => a.order - b.order)[0]
      return [String(s.id), first ? (byId[String(first.workId)] || '') : '']
    }))
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
          故事项目
        </p>
        <h1>把作品排成一条连续的故事线</h1>
        <p>角色与作品按项目归组，记录关系与场景设定，片段顺序只影响叙事，不覆盖作品本体。</p>
      </div>
      <NuxtLink
        to="/create"
        class="btn-primary"
      >+ 新建故事</NuxtLink>
    </div>

    <p
      v-if="loading"
      class="empty-tip"
    >
      正在加载故事…
    </p>
    <p
      v-else-if="error"
      class="empty-tip"
    >
      加载失败：{{ error }}
    </p>
    <p
      v-else-if="!stories.length"
      class="empty-tip"
    >
      还没有故事。故事把多部作品按角色与场景串成一条线。
    </p>

    <div class="story-grid">
      <AppStoryCard
        v-for="(s, i) in stories"
        :key="s.id"
        :story="s"
        :index="i"
        :cover="covers[String(s.id)]"
        :character-names="charNames"
      />
    </div>
  </div>
</template>
