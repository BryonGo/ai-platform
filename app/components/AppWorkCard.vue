<script setup lang="ts">
// 展示型卡片：角色信息由调用方传入（真实接口的角色名/头像）。
export interface WorkCardItem {
  id: string | number
  title: string
  characterId: string | number
  kind: string
  meta?: string
  image?: string
  tone?: string
  recommended?: boolean
  status?: string
  /** 内容分级 sfw/r15/r18。 */
  contentRating?: string
  /**
   * 是否需要遮罩。由调用方按服务端口径算好（r18 且当前不可用成人内容），
   * 卡片不自己判断 —— 权限判定只有一处。
   */
  masked?: boolean
}

defineProps<{
  work: WorkCardItem
  index: number
  characterName?: string
  characterImage?: string
}>()
</script>

<template>
  <NuxtLink
    :to="`/works/${work.id}`"
    class="story-card"
  >
    <template v-if="work.image">
      <img
        class="media-fg"
        :src="work.image"
        :alt="work.title"
      >
    </template>
    <div
      v-else
      class="work-placeholder"
      aria-hidden="true"
    >
      <span>{{ work.title.slice(0, 1) }}</span>
    </div>
    <span
      class="story-wash"
      aria-hidden="true"
    />
    <span class="story-index">0{{ index + 1 }}</span>
    <!-- r18 遮罩：成人分级作品在未开启成人模式时默认模糊，
         标题留在下面（不遮标题是有意的：用户要能认出这是自己的哪张图）。 -->
    <span
      v-if="work.masked"
      class="adult-mask"
      aria-hidden="true"
    />
    <span
      v-if="work.contentRating === 'r18'"
      class="rating-pill"
    >R18</span>
    <span
      v-else-if="work.contentRating === 'r15'"
      class="rating-pill rating-pill--mild"
    >R15</span>
    <span
      v-if="work.status === 'running'"
      class="status-pill"
    >生成中</span>
    <span
      v-else-if="work.recommended"
      class="story-recommended"
    >推荐</span>
    <div class="story-info">
      <small>{{ work.kind }}<template v-if="work.meta"> · {{ work.meta }}</template></small>
      <h3>{{ work.title }}</h3>
      <div>
        <template v-if="characterName">
          <img
            v-if="characterImage"
            :src="characterImage"
            :alt="characterName"
          >
          <span>{{ characterName }}</span>
        </template><span
          v-else
          class="story-role-fallback"
        >角色 {{ String(work.characterId).slice(-4) }}</span>
      </div>
    </div>
  </NuxtLink>
</template>

<style scoped>
/* 遮罩只挡画面，不挡标题：用户要能认出这是自己的哪张图。
   强模糊 + 轻微暗化，避免"糊一层还能看清"的假遮罩。 */
.adult-mask {
  position: absolute;
  inset: 0;
  z-index: 2;
  backdrop-filter: blur(22px) saturate(0.7);
  background: rgb(8 9 10 / 0.35);
}

.rating-pill {
  position: absolute;
  z-index: 3;
  top: 10px;
  left: 10px;
  padding: 2px 8px;
  border: 1px solid rgb(251 191 36 / 0.6);
  border-radius: 4px;
  background: rgb(8 9 10 / 0.7);
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--amber);
}

.rating-pill--mild {
  border-color: var(--line);
  color: var(--muted);
}

.work-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: linear-gradient(160deg, #26272c, #171717);
  color: var(--amber-soft);
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 800;
}
</style>
