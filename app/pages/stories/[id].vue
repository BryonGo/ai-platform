<script setup lang="ts">
const api = useHougongApi()
const session = useAuthSession()
const route = useRoute()

const story = ref<StoryItem | null>(null)
const charNames = ref<Record<string, string>>({})
const workTitles = ref<Record<string, string>>({})
const myWorks = ref<WorkItem[]>([])
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

// ── 片段整理（PUT /hougong/stories/{id}/clips）──
// 该接口此前只有 API 定义、没有 controller/service 实现（实测 404），前端也没有入口。
const editing = ref(false)
const saving = ref(false)
const editClips = ref<{ workId: number, note: string }[]>([])
const pickerOpen = ref(false)

// 可加入片段的作品 = 该故事关联角色名下、且尚未入片段的自己的作品
const addable = computed(() => {
  const ids = new Set((story.value?.characterIds || []).map(String))
  const used = new Set(editClips.value.map(c => String(c.workId)))
  return myWorks.value.filter(w => ids.has(String(w.characterId)) && !used.has(String(w.id)))
})

function startEdit() {
  editClips.value = clips.value.map(c => ({ workId: c.workId, note: c.note || '' }))
  editing.value = true
  pickerOpen.value = false
}

function moveClip(index: number, delta: number) {
  const next = index + delta
  if (next < 0 || next >= editClips.value.length) return
  const list = [...editClips.value]
  const item = list[index]
  if (!item) return
  list.splice(index, 1)
  list.splice(next, 0, item)
  editClips.value = list
}

function removeClip(index: number) {
  editClips.value = editClips.value.filter((_, i) => i !== index)
}

function addClip(workId: number) {
  editClips.value = [...editClips.value, { workId, note: '' }]
  pickerOpen.value = false
}

async function saveClips() {
  if (!story.value) return
  saving.value = true
  error.value = ''
  try {
    story.value = await api.updateStoryClips(story.value.id, editClips.value.map((c, i) => ({
      workId: c.workId,
      order: i + 1,
      note: c.note.trim()
    })))
    editing.value = false
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

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
    myWorks.value = works
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
          <h2>片段 · {{ editing ? editClips.length : story.clips.length }}</h2>
          <p class="hint">
            {{ editing ? '上移/下移调整叙事顺序；备注只影响叙事，不改作品本体' : '按顺序播放，点击可查看对应作品' }}
          </p>
          <!-- 整理模式 -->
          <div
            v-if="editing"
            class="clip-list"
          >
            <div
              v-for="(clip, i) in editClips"
              :key="clip.workId"
              class="clip-row"
            >
              <span class="clip-num">{{ i + 1 }}</span>
              <div class="clip-body">
                <strong>{{ workTitles[String(clip.workId)] || `作品 ${String(clip.workId).slice(-6)}` }}</strong>
                <input
                  v-model="clip.note"
                  type="text"
                  class="composer2-input"
                  maxlength="200"
                  placeholder="这一幕的备注"
                >
              </div>
              <div class="clip-actions">
                <button
                  type="button"
                  :disabled="i === 0"
                  @click="moveClip(i, -1)"
                >
                  上移
                </button>
                <button
                  type="button"
                  :disabled="i === editClips.length - 1"
                  @click="moveClip(i, 1)"
                >
                  下移
                </button>
                <button
                  type="button"
                  class="danger"
                  @click="removeClip(i)"
                >
                  移除
                </button>
              </div>
            </div>
            <p
              v-if="!editClips.length"
              class="hint"
            >
              还没有片段，从下面添加。
            </p>
            <div class="clip-add">
              <button
                type="button"
                class="btn-ghost small"
                @click="pickerOpen = !pickerOpen"
              >
                {{ pickerOpen ? '收起作品列表' : '+ 添加片段' }}
              </button>
              <div
                v-if="pickerOpen"
                class="clip-picker"
              >
                <p
                  v-if="!addable.length"
                  class="hint"
                >
                  没有可添加的作品：该故事角色的其它作品都已在片段里，或还没有作品。
                </p>
                <button
                  v-for="w in addable"
                  :key="w.id"
                  type="button"
                  class="clip-pick"
                  @click="addClip(w.id)"
                >
                  <span>{{ w.title || `作品 ${String(w.id).slice(-6)}` }}</span>
                  <small>{{ w.kind === 'video' ? '视频' : '图片' }}</small>
                </button>
              </div>
            </div>
          </div>

          <div
            v-else-if="clips.length"
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
            v-else-if="!editing"
            class="hint"
          >
            还没有片段。点「整理片段」把该角色的作品排成故事线。
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
          <button
            v-if="!editing"
            type="button"
            class="btn-ghost"
            @click="startEdit"
          >
            整理片段
          </button>
          <template v-else>
            <button
              type="button"
              class="btn-primary"
              :disabled="saving"
              @click="saveClips"
            >
              {{ saving ? '保存中…' : '保存整理' }}
            </button>
            <button
              type="button"
              class="btn-ghost"
              @click="editing = false"
            >
              取消
            </button>
          </template>
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

<style scoped>
.clip-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.clip-actions button {
  padding: 3px 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}
.clip-actions button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.clip-actions button.danger {
  color: #d9534f;
  border-color: rgba(217, 83, 79, 0.4);
}
.clip-add {
  margin-top: 12px;
}
.clip-picker {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
}
.clip-pick {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.clip-pick:hover {
  border-color: rgba(251, 191, 36, 0.45);
}
</style>
