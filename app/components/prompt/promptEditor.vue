<script setup lang="ts">
// TipTap 提示词编辑器：输入 @ 唤出「超级 Tag」分类菜单（@角色/@服装/@背景/@姿势/@画风），
// 选中分类后由父组件打开该分类的标签卡片弹层，选中标签经 applySnippet 插入 snippet 节点。
// 两级交互对齐 PeachArt prompt-editor.tsx + snippet-menu.tsx + snippet-picker.tsx。
import { useEditor, EditorContent } from '@tiptap/vue-3'
import Placeholder from '@tiptap/extension-placeholder'
import type { EditorView } from '@tiptap/pm/view'
import { Fragment, Slice, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import { ref, watch, onBeforeUnmount } from 'vue'
import {
  promptExtensions,
  serializePrompt,
  promptToDocument,
  promptText,
  snippetNodeName,
  type Prompt,
  type SnippetSnapshot
} from './enhancement-mark'

const props = withDefaults(defineProps<{
  modelValue: Prompt
  placeholder?: string
  disabled?: boolean
}>(), {
  placeholder: '输入 @ 唤出角色、服装、画风…',
  disabled: false
})
const emit = defineEmits<{
  (e: 'update:modelValue', value: Prompt): void
  // @ 触发 → 父组件弹「参考图选择」（图片/视频模式都只有参考图，没有远端超级标签）
  (e: 'open-category', category: string): void
}>()

/**
 * 纯文本粘贴：把换行变成**段内硬换行**（hardBreak），整段仍是一个段落。
 *
 * 不这样做时，粘贴多行文本（例如一段带换行的代码）会被切成多个段落；段落一多，
 * 输入框高度暴涨、光标定位与删除都变别扭。产品语义上这就是"一条提示词里的换行"，
 * 提交时 promptText 会把 '\n' 统一换成 ', '（见 enhancement-mark.ts）。
 */
function clipboardTextSlice(text: string, schema: Schema): Slice {
  const inline: ProseMirrorNode[] = []
  text.split(/\r?\n/).forEach((line, index) => {
    if (index > 0) inline.push(schema.nodes.hardBreak!.create())
    if (line) inline.push(schema.text(line))
  })
  const paragraph = schema.nodes.paragraph!.create(null, inline)
  return Slice.maxOpen(Fragment.from(paragraph))
}
// 待替换的 @ 触发位置（insert：刚输入 @；replace：已有节点换类别）。
const snippetTarget = ref<{ kind: 'insert' | 'replace', from: number, to: number } | null>(null)

const editor = useEditor({
  extensions: [
    ...promptExtensions(),
    // 传函数而不是字符串：图片/视频两种模式的提示语不同（"输入 @ 唤出角色…" vs
    // "输入 @ 唤出角色、服装、姿势…，或描述这一镜"），字符串会被固定在创建那一刻。
    Placeholder.configure({ placeholder: () => props.placeholder })
  ],
  content: promptToDocument(props.modelValue),
  editable: !props.disabled,
  editorProps: {
    // D5 无障碍：contenteditable 默认只报 "edit text"，没有可访问名称；
    // 视觉上的占位符是 CSS 伪元素，读屏也读不到，所以这里同时补 aria-*。
    attributes: {
      'aria-label': '创作描述',
      'aria-multiline': 'true',
      'aria-placeholder': props.placeholder
    },
    // 纯文本粘贴：换行按段内硬换行处理，避免被切成多个段落（见 clipboardTextSlice）。
    clipboardTextParser: (text: string, _context: unknown, _plain: boolean, view: EditorView) =>
      clipboardTextSlice(text, view.state.schema),
    handleDOMEvents: {
      // 对齐 PeachArt：beforeinput 拦截 @ / ＠（比 keydown 可靠，兼容 IME 与全角输入）。
      beforeinput: (view: EditorView, event: Event) => {
        const input = event as InputEvent
        if ((input.inputType === 'insertText' || input.inputType === 'insertCompositionText') && (input.data === '@' || input.data === '＠')) {
          if (props.disabled) return false
          const { from, to } = view.state.selection
          if (from !== to) return false
          event.preventDefault()
          tryTriggerSnippet()
          return true
        }
        return false
      }
    }
  },
  onUpdate: ({ editor: e }) => {
    emit('update:modelValue', serializePrompt(e.state.doc))
  }
})

// 外部替换（润色/翻译结果回填）时，若编辑器内容已不同才 setContent，避免打断 IME。
watch(() => props.modelValue, (value) => {
  if (!editor.value) return
  const current = JSON.stringify(serializePrompt(editor.value.state.doc))
  const next = JSON.stringify(value)
  if (current === next) return
  snippetTarget.value = null
  editor.value.commands.setContent(promptToDocument(value), { emitUpdate: false })
})

watch(() => props.disabled, (d) => {
  editor.value?.setEditable(!d)
})

// 提示语随模式变化：改 aria-placeholder，并派发一次空事务让占位符装饰器重算
// （装饰器只在 state 更新时计算，光改 prop 不会刷新）。
watch(() => props.placeholder, (text) => {
  const e = editor.value
  if (!e) return
  e.view.dom.setAttribute('aria-placeholder', text)
  e.view.dispatch(e.state.tr)
})

// —— @ 触发：输入 @ / ＠ 时在光标处插入 '@'，并让父组件弹「参考图选择」。
//
// 这里**不再**弹角色/服装/背景/姿势/画风那一级分类菜单（用户要求图片与视频模式都去掉）：
// 图片创作里要引用的是用户自己传的参考图，跟站点远端标签库无关。
function tryTriggerSnippet() {
  const e = editor.value
  if (!e || props.disabled) return
  const { from, to } = e.state.selection
  if (from !== to) return
  e.chain().focus().insertContent('@').run()
  // '@' 占 [from, from+1)，记录该区间供 applySnippet 替换。
  snippetTarget.value = { kind: 'insert', from, to: from + 1 }
  emit('open-category', 'imageref')
}

// 第二级选中某个标签后：替换 @ 触发位置为 snippet 节点。
function applySnippet(source: SnippetSnapshot) {
  const e = editor.value
  if (!e) return
  const target = snippetTarget.value
  if (!target) return
  const node = e.schema.nodes[snippetNodeName]?.create({ id: source.id, source, pendingCategory: null })
  if (!node) return
  e.chain().focus().insertContentAt({ from: target.from, to: target.to }, node).run()
  snippetTarget.value = null
}

// 取消（菜单/第二级弹层关闭且未选中）：删除刚插入的 '@' 并清 target。
function cancelSnippet() {
  const e = editor.value
  const t = snippetTarget.value
  if (!t || !e) {
    snippetTarget.value = null
    return
  }
  if (t.kind === 'insert') {
    const text = e.state.doc.textBetween(t.from, t.to, '', '')
    if (text === '@' || text === '＠') {
      e.chain().focus().deleteRange({ from: t.from, to: t.to }).run()
    }
  }
  snippetTarget.value = null
}

// 键盘导航（菜单打开时）：↑↓ 移动、Enter 选中、Backspace 清除 @、Escape 关闭。

// 点击已有 snippet 节点 → 删除它（PeachArt 是弹出预览菜单，此处简化为点击删除，可再 @ 重选）。
function onEditorClick(event: MouseEvent) {
  const el = (event.target as HTMLElement).closest('[data-snippet-id]')
  if (!el) return
  const e = editor.value
  if (!e) return
  const pos = e.view.posAtDOM(el, 0)
  const node = e.state.doc.nodeAt(pos)
  if (node?.type.name !== snippetNodeName) return
  e.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
}

// 让父组件能拿纯文本（snippet → 英文，用于提交）。
function toPlainText(): string {
  const e = editor.value
  return e ? promptText(serializePrompt(e.state.doc)) : ''
}

/** 聚焦到正文：输入框内可点的空白区域（如参考图那一行）点一下就应落到光标上。 */
function focus() {
  editor.value?.chain().focus().run()
}

defineExpose({ toPlainText, focus, triggerSnippet: tryTriggerSnippet, applySnippet, cancelSnippet })

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<template>
  <div
    class="prompt-editor"
    :data-disabled="disabled || undefined"
    @click="onEditorClick"
  >
    <EditorContent
      :editor="editor"
      class="prompt-editor__content"
    />
  </div>
</template>

<style>
.prompt-editor { position: relative; width: 100%; }
/* D1：可见编辑区高 60px，但 contenteditable 之前只有一行 24px 高，下面 38px 是死区
   （点击不出光标、还会把焦点丢给 body）。min-height:100% 对"只有 min-height 的父级"
   不成立，所以这里让外壳成为 flex 容器，把 contenteditable 拉满。 */
.prompt-editor__content {
  display: flex;
  min-height: 60px;
  /* 长提示词（例如整段"角色锁模"参考词，数千字）不能把输入框撑到全屏 ——
     否则工具栏与发送按钮会被顶出屏幕。这里只限**高度**、不限字数：
     编辑区自己滚动，工具栏始终留在可视区（整框约在半屏以内）。
     做法对齐 dsh 自己的输入框：max-height: var(--dsh-composer-text-max-height)
     + overflow-y: auto，字数由用户决定。 */
  max-height: var(--hg-composer-text-max-height, min(34vh, 300px));
  overflow-y: auto;
  overscroll-behavior: contain;
}
@media (max-width: 1100px) {
  .prompt-editor__content {
    max-height: var(--hg-composer-text-max-height, min(28vh, 220px));
  }
}
.prompt-editor__content .tiptap {
  flex: 1 0 auto;
  min-height: 60px;
  outline: none;
}
.prompt-editor__content .tiptap p { margin: 0; }
/* D2：占位符。TipTap 已经把文案写进 data-placeholder（实测 <p data-placeholder="…"
   class="is-empty is-editor-empty">），缺的只是这条样式 —— 此前全站唯一的同类规则
   挂在 .prompt-copy 下（那个容器已无任何页面使用），所以输入框里一直看不到提示语。 */
.prompt-editor .tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: #65666c;
  pointer-events: none;
}

