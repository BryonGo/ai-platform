<script setup lang="ts">
import type { ComposerMode } from '~/composables/useModelCatalog'

// 生成参数内容（不含容器）：桌面在 popover、移动端在底部面板里共用。
// 约束（交接文档第 7 条修正）：Steps / CFG / 采样器只在所选模型**真的支持**时出现，
// 不能无条件出现在视频或任意云端模型上。
const props = defineProps<{
  mode: ComposerMode
  count: number
  seconds: number
  durationList: number[]
  sampling: { steps: number, sampler: string, scheduler: string, cfg: number } | null
  limits: { steps: number, stepsMin: number, stepsMax: number, cfgMin: number, cfgMax: number, cfgStep: number, samplers: string[], schedulers: string[] } | null
}>()
const emit = defineEmits<{
  'update:count': [value: number]
  'update:seconds': [value: number]
  'patch:sampling': [value: Record<string, number | string>]
}>()

const advanced = computed(() => props.mode === 'image' && !!props.sampling && !!props.limits)
</script>

<template>
  <div class="params-panel">
    <label
      v-if="mode === 'image'"
      class="param-row"
    >
      <span>数量</span>
      <input
        type="number"
        min="1"
        max="4"
        :value="count"
        @input="emit('update:count', Number(($event.target as HTMLInputElement).value) || 1)"
      >
    </label>

    <label
      v-if="mode === 'video'"
      class="param-row"
    >
      <span>时长</span>
      <select
        :value="seconds"
        @change="emit('update:seconds', Number(($event.target as HTMLSelectElement).value))"
      >
        <option
          v-for="item in durationList"
          :key="item"
          :value="item"
        >
          {{ item }} 秒
        </option>
      </select>
    </label>

    <template v-if="advanced && limits && sampling">
      <label class="param-row">
        <span>Steps</span>
        <input
          type="number"
          :min="limits.stepsMin"
          :max="limits.stepsMax"
          :value="sampling.steps"
          @input="emit('patch:sampling', { steps: Number(($event.target as HTMLInputElement).value) })"
        >
      </label>
      <label class="param-row">
        <span>CFG</span>
        <input
          type="number"
          step="0.1"
          :min="limits.cfgMin"
          :max="limits.cfgMax"
          :value="sampling.cfg"
          @input="emit('patch:sampling', { cfg: Number(($event.target as HTMLInputElement).value) })"
        >
      </label>
      <label class="param-row">
        <span>采样器</span>
        <select
          :value="sampling.sampler"
          @change="emit('patch:sampling', { sampler: ($event.target as HTMLSelectElement).value })"
        >
          <option
            v-for="item in limits.samplers"
            :key="item"
            :value="item"
          >
            {{ item }}
          </option>
        </select>
      </label>
      <label class="param-row">
        <span>调度器</span>
        <select
          :value="sampling.scheduler"
          @change="emit('patch:sampling', { scheduler: ($event.target as HTMLSelectElement).value })"
        >
          <option
            v-for="item in limits.schedulers"
            :key="item"
            :value="item"
          >
            {{ item }}
          </option>
        </select>
      </label>
    </template>

    <p class="param-note">
      {{ advanced
        ? '高级参数只在当前模型支持时出现；组合是否合法由后端校验。'
        : '当前模型不提供采样参数；能力项以后端目录为准。' }}
    </p>
  </div>
</template>

<style scoped>
/* 面板自带实底：之前只有 layout、没有背景，浮层里看过去是透明的 */
.params-panel {
  display: grid;
  gap: 8px;
  width: 100%;
  min-width: 240px;
  padding: 12px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 12px;
  background: #1c1d21;
  box-shadow: 0 18px 44px #0009;
}
.param-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--hg3-muted, #9a9791);
  font-size: 12px;
}
.param-row input,
.param-row select {
  width: 130px;
  padding: 6px 8px;
  border: 1px solid var(--hg3-line, rgb(255 255 255 / 8%));
  border-radius: 8px;
  background: #141519;
  color: var(--hg3-ink, #f2f0ec);
  font-family: inherit;
  font-size: 12px;
  outline: none;
}
.param-note {
  margin: 2px 0 0;
  color: var(--hg3-faint, #6e6b66);
  font-size: 11px;
  line-height: 1.5;
}
</style>
