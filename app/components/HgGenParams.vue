<script setup lang="ts">
// 生成参数面板（不含容器）：比例 / 清晰度 / 分辨率 / **模型支持的参数**。
//
// 用词口径（用户纠正过）：**清晰度**是 1K / 2K 这种档位，**分辨率**是长×宽（1024×1024）。
//
// 为什么合成一个面板：工具条上原来有「画幅」「时长」「参数」「LoRA」四个入口，
// 用户要连点两三次才知道自己出的是多大一张图、能不能调采样。现在只有一个「参数」按钮，
// 面板里按「比例 → 清晰度 → 分辨率 → 模型参数」从上到下排一遍。
//
// 「只显示模型支持的项」由数据决定，不由这里判断：
//   - 比例：调用方只传当前模型支持的比例（云端按 capabilities.parameters[].ratios，
//     本地底模全部支持）；
//   - 清晰度：调用方只传当前模型支持的档位；
//   - 数量/时长/采样：交给 HgParamsPanel，它自己按 mode 与 sampling 是否为 null 决定渲染，
//     云端模型没有采样参数就不出现 Steps/CFG/采样器；
//   - 效果包 LoRA：只在本地底模时有（云端模型没这东西）。
defineProps<{
  mode: 'image' | 'video'
  /** 当前比例（用于高亮） */
  ratio: string
  /** 可选比例：value + 该档的像素尺寸（用于 title 提示） */
  ratios: { value: string, label: string, size?: string }[]
  resolution: string
  resolutions: { value: string, label: string }[]
  /** 当前比例 + 清晰度对应的**分辨率**文案（如 1024 × 1024），空则显示占位 */
  sizeLabel: string
  count: number
  seconds: number
  durationList: number[]
  sampling: { steps: number, sampler: string, scheduler: string, cfg: number } | null
  limits: { steps: number, stepsMin: number, stepsMax: number, cfgMin: number, cfgMax: number, cfgStep: number, samplers: string[], schedulers: string[] } | null
  /** 效果包入口：visible=false 时整行不渲染（云端模型） */
  loraVisible?: boolean
  loraSelected?: number
}>()

const emit = defineEmits<{
  'update:ratio': [value: string]
  'update:resolution': [value: string]
  'update:count': [value: number]
  'update:seconds': [value: number]
  'patch:sampling': [value: Record<string, number | string>]
  'open:lora': []
  'close': []
}>()

/** "1600x2848" → "1600 × 2848"（乘号统一，读起来是尺寸而不是变量名） */
function fmtSize(size: string) {
  return (size || '').replace(/\s*[xX]\s*/, ' × ')
}

function ratioTitle(item: { value: string, size?: string }) {
  return item.size ? `${item.value} · ${fmtSize(item.size)}` : item.value
}
</script>

<template>
  <div class="gen-params">
    <div class="gp-head">
      <span class="row-title">比例</span>
      <button
        type="button"
        class="row-close"
        aria-label="收起参数"
        @click="emit('close')"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </div>
    <div class="ratio-grid">
      <button
        v-for="item in ratios"
        :key="item.value"
        type="button"
        class="ratio-cell"
        :class="{ active: item.value === ratio }"
        :aria-pressed="item.value === ratio"
        :title="ratioTitle(item)"
        @click="emit('update:ratio', item.value)"
      >
        <HgRatioIcon
          :ratio="item.value"
          :size="30"
        />
        <span>{{ item.value }}</span>
      </button>
    </div>

    <div class="gp-line">
      <span class="row-title">清晰度</span>
      <div class="res-row">
        <button
          v-for="item in resolutions"
          :key="item.value"
          type="button"
          class="res-pill"
          :class="{ active: item.value === resolution }"
          :aria-pressed="item.value === resolution"
          @click="emit('update:resolution', item.value)"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <div class="gp-line">
      <span class="row-title">分辨率</span>
      <strong class="gp-value">{{ sizeLabel || '—' }}</strong>
    </div>

    <div class="gp-sub">
      <span class="row-title">模型参数</span>
      <span class="gp-hint">只列出当前模型支持的项</span>
    </div>

    <HgParamsPanel
      :mode="mode"
      :count="count"
      :seconds="seconds"
      :duration-list="durationList"
      :sampling="sampling"
      :limits="limits"
      @update:count="emit('update:count', $event)"
      @update:seconds="emit('update:seconds', $event)"
      @patch:sampling="emit('patch:sampling', $event)"
    />

    <div
      v-if="loraVisible"
      class="gp-line"
    >
      <span class="row-title">效果包</span>
      <button
        type="button"
        class="res-pill"
        @click="emit('open:lora')"
      >
        LoRA{{ loraSelected ? `(${loraSelected})` : '' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.gen-params { display: flex; flex-direction: column; gap: 12px; }
.gp-head { display: flex; align-items: center; justify-content: space-between; }
.row-title { font-size: 12px; color: var(--hg-muted); }
.row-close { display: inline-flex; border: 0; background: transparent; color: var(--hg-muted); cursor: pointer; }
.row-close:hover { color: var(--ink); }
.ratio-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 8px; }
.ratio-cell {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; border: 1px solid var(--hg-line); border-radius: 10px;
  background: transparent; color: var(--hg-muted); font-size: 12px; cursor: pointer;
}
.ratio-cell.active { border-color: var(--hg-accent); background: color-mix(in srgb, var(--hg-accent) 12%, transparent); color: var(--ink); }
.gp-line { display: flex; align-items: center; gap: 10px; }
.gp-value { font-size: 13px; color: var(--ink); }
.gp-sub { display: flex; align-items: baseline; gap: 8px; margin-top: 2px; }
.gp-hint { font-size: 12px; color: var(--hg-muted); }
.res-row { display: flex; flex-wrap: wrap; gap: 6px; }
.res-pill {
  padding: 5px 12px; border: 1px solid var(--hg-line); border-radius: 999px;
  background: transparent; color: var(--hg-muted); font-size: 12px; cursor: pointer;
}
.res-pill.active { border-color: var(--hg-accent); background: color-mix(in srgb, var(--hg-accent) 12%, transparent); color: var(--ink); }
</style>
