<script setup lang="ts">
import AppCharacterCard from '~/components/AppCharacterCard.vue'

const api = useHougongApi()
const session = useAuthSession()
const characters = ref<CharacterItem[]>([])
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  session.load()
  if (!session.token.value) {
    await navigateTo('/auth/login')
    return
  }
  loading.value = true
  try {
    characters.value = await api.listCharacters()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          角色档案
        </p>
        <h1>她们属于你的宇宙</h1>
        <p>每位角色都有独立的身份、外观、服装与故事线。生成时保持形象一致，改动保留历史版本。</p>
      </div>
      <NuxtLink
        to="/characters/new"
        class="btn-primary"
      >+ 新角色</NuxtLink>
    </div>

    <p
      v-if="error"
      class="empty-tip"
    >
      加载失败：{{ error }}<NuxtLink to="/auth/login">重新登录</NuxtLink>
    </p>
    <p
      v-else-if="!loading && !characters.length"
      class="empty-tip"
    >
      还没有角色。去创作页生成第一位角色吧——形象一致，历史版本可回溯。
    </p>
    <div class="char-grid">
      <AppCharacterCard
        v-for="(c, i) in characters"
        :key="c.id"
        :character="c"
        :index="i"
      />
    </div>
  </div>
</template>
