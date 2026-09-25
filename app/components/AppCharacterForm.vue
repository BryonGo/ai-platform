<script setup lang="ts">
// 角色表单（新建 / 编辑共用），**视觉优先**：
//   第一屏 = 角色源图（必选）+ 角色名 + 成年确认；
//   第二屏 = 结构化标签（时代/地区/性别/…），筛选与画布都按它消费；
//   其余（性格 / 外观锚点 / 服装预设 / 内部备注）收进折叠区，不挤占首屏。
//
// 字段与后端 CharacterInputData 对齐；注意后端 PUT 语义：空字符串 = 「不修改」，
// 所以编辑态留空即保持原值。
//
// 关于「AI 已生成」：后台生成流水线**尚未接入**，这里只如实说明"当前只保存源图"，
// 绝不显示"已生成/稍后会自动出现"这类并不存在的承诺（仓库约定：做不到的就说做不到）。
import { ACTOR_TAXONOMY_FIELDS } from '~/utils/actor'

const props = withDefaults(defineProps<{
  initial?: Partial<CharacterItem>
  submitting?: boolean
  serverError?: string
  submitLabel?: string
  editMode?: boolean
  /** 取消后回到哪里（默认回平台演员库，不再跳旧的 /characters / ?pane=actors）。 */
  cancelTo?: string
}>(), {
  cancelTo: '/actors'
})

const emit = defineEmits<{ submit: [CharacterInput] }>()

const api = useHougongApi()

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 15 << 20 // 15MB，与后端 maxMediaUploadBytes 对齐
const SWATCHES = ['#b3261e', '#7c4dff', '#00897b', '#f9a825', '#37474f', '#c2185b']
const DEFAULT_SWATCH = '#b3261e'

const form = reactive({
  name: '',
  alias: '',
  note: '',
  ageVerified: false,
  traits: [] as string[],
  appearance: [] as { label: string, value: string }[],
  outfits: [] as { name: string, note: string, swatch: string }[]
})

/** 结构化标签：10 个单值 + 气质多选。 */
interface TaxonomyForm {
  eraCategory: string
  era: string
  region: string
  gender: string
  ageGroup: string
  species: string
  bodyType: string
  height: string
  skinTone: string
  hairLength: string
  hairColor: string
  temperament: string[]
}
const taxonomy = reactive<TaxonomyForm>({
  eraCategory: '',
  era: '',
  region: '',
  gender: '',
  ageGroup: '',
  species: '',
  bodyType: '',
  height: '',
  skinTone: '',
  hairLength: '',
  hairColor: '',
  temperament: []
})

// ── 角色源图 ──
const sourceAssetId = ref('')
const sourceUrl = ref('')
const sourceBusy = ref(false)
const sourceError = ref('')
const pickerOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// ── 结构化标签的可选值（后端字典）──
const facets = ref<ActorFacets>({})
const facetsError = ref('')

const newTrait = ref('')
const localError = ref('')

function singleOptions(key: string) {
  return (facets.value as Record<string, { value: string, label?: string }[] | undefined>)[key] || []
}

/** 气质选项：以后端 facets 为主，并补上已选值（编辑态可能是旧字典里的）。 */
const temperamentOptions = computed(() => {
  const out: { value: string, label?: string }[] = [...singleOptions('temperament')]
  const seen = new Set(out.map(o => o.value))
  for (const value of taxonomy.temperament) {
    if (!seen.has(value)) out.push({ value })
  }
  return out
})

/**
 * 某个单值维度的选项：后端 facets 优先，并**补上已选但 facets 里没有的旧值**。
 *
 * 为什么需要：facets 只覆盖当前已发布演员用过的取值。老角色（或运营刚改了字典）
 * 的已选值可能不在里面，此时若只渲染 facets，下拉会显示"未设置"——用户会以为设定丢了。
 */
function optionsFor(key: string, selected: string) {
  const out = [...singleOptions(key)]
  const seen = new Set(out.map(o => o.value))
  if (selected && !seen.has(selected)) out.unshift({ value: selected })
  return out
}

