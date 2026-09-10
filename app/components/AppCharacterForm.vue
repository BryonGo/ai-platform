<script setup lang="ts">
// 角色表单（新建 / 编辑共用）。字段与后端 CharacterInputData 一一对应。
// 注意后端 PUT 语义：空字符串表示「不修改」，所以编辑态下留空即保持原值。
const props = defineProps<{
  initial?: Partial<CharacterItem>
  submitting?: boolean
  serverError?: string
  submitLabel?: string
  editMode?: boolean
}>()

const emit = defineEmits<{ submit: [CharacterInput] }>()

const SWATCHES = ['#b3261e', '#7c4dff', '#00897b', '#f9a825', '#37474f', '#c2185b']
const DEFAULT_SWATCH = '#b3261e'

const form = reactive({
  name: '',
  alias: '',
  age: '',
  ageVerified: false,
  tagline: '',
  traits: [] as string[],
  appearance: [] as { label: string, value: string }[],
  outfits: [] as { name: string, note: string, swatch: string }[]
})

const newTrait = ref('')
const localError = ref('')

function fill(c?: Partial<CharacterItem>) {
  if (!c) return
  form.name = c.name || ''
  form.alias = c.alias || ''
  form.age = c.age || ''
  form.ageVerified = !!c.ageVerified
  form.tagline = c.tagline || ''
  form.traits = [...(c.traits || [])]
  form.appearance = (c.appearance || []).map(a => ({ label: a.label, value: a.value }))
  form.outfits = (c.outfits || []).map(o => ({ name: o.name, note: o.note, swatch: o.swatch || DEFAULT_SWATCH }))
  if (!form.outfits.length) {
    addOutfit()
  }
}

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
  if (!form.name.trim()) {
    localError.value = '请填写角色名'
    return
  }
  if (!form.ageVerified) {
    localError.value = '仅允许创建成年角色，请勾选成年确认'
    return
  }
  emit('submit', {
    name: form.name.trim(),
    alias: form.alias.trim(),
    age: form.age.trim(),
    ageVerified: true,
    tagline: form.tagline.trim(),
    traits: form.traits,
    appearance: form.appearance
      .filter(a => a.label.trim() || a.value.trim())
      .map(a => ({ label: a.label.trim(), value: a.value.trim() })),
    outfits: form.outfits
      .filter(o => o.name.trim())
      .map(o => ({ name: o.name.trim(), note: o.note.trim(), swatch: o.swatch }))
  })
}

watch(() => props.initial, fill, { immediate: true, deep: false })
</script>

<template>
  <form
    class="character-form"
    @submit.prevent="onSubmit"
  >
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
      <div class="field-row">
        <label class="field">
          <span>年龄</span>
          <input
            v-model="form.age"
            type="text"
            class="composer2-input"
            maxlength="32"
            :placeholder="editMode ? '留空 = 不修改' : '如 24 岁'"
          >
        </label>
        <label class="field">
          <span>一句话设定</span>
          <input
            v-model="form.tagline"
            type="text"
            class="composer2-input"
            maxlength="512"
            :placeholder="editMode ? '留空 = 不修改' : '如 妖艳而聪明'"
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

    <p
      v-if="localError || serverError"
      class="form-error"
    >
      {{ localError || serverError }}
    </p>

    <div class="detail-actions">
      <button
        type="submit"
        class="btn-primary"
        :disabled="submitting"
      >
        {{ submitting ? '保存中…' : (submitLabel || '保存') }}
      </button>
      <NuxtLink
        to="/characters"
        class="btn-ghost"
      >
        取消
      </NuxtLink>
    </div>
  </form>
</template>

<style scoped>
.character-form {
  display: grid;
  gap: 24px;
  max-width: 880px;
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
</style>
