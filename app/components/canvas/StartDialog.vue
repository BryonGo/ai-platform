<script setup lang="ts">
/**
 * 画布起始面板：新建时选「空白」还是「套模板」，也能把当前这张图另存为模板。
 *
 * 现在没有后端，用户模板存在浏览器本地（见 ~/data/canvas-templates.ts）。
 * 后端就绪后这里换成接口调用即可，界面不用动。
 */
import type { CanvasTemplateInfo } from '~/data/canvas-templates'

const props = defineProps<{
  /** new = 新建（选空白或模板）；save = 另存为模板。 */
  mode: 'new' | 'save'
  templates: CanvasTemplateInfo[]
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'blank'): void
  (e: 'use', id: string): void
  (e: 'remove', id: string): void
  (e: 'save', name: string): void
  (e: 'close'): void
}>()

const name = ref('')
const root = ref<HTMLElement | null>(null)

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="cg-modal-mask"
    @click.self="emit('close')"
  >
    <div
      ref="root"
      class="cg-modal"
    >
      <header class="cg-modal-head">
        <b>{{ props.mode === 'new' ? '新建画布' : '另存为模板' }}</b>
        <button
          type="button"
          title="关闭"
          @click="emit('close')"
        >
          <i class="i-lucide-x" />
        </button>
      </header>

      <p class="cg-modal-sub">
        {{ props.mode === 'new'
          ? '从空白开始搭，或者套一条现成的产线。模板只带结构（节点、连线、参数），不带产物。'
          : '把这张图存成模板，下次新建时可以直接套用。现在存在这台浏览器本地。' }}
      </p>

      <template v-if="props.mode === 'new'">
        <p
          v-if="loading"
          role="status"
        >
          正在加载模板…
        </p>
        <p
          v-else-if="error"
          role="alert"
        >
          {{ error }} <button
            type="button"
            @click="emit('retry')"
          >
            重试
          </button>
        </p>
        <p v-else-if="!templates.length">
          暂无模板，可以从空白画布开始。
        </p>
        <div
          class="cg-option"
          role="button"
          tabindex="0"
          @click="emit('blank')"
          @keydown.enter="emit('blank')"
        >
          <i class="i-lucide-square-dashed" />
          <span>
            <b>空白画布</b>
            <i>从左边拖一个节点开始</i>
          </span>
        </div>

        <div
          v-for="t in props.templates"
          :key="t.id"
          class="cg-option"
          role="button"
          tabindex="0"
          @click="emit('use', t.id)"
          @keydown.enter="emit('use', t.id)"
        >
          <i :class="t.builtIn ? 'i-lucide-sparkles' : (t.site ? 'i-lucide-layout-template' : 'i-lucide-bookmark')" />
          <span>
            <b>{{ t.name }}</b>
            <i>{{ t.summary }}</i>
          </span>
          <button
            v-if="!t.builtIn && !t.site"
            class="cg-option-del"
            type="button"
            title="删掉这个模板"
            @click.stop="emit('remove', t.id)"
          >
            <i class="i-lucide-trash-2" />
          </button>
        </div>
      </template>

      <template v-else>
        <input
          v-model="name"
          class="cg-modal-input"
          placeholder="模板名字，例如：我的三镜产线"
          @keydown.enter="name.trim() && emit('save', name.trim())"
        >
        <div class="cg-modal-actions">
          <button
            class="cg-ghost"
            type="button"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            class="cg-primary"
            type="button"
            :disabled="!name.trim()"
            @click="emit('save', name.trim())"
          >
            保存模板
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
