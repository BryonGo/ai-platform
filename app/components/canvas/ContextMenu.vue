<script setup lang="ts">
/**
 * 画布右键菜单。
 *
 * 只管显示与选择：菜单项由页面按"点到了什么"算出来（节点 / 空白 / 连线各一套），
 * 选中后把 key 抛回去，页面执行。
 *
 * 为什么不用 <select> 或第三方：画布上的右键菜单要能带图标、子菜单、危险项，
 * 还要在视口边缘自动翻转，自己画一层最省事。
 */

export interface ContextMenuItem {
  key: string
  label: string
  icon?: string
  /** 右侧说明（快捷键、约花费…）。 */
  hint?: string
  tone?: 'muted' | 'run' | 'ok' | 'bad' | 'warn'
  danger?: boolean
  disabled?: boolean
  /** 子菜单（"新增节点"用）：点击展开。 */
  children?: ContextMenuItem[]
}

const props = defineProps<{
  x: number
  y: number
  title?: string
  subtitle?: string
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  (e: 'pick', key: string): void
  (e: 'close'): void
}>()

const root = ref<HTMLElement | null>(null)
const openSub = ref<string>('')
/** 贴着视口边缘时翻转，别让菜单跑出屏幕。 */
const pos = ref({ left: Math.max(8, props.x), top: props.y })
const flipUp = ref(false)
const flipLeft = ref(false)

let observer: ResizeObserver | undefined

function layout(): void {
  const el = root.value
  const h = el?.offsetHeight ?? 240
  const width = el?.offsetWidth ?? 240
  flipLeft.value = props.x + width > window.innerWidth - 8
  flipUp.value = props.y + h > window.innerHeight - 8
  pos.value = {
    left: flipLeft.value ? Math.max(8, props.x - width) : Math.max(8, props.x),
    top: flipUp.value ? Math.max(8, props.y - h) : Math.max(8, props.y)
  }
}

function onPick(item: ContextMenuItem): void {
  if (item.disabled) return
  if (item.children?.length) {
    openSub.value = openSub.value === item.key ? '' : item.key
    return
  }
  emit('pick', item.key)
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  layout()
  observer = new ResizeObserver(layout)
  if (root.value) {
    observer.observe(root.value)
    root.value.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }
  window.addEventListener('mousedown', onDocDown, true)
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', layout)
  window.addEventListener('scroll', onScroll, true)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('mousedown', onDocDown, true)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', layout)
  window.removeEventListener('scroll', onScroll, true)
})

function onDocDown(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) emit('close')
}

function onScroll(event: Event): void {
  if (event.target instanceof Node && root.value?.contains(event.target)) return
  emit('close')
}
</script>

<template>
  <div
    ref="root"
    class="cg-menu"
    :aria-label="title || '画布菜单'"
    :style="{ left: `${pos.left}px`, top: `${pos.top}px` }"
    @contextmenu.prevent
  >
    <div
      v-if="title"
      class="cg-menu-head"
    >
      <b>{{ title }}</b>
      <i v-if="subtitle">{{ subtitle }}</i>
    </div>

    <div
      v-for="item in items"
      :key="item.key"
      class="cg-menu-row"
      :data-tone="item.tone"
      :class="{ 'is-danger': item.danger, 'is-disabled': item.disabled, 'is-open': openSub === item.key }"
    >
      <button
        type="button"
        :disabled="item.disabled"
        :aria-expanded="item.children?.length ? openSub === item.key : undefined"
        @click="onPick(item)"
      >
        <i
          v-if="item.icon"
          :class="item.icon"
        />
        <span class="cg-menu-label">{{ item.label }}</span>
        <span
          v-if="item.hint"
          class="cg-menu-hint"
        >{{ item.hint }}</span>
        <i
          v-if="item.children?.length"
          class="i-lucide-chevron-right cg-menu-arrow"
        />
      </button>

      <div
        v-if="item.children?.length && openSub === item.key"
        class="cg-menu cg-menu--sub"
        :class="{ 'is-left': flipLeft }"
      >
        <button
          v-for="child in item.children"
          :key="child.key"
          type="button"
          :disabled="child.disabled"
          class="cg-menu-subrow"
          @click="onPick(child)"
        >
          <i
            v-if="child.icon"
            :class="child.icon"
          />
          <span class="cg-menu-label">{{ child.label }}</span>
          <span
            v-if="child.hint"
            class="cg-menu-hint"
          >{{ child.hint }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
