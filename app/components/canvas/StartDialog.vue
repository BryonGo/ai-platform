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
}>()

const emit = defineEmits<{
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
          <i :class="t.builtIn ? 'i-lucide-sparkles' : 'i-lucide-bookmark'" />
          <span>
            <b>{{ t.name }}</b>
            <i>{{ t.summary }}</i>
          </span>
          <button
            v-if="!t.builtIn"
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

<style scoped>
.cg-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 48%);
  backdrop-filter: blur(3px);
}

.cg-modal {
  width: 400px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 14px;
  background: var(--hg3-rail-active);
  border: 1px solid var(--hg3-line-strong);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgb(0 0 0 / 56%);
}

.cg-modal-head { display: flex; align-items: center; }
.cg-modal-head b { flex: 1; font-size: 14px; color: var(--hg3-ink); }
.cg-modal-head button { color: var(--hg3-faint); }
.cg-modal-head button:hover { color: var(--hg3-ink); }

.cg-modal-sub { margin: 7px 0 12px; font-size: 11.5px; line-height: 1.6; color: var(--hg3-faint); }

.cg-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 7px;
  padding: 10px 11px;
  text-align: left;
  background: var(--hg3-card);
  border-radius: 11px;
  box-shadow: inset 0 0 0 1px var(--hg3-line);
}

.cg-option:hover { box-shadow: inset 0 0 0 1px var(--hg3-accent-line); }
.cg-option > i { font-size: 16px; color: var(--hg3-accent-hi); }
.cg-option span { display: flex; flex-direction: column; min-width: 0; }
.cg-option b { font-size: 12.5px; color: var(--hg3-ink); }
.cg-option i { font-size: 10.5px; font-style: normal; color: var(--hg3-faint); }

.cg-option-del {
  margin-left: auto;
  padding: 4px;
  color: var(--hg3-faint);
}

.cg-option-del:hover { color: var(--hg3-i-coral); }

.cg-modal-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  font-size: 12.5px;
  color: var(--hg3-ink);
  background: var(--hg3-well);
  border: 1px solid var(--hg3-line-strong);
  border-radius: 9px;
}

.cg-modal-input:focus { outline: none; border-color: var(--hg3-accent-line); }
.cg-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

.cg-ghost,
.cg-primary {
  height: 30px;
  padding: 0 14px;
  font-size: 12px;
  border-radius: 999px;
}

.cg-ghost { color: var(--hg3-ink); background: rgb(255 255 255 / 7%); }
.cg-primary { font-weight: 600; color: var(--hg3-accent-ink); background: var(--hg3-accent); }
.cg-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
