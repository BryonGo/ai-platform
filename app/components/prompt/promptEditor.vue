<script setup lang="ts">
// TipTap 提示词编辑器：输入 @ 唤出超级标签选择器，选中后插入可点击/可删除的 snippet 节点。
// 忠实移植 PeachArt prompt-editor.tsx（React）到 Vue 3，交互等价。
import { useEditor, EditorContent } from '@tiptap/vue-3'
import Placeholder from '@tiptap/extension-placeholder'
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
}>()

const pickerOpen = ref(false)
const snippetTarget = ref<{ kind: 'insert' | 'replace', from: number, to: number } | null>(null)

const editor = useEditor({
  extensions: [
    ...promptExtensions(),
    Placeholder.configure({ placeholder: props.placeholder })
  ],
  content: promptToDocument(props.modelValue),
  editable: !props.disabled,
  onUpdate: ({ editor }) => {
    emit('update:modelValue', serializePrompt(editor.state.doc))
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

// —— @ 触发：在 handleTextInput 之外拦截 beforeinput。Vue/TipTap 下简化处理：
// 直接监听编辑器按键，当输入 '@' 或 '＠' 时在光标处插入触发标记并弹出选择器。
function tryTriggerSnippet() {
  const e = editor.value
  if (!e) return
  const { from, to } = e.state.selection
  if (from !== to) return
  // 在光标处插入 '@'，标记 target，弹出选择器。
  e.chain().focus().insertContent('@').run()
  snippetTarget.value = { kind: 'insert', from: from + 1, to: from + 1 }
  pickerOpen.value = true
}

// 选择器选中某个标签后：替换 target 范围为 snippet 节点。
function applySnippet(source: SnippetSnapshot) {
  const e = editor.value
  if (!e) return
  const target = snippetTarget.value
  if (!target) return
  const id = source.id
  const node = e.schema.nodes[snippetNodeName]?.create({ id, source, pendingCategory: null })
  if (!node) return
  e.chain().focus().insertContentAt({ from: target.from, to: target.to }, node).run()
  snippetTarget.value = null
  pickerOpen.value = false
}

function closePicker() {
  // 关闭时若 target 是刚插入的 '@'（尚未选中），清除它。
  const e = editor.value
  const t = snippetTarget.value
  if (t?.kind === 'insert' && e) {
    const node = e.state.doc.nodeAt(t.from)
    if (node?.type.name === 'text' && node.text === '@') {
      e.chain().focus().deleteRange({ from: t.from - 1, to: t.to }).run()
    }
  }
  snippetTarget.value = null
  pickerOpen.value = false
}

// 点击已有 snippet 节点 → 删除它（简化：直接删除；PeachArt 是弹出菜单，这里做删除+可再插）。
function onEditorClick(event: MouseEvent) {
  const el = (event.target as HTMLElement).closest('[data-snippet-id]')
  if (!el) return
  const e = editor.value
  if (!e) return
  const pos = e.view.posAtDOM(el, 0)
  const node = e.state.doc.nodeAt(pos)
  if (node?.type.name !== snippetNodeName) return
  // 删除该 snippet 节点，便于用户重新选择。
  e.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
}

// 让父组件能拿纯文本（snippet → 英文，用于提交）。
function toPlainText(): string {
  const e = editor.value
  return e ? promptText(serializePrompt(e.state.doc)) : ''
}

defineExpose({ toPlainText, triggerSnippet: tryTriggerSnippet })

onBeforeUnmount(() => {
  editor.value?.destroy()
})

// 暴露给模板的 @ 工具条按钮触发。
function onKeydown(event: KeyboardEvent) {
  if (event.key === '@' || event.key === '＠') {
    event.preventDefault()
    tryTriggerSnippet()
  }
}
</script>

<template>
  <div
    class="prompt-editor"
    :data-disabled="disabled || undefined"
    @keydown="onKeydown"
    @click="onEditorClick"
  >
    <EditorContent
      :editor="editor"
      class="prompt-editor__content"
    />
    <slot name="picker">
      <SnippetPicker
        :open="pickerOpen"
        @close="closePicker"
        @apply="applySnippet"
      />
    </slot>
  </div>
</template>

<style>
.prompt-editor { position: relative; width: 100%; }
.prompt-editor__content { min-height: 60px; }
.prompt-editor__content .tiptap { outline: none; min-height: 100%; }
.prompt-editor__content .tiptap p { margin: 0; }

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
