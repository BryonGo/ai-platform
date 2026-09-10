<script setup lang="ts">
const api = useHougongApi()
const session = useAuthSession()
const route = useRoute()

const story = ref<StoryItem | null>(null)
const charNames = ref<Record<string, string>>({})
const workTitles = ref<Record<string, string>>({})
const workCovers = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')

const storyId = computed(() => String(route.params.id))
const clips = computed(() => (story.value ? [...story.value.clips].sort((a, b) => a.order - b.order) : []))
const cover = computed(() => {
  const first = clips.value[0]
  return first ? (workCovers.value[String(first.workId)] || '') : ''
})
const updatedText = computed(() => {
  const ts = story.value?.updatedAt || 0
  return ts ? new Date(ts * 1000).toLocaleDateString('zh-CN') : ''
})
const charName = (id: number) => charNames.value[String(id)] || `角色 ${String(id).slice(-4)}`

async function load() {
  session.load()
  if (!session.token.value) {
    await navigateTo('/auth/login')
    return
  }
  loading.value = true
  error.value = ''
  story.value = null
  try {
    const [s, chars, works] = await Promise.all([
      api.getHougongStory(storyId.value),
      api.listCharacters().catch(() => [] as CharacterItem[]),
      api.listWorks().catch(() => [] as WorkItem[])
    ])
    story.value = s
    charNames.value = Object.fromEntries(chars.map(c => [String(c.id), c.name]))
    workTitles.value = Object.fromEntries(works.map(w => [String(w.id), w.title]))
    workCovers.value = Object.fromEntries(works.map(w => [String(w.id), w.imageUrl || '']))
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(storyId, load)
</script>

<template>
  <div
    v-if="loading"
    class="page-body"
  >
    <p class="empty-tip">
      正在加载故事…
    </p>
  </div>

  <div
    v-else-if="story"
    class="page-body"
  >
    <div class="detail-grid">
      <div>
        <div class="media-frame wide">
          <img
            v-if="cover"
            :src="cover"
            :alt="story.title"
          >
          <div
            v-else
            class="media-placeholder"
          >
            <span>{{ story.title.slice(0, 1) }}</span>
          </div>
        </div>

        <!-- 片段时间线 -->
        <section class="panel-block">
          <h2>片段 · {{ story.clips.length }}</h2>
          <p class="hint">
            按顺序播放，点击可查看对应作品
          </p>
          <div
            v-if="clips.length"
            class="clip-list"
          >
            <div
              v-for="clip in clips"
              :key="`${clip.workId}-${clip.order}`"
              class="clip-row"
            >
              <span class="clip-num">{{ clip.order }}</span>
              <div class="clip-body">
                <strong>{{ workTitles[String(clip.workId)] || `作品 ${String(clip.workId).slice(-6)}` }}</strong>
                <small>{{ clip.note }}</small>
              </div>
              <NuxtLink
                :to="`/works/${clip.workId}`"
                class="clip-link"
              >查看 <span
                class="i-lucide-arrow-right"
                aria-hidden="true"
              /></NuxtLink>
            </div>
          </div>
          <p
            v-else
            class="hint"
          >
            还没有片段。
          </p>
        </section>
      </div>

      <div class="media-detail">
        <p class="detail-kicker">
          故事项目<template v-if="updatedText">
            · 更新于 {{ updatedText }}
          </template>
        </p>
        <h1 class="detail-title">
          {{ story.title }}
        </h1>
        <p class="detail-desc">
          {{ story.synopsis }}
        </p>

        <p
          v-if="error"
          class="empty-tip"
        >
          {{ error }}
        </p>

        <div class="detail-actions">
          <NuxtLink
            :to="`/create?story=${story.id}`"
            class="btn-primary"
          >继续创作</NuxtLink>
          <NuxtLink
            to="/create"
            class="btn-ghost"
          >加入新片段</NuxtLink>
        </div>

        <div class="side-stack">
          <section class="panel-block">
            <h2>角色与关系</h2>
            <div
              v-if="story.characterIds.length"
              class="avatar-stack"
            >
              <NuxtLink
                v-for="cid in story.characterIds"
                :key="cid"
                :to="`/characters/${cid}`"
                :title="charName(cid)"
              >
                <span class="avatar-fallback">{{ charName(cid).slice(0, 1) }}</span>
              </NuxtLink>
            </div>
            <p
              v-else
              class="hint"
            >
              还没有关联角色。
            </p>
            <dl v-if="story.relation.length">
              <div
                v-for="(r, i) in story.relation"
                :key="i"
                class="info-line"
              >
                <dt>{{ r.from }} × {{ r.to }}</dt>
                <dd>{{ r.note }}</dd>
              </div>
            </dl>
          </section>

          <section class="panel-block">
            <h2>场景设定</h2>
            <dl v-if="story.settings.length">
              <div
                v-for="setting in story.settings"
                :key="setting.name"
                class="info-line"
              >
                <dt>{{ setting.name }}</dt>
                <dd>{{ setting.note }}</dd>
              </div>
            </dl>
            <p
              v-else
              class="hint"
            >
              还没有场景设定。
            </p>
          </section>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else
    class="empty-state"
  >
    <p>{{ error ? `加载失败：${error}` : '没有找到这个故事' }}</p>
    <NuxtLink
      to="/stories"
      class="btn-ghost small"
      style="margin-top: 16px; display: inline-flex"
    >返回故事</NuxtLink>
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

.avatar-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: linear-gradient(160deg, #2b2b31, #17181b);
  color: var(--amber-soft);
  font-weight: 700;
}
</style>
