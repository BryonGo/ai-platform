<script setup lang="ts">
import AppCharacterForm from '~/components/AppCharacterForm.vue'

const api = useHougongApi()
const session = useAuthSession()
const route = useRoute()

const character = ref<CharacterItem | null>(null)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')

const characterId = computed(() => String(route.params.id))

onMounted(async () => {
  session.load()
  if (!session.token.value) {
    await navigateTo('/auth/login')
    return
  }
  try {
    character.value = await api.getCharacter(Number(characterId.value))
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

// 删除角色（后端会校验：名下还有作品时拒绝，需先删作品）
async function removeCharacter() {
  if (!character.value) return
  if (!window.confirm(`删除角色「${character.value.name}」？删除后无法恢复。`)) return
  try {
    await api.deleteCharacter(characterId.value)
    await navigateTo('/characters')
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function onSubmit(input: CharacterInput) {
  submitting.value = true
  error.value = ''
  try {
    await api.updateCharacter(characterId.value, input)
    await navigateTo(`/characters/${characterId.value}`)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          角色档案
        </p>
        <h1>编辑角色</h1>
        <p>留空的字段保持原值；服装预设按「追加版本」处理——第一条成为当前默认，旧造型保留为历史。</p>
      </div>
    </div>

    <p
      v-if="loading"
      class="empty-tip"
    >
      正在加载…
    </p>
    <template v-else-if="character">
      <AppCharacterForm
        :initial="character"
        :submitting="submitting"
        :server-error="error"
        edit-mode
        submit-label="保存修改"
        @submit="onSubmit"
      />
      <div class="danger-zone">
        <div>
          <strong>删除角色</strong>
          <small>名下还有作品时无法删除，请先删除该角色的作品。</small>
        </div>
        <button
          type="button"
          class="btn-ghost danger"
          @click="removeCharacter"
        >
          删除角色
        </button>
      </div>
    </template>
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
  </div>
</template>

<style scoped>
.danger-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 880px;
  margin-top: 24px;
  padding: 16px 18px;
  border: 1px solid rgba(217, 83, 79, 0.35);
  border-radius: 12px;
}
.danger-zone small {
  display: block;
  margin-top: 4px;
  color: var(--text-dim, #8a8f98);
}
.btn-ghost.danger {
  color: #d9534f;
  border-color: rgba(217, 83, 79, 0.4);
}
</style>
