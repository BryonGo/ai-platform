<script setup lang="ts">
// TipTap 提示词编辑器：输入 @ 唤出「超级 Tag」分类菜单（@角色/@服装/@背景/@姿势/@画风），
// 选中分类后由父组件打开该分类的标签卡片弹层，选中标签经 applySnippet 插入 snippet 节点。
// 两级交互对齐 PeachArt prompt-editor.tsx + snippet-menu.tsx + snippet-picker.tsx。
import { useEditor, EditorContent } from '@tiptap/vue-3'
import Placeholder from '@tiptap/extension-placeholder'
import type { EditorView } from '@tiptap/pm/view'
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
  // 点分类菜单某一项 → 父组件打开该分类的标签卡片弹层。
  (e: 'open-category', category: string): void
}>()

// 第一级分类菜单（对齐 PeachArt snippet-menu）。
const categories = [
  { key: 'character', label: '角色', description: '选择角色并保留完整特征' },
  { key: 'clothing', label: '服装', description: '选择一套完整搭配' },
  { key: 'background', label: '背景', description: '选择画面所在场景' },
  { key: 'pose', label: '姿势', description: '选择动作与构图姿势' },
  { key: 'style', label: '画风', description: '选择艺术家风格' }
]

const menuOpen = ref(false)
const menuActive = ref(0)
// 待替换的 @ 触发位置（insert：刚输入 @；replace：已有节点换类别）。
const snippetTarget = ref<{ kind: 'insert' | 'replace', from: number, to: number } | null>(null)

const editor = useEditor({
  extensions: [
    ...promptExtensions(),
    Placeholder.configure({ placeholder: props.placeholder })
  ],
  content: promptToDocument(props.modelValue),
  editable: !props.disabled,
  editorProps: {
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
  menuOpen.value = false
  editor.value.commands.setContent(promptToDocument(value), { emitUpdate: false })
})

watch(() => props.disabled, (d) => {
  editor.value?.setEditable(!d)
})

// —— @ 触发：输入 @ / ＠ 时在光标处插入 '@' 并打开第一级分类菜单。
function tryTriggerSnippet() {
  const e = editor.value
  if (!e || props.disabled) return
  const { from, to } = e.state.selection
  if (from !== to) return
  e.chain().focus().insertContent('@').run()
  // '@' 占 [from, from+1)，记录该区间供 applySnippet 替换。
  snippetTarget.value = { kind: 'insert', from, to: from + 1 }
  menuActive.value = 0
  menuOpen.value = true
}

// 点分类菜单某一项 → 进入第二级（父组件弹层）。
function chooseCategory(key: string) {
  menuOpen.value = false
  emit('open-category', key)
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
  menuOpen.value = false
}

// 取消（菜单/第二级弹层关闭且未选中）：删除刚插入的 '@' 并清 target。
function cancelSnippet() {
  const e = editor.value
  const t = snippetTarget.value
  if (!t || !e) {
    snippetTarget.value = null
    menuOpen.value = false
    return
  }
  if (t.kind === 'insert') {
    const text = e.state.doc.textBetween(t.from, t.to, '', '')
    if (text === '@' || text === '＠') {
      e.chain().focus().deleteRange({ from: t.from, to: t.to }).run()
    }
  }
  snippetTarget.value = null
  menuOpen.value = false
}

// 关闭菜单：若 @ 触发位置仍是刚插入的 '@'（未选中任何项），清除它。
function closeMenu() {
  cancelSnippet()
}

// 键盘导航（菜单打开时）：↑↓ 移动、Enter 选中、Backspace 清除 @、Escape 关闭。
function onMenuKeydown(event: KeyboardEvent) {
  if (!menuOpen.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    menuActive.value = (menuActive.value + 1) % categories.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    menuActive.value = (menuActive.value - 1 + categories.length) % categories.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const cat = categories[menuActive.value]
    if (cat) chooseCategory(cat.key)
  } else if (event.key === 'Backspace') {
    event.preventDefault()
    closeMenu()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  }
}

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
  menuOpen.value = false
}

// 让父组件能拿纯文本（snippet → 英文，用于提交）。
function toPlainText(): string {
  const e = editor.value
  return e ? promptText(serializePrompt(e.state.doc)) : ''
}

defineExpose({ toPlainText, triggerSnippet: tryTriggerSnippet, applySnippet, cancelSnippet })

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
    <!-- 第一级分类菜单：浮在编辑器上方 -->
    <div
      v-if="menuOpen"
      class="snippet-menu"
      @keydown="onMenuKeydown"
      @click.stop
    >
      <div class="snippet-menu__head">
        <span class="snippet-menu__title">超级 Tag</span>
        <span class="snippet-menu__hint">选择一个画面要素</span>
      </div>
      <div class="snippet-menu__list">
        <button
          v-for="(c, i) in categories"
          :key="c.key"
          type="button"
          class="snippet-menu__item"
          :class="{ active: menuActive === i }"
          @mouseenter="menuActive = i"
          @click="chooseCategory(c.key)"
        >
          <span class="snippet-menu__at">@{{ c.label }}</span>
          <span class="snippet-menu__desc">{{ c.description }}</span>
          <span
            class="snippet-menu__arrow"
            aria-hidden="true"
          >›</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style>
.prompt-editor { position: relative; width: 100%; }
.prompt-editor__content { min-height: 60px; }
.prompt-editor__content .tiptap { outline: none; min-height: 100%; }
.prompt-editor__content .tiptap p { margin: 0; }

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
