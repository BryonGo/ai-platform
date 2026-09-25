<script setup lang="ts">
import AppCharacterForm from '~/components/AppCharacterForm.vue'

const api = useHougongApi()
const session = useAuthSession()

const submitting = ref(false)
const error = ref('')

onMounted(async () => {
  await session.load()
  if (!session.token.value) {
    goLogin()
  }
})

async function onSubmit(input: CharacterInput) {
  submitting.value = true
  error.value = ''
  try {
    await api.createCharacter(input)
    // 创建后回「我的演员」（/actors/mine），不再跳旧的 /characters / ?pane=actors。
    await navigateTo('/actors/mine')
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
          演员库
        </p>
        <h1>新建演员</h1>
        <p>先定脸再定设定：角色源图 + 角色名 + 成年确认是必需项，结构化标签让演员可被筛选与复用。</p>
      </div>
    </div>

    <AppCharacterForm
      :submitting="submitting"
      :server-error="error"
      submit-label="创建演员"
      @submit="onSubmit"
    />
  </div>
</template>
