<script setup lang="ts">
const api = useHougongApi()
const session = useAuthSession()

const tab = ref<'market' | 'mine'>('market')
const loading = ref(true)
const error = ref('')

// 模型市场
const models = ref<ModelListItem[]>([])
const facets = ref<ModelFacets | null>(null)
const famFilter = ref('')
// 底模/LoRA 属于图片；视频模型单列（图生视频）。默认只看图片底模。
const typeFilter = ref<'model' | 'lora' | 'video' | ''>('model')
const detail = ref<ModelDetail | null>(null)

// 我的模型
const mine = ref<MineListItem[]>([])
const editing = ref<MineModel | null>(null)
const editorOpen = ref(false)
const editorBusy = ref(false)
const editorErr = ref('')
const editor = ref({
  source: 'original' as 'original' | 'import',
  title: '',
  type: 'model' as 'model' | 'lora',
  family: '',
  category: 'style',
  safety: 'safe' as 'safe' | 'adult',
  description: '',
  triggers: '' as string,
  weight: 0.8
})
const newDraftBusy = ref(false)

const categoryOptions = ['base-model', 'character', 'concept', 'style', 'tool']
const stateLabel: Record<string, string> = {
  draft: '草稿', pending: '审核中', published: '已发布', rejected: '未通过', hidden: '已隐藏'
}

// 后端约束：type=model 必须 base-model；type=lora 用其余分类
const allowedCategories = computed(() =>
  editor.value.type === 'model' ? ['base-model'] : categoryOptions.filter(c => c !== 'base-model')
)

function onTypeChange() {
  if (editor.value.type === 'model') editor.value.category = 'base-model'
  else if (!allowedCategories.value.includes(editor.value.category)) editor.value.category = 'style'
}

async function loadMarket() {
  loading.value = true
  try {
    const [list, f] = await Promise.all([
      api.modelList({ type: typeFilter.value || undefined, family: famFilter.value || undefined, limit: 50 }).catch(() => ({ items: [] })),
      api.modelFacets().catch(() => null)
    ])
    models.value = list.items || []
    facets.value = f
  } finally {
    loading.value = false
  }
}

async function loadMine() {
  loading.value = true
  try {
    const r = await api.mineModels()
    mine.value = r.items || []
  } finally {
    loading.value = false
  }
}

// typeLabel 卡片副标题：视频模型标「视频」，LoRA 标「LoRA」，其余显示底模族。
function typeLabel(m: ModelListItem) {
  if (m.type === 'video') return '视频模型'
  return m.type === 'lora' ? 'LoRA' : (m.family || '底模')
}

function switchTab(t: 'market' | 'mine') {
  tab.value = t
  if (t === 'market') loadMarket()
  else loadMine()
}

async function showDetail(id: string) {
  detail.value = await api.modelGet(id)
}
function openEditor(item?: MineListItem) {
  editorErr.value = ''
  if (item) {
    editing.value = { ...item, owner: { id: '', name: '' }, source: '', sourceUrl: null, description: '', triggers: [], weight: null, sampling: null, images: [], runtime: { engine: 'comfy' }, file: null, reason: null }
    editor.value = { source: 'original', title: item.title, type: (item.type as 'model' | 'lora'), family: item.family, category: item.category, safety: (item.safety === 'adult' ? 'adult' : 'safe'), description: '', triggers: '', weight: 0.8 }
  } else {
    editing.value = null
    editor.value = { source: 'original', title: '', type: 'model', family: 'Krea 2', category: 'base-model', safety: 'safe', description: '', triggers: '', weight: 0.8 }
  }
  onTypeChange()
  editorOpen.value = true
}

async function createDraft() {
  newDraftBusy.value = true
  try {
    const m = await api.createModel()
    await loadMine()
    const item = mine.value.find(x => x.id === m.id)
    openEditor(item)
  } catch (e: unknown) {
    editorErr.value = e instanceof Error ? e.message : '创建失败'
  } finally {
    newDraftBusy.value = false
  }
}

