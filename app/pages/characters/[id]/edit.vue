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
    <AppCharacterForm
      v-else-if="character"
      :initial="character"
      :submitting="submitting"
      :server-error="error"
      edit-mode
      submit-label="保存修改"
      @submit="onSubmit"
    />
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
