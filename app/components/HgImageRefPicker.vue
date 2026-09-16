<script setup lang="ts">
// `@` 唤出的图片选择器：列出当前已上传的图，选中即在提示词里插入一个原子 chip。
//
// 为什么取代原来的「超级标签」弹层：图片创作里用户真正需要引用的是**自己传的图**
// （「参考 @图1 的光线，@图2 的构图」），而原来的角色/服装/背景/姿势/画风标签
// 是按站点的远端标签库写死的，跟这次要传的图没有关系（用户要求：图片与视频模式都去掉）。
//
// 视频要标角色（用户要求）：「@图片1 和 @图片2 分别干啥的」必须一眼看出 ——
// 第 1 张是**首帧**（决定这一镜从哪开始），第 2 张起才是参考图，且上游的图位从
// ref_image_0 起算，所以第 2 张在图位上是「参考1」。不标出来的后果是：
// 用户以为"参考2"是第二张，实际模型把这层意思套到了下一张上。
const props = withDefaults(defineProps<{
  open: boolean
  /** 当前已上传的图（与参考图条一一对应，顺序即编号） */
  items: { preview: string, name?: string }[]
  /**
   * 每张图的角色（首帧 / 参考1 / 参考2…），与 items 同序；空数组表示不区分角色
   * （图片模式：所有图都是参考图，只标序号）。
   */
  roles?: string[]
}>(), {
  roles: () => []
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'pick', index: number): void
}>()

/**
 * 编号从 1 开始，与 chip、提交时的措辞一致。
 *
 * 有 roles（视频）时格子直接显示角色（首帧 / 参考1），并保留序号 —— 用户点之前
 * 就该知道这张图会以什么身份进工作流；没有 roles（图片）时退回「图N」。
 */
const options = computed(() => props.items.map((item, i) => ({
  ...item,
  index: i + 1,
  role: props.roles?.[i] || '',
  label: props.roles?.[i] || `图${i + 1}`
})))
</script>

<template>
  <div
    v-if="open"
    class="ref-picker"
    role="dialog"
    aria-label="选择要引用的参考图"
  >
    <div class="ref-picker__head">
      <span>{{ roles.length ? '引用哪张图？（首帧 / 参考图）' : '引用哪张参考图？' }}</span>
      <button
        type="button"
        class="ref-picker__close"
        aria-label="关闭"
        @click="emit('close')"
      >
        <UIcon name="i-lucide-x" />
      </button>
    </div>
    <p
      v-if="!options.length"
      class="ref-picker__empty"
    >
      还没有图片。先用输入框左侧的「+」上传，再用 @ 引用（视频第 1 张是首帧）。
    </p>
    <div
      v-else
      class="ref-picker__grid"
    >
      <button
        v-for="item in options"
        :key="item.index"
        type="button"
        class="ref-picker__cell"
        :title="item.name || `第 ${item.index} 张图${item.role ? `（${item.role}）` : ''}`"
        @click="emit('pick', item.index)"
      >
        <img
          :src="item.preview"
          :alt="item.label"
        >
        <span class="ref-picker__cell-label">{{ item.label }}</span>
        <em
          v-if="item.role && item.role !== '首帧'"
          class="ref-picker__cell-index"
        >第{{ item.index }}张</em>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 浮在输入框上方（与 @ 触发位置同侧），不挤占布局 */
.ref-picker {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 14px;
  z-index: 30;
  width: min(320px, calc(100vw - 24px));
  max-height: min(50vh, 320px);
  overflow-y: auto;
  padding: 12px;
  border: 1px solid var(--hg-line);
  border-radius: 12px;
  background: var(--hg-card);
  box-shadow: 0 12px 32px rgb(0 0 0 / 35%);
}
.ref-picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--ink);
}
.ref-picker__close {
  display: inline-flex;
  border: 0;
  background: transparent;
  color: var(--hg-muted);
  cursor: pointer;
}
.ref-picker__empty {
  margin: 0;
  font-size: 12px;
  color: var(--hg-muted);
  line-height: 1.6;
}
.ref-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 8px;
}
.ref-picker__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--hg-line);
  border-radius: 10px;
  background: transparent;
  color: var(--hg-muted);
  font-size: 12px;
  cursor: pointer;
}
.ref-picker__cell:hover {
  border-color: var(--hg-accent);
  color: var(--ink);
}
.ref-picker__cell-label {
  font-weight: 500;
  color: var(--ink);
}
.ref-picker__cell-index {
  font-size: 10px;
  font-style: normal;
  color: var(--hg-muted);
}
.ref-picker__cell img {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  object-fit: cover;
}
</style>
