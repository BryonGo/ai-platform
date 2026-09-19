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
  await session.load()
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

// ── 集（画布·集）──
//
// 为什么这个区放在故事页而不是单独开一页：集是**故事的从属**（第几集），
// 单独一页会多一次"先选故事再选集"的导航；而画布要从集进（`ownerType=episode`），
// 所以每集一行、点「用画布做」直接带着集 id 进画布。
const episodes = ref<EpisodeItem[]>([])
const episodesBusy = ref(false)
const episodeError = ref('')

async function loadEpisodes() {
  try {
    episodes.value = await api.listEpisodes(storyId.value)
    episodeError.value = ''
  } catch (e: unknown) {
    // 读不到不打断整页：故事内容仍然能看，只是这一区给一句可读的原因。
    episodeError.value = e instanceof Error ? e.message : '集列表加载失败'
  }
}

async function addEpisode() {
  if (episodesBusy.value) return
  episodesBusy.value = true
  try {
    const ep = await api.createEpisode(storyId.value)
    episodes.value = [...episodes.value, ep].sort((a, b) => a.idx - b.idx)
  } catch (e: unknown) {
    episodeError.value = e instanceof Error ? e.message : '新建集失败'
  } finally {
    episodesBusy.value = false
  }
}

async function renameEpisode(ep: EpisodeItem) {
  const next = window.prompt('集标题', ep.title)
  if (next === null || next.trim() === '' || next === ep.title) return
  try {
    const updated = await api.updateEpisode(ep.id, { title: next.trim() })
    replaceEpisode(updated)
  } catch (e: unknown) {
    episodeError.value = e instanceof Error ? e.message : '改名失败'
  }
}

async function setEpisodeStatus(ep: EpisodeItem, status: string) {
  if (status === ep.status) return
  try {
    replaceEpisode(await api.updateEpisode(ep.id, { status }))
  } catch (e: unknown) {
    episodeError.value = e instanceof Error ? e.message : '改状态失败'
  }
}

async function removeEpisode(ep: EpisodeItem) {
  // 说清后果：图不会被删（它们只是失去归属），避免用户以为"删了集=删了产出"。
  const ok = window.confirm(`删除「${ep.title}」？\n这一集下面的画布图不会被删，只是不再属于任何一集。`)
  if (!ok) return
  try {
    await api.deleteEpisode(ep.id)
    episodes.value = episodes.value.filter(e => e.id !== ep.id)
  } catch (e: unknown) {
    episodeError.value = e instanceof Error ? e.message : '删除失败'
  }
}

function replaceEpisode(ep: EpisodeItem) {
  episodes.value = episodes.value.map(e => (e.id === ep.id ? ep : e))
}

const episodeStatusText: Record<string, string> = { todo: '待做', running: '进行中', done: '已完成' }

// ── 看剧本：**按需读画布**，不把剧本镜像进 hougong_episode.script ──
//
// 为什么不镜像：剧本在画布里是产物（`script_in` / `script_gen` 节点的输出），
// 而产物有版本、有会话、有运行记录。再往集表里存一份就是第二份真源 ——
// 改一边忘另一边正是这个仓库反复踩的坑（工具清单、参数规则、节点端口都栽过）。
// 所以集表那列 `script` 保持**遗留不用**，要看就直接读画布产物。
//
// 为什么按需（点开才拉）：集列表已经有 `graphCount` 这个线索，为每一集各拉一次
// 图才有剧本正文是 N+1；用户点哪一集才拉哪一集。
const canvasApi = useCanvasApi()
const episodeScripts = ref<Record<string, {
  open: boolean
  loading: boolean
  text: string
  graphId: string
  error: string
}>>({})

function scriptState(ep: EpisodeItem) {
  return episodeScripts.value[ep.id] ?? { open: false, loading: false, text: '', graphId: '', error: '' }
}

