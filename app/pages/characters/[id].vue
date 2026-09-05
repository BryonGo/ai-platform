<script setup lang="ts">
import { characterOf, worksOf } from '~/composables/useHougong'
import AppWorkCard from '~/components/AppWorkCard.vue'

const route = useRoute()
const c = computed(() => characterOf(String(route.params.id)))
const works = computed(() => worksOf(String(route.params.id)))
</script>

<template>
  <div
    v-if="c"
    class="page-body"
  >
    <div class="detail-grid">
      <div>
        <div class="media-frame portrait">
          <img
            :src="c.image"
            :alt="c.name"
          >
          <span
            class="story-wash"
            aria-hidden="true"
          />
          <div class="story-info">
            <small>{{ c.age }}</small>
            <h3>{{ c.name }}</h3>
            <div><span>{{ c.alias }}</span></div>
          </div>
        </div>
      </div>

      <div class="media-detail">
        <p class="detail-kicker">
          角色设定
        </p>
        <h1 class="detail-title">
          {{ c.name }}
        </h1>
        <p class="detail-desc">
          {{ c.tagline }}
        </p>

        <div class="detail-actions">
          <NuxtLink
            :to="`/create?character=${c.id}`"
            class="btn-primary"
          >用她创作</NuxtLink>
          <button
            type="button"
            class="btn-ghost"
          >
            生成新造型
          </button>
        </div>

        <section class="panel-block">
          <h2>性格</h2>
          <div class="tag-row">
            <span
              v-for="t in c.traits"
              :key="t"
              class="chip"
            >{{ t }}</span>
          </div>
        </section>

        <section class="panel-block">
          <h2>外观锚点</h2>
          <p class="hint">
            生成时按这些特征保持形象一致
          </p>
          <dl class="spec-list">
            <div
              v-for="item in c.appearance"
              :key="item.label"
              class="spec-row"
            >
              <dt class="spec-label">
                {{ item.label }}
              </dt>
              <dd class="spec-value">
                {{ item.value }}
              </dd>
            </div>
          </dl>
        </section>

        <section class="panel-block">
          <h2>服装预设</h2>
          <p class="hint">
            本次出演造型与档案分离，历史任务保留当时快照
          </p>
          <div class="outfit-row">
            <div
              v-for="(o, i) in c.outfits"
              :key="o.name"
              class="outfit-item"
              :class="{ current: i === 0 }"
            >
              <span
                class="outfit-swatch"
                :style="{ background: o.swatch }"
                aria-hidden="true"
              />
              <strong>{{ o.name }}</strong>
              <small>{{ o.note }}</small>
              <span
                v-if="i === 0"
                class="current-tag"
              >当前默认</span>
            </div>
          </div>
        </section>
      </div>
    </div>

    <section style="margin-top: 56px">
      <div class="page-head">
        <div>
          <h1 style="font-size: 24px">
            她的作品
          </h1>
          <p>{{ works.length }} 部 · 每次任务保存实际配置快照</p>
        </div>
      </div>
      <div class="story-grid">
        <AppWorkCard
          v-for="(w, i) in works"
          :key="w.id"
          :work="w"
          :index="i"
        />
      </div>
    </section>
  </div>

  <div
    v-else
    class="empty-state"
  >
    <p>没有找到这位角色</p>
    <NuxtLink
      to="/characters"
      class="btn-ghost small"
      style="margin-top: 16px; display: inline-flex"
    >返回角色</NuxtLink>
  </div>
</template>
