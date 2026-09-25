<script setup lang="ts">
// 输入框左侧的「+ 添加图片」方框（首页与创作页共用）。
//
// 为什么抽出来（2026-09-14 用户反馈）：同一个动作在两个页面是两套交互 ——
// 首页是正文左侧的 + 方框，创作页是工具栏里的「参考图」胶囊。用户在两页之间切换时
// 找不到同一个按钮，所以这里统一成一套，并固定放在**正文之外**。
//
// 职责边界（2026-09-15 调整）：
//   · 本组件只管「+」这个入口，**位置固定不动**；
//   · 已选的图由 HgReferenceStrip 单独一行排在输入框**上方**（用户反馈：
//     图跟着 + 一起挤在模式页签与输入框之间，加一张还整体左右移动）；
//   · 到该模型的张数上限后「+」**禁用**而不是消失，位置保持稳定；
//   · 图片不进文字流，鼠标点正文、定位光标都不受图片影响。
//
// 双入口（2026-09 用户要求）：单点「+」以前直接弹本地文件选择，用户找不到"用素材库里的图"。
// 现在点「+」先出一个两项菜单：本地上传 / 从我的资产选择。本组件只负责把选择意图发出去，
// 资产库列表与引用逻辑在 HgAssetPicker / useChatStudio 里，二者互不耦合。
const props = withDefaults(defineProps<{
  /** 该模型能收几张（1 = 只有首帧；> 1 时允许一次多选）。 */
  max?: number
  accept?: string
  ariaLabel?: string
  title?: string
  disabled?: boolean
}>(), {
  max: 1,
  accept: 'image/png,image/jpeg,image/webp',
  ariaLabel: '添加参考图',
  title: '添加图片',
  disabled: false
})

const emit = defineEmits<{
  files: [files: File[]]
  /** 用户选择「从我的资产选择」：由父组件打开资产选择浮层。 */
  pickAsset: []
}>()

const menuOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

function toggleMenu() {
  if (props.disabled) return
  menuOpen.value = !menuOpen.value
}

function chooseLocal() {
  menuOpen.value = false
  fileInput.value?.click()
}

function chooseAsset() {
  menuOpen.value = false
  emit('pickAsset')
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  menuOpen.value = false
  if (files.length) emit('files', files)
  // 清空 value：选同一张图两次也要能触发 change
  input.value = ''
}

/** 点在菜单与「+」之外就收起菜单（Esc 同样收起）。 */
function onDocClick(event: MouseEvent) {
  const target = event.target as Node | null
  if (menuOpen.value && wrap.value && target && !wrap.value.contains(target)) {
    menuOpen.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') menuOpen.value = false
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener('click', onDocClick)
    window.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('click', onDocClick)
    window.removeEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="wrap"
    class="media-wrap"
  >
    <button
      type="button"
      class="media-box"
      :class="{ disabled, open: menuOpen }"
      :title="title"
      :aria-label="ariaLabel"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      :disabled="disabled"
      @click="toggleMenu"
    >
      <UIcon
        name="i-lucide-plus"
        aria-hidden="true"
      />
    </button>

    <input
      ref="fileInput"
      class="media-file"
      type="file"
      :accept="accept"
      :disabled="disabled"
      :multiple="max > 1"
      @change="onChange"
    >

    <div
      v-if="menuOpen"
      class="media-menu"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        class="media-menu__item"
        @click="chooseLocal"
      >
        <UIcon
          name="i-lucide-upload"
          aria-hidden="true"
        />本地上传
      </button>
      <button
        type="button"
        role="menuitem"
        class="media-menu__item"
        @click="chooseAsset"
      >
        <UIcon
          name="i-lucide-images"
          aria-hidden="true"
        />从我的资产选择
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 包裹层只负责给浮层定位，尺寸与「+」一致，位置仍然固定不动 */
.media-wrap {
  position: relative;
  flex-shrink: 0;
}
.media-box {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 1px solid #333;
  border-radius: 14px;
  background: rgb(255 255 255 / 5%);
  color: var(--hg3-ink, #fafafa);
  font-size: 20px;
  cursor: pointer;
}
.media-box:hover:not(.disabled) {
  border-color: var(--hg3-accent-line, rgb(232 50 176 / 38%));
}
.media-box.open {
  border-color: var(--hg3-accent-line, rgb(232 50 176 / 38%));
}
.media-box.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.media-file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
/* 向上弹出：输入框沉底，菜单往下会被视口裁掉 */
.media-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 40;
  display: grid;
  min-width: 168px;
  padding: 4px;
  border: 1px solid var(--hg3-line-strong, #3a3b40);
  border-radius: 10px;
  background: #1c1d21;
  box-shadow: 0 12px 30px rgb(0 0 0 / 45%);
}
.media-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--hg3-ink, #fafafa);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.media-menu__item:hover {
  background: #282828;
}
</style>