function toggleTemperament(value: string) {
  const i = taxonomy.temperament.indexOf(value)
  if (i >= 0) taxonomy.temperament.splice(i, 1)
  else taxonomy.temperament.push(value)
}

async function loadFacets() {
  facetsError.value = ''
  try {
    const res = await api.listActors({ page: 1, pageSize: 1 })
    facets.value = res.facets
  } catch (e: unknown) {
    facetsError.value = e instanceof Error ? e.message : '可选值读取失败'
  }
}

function fill(c?: Partial<CharacterItem>) {
  if (!c) return
  form.name = c.name || ''
  form.alias = c.alias || ''
  form.note = c.tagline || ''
  form.ageVerified = !!c.ageVerified
  form.traits = [...(c.traits || [])]
  form.appearance = (c.appearance || []).map(a => ({ label: a.label, value: a.value }))
  form.outfits = (c.outfits || []).map(o => ({ name: o.name, note: o.note, swatch: o.swatch || DEFAULT_SWATCH }))
  if (!form.outfits.length) addOutfit()

  if (c.taxonomy) {
    for (const field of ACTOR_TAXONOMY_FIELDS) {
      taxonomy[field.key] = (c.taxonomy as Record<string, unknown>)[field.key] ? String((c.taxonomy as Record<string, unknown>)[field.key]) : ''
    }
    taxonomy.temperament = [...(c.taxonomy.temperament || [])]
  }

  // 源图优先取立绘，其次头像 / 全身。
  const media = c.media
  const slot = media?.portrait || media?.headshot || media?.fullBody
  if (slot) {
    sourceAssetId.value = slot.assetId || ''
    sourceUrl.value = slot.url
  }
}

// ── 源图上传 / 选择 ──
async function resolveSourceUrl(assetId: string) {
  try {
    const choices = await api.assetSelectByIds([assetId])
    sourceUrl.value = choices[0]?.asset?.url || ''
  } catch {
    sourceUrl.value = ''
  }
}

async function uploadSource(file: File) {
  if (!ALLOWED_MIME.includes(file.type)) {
    sourceError.value = '只支持 JPG / PNG / WebP 图片'
    return
  }
  if (file.size > MAX_BYTES) {
    sourceError.value = '图片不能超过 15MB'
    return
  }
  sourceBusy.value = true
  sourceError.value = ''
  try {
    const up = await api.uploadAsset(file)
    if (!up.assetId) {
      sourceError.value = '上传成功但后端没有返回素材 id，请重试'
      return
    }
    sourceAssetId.value = up.assetId
    await resolveSourceUrl(up.assetId)
  } catch (e: unknown) {
    sourceError.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    sourceBusy.value = false
  }
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 清空 value，保证同一张图删掉后还能再选
  input.value = ''
  if (file) void uploadSource(file)
}

function onPickAsset(asset: { id: string, url: string }) {
  if (!asset?.id) return
  sourceAssetId.value = asset.id
  sourceUrl.value = asset.url
  pickerOpen.value = false
}

function clearSource() {
  sourceAssetId.value = ''
  sourceUrl.value = ''
  sourceError.value = ''
}

// ── 老字段编辑 ──
function addTrait() {
  const t = newTrait.value.trim()
  if (!t || form.traits.includes(t)) {
    newTrait.value = ''
    return
  }
  form.traits.push(t)
  newTrait.value = ''
}

function removeTrait(i: number) {
  form.traits.splice(i, 1)
}

function addAppearance() {
  form.appearance.push({ label: '', value: '' })
}

function removeAppearance(i: number) {
  form.appearance.splice(i, 1)
}

function addOutfit() {
  form.outfits.push({ name: '', note: '', swatch: SWATCHES[form.outfits.length % SWATCHES.length] ?? DEFAULT_SWATCH })
}

function removeOutfit(i: number) {
  form.outfits.splice(i, 1)
}

