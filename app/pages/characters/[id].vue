<script setup lang="ts">
import AppWorkCard from '~/components/AppWorkCard.vue'

const api = useHougongApi()
const session = useAuthSession()
const route = useRoute()

const character = ref<CharacterItem | null>(null)
const works = ref<WorkItem[]>([])
const loading = ref(true)
const error = ref('')

const characterId = computed(() => String(route.params.id))

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
  character.value = null
  works.value = []
  try {
    const c = await api.getCharacter(Number(characterId.value))
    character.value = c
    const list = await api.listWorks()
    works.value = list.filter(w => String(w.characterId) === characterId.value)
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
            :to="`/create?character=${character.id}`"
            class="btn-primary"
          >用她创作</NuxtLink>
          <NuxtLink
            :to="`/characters/${character.id}/edit`"
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
      to="/characters"
      class="btn-ghost small"
      style="margin-top: 16px; display: inline-flex"
    >返回角色</NuxtLink>
  </div>
</template>

<style scoped>
.portrait-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: linear-gradient(160deg, #2b2b31, #17181b);
  color: var(--amber-soft);
  font-size: clamp(48px, 7vw, 96px);
  font-weight: 800;
}
</style>

<style scoped>
.history-tag {
  color: var(--text-dim, #8a8f98);
  font-size: 12px;
}
</style>
