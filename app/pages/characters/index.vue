<script setup lang="ts">
import { characters } from '~/composables/useHougong'
import AppCharacterCard from '~/components/AppCharacterCard.vue'
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
        to="/create"
        class="btn-primary"
      >+ 新角色</NuxtLink>
    </div>

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