function onSubmit() {
  localError.value = ''
  if (!sourceAssetId.value && !props.editMode) {
    localError.value = '请先上传或选择一张角色源图'
    return
  }
  if (!form.name.trim()) {
    localError.value = '请填写角色名'
    return
  }
  if (!form.ageVerified) {
    localError.value = '仅允许创建成年角色，请勾选成年确认'
    return
  }

  const builtTaxonomy: ActorTaxonomy = {}
  for (const field of ACTOR_TAXONOMY_FIELDS) {
    const value = taxonomy[field.key]?.trim()
    if (value) builtTaxonomy[field.key] = value
  }
  if (taxonomy.temperament.length) builtTaxonomy.temperament = [...taxonomy.temperament]

  const input: CharacterInput = {
    name: form.name.trim(),
    alias: form.alias.trim(),
    ageVerified: true,
    // 自由文本（内部备注）落到 tagline —— 后端唯一的自由描述字段。
    tagline: form.note.trim(),
    traits: form.traits,
    appearance: form.appearance
      .filter(a => a.label.trim() || a.value.trim())
      .map(a => ({ label: a.label.trim(), value: a.value.trim() })),
    outfits: form.outfits
      .filter(o => o.name.trim())
      .map(o => ({ name: o.name.trim(), note: o.note.trim(), swatch: o.swatch }))
  }
  if (Object.keys(builtTaxonomy).length) input.taxonomy = builtTaxonomy
  if (sourceAssetId.value) input.sourceAssetId = sourceAssetId.value
  emit('submit', input)
}

watch(() => props.initial, fill, { immediate: true, deep: false })
onMounted(loadFacets)
</script>

