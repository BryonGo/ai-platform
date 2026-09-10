<script setup lang="ts">
import AppCharacterForm from '~/components/AppCharacterForm.vue'

const api = useHougongApi()
const session = useAuthSession()

const submitting = ref(false)
const error = ref('')

onMounted(() => {
  session.load()
  if (!session.token.value) {
    navigateTo('/auth/login')
  }
})

async function onSubmit(input: CharacterInput) {
  submitting.value = true
  error.value = ''
  try {
    const created = await api.createCharacter(input)
    await navigateTo(`/characters/${created.id}`)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '创建失败'
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
        <h1>新建角色</h1>
        <p>身份、外观锚点与服装预设都会随任务保存快照，之后改动不影响历史作品。</p>
      </div>
    </div>

    <AppCharacterForm
      :submitting="submitting"
      :server-error="error"
      submit-label="创建角色"
      @submit="onSubmit"
    />
  </div>
</template>