async function toggleEpisodeScript(ep: EpisodeItem) {
  const cur = scriptState(ep)
  if (cur.open) {
    episodeScripts.value = { ...episodeScripts.value, [ep.id]: { ...cur, open: false } }
    return
  }
  episodeScripts.value = { ...episodeScripts.value, [ep.id]: { ...cur, open: true } }
  if (cur.text || cur.loading) return
  episodeScripts.value = { ...episodeScripts.value, [ep.id]: { ...scriptState(ep), loading: true } }
  try {
    // 这一集的图可能不止一张（多次尝试）：取**最近更新**的那张，
    // 与用户"刚改完那张"的直觉一致。
    const graphs = await canvasApi.listGraphs('hougong', { type: 'episode', id: String(ep.id) })
    const latest = [...graphs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
    if (!latest) {
      episodeScripts.value = { ...episodeScripts.value, [ep.id]: { open: true, loading: false, text: '', graphId: '', error: '这一集还没有画布图' } }
      return
    }
    const view = await canvasApi.getGraph(latest.id)
    // 只认**文本类**产物（`text` 槽）：`outline` 是拆解出的大纲、`table` 是分镜表，
    // 都不是"剧本"。取最新一版 —— 生成过的剧本比粘进去的原文更能代表这一集。
    const texts = view.artifacts
      .filter(a => a.type === 'text' && (a.text || '').trim() !== '')
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    const picked = texts[texts.length - 1]
    episodeScripts.value = {
      ...episodeScripts.value,
      [ep.id]: {
        open: true, loading: false, graphId: latest.id,
        text: picked ? String(picked.text) : '',
        error: picked ? '' : '这张图里还没有剧本（先去「剧本输入」贴一份，或在「剧本生成」里写一版）'
      }
    }
  } catch (e: unknown) {
    episodeScripts.value = {
      ...episodeScripts.value,
      [ep.id]: { open: true, loading: false, text: '', graphId: '', error: e instanceof Error ? e.message : '剧本读取失败' }
    }
  }
}

onMounted(() => {
  void load()
  void loadEpisodes()
})
watch(storyId, () => {
  void load()
  void loadEpisodes()
})

// 分镜/作品缩略图是限时签名地址：过期后收到自愈信号重新取一次。
useMediaAutoRefresh(() => load())
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
          <!--
            进画布：带上 `ownerType=project&ownerId=故事 id`。
            画布把这当成**归属**存进 canvas_graph（owner_type/owner_id），
            于是"这条故事线的图"和账号里其它图分得开：列表按归属过滤、
            "继续补充"接得上同一条会话。画布不认识"故事"，只是原样带着这个标签。

            这是**整部故事**一把画布（试画/探索用）；按集做请用右侧「集」区里每集那行的
            入口（`ownerType=episode`）—— 图与集一一对应，导出与排查才说得清这是第几集的图。
          -->
          <NuxtLink
            :to="`/canvas?ownerType=project&ownerId=${story.id}`"
            class="btn-ghost"
            title="整部故事一把画布；按集做请用右侧「集」区的入口"
          >用画布做</NuxtLink>
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
            <h2>集 · {{ episodes.length }}</h2>
            <p class="hint">
              一集 = 一条产线归属；点「用画布做」会带着这一集的 id 打开画布，图就挂在这一集下面。
            </p>
            <div class="episode-list">
              <div
                v-for="ep in episodes"
                :key="ep.id"
                class="episode-block"
              >
                <div class="episode-row">
                  <span class="episode-idx">第 {{ ep.idx }} 集</span>
                  <div class="episode-body">
                    <strong>{{ ep.title }}</strong>
                    <span class="episode-meta">
                      {{ episodeStatusText[ep.status] || ep.status }}
                      · {{ ep.graphCount }} 张画布图
                    </span>
                  </div>
                  <div class="episode-actions">
                    <NuxtLink
                      :to="`/canvas?ownerType=episode&ownerId=${ep.id}`"
                      class="btn-ghost small"
                    >用画布做</NuxtLink>
                    <select
                      class="composer2-input episode-status"
                      :value="ep.status"
                      @change="setEpisodeStatus(ep, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="todo">
                        待做
                      </option>
                      <option value="running">
                        进行中
                      </option>
                      <option value="done">
                        已完成
                      </option>
                    </select>
                    <button
                      type="button"
                      class="btn-ghost small"
                      @click="toggleEpisodeScript(ep)"
                    >
                      {{ scriptState(ep).open ? '收起剧本' : '看剧本' }}
                    </button>
                    <button
                      type="button"
                      class="btn-ghost small"
                      @click="renameEpisode(ep)"
                    >
                      改名
                    </button>
                    <button
                      type="button"
                      class="btn-ghost small danger"
                      @click="removeEpisode(ep)"
                    >
                      删除
                    </button>
                  </div>
                </div>
                <!--
                  剧本按需展开：内容是**画布产物**（不是集表 `script` 那列）。
                  只读不写：要改剧本回画布改（那里有版本、会话与运行记录）。
                -->
                <div
                  v-if="scriptState(ep).open"
                  class="episode-script"
                >
                  <p
                    v-if="scriptState(ep).loading"
                    class="hint"
                  >
                    读取中…
                  </p>
                  <p
                    v-else-if="scriptState(ep).error"
                    class="hint"
                  >
                    {{ scriptState(ep).error }}
                  </p>
                  <template v-else>
                    <pre class="episode-script-text">{{ scriptState(ep).text }}</pre>
                    <NuxtLink
                      :to="`/canvas?ownerType=episode&ownerId=${ep.id}`"
                      class="btn-ghost small"
                    >去画布改剧本</NuxtLink>
                  </template>
                </div>
              </div>
            </div>
            <p
              v-if="!episodes.length"
              class="hint"
            >
              还没有集。新建一集，然后在画布里从这一集开始做。
            </p>
            <p
              v-if="episodeError"
              class="hint"
            >
              {{ episodeError }}
            </p>
            <button
              type="button"
              class="btn-ghost small"
              :disabled="episodesBusy"
              @click="addEpisode"
            >
              {{ episodesBusy ? '新建中…' : '+ 新建一集' }}
            </button>
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
.episode-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.episode-script {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-left: 2px solid var(--amber-soft);
  background: rgba(255, 255, 255, 0.02);
  border-radius: 0 8px 8px 0;
}

.episode-script-text {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
}

.episode-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.episode-row {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--line, #2a2b30);
  border-radius: 8px;
}

.episode-idx {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--amber-soft);
}

.episode-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.episode-meta {
  font-size: 12px;
  opacity: 0.7;
}

.episode-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.episode-status {
  width: auto;
  padding: 2px 6px;
}

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