/* 第一级分类菜单 */
.snippet-menu {
  position: absolute;
  z-index: 50;
  bottom: calc(100% + 8px);
  left: 0;
  width: 280px;
  border: 1px solid var(--hg-line, rgb(255 255 255 / 0.14));
  border-radius: 12px;
  background: var(--bg-elev, rgb(22 22 27 / 0.99));
  box-shadow: 0 12px 36px rgb(0 0 0 / 0.5);
  overflow: hidden;
}
.snippet-menu__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 10px 12px 8px;
  background: linear-gradient(to right, rgb(251 191 36 / 0.08), transparent);
}
.snippet-menu__title { font-size: 14px; font-weight: 700; color: var(--amber); }
.snippet-menu__hint { font-size: 11px; color: var(--muted); }
.snippet-menu__list { padding: 6px; }
.snippet-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.snippet-menu__item:hover,
.snippet-menu__item.active { background: rgb(255 255 255 / 0.07); }
.snippet-menu__at {
  flex-shrink: 0;
  min-width: 56px;
  color: var(--amber);
  font-size: 14px;
  font-weight: 700;
}
.snippet-menu__desc {
  flex: 1;
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.snippet-menu__arrow { color: var(--faint); font-size: 16px; }

/* snippet 超级标签 */
.super-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  margin: 0 2px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgb(251 191 36 / 0.14);
  border: 1px solid rgb(251 191 36 / 0.35);
  color: var(--ink);
  font-size: 0.85em;
  vertical-align: baseline;
  cursor: pointer;
  user-select: none;
}
.super-tag__category { font-size: 0.78em; opacity: 0.72; }
.super-tag__category b { font-weight: 700; }
.super-tag__name { font-weight: 600; }
.super-tag__prompt { font-size: 0.75em; opacity: 0.55; }
.super-tag.is-character { background: rgb(96 165 250 / 0.14); border-color: rgb(96 165 250 / 0.35); }
.super-tag.is-clothing { background: rgb(251 146 60 / 0.14); border-color: rgb(251 146 60 / 0.35); }
.super-tag.is-background { background: rgb(74 222 128 / 0.14); border-color: rgb(74 222 128 / 0.35); }
.super-tag.is-pose { background: rgb(168 85 247 / 0.14); border-color: rgb(168 85 247 / 0.35); }
.super-tag.is-style { background: rgb(236 72 153 / 0.14); border-color: rgb(236 72 153 / 0.35); }

/* 润色增强高亮 */
.enhancement {
  background: linear-gradient(transparent 60%, rgb(251 191 36 / 0.25) 60%);
  border-radius: 2px;
}
</style>