<template>
  <form
    class="character-form"
    @submit.prevent="onSubmit"
  >
    <!-- 第一屏：视觉优先 —— 先定脸 -->
    <section class="panel-block fx-hero">
      <h2>角色源图 *</h2>
      <p class="hint">
        先定「脸」：上传或选择一张角色源图，后续造型与图片都从它派生。
      </p>
      <div class="source-pick">
        <div class="source-preview">
          <img
            v-if="sourceUrl"
            :src="sourceUrl"
            :alt="form.name || '角色源图'"
          >
          <span
            v-else
            class="source-empty"
          >未选择</span>
        </div>
        <div class="source-side">
          <div class="source-actions">
            <button
              type="button"
              class="btn-ghost small"
              :disabled="sourceBusy"
              @click="fileInput?.click()"
            >
              {{ sourceBusy ? '上传中…' : '上传图片' }}
            </button>
            <button
              type="button"
              class="btn-ghost small"
              @click="pickerOpen = true"
            >
              从我的资产选择
            </button>
            <button
              v-if="sourceAssetId"
              type="button"
              class="btn-ghost small"
              @click="clearSource"
            >
              移除
            </button>
          </div>
          <p class="hint">
            支持 JPG / PNG / WebP，≤15MB。选中后确认签名地址，返回真实素材 id。
          </p>
          <small class="fx-note">当前版本只保存这张源图；自动派生多视图 / 音色尚未接入。</small>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="sr-only"
            @change="onFile"
          >
        </div>
      </div>
      <p
        v-if="sourceError"
        class="form-error"
        role="alert"
      >
        {{ sourceError }}
      </p>
    </section>

    <section class="panel-block">
      <h2>身份</h2>
      <div class="field-row">
        <label class="field">
          <span>角色名 *</span>
          <input
            v-model="form.name"
            type="text"
            class="composer2-input"
            maxlength="64"
            placeholder="如 妲己"
          >
        </label>
        <label class="field">
          <span>称号 / 别名</span>
          <input
            v-model="form.alias"
            type="text"
            class="composer2-input"
            maxlength="128"
            :placeholder="editMode ? '留空 = 不修改' : '如 狐灵'"
          >
        </label>
      </div>
      <label class="check-row">
        <input
          v-model="form.ageVerified"
          type="checkbox"
        >
        <span>我确认该角色为成年角色（仅允许成年角色）</span>
      </label>
    </section>

    <!-- 结构化标签：可筛选、可被画布消费 -->
    <section class="panel-block">
      <h2>结构化标签</h2>
      <p class="hint">
        这些维度决定演员能否被筛选到，也是画布消费的口径。取值由后端字典下发。
        <button
          v-if="facetsError"
          type="button"
          class="fx-inline-link"
          @click="loadFacets"
        >
          重试读取
        </button>
      </p>
      <div class="tax-grid">
        <label
          v-for="field in ACTOR_TAXONOMY_FIELDS"
          :key="field.key"
          class="tax-field"
        >
          <span>{{ field.label }}</span>
          <select
            v-model="taxonomy[field.key]"
            class="tax-select"
            :aria-label="field.label"
          >
            <option value="">
              未设置
            </option>
            <option
              v-for="opt in optionsFor(field.key, taxonomy[field.key])"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label || opt.value }}
            </option>
          </select>
        </label>
      </div>
      <div class="tax-field tax-field--wide">
        <span>气质（可多选）</span>
        <div class="tag-row">
          <button
            v-for="opt in temperamentOptions"
            :key="opt.value"
            type="button"
            class="tax-chip"
            :class="{ active: taxonomy.temperament.includes(opt.value) }"
            :aria-pressed="taxonomy.temperament.includes(opt.value)"
            @click="toggleTemperament(opt.value)"
          >
            {{ opt.label || opt.value }}
          </button>
          <small v-if="!temperamentOptions.length">暂无可选气质</small>
        </div>
      </div>
      <p
        v-if="facetsError"
        class="hint"
      >
        {{ facetsError }}
      </p>
    </section>

    <details class="fx-details">
      <summary>更多设定（可选）：性格 / 外观锚点 / 服装预设</summary>
      <div class="fx-details__body">
        <section class="panel-block">
          <h2>性格</h2>
          <div class="tag-row">
            <span
              v-for="(t, i) in form.traits"
              :key="t"
              class="chip chip-removable"
            >
              {{ t }}
              <button
                type="button"
                class="chip-x"
                :aria-label="`删除 ${t}`"
                @click="removeTrait(i)"
              >×</button>
            </span>
          </div>
          <div class="input-row">
            <input
              v-model="newTrait"
              type="text"
              class="composer2-input"
              maxlength="32"
              placeholder="输入一个性格标签后回车"
              @keydown.enter.prevent="addTrait"
            >
            <button
              type="button"
              class="btn-ghost small"
              @click="addTrait"
            >
              添加
            </button>
          </div>
        </section>

        <section class="panel-block">
          <h2>外观锚点</h2>
          <p class="hint">
            生成时按这些特征保持形象一致
          </p>
          <div
            v-for="(a, i) in form.appearance"
            :key="i"
            class="input-row"
          >
            <input
              v-model="a.label"
              type="text"
              class="composer2-input short"
              maxlength="32"
              placeholder="特征名（如 发型）"
            >
            <input
              v-model="a.value"
              type="text"
              class="composer2-input"
              maxlength="128"
              placeholder="取值（如 乌黑长直发）"
            >
            <button
              type="button"
              class="btn-ghost small"
              @click="removeAppearance(i)"
            >
              删除
            </button>
          </div>
          <button
            type="button"
            class="btn-ghost small"
            @click="addAppearance"
          >
            + 添加锚点
          </button>
        </section>

        <section class="panel-block">
          <h2>服装预设</h2>
          <p class="hint">
            {{ editMode
              ? '提交后按「追加版本」处理：第一条成为当前默认，旧造型保留为历史（不影响已生成作品）'
              : '第一条为当前默认造型' }}
          </p>
          <div
            v-for="(o, i) in form.outfits"
            :key="i"
            class="input-row"
          >
            <input
              v-model="o.swatch"
              type="color"
              class="swatch-input"
              :aria-label="`造型 ${i + 1} 配色`"
            >
            <input
              v-model="o.name"
              type="text"
              class="composer2-input short"
              maxlength="64"
              placeholder="造型名（如 朱红丝缎裙）"
            >
            <input
              v-model="o.note"
              type="text"
              class="composer2-input"
              maxlength="128"
              placeholder="备注"
            >
            <button
              type="button"
              class="btn-ghost small"
              :disabled="form.outfits.length <= 1"
              @click="removeOutfit(i)"
            >
              删除
            </button>
          </div>
          <button
            type="button"
            class="btn-ghost small"
            @click="addOutfit"
          >
            + 添加造型
          </button>
        </section>
      </div>
    </details>

    <details class="fx-details">
      <summary>内部备注（可选）</summary>
      <div class="fx-details__body">
        <textarea
          v-model="form.note"
          class="fx-textarea"
          maxlength="512"
          rows="3"
          aria-label="内部备注"
          placeholder="仅自己可见的备注；会随角色保存，不参与筛选与生成。"
        />
      </div>
    </details>

    <p
      v-if="localError || serverError"
      class="form-error"
      role="alert"
    >
      {{ localError || serverError }}
    </p>

    <div class="detail-actions">
      <button
        type="submit"
        class="btn-primary"
        :disabled="submitting || sourceBusy"
      >
        {{ submitting ? '保存中…' : (submitLabel || '保存') }}
      </button>
      <NuxtLink
        :to="cancelTo"
        class="btn-ghost"
      >
        取消
      </NuxtLink>
    </div>

    <HgAssetPicker
      :open="pickerOpen"
      :selected-ids="sourceAssetId ? [sourceAssetId] : []"
      :can-add-more="!sourceAssetId"
      @select="onPickAsset"
      @close="pickerOpen = false"
    />
  </form>
