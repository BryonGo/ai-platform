<script setup lang="ts">
import { storyOf, clipsOf, characterOf, workOf } from '~/composables/useHougong'

const route = useRoute()
const s = computed(() => storyOf(String(route.params.id)))
const clips = computed(() => (s.value ? clipsOf(s.value) : []))
</script>

<template>
  <div
    v-if="s"
    class="page-body"
  >
    <div class="detail-grid">
      <div>
        <div class="media-frame wide">
          <img
            :src="s.cover"
            :alt="s.title"
          >
        </div>

        <!-- 片段时间线 -->
        <section class="panel-block">
          <h2>片段 · {{ s.clips.length }}</h2>
          <p class="hint">
            按顺序播放，点击可查看对应作品
          </p>
          <div class="clip-list">
            <div
              v-for="clip in clips"
              :key="clip.id"
              class="clip-row"
            >
              <span class="clip-num">{{ clip.order }}</span>
              <div class="clip-body">
                <strong>{{ workOf(clip.workId)?.title }}</strong>
                <small>{{ clip.note }}</small>
              </div>
              <NuxtLink
                :to="`/works/${clip.workId}`"
                class="clip-link"
              >查看 <span
                class="i-lucide-arrow-right"
                aria-hidden="true"
              /></NuxtLink>
            </div>
          </div>
        </section>
      </div>

      <div class="media-detail">
        <p class="detail-kicker">
          故事项目 · 更新于 {{ s.updatedAt }}
        </p>
        <h1 class="detail-title">
          {{ s.title }}
        </h1>
        <p class="detail-desc">
          {{ s.synopsis }}
        </p>

        <div class="detail-actions">
          <NuxtLink
            :to="`/create?story=${s.id}`"
            class="btn-primary"
          >继续创作</NuxtLink>
          <button
            type="button"
            class="btn-ghost"
          >
            整理片段
          </button>
        </div>

        <div class="side-stack">
          <section class="panel-block">
            <h2>角色与关系</h2>
            <div class="avatar-stack">
              <NuxtLink
                v-for="cid in s.characterIds"
                :key="cid"
                :to="`/characters/${cid}`"
              >
                <img
                  :src="characterOf(cid)?.image"
                  :alt="characterOf(cid)?.name"
                  :title="characterOf(cid)?.name"
                >
              </NuxtLink>
            </div>
            <dl v-if="s.relation.length">
              <div
                v-for="(r, i) in s.relation"
                :key="i"
                class="info-line"
              >
                <dt>{{ r.from }} × {{ r.to }}</dt>
                <dd>{{ r.note }}</dd>
              </div>
            </dl>
          </section>

          <section class="panel-block">
            <h2>场景设定</h2>
            <dl>
              <div
                v-for="setting in s.settings"
                :key="setting.name"
                class="info-line"
              >
                <dt>{{ setting.name }}</dt>
                <dd>{{ setting.note }}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  </div>

  <div
    v-else
    class="empty-state"
  >
    <p>没有找到这个故事</p>
    <NuxtLink
      to="/stories"
      class="btn-ghost small"
      style="margin-top: 16px; display: inline-flex"
    >返回故事</NuxtLink>
  </div>
</template>
