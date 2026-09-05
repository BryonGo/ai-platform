<script setup lang="ts">
import { workOf, characterOf, worksOf } from '~/composables/useHougong'
import AppWorkCard from '~/components/AppWorkCard.vue'

const route = useRoute()
const w = computed(() => workOf(String(route.params.id)))
const owner = computed(() => characterOf(w.value?.characterId ?? ''))
const related = computed(() =>
  worksOf(w.value?.characterId ?? '').filter(x => x.id !== w.value?.id).slice(0, 3)
)
</script>

<template>
  <div
    v-if="w"
    class="page-body"
  >
    <div class="detail-grid">
      <div>
        <div class="media-frame wide">
          <img
            :src="w.image"
            :alt="w.title"
          >
        </div>
      </div>

      <div class="media-detail">
        <p class="detail-kicker">
          {{ w.kind }} · {{ w.meta }}
          <span
            v-if="w.status === 'running'"
            style="color: var(--amber-soft)"
          >· 生成中</span>
          <span
            v-else-if="w.recommended"
            style="color: var(--amber-soft)"
          >· 推荐</span>
        </p>
        <h1 class="detail-title">
          {{ w.title }}
        </h1>
        <NuxtLink
          v-if="owner"
          :to="`/characters/${owner.id}`"
          class="detail-sub"
          style="text-decoration: none"
        >
          出演：{{ owner.name }} · {{ owner.alias }}
        </NuxtLink>

        <div class="detail-actions">
          <NuxtLink
            v-if="w.status === 'running'"
            to="/create"
            class="btn-ghost"
          >查看进度</NuxtLink>
          <NuxtLink
            :to="`/create?work=${w.id}`"
            class="btn-primary"
          >继续创作</NuxtLink>
          <button
            type="button"
            class="btn-ghost"
          >
            收藏
          </button>
        </div>

        <section class="panel-block">
          <h2>生成信息</h2>
          <dl>
            <div class="info-line">
              <dt>角色</dt>
              <dd>{{ owner?.name }}</dd>
            </div>
            <div class="info-line">
              <dt>类型</dt>
              <dd>{{ w.kind }} · {{ w.meta }}</dd>
            </div>
            <div class="info-line">
              <dt>可见性</dt>
              <dd>私密（默认）</dd>
            </div>
            <div class="info-line">
              <dt>计费</dt>
              <dd>已结算 · 失败自动退回</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>

    <section
      v-if="related.length"
      style="margin-top: 56px"
    >
      <div class="page-head">
        <div>
          <h1 style="font-size: 24px">
            同角色作品
          </h1>
        </div>
      </div>
      <div class="story-grid">
        <AppWorkCard
          v-for="(x, i) in related"
          :key="x.id"
          :work="x"
          :index="i"
        />
      </div>
    </section>
  </div>

  <div
    v-else
    class="empty-state"
  >
    <p>没有找到这部作品</p>
    <NuxtLink
      to="/works"
      class="btn-ghost small"
      style="margin-top: 16px; display: inline-flex"
    >返回作品库</NuxtLink>
  </div>
</template>