async function saveDraft() {
  editorBusy.value = true
  editorErr.value = ''
  try {
    const triggers = editor.value.triggers.split('\n').map(s => s.trim()).filter(Boolean)
    const draft: ModelDraftInput = {
      source: editor.value.source,
      title: editor.value.title,
      type: editor.value.type,
      family: editor.value.family,
      category: editor.value.category,
      safety: editor.value.safety,
      description: editor.value.description,
      triggers,
      weight: editor.value.type === 'lora' ? editor.value.weight : undefined
    }
    const id = editing.value?.id
    if (!id) throw new Error('缺少模型 id')
    editing.value = await api.saveModel(id, draft)
    editorOpen.value = false
    await loadMine()
  } catch (e: unknown) {
    editorErr.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    editorBusy.value = false
  }
}

async function act(id: string, action: 'submit' | 'withdraw' | 'hide' | 'unhide' | 'remove') {
  try {
    if (action === 'submit') await api.submitModel(id)
    else if (action === 'withdraw') await api.withdrawModel(id)
    else if (action === 'hide') await api.setModelHidden(id, true)
    else if (action === 'unhide') await api.setModelHidden(id, false)
    else if (action === 'remove') {
      if (!window.confirm('删除该模型？')) return
      await api.removeModel(id)
    }
    await loadMine()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

onMounted(() => {
  session.load()
  if (!session.token.value) {
    navigateTo('/auth/login')
    return
  }
  loadMarket()
})
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          模型工坊
        </p>
        <h1>底模与效果包</h1>
        <p>浏览可用的底模与 LoRA；你也可以创建并发布自己的模型。</p>
      </div>
      <button
        type="button"
        class="btn-primary"
        :disabled="newDraftBusy"
        @click="createDraft"
      >
        + 新建模型草稿
      </button>
    </div>

    <div class="filters">
      <button
        v-for="t in ([{ key: 'market', label: '模型市场' }, { key: 'mine', label: '我的模型' }] as const)"
        :key="t.key"
        type="button"
        class="filter-btn"
        :class="{ active: tab === t.key }"
        @click="switchTab(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <p
      v-if="error"
      class="empty-tip"
    >
      {{ error }}
    </p>

    <!-- 市场 -->
    <template v-if="tab === 'market'">
      <div class="filters">
        <button
          v-for="t in ([{ key: 'model', label: '图片底模' }, { key: 'lora', label: '图片 LoRA' }, { key: 'video', label: '视频模型' }] as const)"
          :key="t.key"
          type="button"
          class="filter-btn"
          :class="{ active: typeFilter === t.key }"
          @click="typeFilter = t.key; loadMarket()"
        >
          {{ t.label }}
        </button>
      </div>
      <div
        v-if="typeFilter !== 'video' && facets?.families.length"
        class="fam-row"
      >
        <button
          type="button"
          class="filter-btn"
          :class="{ active: famFilter === '' }"
          @click="famFilter = ''; loadMarket()"
        >
          全部底模族
        </button>
        <button
          v-for="f in facets.families"
          :key="f"
          type="button"
          class="filter-btn"
          :class="{ active: famFilter === f }"
          @click="famFilter = f; loadMarket()"
        >
          {{ f }}
        </button>
      </div>
      <div class="model-grid">
        <button
          v-for="m in models"
          :key="m.id"
          type="button"
          class="model-card"
          @click="showDetail(m.id)"
        >
          <img
            v-if="m.cover"
            :src="m.cover"
            :alt="m.name"
          >
          <div
            v-else-if="m.type === 'video'"
            class="model-cover-placeholder video"
          >
            <span class="play-badge">▶</span>
          </div>
          <div
            v-else
            class="model-cover-placeholder"
          >
            {{ m.name.slice(0, 1) }}
          </div>
          <div class="model-info">
            <small>{{ typeLabel(m) }}</small>
            <strong>{{ m.name }}</strong>
            <span class="muted">{{ m.author }} · {{ m.category }}</span>
          </div>
        </button>
      </div>
      <p
        v-if="!loading && !models.length"
        class="empty-tip"
      >
        {{ typeFilter === 'video' ? '暂无可用视频模型' : '暂无模型' }}
      </p>

      <div
        v-if="detail"
        class="detail-panel"
      >
        <div class="detail-head">
          <h3>{{ detail.name }}</h3>
          <button
            type="button"
            class="composer2-btn-sm"
            @click="detail = null"
          >
            关闭
          </button>
        </div>
        <p class="muted">
          {{ detail.excerpt }}
        </p>
        <p class="muted">
          {{ detail.description }}
        </p>
        <div class="detail-tags">
          <span
            v-for="t in detail.tags"
            :key="t"
            class="chip"
          >{{ t }}</span>
        </div>
        <p><strong>可用：</strong>{{ detail.available ? '是' : '否' }} · <strong>可选：</strong>{{ detail.selectable ? '是' : '否' }}</p>
        <!-- 该底模 family 下的 LoRA 分组 -->
        <div
          v-if="detail.compatible?.length"
          class="lora-group"
        >
          <div class="lora-group-title">
            LoRA · {{ detail.family || detail.name }}（{{ detail.compatible.length }}）
          </div>
          <div class="lora-grid">
            <button
              v-for="l in detail.compatible"
              :key="l.id"
              type="button"
              class="lora-chip"
              @click="showDetail(l.id)"
            >
              {{ l.name }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 我的模型 -->
    <template v-else>
      <div class="mine-list">
        <div
          v-for="m in mine"
          :key="m.id"
          class="mine-row"
        >
          <div>
            <strong>{{ m.title }}</strong>
            <span class="muted">{{ m.type === 'lora' ? 'LoRA' : '模型' }} · {{ m.family }} · {{ m.category }}</span>
          </div>
          <span
            class="status-pill"
            :class="m.state"
          >{{ stateLabel[m.state] || m.state }}</span>
          <div class="mine-actions">
            <button
              type="button"
              class="composer2-btn-sm"
              @click="openEditor(m)"
            >
              编辑
            </button>
            <button
              v-if="m.viewer.submit"
              type="button"
              class="composer2-btn-sm"
              @click="act(m.id, 'submit')"
            >
              提交发布
            </button>
            <button
              v-if="m.viewer.withdraw"
              type="button"
              class="composer2-btn-sm"
              @click="act(m.id, 'withdraw')"
            >
              撤回
            </button>
            <button
              v-if="m.viewer.hide"
              type="button"
              class="composer2-btn-sm"
              @click="act(m.id, m.state === 'hidden' ? 'unhide' : 'hide')"
            >
              {{ m.state === 'hidden' ? '取消隐藏' : '隐藏' }}
            </button>
            <button
              v-if="m.viewer.remove"
              type="button"
              class="composer2-btn-sm danger"
              @click="act(m.id, 'remove')"
            >
              删除
            </button>
          </div>
        </div>
        <p
          v-if="!loading && !mine.length"
          class="empty-tip"
        >
          还没有模型草稿，点「新建模型草稿」开始。
        </p>
      </div>
    </template>

    <!-- 编辑器 -->
    <div
      v-if="editorOpen"
      class="modal-mask"
      @click.self="editorOpen = false"
    >
      <div class="modal-panel editor-panel">
        <div class="modal-title">
          {{ editing ? '编辑模型' : '新建模型草稿' }}
        </div>
        <div class="editor-grid">
          <label class="field">
            <span>名称</span>
            <input
              v-model="editor.title"
              type="text"
              class="composer2-input"
              maxlength="160"
            >
          </label>
          <label class="field">
            <span>类型</span>
            <select
              v-model="editor.type"
              class="composer2-input"
              @change="onTypeChange"
            >
              <option value="model">底模 model</option>
              <option value="lora">效果包 LoRA</option>
            </select>
          </label>
          <label class="field">
            <span>系列 family</span>
            <input
              v-model="editor.family"
              type="text"
              class="composer2-input"
              placeholder="如 Krea 2 / Illustrious"
            >
          </label>
          <label class="field">
            <span>分类</span>
            <select
              v-model="editor.category"
              class="composer2-input"
            >
              <option
                v-for="c in allowedCategories"
                :key="c"
                :value="c"
              >{{ c }}</option>
            </select>
          </label>
          <label class="field">
            <span>安全分级</span>
            <select
              v-model="editor.safety"
              class="composer2-input"
            >
              <option value="safe">safe</option>
              <option value="adult">adult</option>
            </select>
          </label>
          <label
            v-if="editor.type === 'lora'"
            class="field"
          >
            <span>权重 {{ editor.weight }}</span>
            <input
              v-model.number="editor.weight"
              type="range"
              min="-4"
              max="4"
              step="0.05"
            >
          </label>
          <label class="field span2">
            <span>描述</span>
            <textarea
              v-model="editor.description"
              class="composer2-input"
              rows="3"
            />
          </label>
          <label class="field span2">
            <span>触发词（每行一个，LoRA 用）</span>
            <textarea
              v-model="editor.triggers"
              class="composer2-input"
              rows="2"
            />
          </label>
        </div>
        <p
          v-if="editorErr"
          class="error-text"
        >
          {{ editorErr }}
        </p>
        <div class="modal-actions">
          <button
            type="button"
            class="btn-ghost"
            @click="editorOpen = false"
          >
            取消
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="editorBusy"
            @click="saveDraft"
          >
            {{ editorBusy ? '保存中…' : '保存草稿' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fam-row {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin: 0.8rem 0;
}
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.9rem;
  margin-top: 1rem;
}
.model-card {
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 1rem;
  overflow: hidden;
  background: var(--hg-card);
  cursor: pointer;
  padding: 0;
  text-align: left;
  transition: border-color 0.15s;
}
.model-card:hover {
  border-color: var(--hg-accent, #b08a4f);
}
.model-card img,
.model-cover-placeholder {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
.model-cover-placeholder {
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #26272c, #17181b);
  color: var(--amber-soft);
  font-size: 2.4rem;
  font-weight: 800;
}
.model-cover-placeholder.video {
  background: linear-gradient(160deg, #2a2320, #14161a);
  position: relative;
}
.model-cover-placeholder .play-badge {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  border: 1px solid rgba(240, 196, 118, 0.55);
  background: rgba(0, 0, 0, 0.35);
  font-size: 1.1rem;
  padding-left: 0.2rem;
}
.model-info {
  display: grid;
  gap: 0.15rem;
  padding: 0.6rem 0.7rem;
}
.model-info small {
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--hg-accent, #b08a4f);
  text-transform: uppercase;
}
.model-info span {
  font-size: 0.74rem;
}
.detail-panel {
  margin-top: 1rem;
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 1rem;
  padding: 1rem;
  background: var(--hg-card);
}
.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.detail-tags {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
  margin: 0.5rem 0;
}
.chip {
  background: var(--hg-amber, #f3e3c0);
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--amber-soft);
}

/* ── LoRA 分组 ── */
.lora-group {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--hg-line, #e2e4ea);
}
.lora-group-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--amber);
  margin-bottom: 0.5rem;
}
.lora-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.lora-chip {
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.76rem;
  cursor: pointer;
  background: transparent;
  color: var(--ink);
}
.lora-chip:hover {
  border-color: var(--amber);
}
.mine-list {
  display: grid;
  gap: 0.6rem;
  margin-top: 1rem;
}
.mine-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 1rem;
  padding: 0.8rem 1rem;
  background: var(--hg-card);
  flex-wrap: wrap;
}
.mine-row > div:first-child {
  flex: 1;
  display: grid;
  gap: 0.15rem;
  min-width: 160px;
}
.mine-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.status-pill.published {
  background: #dcfce7;
  color: #15803d;
}
.status-pill.pending {
  background: #fef3c7;
  color: #a16207;
}
.status-pill.rejected {
  background: #fee2e2;
  color: #b91c1c;
}
.status-pill.hidden {
  background: #e5e7eb;
  color: #6b7280;
}
.danger {
  color: #b91c1c;
}
.editor-panel {
  width: min(560px, 92vw);
  max-height: 86vh;
  overflow: auto;
}
.editor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.7rem;
  margin: 0.8rem 0;
}
.span2 {
  grid-column: span 2;
}
.field {
  display: grid;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--hg-muted, #666);
}
.error-text {
  color: #dc2626;
  font-size: 0.82rem;
}
.composer2-input {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border-radius: 0.6rem;
  border: 1px solid var(--hg-line, #e2e4ea);
  font-size: 0.85rem;
  outline: none;
  background: var(--hg-input);
  resize: vertical;
}
.composer2-btn-sm {
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--hg-line, #e2e4ea);
  background: transparent;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  color: var(--hg-muted, #666);
}
.composer2-btn-sm:hover {
  border-color: var(--hg-accent, #b08a4f);
  color: var(--hg-accent, #b08a4f);
}
</style>