</template>

<style scoped>
.character-form {
  display: grid;
  gap: 24px;
  max-width: 880px;
}

.fx-hero {
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 18px;
  background: rgb(255 255 255 / 2%);
}
.source-pick {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.source-preview {
  flex: 0 0 auto;
  width: 180px;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #141416;
}
.source-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.source-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--faint);
  font-size: 13px;
}
.source-side {
  display: grid;
  gap: 8px;
  align-content: start;
  flex: 1 1 260px;
}
.source-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.source-actions .btn-ghost {
  min-height: 44px;
}
.fx-note {
  color: var(--faint);
  font-size: 11.5px;
}

.tax-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.tax-field {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
}
.tax-field--wide {
  margin-top: 14px;
}
.tax-select {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgb(255 255 255 / 3%);
  color: var(--ink);
  font-family: inherit;
  font-size: 13px;
}
.tax-select:focus-visible,
.tax-chip:focus-visible {
  outline: 2px solid var(--hg-accent);
  outline-offset: 2px;
}
.tax-chip {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tax-chip.active {
  border-color: var(--hg-accent);
  background: rgb(232 50 176 / 12%);
  color: var(--hg-accent-hi);
}

.fx-details {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px 16px;
  background: rgb(255 255 255 / 2%);
}
.fx-details summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 13px;
}
.fx-details[open] summary {
  margin-bottom: 12px;
  color: var(--ink);
}
.fx-details__body {
  display: grid;
  gap: 18px;
}
.fx-textarea {
  width: 100%;
  min-height: 88px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgb(255 255 255 / 3%);
  color: var(--ink);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}
.fx-textarea:focus {
  outline: 2px solid var(--hg-accent);
  outline-offset: 1px;
}
.fx-inline-link {
  margin-left: 6px;
  border: 0;
  background: transparent;
  color: var(--hg-accent-hi);
  font-family: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.chip-removable {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.chip-x {
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0.7;
  padding: 0;
}
.chip-x:hover {
  opacity: 1;
}
.swatch-input {
  width: 40px;
  height: 38px;
  padding: 2px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: transparent;
}
.composer2-input.short {
  max-width: 220px;
}

@media (prefers-reduced-motion: reduce) {
  .tax-chip, .tax-select, .fx-details summary { transition: none; }
}
</style>
